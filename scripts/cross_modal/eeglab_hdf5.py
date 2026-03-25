#!/usr/bin/env python3
"""Minimal helpers for reading EEGLAB MATLAB v7.3/HDF5 `.set` files."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


def add_local_pydeps() -> None:
    pydeps = Path(".tmp/pydeps")
    if pydeps.exists():
        sys.path.insert(0, str(pydeps.resolve()))


def ensure_h5py() -> None:
    add_local_pydeps()
    if importlib.util.find_spec("h5py") is None:
        raise SystemExit(
            "Missing optional dependency 'h5py'. "
            "Run `python scripts/cross_modal/bootstrap_waveform_deps.py` first."
        )


ensure_h5py()

import h5py  # noqa: E402
import numpy as np  # noqa: E402


def open_set_file(path: Path) -> h5py.File:
    return h5py.File(path, "r")


def read_scalar(file_handle: h5py.File, key: str) -> float:
    array = np.asarray(file_handle[key][()])
    return float(array.reshape(-1)[0])


def _decode_uint16_string(array: np.ndarray) -> str:
    return "".join(chr(int(value)) for value in np.asarray(array).reshape(-1) if int(value) != 0)


def _decode_reference(file_handle: h5py.File, reference: h5py.Reference) -> object:
    target = file_handle[reference]
    if not isinstance(target, h5py.Dataset):
        return None
    array = np.asarray(target[()])
    if array.dtype == np.uint16:
        return _decode_uint16_string(array)
    if array.dtype.kind in {"f", "i", "u"} and array.size == 1:
        return float(array.reshape(-1)[0])
    return array


def decode_cell_value(file_handle: h5py.File, value: object) -> object:
    if isinstance(value, h5py.Reference):
        return _decode_reference(file_handle, value)
    if isinstance(value, np.ndarray) and value.dtype == object and value.size == 1:
        scalar = value.reshape(-1)[0]
        if isinstance(scalar, h5py.Reference):
            return _decode_reference(file_handle, scalar)
        return scalar
    if isinstance(value, np.ndarray) and value.dtype == np.uint16:
        return _decode_uint16_string(value)
    if isinstance(value, np.ndarray) and value.size == 1 and value.dtype.kind in {"f", "i", "u"}:
        return float(value.reshape(-1)[0])
    return value


def read_channel_labels(file_handle: h5py.File) -> list[str]:
    label_dataset = file_handle["chanlocs/labels"]
    labels: list[str] = []
    for index in range(label_dataset.shape[0]):
        decoded = decode_cell_value(file_handle, label_dataset[index, 0])
        labels.append(str(decoded))
    return labels


def channel_index_map(file_handle: h5py.File) -> dict[str, int]:
    return {label: index for index, label in enumerate(read_channel_labels(file_handle))}


def read_time_slice(
    file_handle: h5py.File,
    *,
    start_sample: int,
    stop_sample: int,
    channel_indices: list[int] | None = None,
) -> np.ndarray:
    data = file_handle["data"]
    if channel_indices is None:
        sliced = np.asarray(data[start_sample:stop_sample, :], dtype=np.float32)
    else:
        sliced = np.asarray(data[start_sample:stop_sample, channel_indices], dtype=np.float32)
    if sliced.ndim == 1:
        sliced = sliced[:, np.newaxis]
    return sliced.T

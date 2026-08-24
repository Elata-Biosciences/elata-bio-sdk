#!/usr/bin/env python3
"""Read chunks emitted by emit-chunks.mjs using pyarrow and verify them.

This is the interoperability guarantee: a chunk written by the browser
recorder must be a genuine Arrow IPC file that the reference Python
implementation reads, with the values and the Elata identity metadata intact.
Nothing here imports our JS — if the two disagree, the chunk is the problem.

Usage: python verify_chunks.py <dir-with-manifest.json>
"""

import json
import math
import pathlib
import sys

try:
    import pyarrow as pa
    import pyarrow.ipc as ipc
except ModuleNotFoundError:  # pragma: no cover - environment guidance
    sys.exit(
        "pyarrow is required for cross-language verification.\n"
        "  python3 -m venv .venv && .venv/bin/pip install pyarrow\n"
        "  ELATA_PYTHON=.venv/bin/python pnpm run verify:cross-language"
    )

CRC32C_POLY = 0x82F63B78


def crc32c(data: bytes) -> str:
    """Mirror of the TypeScript crc32c so checksums are checked independently."""
    table = []
    for n in range(256):
        c = n
        for _ in range(8):
            c = (c >> 1) ^ CRC32C_POLY if c & 1 else c >> 1
        table.append(c & 0xFFFFFFFF)
    crc = 0xFFFFFFFF
    for byte in data:
        crc = (crc >> 8) ^ table[(crc ^ byte) & 0xFF]
    return format(crc ^ 0xFFFFFFFF, "08x")


class Failure(Exception):
    pass


def check(condition: bool, message: str) -> None:
    if not condition:
        raise Failure(message)


def read_table(path: pathlib.Path) -> pa.Table:
    with pa.memory_map(str(path), "rb") as source:
        return ipc.open_file(source).read_all()


def verify_case(root: pathlib.Path, manifest: dict, case: dict) -> list[str]:
    path = root / case["file"]
    raw = path.read_bytes()
    notes = []

    # 1. The bytes are a real Arrow IPC *file*, readable by pyarrow.
    table = read_table(path)
    check(
        table.num_rows == case["rows"],
        f"{case['file']}: expected {case['rows']} rows, pyarrow read {table.num_rows}",
    )

    # 2. Our checksum recomputes identically in Python.
    check(
        crc32c(raw) == case["checksum"],
        f"{case['file']}: crc32c mismatch (js {case['checksum']}, py {crc32c(raw)})",
    )

    # 3. The Elata identity metadata survived the round trip.
    meta = {
        k.decode(): v.decode() for k, v in (table.schema.metadata or {}).items()
    }
    keys = manifest["metadataKeys"]
    check(
        meta.get(keys["sessionId"]) == manifest["sessionId"],
        f"{case['file']}: sessionId metadata missing/wrong ({meta!r})",
    )
    check(
        meta.get(keys["arrowSchemaId"]) == case["arrowSchemaId"],
        f"{case['file']}: arrowSchemaId metadata wrong ({meta!r})",
    )

    # 4. Time-column contract: regular streams carry NO time column; irregular
    #    ones carry an int64 microsecond column (never an Arrow timestamp type,
    #    which would imply an epoch these values do not have).
    names = table.schema.names
    if case["hasTimeColumn"]:
        check("time_us" in names, f"{case['file']}: expected a time_us column")
        check(
            pa.types.is_int64(table.schema.field("time_us").type),
            f"{case['file']}: time_us must be int64, got "
            f"{table.schema.field('time_us').type}",
        )
    else:
        check(
            "time_us" not in names,
            f"{case['file']}: regular stream must not carry a time column",
        )

    # 5. Per-case value checks.
    if "valueFormula" in case:
        for ch, name in enumerate(case["columns"]):
            values = table.column(name).to_pylist()
            for i, got in enumerate(values):
                want = ch * 1000 + i * 0.25
                check(
                    math.isclose(got, want, rel_tol=1e-6, abs_tol=1e-6),
                    f"{case['file']}:{name}[{i}] expected {want}, got {got}",
                )
        notes.append(f"{len(case['columns'])}x{case['rows']} float32 values exact")

    if case.get("timeUsStepUs"):
        times = table.column("time_us").to_pylist()
        step = case["timeUsStepUs"]
        for i, got in enumerate(times):
            check(got == i * step, f"{case['file']}: time_us[{i}] expected {i * step}, got {got}")
        raws = table.column("raw").to_pylist()
        nulls = [i for i, v in enumerate(raws) if v is None]
        expected_nulls = [i for i in range(case["rows"]) if i % case["nullEvery"] == 0]
        check(
            nulls == expected_nulls,
            f"{case['file']}: null positions {nulls} != expected {expected_nulls}",
        )
        notes.append(f"{len(times)} timestamps + {len(nulls)} nulls exact")

    expect = case.get("expect", {})
    for column, wanted in expect.items():
        if column.endswith("_is_null"):
            continue
        if column.endswith("_row1"):
            actual = table.column(column[: -len("_row1")]).to_pylist()[1]
            check(actual == wanted, f"{case['file']}:{column} expected {wanted}, got {actual}")
            continue
        actual = table.column(column).to_pylist()
        for i, want in enumerate(wanted):
            got = actual[i]
            ok = math.isclose(got, want, rel_tol=1e-6) if isinstance(want, float) else got == want
            check(ok, f"{case['file']}:{column}[{i}] expected {want}, got {got}")
        notes.append(f"{column} ok")

    if expect.get("confidence_row1_is_null"):
        check(
            table.column("confidence").to_pylist()[1] is None,
            f"{case['file']}: confidence row 1 should be null",
        )
        notes.append("null preserved in a float column")

    return notes


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    manifest = json.loads((root / "manifest.json").read_text())
    failures = []
    for case in manifest["cases"]:
        try:
            notes = verify_case(root, manifest, case)
            print(f"  OK  {case['file']:<22} {case['arrowSchemaId']:<22} {'; '.join(notes)}")
        except Failure as error:
            failures.append(str(error))
            print(f"  FAIL {case['file']}: {error}")
        except Exception as error:  # unreadable file, wrong format, …
            failures.append(f"{case['file']}: {type(error).__name__}: {error}")
            print(f"  FAIL {case['file']}: {type(error).__name__}: {error}")

    print()
    if failures:
        print(f"cross-language verification FAILED ({len(failures)} case(s))")
        return 1
    print(f"cross-language verification passed ({len(manifest['cases'])} chunks, pyarrow {pa.__version__})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

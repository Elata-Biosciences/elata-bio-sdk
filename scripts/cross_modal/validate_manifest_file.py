#!/usr/bin/env python3
"""Validate a cross-modal dataset manifest file against the shared contract."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from manifest_contract import validate_manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a cross-modal dataset manifest.")
    parser.add_argument("manifest", help="Path to the manifest JSON file.")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)

    failures = validate_manifest(manifest)
    if failures:
        for failure in failures:
            print(failure)
        return 1

    print(f"Validated manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

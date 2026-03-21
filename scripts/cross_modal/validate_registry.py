#!/usr/bin/env python3
"""Validate every manifest referenced by the cross-modal registry."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from manifest_contract import validate_manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate all manifests in a cross-modal registry.")
    parser.add_argument(
        "--registry",
        default="manifests/cross_modal/registry.json",
        help="Path to the registry JSON file.",
    )
    args = parser.parse_args()

    registry_path = Path(args.registry)
    with registry_path.open("r", encoding="utf-8") as handle:
        registry = json.load(handle)

    failures: list[str] = []
    for entry in registry.get("entries", []):
        manifest_path = Path(entry["manifest_path"])
        if not manifest_path.exists():
            failures.append(f"Missing manifest file: {manifest_path}")
            continue
        with manifest_path.open("r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        manifest_failures = validate_manifest(manifest)
        for failure in manifest_failures:
            failures.append(f"{manifest_path}: {failure}")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print(f"Validated registry and manifests: {registry_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

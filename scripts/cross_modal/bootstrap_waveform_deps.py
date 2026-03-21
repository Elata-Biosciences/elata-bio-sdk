#!/usr/bin/env python3
"""Install local optional Python deps for waveform-level cross-modal scripts."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Install local waveform Python dependencies.")
    parser.add_argument(
        "--target",
        default=".tmp/pydeps",
        help="Target directory for local Python packages.",
    )
    args = parser.parse_args()

    target = Path(args.target)
    target.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, "-m", "pip", "install", "--target", str(target), "h5py"]
    subprocess.run(command, check=True)
    print(f"Installed waveform deps into {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

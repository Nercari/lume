"""Smoke check for the Lume case store (#7): runs case-store/smoke.mjs, which needs only Node."""
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.exit(subprocess.run(["node", str(root / "case-store" / "smoke.mjs")], cwd=root).returncode)

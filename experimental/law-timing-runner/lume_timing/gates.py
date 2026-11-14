"""Gate check. Mirrors audits/hillclimb/voto-timing/harness.mjs gatesBlocker. A gate counts only as VERIFIED with a GitHub evidence link."""
import re

from .contract import Reject

EVIDENCE_RE = re.compile(r"^https://github\.com/Nercari/[^/]+/(issues|pull)/\d+")
REQUIRED = ("independent-evaluator", "law-vetoes", "heldout-isolation", "case-readiness")


def require_gates_verified(gates):
    by_id = {g.get("id"): g for g in gates if isinstance(g, dict)}
    for gate_id in REQUIRED:
        g = by_id.get(gate_id)
        if not g or g.get("status") != "VERIFIED" or not EVIDENCE_RE.match(str(g.get("evidence") or "")):
            raise Reject("gates_not_verified")

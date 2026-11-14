"""lume_timing_run handler. Every check runs before the first backend call. The backend is injected. No default backend exists."""
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

from . import subscription
from .allowlist import load_manifest, read_verified_source
from .contract import Reject, validate_request
from .gates import require_gates_verified
from .grant import Ledger, check_grant, load_grant, package_hash

log = logging.getLogger("lume_timing")
LAW_PROFILE = "law"
TIMING_LABELS = {
    "timing_kind": "SYNTHETIC_PROXY",
    "chat_upload_to_final_voto_sec": "UNMEASURED",
    "human_review_sec": "UNMEASURED",
    "edit_burden": "UNMEASURED",
    "baseline_claimed": False,
    "improvement_claimed": False,
}


@dataclass(frozen=True)
class Config:
    profile_provider: Callable[[], Optional[str]]
    gates_provider: Callable[[], list]
    auth_provider: Callable[[], dict]
    backend: Any
    grant_path: str
    ledger_path: str
    manifest_path: str
    manifest_sha256: str
    source_root: str
    law_root: str
    output_dir: str
    environ: Callable[[], dict]
    wall_clock: Callable[[], float] = time.time
    mono_clock: Callable[[], float] = time.monotonic
    code_dir: Optional[str] = None


def _open_output_dir(cfg):
    """Open the output dir by descriptor, so a later swap of the path cannot redirect the write. Must resolve inside the Law root."""
    root = os.path.realpath(cfg.law_root)
    try:
        fd = os.open(cfg.output_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except OSError:
        raise Reject("output_root_invalid") from None
    real = os.readlink(f"/proc/self/fd/{fd}")
    if os.path.commonpath([root, real]) != root or real == root:
        os.close(fd)
        raise Reject("output_root_invalid")
    return fd


class Runner:
    def __init__(self, cfg: Optional[Config] = None):
        self.cfg = cfg

    def active(self):
        return self.cfg is not None and self.cfg.profile_provider() == LAW_PROFILE

    def handle(self, args, **_kw):
        try:
            return json.dumps(self._run(args), sort_keys=True)
        except Reject as r:
            log.info("rejected code=%s", r.code)
            return json.dumps({"ok": False, "error": r.code})
        except Exception:
            log.error("internal_error")
            return json.dumps({"ok": False, "error": "internal_error"})

    def _run(self, args):
        cfg = self.cfg
        if cfg is None or cfg.backend is None:
            raise Reject("not_configured")
        if cfg.profile_provider() != LAW_PROFILE:
            raise Reject("wrong_profile")
        req = validate_request(args)
        require_gates_verified(cfg.gates_provider())
        subscription.require_clean_environment(cfg.environ())
        now = cfg.wall_clock()
        grant = load_grant(cfg.grant_path)
        manifest = load_manifest(cfg.manifest_path, cfg.manifest_sha256)
        check_grant(grant, code_hash=package_hash(cfg.code_dir) if cfg.code_dir else package_hash(),
                    allowlist_hash=manifest.sha256, profile=LAW_PROFILE, models=subscription.ALLOWED_MODELS, now=now)
        if req.units > grant.max_units:
            raise Reject("budget_exhausted")
        entries = manifest.admit(req.case_ids)
        sources = [read_verified_source(cfg.source_root, e) for e in entries]
        subscription.check_auth_status(cfg.auth_provider())
        out_fd = _open_output_dir(cfg)
        ledger = Ledger(cfg.ledger_path)
        started = 0
        try:
            ledger.open_exclusive()
            ledger.reserve(grant, req.units)
            deadline = cfg.mono_clock() + min(req.timeout_sec, max(int(grant.expires_at - now), 1))
            rows, status = [], "complete"
            t0 = cfg.mono_clock()
            for it in range(req.iterations):
                for case_id, data in zip(req.case_ids, sources):
                    left = deadline - cfg.mono_clock()
                    if left <= 0:
                        status = "timeout"
                        break
                    started += 1
                    try:
                        receipt = subscription.verify_unit_receipt(cfg.backend.run_unit(data, grant.model, left), grant.model)
                        if receipt["synthetic"] is not bool(getattr(cfg.backend, "SYNTHETIC", False)):
                            raise Reject("receipt_rejected")
                    except Reject as r:
                        rows.append({"case_id": case_id, "iteration": it + 1, "ok": False, "error": r.code})
                        status = "unit_failed"
                        break
                    except Exception:
                        rows.append({"case_id": case_id, "iteration": it + 1, "ok": False, "error": "backend_error"})
                        status = "unit_failed"
                        break
                    rows.append({"case_id": case_id, "iteration": it + 1, "ok": True, "cli_duration_ms": receipt["cli_duration_ms"],
                                 "tokens": receipt["tokens"], "output_chars": receipt["output_chars"]})
                    if cfg.mono_clock() > deadline:
                        status = "timeout"
                        break
                if status != "complete":
                    break
            elapsed = round(cfg.mono_clock() - t0, 3)
            ok = [r for r in rows if r["ok"]]
            trust = "TEST_DOUBLE" if getattr(cfg.backend, "SYNTHETIC", False) else "BACKEND_REPORTED_UNVERIFIED"
            aggregate = {
                "units_requested": req.units, "units_started": started, "units_ok": len(ok),
                "cli_pipeline_sec": elapsed,
                "tokens_input": sum(r["tokens"]["input"] for r in ok), "tokens_output": sum(r["tokens"]["output"] for r in ok),
            }
            receipt_id = secrets.token_hex(8)
            body = {"receipt_id": receipt_id, "status": status, "backend_trust": trust, "subscription_proof": False,
                    "model": grant.model, "grant_id": grant.grant_id, "aggregate": aggregate, "units": rows, **TIMING_LABELS}
            try:
                fd = os.open(receipt_id + ".json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=out_fd)
                with os.fdopen(fd, "w") as fh:
                    json.dump(body, fh, sort_keys=True)
            except OSError:
                raise Reject("output_write_failed") from None
            return {"ok": status == "complete", "receipt_id": receipt_id, "status": status, "backend_trust": trust,
                    "subscription_proof": False, "aggregate": aggregate, **TIMING_LABELS}
        finally:
            try:
                ledger.settle(started)
            finally:
                ledger.close()
                os.close(out_fd)

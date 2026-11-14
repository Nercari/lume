"""DESIGN CONTRACT EVIDENCE ONLY. Synthetic. Not runtime code, not imported by lume_timing, not a backend.
It shows what a future inference-provenance verifier must accept and reject, using invented fixtures and an invented test key.
It starts no process, opens no socket, reads no file, no credential and no account state.
`production_trust` is always False: an offline check with a key that sits in this file cannot prove where inference ran.
Run: PYTHONPATH=. python3 -m design.provenance_contract"""
import hashlib
import hmac
import json

from lume_timing.process import build_claude_argv
from lume_timing.subscription import ALLOWED_MODELS, BLOCKED_ENV, BLOCKED_PREFIXES, CHILD_ENV_KEYS

LABEL = "SYNTHETIC_DESIGN_CONTRACT_EVIDENCE"
SCHEMA = "lume-backend-provenance-design/1"
KIND = "inference_provenance"
ALG = "design-hmac-sha256-test-only"
KEY_ID = "design-test-key-1"
TEST_KEY = b"INVENTED-DESIGN-TEST-KEY-NOT-A-SECRET"
MAX_AGE_SEC = 300
BODY = ("schema", "evidence_kind", "synthetic", "run_id", "grant_hash", "code_hash", "manifest_hash",
        "requested_model", "executed_model", "issued_at")
BINDINGS = ("run_id", "grant_hash", "code_hash", "manifest_hash")
TRUSTED_AUTH_SOURCES = ("trusted_host_status",)


class Refuse(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _mac(body):
    return hmac.new(TEST_KEY, json.dumps(body, sort_keys=True, separators=(",", ":")).encode(), hashlib.sha256).hexdigest()


def sign(body):
    """Test helper. In a real design the key is held by the attestor, never by the executor or this repo."""
    return {**body, "attestation": {"alg": ALG, "key_id": KEY_ID, "mac": _mac(body)}}


def _verify(env, expected, now, seen):
    if type(env) is not dict:
        raise Refuse("not_an_object")
    if env.get("evidence_kind") != KIND:
        raise Refuse("wrong_evidence_kind")
    if set(env) - set(BODY) - {"attestation"}:
        raise Refuse("untrusted_field")
    if any(k not in env for k in BODY):
        raise Refuse("missing_field")
    att = env.get("attestation")
    if type(att) is not dict:
        raise Refuse("attestation_missing")
    if att.get("alg") != ALG or att.get("key_id") != KEY_ID or set(att) != {"alg", "key_id", "mac"}:
        raise Refuse("attestation_unknown")
    body = {k: env[k] for k in BODY}
    if type(att["mac"]) is not str or not hmac.compare_digest(att["mac"], _mac(body)):
        raise Refuse("attestation_invalid")
    if env["schema"] != SCHEMA or env["synthetic"] is not True:
        raise Refuse("schema_or_synthetic_label")
    req, ran = env["requested_model"], env["executed_model"]
    if req not in ALLOWED_MODELS or ran not in ALLOWED_MODELS:
        raise Refuse("model_not_allowed")
    if req != ran or req != expected["model"]:
        raise Refuse("model_conflict")
    for k in BINDINGS:
        if env[k] != expected[k]:
            raise Refuse("binding_mismatch")
    if type(env["issued_at"]) is not int or env["issued_at"] > now or now - env["issued_at"] > MAX_AGE_SEC:
        raise Refuse("stale_or_future")
    if env["run_id"] in seen:
        raise Refuse("replayed_run_id")


def verify_envelope(env, expected, *, now, seen_run_ids=()):
    """Fail closed on the first fault. Accepts only a design fixture; never grants production trust."""
    try:
        _verify(env, expected, now, seen_run_ids)
    except Refuse as r:
        return {"label": LABEL, "accepted": False, "reason": r.code, "production_trust": False}
    return {"label": LABEL, "accepted": True, "reason": "design_fixture_consistent", "production_trust": False}


def check_launch_contract(spec, model):
    """Pure data check of a proposed launch. Starts nothing."""
    if type(spec) is not dict:
        return "not_an_object"
    if set(spec) - {"argv", "env"}:
        return "caller_configured_field"
    try:
        fixed = build_claude_argv(model)
    except ValueError:
        return "model_not_allowed"
    if spec.get("argv") != fixed:
        return "argv_not_fixed"
    env = spec.get("env")
    if type(env) is not dict:
        return "env_not_sanitized"
    if any(k in BLOCKED_ENV or k.startswith(BLOCKED_PREFIXES) for k in env):
        return "billing_env_present"
    if set(env) - set(CHILD_ENV_KEYS):
        return "env_not_sanitized"
    return "ok"


def check_auth_source(source):
    return "ok" if source in TRUSTED_AUTH_SOURCES else "auth_source_untrusted"


NOW = 1_800_000_000
EXPECTED = {"run_id": "design-run-0001", "grant_hash": "a" * 64, "code_hash": "b" * 64, "manifest_hash": "c" * 64,
            "model": ALLOWED_MODELS[0]}
GOOD = {"schema": SCHEMA, "evidence_kind": KIND, "synthetic": True, "run_id": EXPECTED["run_id"],
        "grant_hash": EXPECTED["grant_hash"], "code_hash": EXPECTED["code_hash"], "manifest_hash": EXPECTED["manifest_hash"],
        "requested_model": EXPECTED["model"], "executed_model": EXPECTED["model"], "issued_at": NOW - 5}
GOOD_ARGV = build_claude_argv(ALLOWED_MODELS[0])
GOOD_ENV = {"PATH": "/usr/bin", "HOME": "/home/x", "LANG": "C"}
INVENTED_MODEL = "invented-test-model-x"
CODING_AGENT_EVIDENCE = {"requested_model": ALLOWED_MODELS[0], "executed_models": [ALLOWED_MODELS[0]], "api_key_source": "none",
                         "fallback_used": False, "is_error": False, "synthetic": True,
                         "auth": {"authMethod": "claude.ai", "apiProvider": "firstParty", "subscriptionType": "max"}}


def _sub(**over):
    return sign({**GOOD, **over})


def matrix():
    """(case, expected, got). Every case is a synthetic design check, not a provider response and not a live measurement."""
    v = lambda env, **kw: verify_envelope(env, EXPECTED, now=NOW, **kw)
    unsigned = dict(GOOD)
    no_att = {k: x for k, x in sign(GOOD).items()}
    forged = sign(GOOD)
    forged["attestation"] = {**forged["attestation"], "mac": "0" * 64}
    tampered = sign(GOOD)
    tampered["executed_model"] = ALLOWED_MODELS[1]
    sig_other_key = sign(GOOD)
    sig_other_key["attestation"] = {**sig_other_key["attestation"], "key_id": "attacker-key"}
    rows = [
        ("accept_consistent_signed_fixture", "design_fixture_consistent", v(sign(GOOD))["reason"]),
        ("reject_unsigned_but_complete_json", "attestation_missing", v(unsigned)["reason"]),
        ("reject_attestation_not_an_object", "attestation_missing", v({**no_att, "attestation": "ok"})["reason"]),
        ("reject_forged_mac", "attestation_invalid", v(forged)["reason"]),
        ("reject_body_changed_after_signing", "attestation_invalid", v(tampered)["reason"]),
        ("reject_unknown_key_id", "attestation_unknown", v(sig_other_key)["reason"]),
        ("reject_coding_agent_subscription_evidence", "wrong_evidence_kind", v(CODING_AGENT_EVIDENCE)["reason"]),
        ("reject_self_reported_subscription_field", "untrusted_field", v(_sub(subscription_type="max"))["reason"]),
        ("reject_cli_cost_field", "untrusted_field", v(_sub(total_cost_usd=0.0))["reason"]),
        ("reject_missing_field", "missing_field", v(sign({k: x for k, x in GOOD.items() if k != "manifest_hash"}))["reason"]),
        ("reject_not_labelled_synthetic", "schema_or_synthetic_label", v(_sub(synthetic=False))["reason"]),
        ("reject_invented_model_label", "model_not_allowed", v(_sub(requested_model=INVENTED_MODEL, executed_model=INVENTED_MODEL))["reason"]),
        ("reject_executed_differs_from_requested", "model_conflict", v(_sub(executed_model=ALLOWED_MODELS[1]))["reason"]),
        ("reject_model_differs_from_grant", "model_conflict", v(_sub(requested_model=ALLOWED_MODELS[1], executed_model=ALLOWED_MODELS[1]))["reason"]),
        ("reject_wrong_grant_hash", "binding_mismatch", v(_sub(grant_hash="d" * 64))["reason"]),
        ("reject_wrong_code_hash", "binding_mismatch", v(_sub(code_hash="d" * 64))["reason"]),
        ("reject_wrong_manifest_hash", "binding_mismatch", v(_sub(manifest_hash="d" * 64))["reason"]),
        ("reject_wrong_run_id", "binding_mismatch", v(_sub(run_id="design-run-0002"))["reason"]),
        ("reject_stale", "stale_or_future", v(_sub(issued_at=NOW - MAX_AGE_SEC - 1))["reason"]),
        ("reject_future", "stale_or_future", v(_sub(issued_at=NOW + 1))["reason"]),
        ("reject_replayed_run_id", "replayed_run_id", v(sign(GOOD), seen_run_ids={EXPECTED["run_id"]})["reason"]),
        ("accept_launch_contract_fixed_argv_clean_env", "ok", check_launch_contract({"argv": GOOD_ARGV, "env": GOOD_ENV}, ALLOWED_MODELS[0])),
        ("reject_launch_caller_executable", "caller_configured_field", check_launch_contract({"argv": GOOD_ARGV, "env": GOOD_ENV, "executable": "/tmp/x"}, ALLOWED_MODELS[0])),
        ("reject_launch_caller_endpoint", "caller_configured_field", check_launch_contract({"argv": GOOD_ARGV, "env": GOOD_ENV, "base_url": "https://invented.example"}, ALLOWED_MODELS[0])),
        ("reject_launch_shell_flag", "caller_configured_field", check_launch_contract({"argv": GOOD_ARGV, "env": GOOD_ENV, "shell": True}, ALLOWED_MODELS[0])),
        ("reject_launch_extra_arg", "argv_not_fixed", check_launch_contract({"argv": GOOD_ARGV + ("--bare",), "env": GOOD_ENV}, ALLOWED_MODELS[0])),
        ("reject_launch_string_argv", "argv_not_fixed", check_launch_contract({"argv": "claude --print", "env": GOOD_ENV}, ALLOWED_MODELS[0])),
        ("reject_launch_api_key_env", "billing_env_present", check_launch_contract({"argv": GOOD_ARGV, "env": {**GOOD_ENV, "ANTHROPIC_API_KEY": "x"}}, ALLOWED_MODELS[0])),
        ("reject_launch_base_url_env", "billing_env_present", check_launch_contract({"argv": GOOD_ARGV, "env": {**GOOD_ENV, "ANTHROPIC_BASE_URL": "x"}}, ALLOWED_MODELS[0])),
        ("reject_launch_cloud_provider_env", "billing_env_present", check_launch_contract({"argv": GOOD_ARGV, "env": {**GOOD_ENV, "CLAUDE_CODE_USE_BEDROCK": "1"}}, ALLOWED_MODELS[0])),
        ("reject_launch_unlisted_env", "env_not_sanitized", check_launch_contract({"argv": GOOD_ARGV, "env": {**GOOD_ENV, "FOO": "1"}}, ALLOWED_MODELS[0])),
        ("reject_launch_invented_model", "model_not_allowed", check_launch_contract({"argv": GOOD_ARGV, "env": GOOD_ENV}, INVENTED_MODEL)),
        ("accept_auth_from_trusted_host_status", "ok", check_auth_source("trusted_host_status")),
        ("reject_auth_from_model_text", "auth_source_untrusted", check_auth_source("model_text")),
        ("reject_auth_from_receipt_self_report", "auth_source_untrusted", check_auth_source("receipt_self_report")),
    ]
    return [{"case": c, "expected": e, "got": g, "pass": e == g} for c, e, g in rows]


def main():
    rows = matrix()
    body = {"label": LABEL, "production_trust": False, "cases": len(rows), "passed": sum(r["pass"] for r in rows),
            "accept_cases": sum(r["case"].startswith("accept") for r in rows),
            "reject_cases": sum(r["case"].startswith("reject") for r in rows), "rows": rows}
    text = json.dumps(body, sort_keys=True, indent=1)
    print(text)
    print("sha256", hashlib.sha256(text.encode()).hexdigest())
    return 0 if body["passed"] == body["cases"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

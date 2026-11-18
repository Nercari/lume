"""Subscription-only contract. Checks inputs and a backend receipt. A receipt from a fake or an unverified backend is contract
coverage, not proof of the subscription path. No credential is read here."""
import math

from .contract import Reject

ALLOWED_MODELS = ("claude-haiku-5-5", "claude-sonnet-5-5")
BLOCKED_ENV = (
    "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "OPENAI_API_KEY",
    "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
    "ANTHROPIC_BEDROCK_BASE_URL", "ANTHROPIC_VERTEX_BASE_URL", "ANTHROPIC_VERTEX_PROJECT_ID",
    "ANTHROPIC_FOUNDRY_API_KEY", "ANTHROPIC_FOUNDRY_BASE_URL", "ANTHROPIC_FOUNDRY_RESOURCE",
    "AWS_BEARER_TOKEN_BEDROCK", "CLOUD_ML_REGION",
)
BLOCKED_PREFIXES = ("ANTHROPIC_", "CLAUDE_CODE_USE_")
CHILD_ENV_KEYS = ("PATH", "HOME", "LANG", "LC_ALL")


def require_clean_environment(environ):
    """Fail closed. The harness strips these variables. This tool refuses to run when any is set."""
    if any(k in BLOCKED_ENV or k.startswith(BLOCKED_PREFIXES) for k in environ):
        raise Reject("billing_env_present")


def child_env(environ):
    return {k: environ[k] for k in CHILD_ENV_KEYS if k in environ}


def _auth(auth):
    if type(auth) is not dict:
        raise Reject("auth_not_subscription")
    if auth.get("authMethod") != "claude.ai" or auth.get("apiProvider") != "firstParty" or not auth.get("subscriptionType"):
        raise Reject("auth_not_subscription")
    return {"authMethod": "claude.ai", "apiProvider": "firstParty", "subscriptionType": str(auth["subscriptionType"])[:32]}


def check_auth_status(status):
    """`status` is the parsed output of the CLI's auth status command, supplied by the host. This function reads no credential."""
    if type(status) is not dict or status.get("loggedIn") is not True:
        raise Reject("auth_not_subscription")
    return _auth(status)


def _count(value, high):
    if type(value) is not int or not 0 <= value <= high:
        raise Reject("receipt_rejected")
    return value


def verify_unit_receipt(receipt, model):
    """Accept only a receipt that matches the pinned model with no fallback and a subscription login. Returns a whitelisted copy,
    so any extra field (text, stderr, a path) is dropped here."""
    if model not in ALLOWED_MODELS or type(receipt) is not dict:
        raise Reject("receipt_rejected")
    models = receipt.get("executed_models")
    if receipt.get("requested_model") != model or type(models) is not list or not models or any(m != model for m in models):
        raise Reject("receipt_rejected")
    if receipt.get("api_key_source") not in (None, "none") or receipt.get("fallback_used") is not False:
        raise Reject("receipt_rejected")
    if receipt.get("is_error") is not False or type(receipt.get("synthetic")) is not bool:
        raise Reject("receipt_rejected")
    tokens = receipt.get("tokens")
    if type(tokens) is not dict:
        raise Reject("receipt_rejected")
    ms = receipt.get("cli_duration_ms")
    if type(ms) not in (int, float) or isinstance(ms, bool) or not math.isfinite(ms) or not 0 <= ms <= 3_600_000:
        raise Reject("receipt_rejected")
    try:
        auth = _auth(receipt.get("auth"))
    except Reject:
        raise Reject("receipt_rejected") from None
    return {
        "requested_model": model, "executed_models": [model], "api_key_source": "none", "fallback_used": False,
        "is_error": False, "synthetic": receipt["synthetic"], "auth": auth, "cli_duration_ms": ms,
        "tokens": {"input": _count(tokens.get("input"), 10_000_000), "output": _count(tokens.get("output"), 10_000_000)},
        "output_chars": _count(receipt.get("output_chars"), 1_000_000),
    }

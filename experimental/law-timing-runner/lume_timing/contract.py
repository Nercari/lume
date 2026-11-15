"""Request contract for lume_timing_run. Validates types before any lookup and echoes no caller value in errors."""
import json
import math
import re
from dataclasses import dataclass

TOOL_NAME = "lume_timing_run"
TOOLSET = "lume_timing"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{3,39}$")
MAX_IDS = 3
MAX_ITERATIONS = 2
MAX_TIMEOUT_SEC = 600
MAX_REQUEST_BYTES = 2048
FIELDS = ("case_ids", "iterations", "timeout_sec")


class Reject(Exception):
    """A fail-closed refusal. `code` is a fixed string and never contains caller input."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _pairs(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise Reject("duplicate_key")
        out[key] = value
    return out


def _constant(_name):
    raise Reject("nonfinite_number")


def _float(text):
    value = float(text)
    if not math.isfinite(value):
        raise Reject("nonfinite_number")
    return value


def parse_json_strict(raw, max_bytes=MAX_REQUEST_BYTES):
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = bytes(raw).decode("utf-8")
        except UnicodeDecodeError:
            raise Reject("bad_encoding") from None
    if not isinstance(raw, str):
        raise Reject("bad_type")
    if len(raw.encode("utf-8")) > max_bytes:
        raise Reject("request_too_large")
    try:
        return json.loads(raw, object_pairs_hook=_pairs, parse_constant=_constant, parse_float=_float)
    except Reject:
        raise
    except (ValueError, RecursionError):
        raise Reject("malformed_json") from None


@dataclass(frozen=True)
class Request:
    case_ids: tuple
    iterations: int
    timeout_sec: int

    @property
    def units(self):
        return len(self.case_ids) * self.iterations


def _bounded_int(value, high):
    if type(value) is not int:
        raise Reject("bad_type")
    if not 1 <= value <= high:
        raise Reject("out_of_range")
    return value


def validate_request(obj, *, max_ids=MAX_IDS, max_iterations=MAX_ITERATIONS, max_timeout=MAX_TIMEOUT_SEC):
    if isinstance(obj, (str, bytes, bytearray)):
        obj = parse_json_strict(obj)
    if type(obj) is not dict:
        raise Reject("bad_type")
    if any(type(k) is not str for k in obj):
        raise Reject("bad_type")
    if set(obj) - set(FIELDS):
        raise Reject("unknown_field")
    if set(FIELDS) - set(obj):
        raise Reject("missing_field")
    ids = obj["case_ids"]
    if type(ids) is not list:
        raise Reject("bad_type")
    if not 1 <= len(ids) <= max_ids:
        raise Reject("out_of_range")
    if any(type(i) is not str for i in ids):
        raise Reject("bad_type")
    if any(not ID_RE.fullmatch(i) for i in ids):
        raise Reject("bad_id_format")
    if len(set(ids)) != len(ids):
        raise Reject("duplicate_id")
    iterations = _bounded_int(obj["iterations"], max_iterations)
    timeout = _bounded_int(obj["timeout_sec"], max_timeout)
    return Request(tuple(ids), iterations, timeout)


SCHEMA = {
    "name": TOOL_NAME,
    "description": (
        "Run the fixed Lume voto timing pipeline on approved development IDs. Synthetic-prototype tool: it takes opaque IDs "
        "and bounded numbers only, no paths, commands, models or endpoints. Returns an aggregate and an opaque receipt."
    ),
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "required": list(FIELDS),
        "properties": {
            "case_ids": {
                "type": "array", "minItems": 1, "maxItems": MAX_IDS, "uniqueItems": True,
                "items": {"type": "string", "pattern": ID_RE.pattern},
            },
            "iterations": {"type": "integer", "minimum": 1, "maximum": MAX_ITERATIONS},
            "timeout_sec": {"type": "integer", "minimum": 1, "maximum": MAX_TIMEOUT_SEC},
        },
    },
}

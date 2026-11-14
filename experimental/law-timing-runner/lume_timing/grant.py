"""Host-issued grant and a persisted budget ledger. The grant is a file the host writes. This module never creates one.
A grant binds a code hash, an allowlist hash, one model, run and unit caps and an expiry. Hard ceilings below hold even if a grant file asks for more."""
import fcntl
import hashlib
import json
import os
import re
import secrets
import tempfile
from dataclasses import dataclass

from .contract import Reject, parse_json_strict

HARD_MAX_RUNS = 3
HARD_MAX_UNITS = 6
HARD_MAX_LIFETIME_SEC = 24 * 3600
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
GRANT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{7,47}$")
FIELDS = {"grant_id", "code_hash", "allowlist_hash", "model", "max_runs", "max_units", "issued_at", "expires_at", "profile"}
PKG_DIR = os.path.dirname(os.path.abspath(__file__))


def package_hash(pkg_dir=PKG_DIR):
    h = hashlib.sha256()
    for name in sorted(os.listdir(pkg_dir)):
        if name.endswith((".py", ".yaml")):
            with open(os.path.join(pkg_dir, name), "rb") as fh:
                data = fh.read()
            h.update(name.encode() + b"\0" + hashlib.sha256(data).digest())
    return h.hexdigest()


@dataclass(frozen=True)
class Grant:
    grant_id: str
    code_hash: str
    allowlist_hash: str
    model: str
    max_runs: int
    max_units: int
    issued_at: int
    expires_at: int
    profile: str
    fingerprint: str


def load_grant(path):
    try:
        with open(path, "rb") as fh:
            raw = fh.read(8193)
    except OSError:
        raise Reject("grant_missing") from None
    if len(raw) > 8192:
        raise Reject("grant_invalid")
    try:
        doc = parse_json_strict(raw, 8192)
    except Reject:
        raise Reject("grant_invalid") from None
    if type(doc) is not dict or set(doc) != FIELDS:
        raise Reject("grant_invalid")
    ints = ("max_runs", "max_units", "issued_at", "expires_at")
    if any(type(doc[k]) is not int for k in ints) or any(type(doc[k]) is not str for k in FIELDS - set(ints)):
        raise Reject("grant_invalid")
    if not GRANT_ID_RE.fullmatch(doc["grant_id"]) or not SHA_RE.fullmatch(doc["code_hash"]) or not SHA_RE.fullmatch(doc["allowlist_hash"]):
        raise Reject("grant_invalid")
    if not 1 <= doc["max_runs"] <= HARD_MAX_RUNS or not 1 <= doc["max_units"] <= HARD_MAX_UNITS:
        raise Reject("grant_invalid")
    if not 0 < doc["expires_at"] - doc["issued_at"] <= HARD_MAX_LIFETIME_SEC:
        raise Reject("grant_invalid")
    fp = hashlib.sha256(json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return Grant(fingerprint=fp, **doc)


def check_grant(grant, *, code_hash, allowlist_hash, profile, models, now):
    if grant.code_hash != code_hash:
        raise Reject("grant_stale_code")
    if grant.allowlist_hash != allowlist_hash:
        raise Reject("grant_stale_allowlist")
    if grant.profile != profile or grant.model not in models:
        raise Reject("grant_mismatch")
    if now < grant.issued_at:
        raise Reject("grant_not_yet_valid")
    if now >= grant.expires_at:
        raise Reject("grant_expired")


class Ledger:
    """Persisted spend per grant. An exclusive flock is held for the whole run, so a second caller is refused (not queued).
    Any in_flight entry found on open belongs to a crashed process, and it is counted as spent. Settlement is always final.
    Limit: a host user who can edit this file can reset it. See README."""

    def __init__(self, path):
        self.path = path
        self._fd = None
        self._res = None
        self._doc = None

    def open_exclusive(self):
        try:
            self._fd = os.open(self.path + ".lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self._close()
            raise Reject("busy") from None
        except OSError:
            self._close()
            raise Reject("ledger_unavailable") from None
        try:
            self._doc = self._read()
            for entry in self._doc.values():
                if entry["in_flight"]:
                    entry["runs"] += len(entry["in_flight"])
                    entry["units"] += sum(entry["in_flight"].values())
                    entry["in_flight"] = {}
        except Reject:
            self._close()
            raise

    def _read(self):
        try:
            with open(self.path, "rb") as fh:
                doc = json.loads(fh.read(1 << 20))
        except FileNotFoundError:
            return {}
        except (OSError, ValueError):
            raise Reject("ledger_corrupt") from None
        try:
            for entry in doc.values():
                if set(entry) != {"fingerprint", "runs", "units", "in_flight"} or type(entry["runs"]) is not int or type(entry["units"]) is not int:
                    raise ValueError
        except (AttributeError, ValueError, TypeError):
            raise Reject("ledger_corrupt") from None
        return doc

    def _write(self):
        d = os.path.dirname(self.path)
        fd, tmp = tempfile.mkstemp(dir=d, prefix=".ledger-")
        try:
            with os.fdopen(fd, "w") as fh:
                json.dump(self._doc, fh, sort_keys=True)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, self.path)
        except OSError:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise Reject("ledger_unavailable") from None
        dfd = os.open(d, os.O_RDONLY)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)

    def reserve(self, grant, units):
        entry = self._doc.setdefault(grant.grant_id, {"fingerprint": grant.fingerprint, "runs": 0, "units": 0, "in_flight": {}})
        if entry["fingerprint"] != grant.fingerprint:
            raise Reject("grant_replaced")
        if entry["runs"] + 1 > grant.max_runs or entry["units"] + units > grant.max_units:
            raise Reject("budget_exhausted")
        self._res = secrets.token_hex(8)
        self._gid = grant.grant_id
        entry["in_flight"][self._res] = units
        self._write()

    def settle(self, units_started):
        """Final state for the reservation. A run that started no unit costs nothing. Any other run costs one run and its started units."""
        if self._res is None:
            return
        entry = self._doc[self._gid]
        entry["in_flight"].pop(self._res, None)
        if units_started:
            entry["runs"] += 1
            entry["units"] += units_started
        self._res = None
        self._write()

    def close(self):
        self._close()

    def _close(self):
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None

    def snapshot(self, grant_id):
        e = (self._doc or self._read()).get(grant_id)
        return dict(e) if e else None

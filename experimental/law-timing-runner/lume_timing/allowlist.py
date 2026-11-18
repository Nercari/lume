"""Hash-bound, immutable development allowlist and verified source reads. Synthetic fixtures only in the repository."""
import hashlib
import os
import re
import stat
from dataclasses import dataclass
from types import MappingProxyType

from .contract import ID_RE, Reject, parse_json_strict

FILE_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}\.txt$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_MANIFEST_BYTES = 65536
MAX_INPUT_BYTES = 200_000


@dataclass(frozen=True)
class Entry:
    file: str
    sha256: str
    size: int


@dataclass(frozen=True)
class Manifest:
    sha256: str
    dev: MappingProxyType
    heldout: frozenset
    ocr_excluded: frozenset

    def admit(self, ids):
        """One refusal code for unknown, heldout and OCR-excluded IDs, so the reply does not reveal which list an ID is on."""
        if any(i not in self.dev for i in ids):
            raise Reject("id_not_allowed")
        return tuple(self.dev[i] for i in ids)


def load_manifest(path, expected_sha256):
    if not SHA_RE.fullmatch(expected_sha256 or ""):
        raise Reject("manifest_hash_mismatch")
    try:
        with open(path, "rb") as fh:
            raw = fh.read(MAX_MANIFEST_BYTES + 1)
    except OSError:
        raise Reject("manifest_unreadable") from None
    if len(raw) > MAX_MANIFEST_BYTES:
        raise Reject("manifest_invalid")
    digest = hashlib.sha256(raw).hexdigest()
    if digest != expected_sha256:
        raise Reject("manifest_hash_mismatch")
    doc = parse_json_strict(raw, MAX_MANIFEST_BYTES)
    try:
        if set(doc) != {"version", "dev", "heldout", "ocr_excluded"} or doc["version"] != 1:
            raise Reject("manifest_invalid")
        dev = {}
        for case_id, e in doc["dev"].items():
            if not ID_RE.fullmatch(case_id) or set(e) != {"file", "sha256", "size"}:
                raise Reject("manifest_invalid")
            if not FILE_RE.fullmatch(e["file"]) or not SHA_RE.fullmatch(e["sha256"]):
                raise Reject("manifest_invalid")
            if type(e["size"]) is not int or not 0 < e["size"] <= MAX_INPUT_BYTES:
                raise Reject("manifest_invalid")
            dev[case_id] = Entry(e["file"], e["sha256"], e["size"])
        heldout, ocr = frozenset(doc["heldout"]), frozenset(doc["ocr_excluded"])
    except (TypeError, AttributeError, KeyError):
        raise Reject("manifest_invalid") from None
    if not dev or set(dev) & (heldout | ocr) or heldout & ocr:
        raise Reject("manifest_invalid")
    return Manifest(digest, MappingProxyType(dev), heldout, ocr)


def read_verified_source(source_root, entry):
    """Open without following a final symlink, check type, size and hash from the open descriptor, and return the bytes.
    The caller passes these bytes on, so the file is not read a second time. A parent-directory swap is not covered: see README."""
    path = os.path.join(os.path.realpath(source_root), entry.file)
    fd = None
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_size != entry.size or st.st_size > MAX_INPUT_BYTES:
            raise Reject("source_unverified")
        data = b""
        while len(data) <= entry.size:
            chunk = os.read(fd, entry.size + 1 - len(data))
            if not chunk:
                break
            data += chunk
    except OSError:
        raise Reject("source_unverified") from None
    finally:
        if fd is not None:
            os.close(fd)
    if len(data) != entry.size or hashlib.sha256(data).hexdigest() != entry.sha256:
        raise Reject("source_unverified")
    return data

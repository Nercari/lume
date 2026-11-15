"""Synthetic world for the prototype tests. Every source file, ID, grant and backend here is a fake. No real case data."""
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from unittest import mock

from lume_timing import subscription
from lume_timing.grant import package_hash
from lume_timing.runner import Config, Runner

SENTINEL = "SENTINEL-NOT-A-SECRET-91c2"
SRC_SENTINEL = "SYNTHETIC-SOURCE-TEXT-5d7e"
DEV = ["dev-case-0001", "dev-case-0002", "dev-case-0003"]
HELD = "held-case-0001"
OCR = "ocr-case-0001"
NOW = 1_800_000_000
GATE_IDS = ("independent-evaluator", "law-vetoes", "heldout-isolation", "case-readiness")
VERIFIED = [{"id": g, "status": "VERIFIED", "evidence": "https://github.com/Nercari/lume/issues/1"} for g in GATE_IDS]
AUTH = {"loggedIn": True, "authMethod": "claude.ai", "apiProvider": "firstParty", "subscriptionType": "max"}
MODEL = "claude-haiku-5-5"


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class FakeBackend:
    """Clearly synthetic. Never starts a process or opens a socket."""
    SYNTHETIC = True

    def __init__(self, clock=None):
        self.calls = []
        self.clock = clock
        self.advance = 0.0
        self.raise_text = None
        self.mutate = None
        self.overrides = {}

    def run_unit(self, data, model, timeout_sec):
        self.calls.append((len(data), model, timeout_sec))
        if self.mutate:
            self.mutate()
        if self.raise_text:
            raise RuntimeError(self.raise_text)
        if self.clock:
            self.clock.t += self.advance
        r = {"requested_model": model, "executed_models": [model], "api_key_source": "none", "fallback_used": False,
             "is_error": False, "synthetic": True, "auth": dict(AUTH), "cli_duration_ms": 12.5,
             "tokens": {"input": 10, "output": 5}, "output_chars": 20}
        r.update(self.overrides)
        return r


_DEFAULT = object()


class World(unittest.TestCase):
    max_runs = 3
    max_units = 6

    def setUp(self):
        self._popen = mock.patch.object(subprocess, "Popen", side_effect=AssertionError("process started in a unit test"))
        self._popen.start()
        self.addCleanup(self._popen.stop)
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = os.path.realpath(self._tmp.name)
        self.law = os.path.join(root, "law")
        self.outside = os.path.join(root, "outside")
        for d in ("sources", "outputs", "state"):
            os.makedirs(os.path.join(self.law, d))
        os.makedirs(self.outside)
        self.src = os.path.join(self.law, "sources")
        self.out = os.path.join(self.law, "outputs")
        dev = {}
        for i, cid in enumerate(DEV, 1):
            data = f"{SRC_SENTINEL} synthetic body {i}\n".encode()
            with open(os.path.join(self.src, f"s{i}.txt"), "wb") as fh:
                fh.write(data)
            dev[cid] = {"file": f"s{i}.txt", "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
        self.manifest_path = os.path.join(self.law, "state", "manifest.json")
        raw = json.dumps({"version": 1, "dev": dev, "heldout": [HELD], "ocr_excluded": [OCR]}, sort_keys=True).encode()
        with open(self.manifest_path, "wb") as fh:
            fh.write(raw)
        self.manifest_sha = hashlib.sha256(raw).hexdigest()
        self.grant_path = os.path.join(self.law, "state", "grant.json")
        self.write_grant()
        self.clock = Clock()
        self.backend = FakeBackend(self.clock)
        self.gates = list(VERIFIED)
        self.auth = dict(AUTH)
        self.profile = "law"
        self.environ = {"PATH": "/usr/bin", "HOME": "/home/x"}
        self.wall = NOW
        self.runner = Runner(self.config())

    def write_grant(self, **over):
        g = {"grant_id": "grant-synthetic-0001", "code_hash": package_hash(), "allowlist_hash": self.manifest_sha, "model": MODEL,
             "max_runs": self.max_runs, "max_units": self.max_units, "issued_at": NOW - 10, "expires_at": NOW + 3600, "profile": "law"}
        g.update(over)
        with open(self.grant_path, "w") as fh:
            json.dump(g, fh)

    def config(self, **over):
        c = dict(profile_provider=lambda: self.profile, gates_provider=lambda: self.gates, auth_provider=lambda: self.auth,
                 backend=self.backend, grant_path=self.grant_path, ledger_path=os.path.join(self.law, "state", "ledger.json"),
                 manifest_path=self.manifest_path, manifest_sha256=self.manifest_sha, source_root=self.src, law_root=self.law,
                 output_dir=self.out, environ=lambda: self.environ, wall_clock=lambda: self.wall, mono_clock=self.clock)
        c.update(over)
        return Config(**c)

    def call(self, args=_DEFAULT, **kw):
        if args is _DEFAULT:
            args = {"case_ids": [DEV[0]], "iterations": 1, "timeout_sec": 60}
        return json.loads(self.runner.handle(args, **kw))

    def ledger(self):
        with open(os.path.join(self.law, "state", "ledger.json")) as fh:
            return json.load(fh)

    def reset_ledger(self):
        try:
            os.unlink(os.path.join(self.law, "state", "ledger.json"))
        except FileNotFoundError:
            pass

import json
import os
import unittest

from lume_timing import subscription
from lume_timing.contract import Reject, validate_request
from lume_timing.runner import Runner

from .support import DEV, GATE_IDS, HELD, OCR, SENTINEL, VERIFIED, World

OK = {"case_ids": [DEV[0]], "iterations": 1, "timeout_sec": 60}


class Rejection(World):
    def assertRejected(self, args, code=None):
        r = self.call(args)
        self.assertFalse(r["ok"], r)
        if code:
            self.assertEqual(r["error"], code)
        self.assertEqual(self.backend.calls, [], "backend invoked on rejected input")
        self.assertNotIn(SENTINEL, json.dumps(r))
        return r

    def test_happy_path_control(self):
        r = self.call(OK)
        self.assertTrue(r["ok"], r)
        self.assertEqual(len(self.backend.calls), 1)

    def test_unknown_heldout_ocr_ids_same_code(self):
        for cid in ("dev-case-9999", HELD, OCR):
            self.assertRejected({**OK, "case_ids": [cid]}, "id_not_allowed")

    def test_mixed_valid_and_heldout(self):
        self.assertRejected({**OK, "case_ids": [DEV[0], HELD]}, "id_not_allowed")

    def test_path_and_format_attacks_in_ids(self):
        for bad in ("../etc/passwd", "/etc/passwd", "dev-case-0001/../x", "C:\\x", "dev case", "DEV-CASE-0001", "a", "x" * 80,
                    "dev-case-0001\n", "dev-case-0001\x00", "~/s1", "$(id)", ";ls", "dev-case-0001.txt"):
            self.assertRejected({**OK, "case_ids": [bad]}, "bad_id_format")

    def test_extra_and_override_fields(self):
        for extra in ("path", "command", "executable", "env", "endpoint", "model", "fallback_model", "output_root", "output_dir",
                      "profile", "grant", "grant_path", "argv", "shell", "settings", "base_url", "api_key"):
            self.assertRejected({**OK, extra: SENTINEL}, "unknown_field")

    def test_missing_fields(self):
        for k in OK:
            self.assertRejected({a: b for a, b in OK.items() if a != k}, "missing_field")

    def test_type_checks_before_lookup(self):
        for args in (None, [], "x", 5, {**OK, "case_ids": "dev-case-0001"}, {**OK, "case_ids": [1]}, {**OK, "case_ids": [None]},
                     {**OK, "case_ids": [[DEV[0]]]}, {**OK, "iterations": True}, {**OK, "iterations": 1.0}, {**OK, "iterations": "1"},
                     {**OK, "timeout_sec": False}, {**OK, "timeout_sec": 5.5}, {**OK, "timeout_sec": None}, {**OK, "case_ids": {"a": 1}}):
            self.assertRejected(args)

    def test_nonfinite_numbers(self):
        for raw in ('{"case_ids":["dev-case-0001"],"iterations":NaN,"timeout_sec":60}',
                    '{"case_ids":["dev-case-0001"],"iterations":1,"timeout_sec":Infinity}',
                    '{"case_ids":["dev-case-0001"],"iterations":1,"timeout_sec":-Infinity}',
                    '{"case_ids":["dev-case-0001"],"iterations":1,"timeout_sec":1e999}'):
            self.assertRejected(raw, "nonfinite_number")

    def test_duplicate_key_json(self):
        self.assertRejected('{"case_ids":["dev-case-0001"],"iterations":1,"iterations":2,"timeout_sec":60}', "duplicate_key")
        self.assertRejected('{"case_ids":["dev-case-0001"],"case_ids":["dev-case-0002"],"iterations":1,"timeout_sec":60}', "duplicate_key")

    def test_malformed_and_oversize_json(self):
        self.assertRejected("{not json", "malformed_json")
        self.assertRejected("[" * 5000, "request_too_large")
        self.assertRejected(b"\xff\xfe", "bad_encoding")
        self.assertRejected('{"case_ids":["dev-case-0001"],"iterations":1,"timeout_sec":60}' + " " * 3000, "request_too_large")

    def test_duplicate_ids(self):
        self.assertRejected({**OK, "case_ids": [DEV[0], DEV[0]]}, "duplicate_id")

    def test_wrong_profile(self):
        for p in (None, "", "main", "LAW", "law ", "default"):
            self.profile = p
            self.assertRejected(OK, "wrong_profile")

    def test_grant_profile_mismatch(self):
        self.write_grant(profile="main")
        self.assertRejected(OK, "grant_mismatch")

    def test_missing_grant(self):
        os.unlink(self.grant_path)
        self.assertRejected(OK, "grant_missing")

    def test_expired_and_not_yet_valid_grant(self):
        self.wall = self.wall + 3601
        self.assertRejected(OK, "grant_expired")
        self.wall = self.wall - 7200
        self.assertRejected(OK, "grant_not_yet_valid")

    def test_stale_code_and_allowlist_hash(self):
        self.write_grant(code_hash="0" * 64)
        self.assertRejected(OK, "grant_stale_code")
        self.write_grant(allowlist_hash="1" * 64)
        self.assertRejected(OK, "grant_stale_allowlist")

    def test_grant_bad_shape(self):
        for over in ({"model": "claude-opus-5-5"}, {"max_runs": 99}, {"max_units": 0}, {"max_runs": True}, {"expires_at": 10**12},
                     {"expires_at": 1}, {"grant_id": "x"}, {"code_hash": "zz"}):
            self.write_grant(**over)
            self.assertRejected(OK)
        with open(self.grant_path, "w") as fh:
            fh.write('{"grant_id": "grant-synthetic-0001", "grant_id": "grant-synthetic-0002"}')
        self.assertRejected(OK, "grant_invalid")

    def test_mismatched_source_hash(self):
        with open(os.path.join(self.src, "s1.txt"), "ab") as fh:
            fh.write(b"x")
        self.assertRejected(OK, "source_unverified")

    def test_same_size_changed_source(self):
        p = os.path.join(self.src, "s1.txt")
        data = open(p, "rb").read()
        open(p, "wb").write(b"Z" * len(data))
        self.assertRejected(OK, "source_unverified")

    def test_missing_source(self):
        os.unlink(os.path.join(self.src, "s1.txt"))
        self.assertRejected(OK, "source_unverified")

    def test_symlink_source_escape(self):
        target = os.path.join(self.outside, "s1.txt")
        os.replace(os.path.join(self.src, "s1.txt"), target)
        os.symlink(target, os.path.join(self.src, "s1.txt"))
        self.assertRejected(OK, "source_unverified")

    def test_symlink_inside_tree_is_also_refused(self):
        os.replace(os.path.join(self.src, "s1.txt"), os.path.join(self.src, "real.txt"))
        os.symlink("real.txt", os.path.join(self.src, "s1.txt"))
        self.assertRejected(OK, "source_unverified")

    def test_manifest_hash_mismatch_and_tamper(self):
        self.runner = Runner(self.config(manifest_sha256="a" * 64))
        self.assertRejected(OK, "manifest_hash_mismatch")
        self.runner = Runner(self.config())
        with open(self.manifest_path, "a") as fh:
            fh.write(" ")
        self.assertRejected(OK, "manifest_hash_mismatch")

    def test_each_unmet_gate_blocks(self):
        for gid in GATE_IDS:
            self.gates = [dict(g, status="UNMET", evidence="") if g["id"] == gid else g for g in VERIFIED]
            self.assertRejected(OK, "gates_not_verified")

    def test_gate_verified_without_github_evidence_blocks(self):
        for ev in ("", "trust me", "http://github.com/Nercari/lume/issues/1", "https://github.com/Other/lume/issues/1", None):
            self.gates = [dict(g, evidence=ev) for g in VERIFIED]
            self.assertRejected(OK, "gates_not_verified")

    def test_missing_gate_blocks(self):
        self.gates = VERIFIED[:3]
        self.assertRejected(OK, "gates_not_verified")
        self.gates = []
        self.assertRejected(OK, "gates_not_verified")

    def test_live_gates_json_blocks_all_four(self):
        here = os.path.dirname(os.path.abspath(__file__))
        live = os.path.join(here, "..", "..", "..", "audits", "hillclimb", "voto-timing", "gates.json")
        with open(live) as fh:
            doc = json.load(fh)
        self.assertEqual([g["status"] for g in doc["gates"]], ["UNMET"] * 4)
        self.gates = doc["gates"]
        self.assertRejected(OK, "gates_not_verified")

    def test_not_configured_and_no_backend(self):
        self.assertEqual(json.loads(Runner(None).handle(OK))["error"], "not_configured")
        self.runner = Runner(self.config(backend=None))
        self.assertRejected(OK, "not_configured")

    def test_validate_request_never_echoes_input(self):
        for bad in ({"case_ids": [SENTINEL], "iterations": 1, "timeout_sec": 1}, {SENTINEL: 1}, {**OK, SENTINEL: 1}):
            with self.assertRaises(Reject) as cm:
                validate_request(bad)
            self.assertNotIn(SENTINEL, cm.exception.code)
            self.assertNotIn(SENTINEL, repr(cm.exception))


if __name__ == "__main__":
    unittest.main()

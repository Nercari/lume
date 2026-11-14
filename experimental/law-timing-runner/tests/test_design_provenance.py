"""Design-labeled synthetic checks for design/provenance_contract.py. No process, socket, file or account access."""
import ast
import contextlib
import io
import os
import socket
import subprocess
import unittest
from unittest import mock

import lume_timing
from design import provenance_contract as pc
from lume_timing.grant import package_hash

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_main():
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = pc.main()
    return code, buf.getvalue()


class DesignProvenance(unittest.TestCase):
    def setUp(self):
        for target, name in ((subprocess, "Popen"), (socket, "socket")):
            p = mock.patch.object(target, name, side_effect=AssertionError("design check touched a process or socket"))
            p.start()
            self.addCleanup(p.stop)

    def test_matrix_counts_and_all_rows_pass(self):
        rows = pc.matrix()
        self.assertEqual(len(rows), 35)
        self.assertEqual(sum(r["case"].startswith("accept") for r in rows), 3)
        self.assertEqual(sum(r["case"].startswith("reject") for r in rows), 32)
        bad = [r for r in rows if not r["pass"]]
        self.assertEqual(bad, [])

    def test_output_is_repeatable(self):
        (c1, o1), (c2, o2) = run_main(), run_main()
        self.assertEqual((c1, c2), (0, 0))
        self.assertEqual(o1, o2)
        self.assertIn("SYNTHETIC_DESIGN_CONTRACT_EVIDENCE", o1)

    def test_accept_never_grants_production_trust(self):
        r = pc.verify_envelope(pc.sign(dict(pc.GOOD)), pc.EXPECTED, now=pc.NOW)
        self.assertTrue(r["accepted"])
        self.assertIs(r["production_trust"], False)
        r = pc.verify_envelope(dict(pc.GOOD), pc.EXPECTED, now=pc.NOW)
        self.assertFalse(r["accepted"])
        self.assertIs(r["production_trust"], False)

    def test_coding_agent_evidence_is_not_inference_provenance(self):
        r = pc.verify_envelope(pc.CODING_AGENT_EVIDENCE, pc.EXPECTED, now=pc.NOW)
        self.assertEqual((r["accepted"], r["reason"]), (False, "wrong_evidence_kind"))

    def test_design_module_has_no_runtime_reach(self):
        with open(os.path.join(HERE, "design", "provenance_contract.py")) as fh:
            tree = ast.parse(fh.read())
        imported = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                imported |= {a.name.split(".")[0] for a in n.names}
            elif isinstance(n, ast.ImportFrom):
                imported.add(n.module.split(".")[0])
        self.assertEqual(imported, {"hashlib", "hmac", "json", "lume_timing"})
        names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
        self.assertTrue({"open", "exec", "eval", "__import__"}.isdisjoint(names))

    def test_runtime_package_does_not_import_design(self):
        pkg = os.path.dirname(lume_timing.__file__)
        for name in os.listdir(pkg):
            if name.endswith(".py"):
                with open(os.path.join(pkg, name)) as fh:
                    self.assertNotRegex(fh.read(), r"(?m)^\s*(from|import)\s+design\b", name)

    def test_package_hash_unchanged_by_design_files(self):
        with open(os.path.join(HERE, "CAPABILITY.md")) as fh:
            doc = fh.read()
        self.assertIn(package_hash(), doc)


if __name__ == "__main__":
    unittest.main()

import json
import unittest

import lume_timing
from lume_timing.contract import SCHEMA, TOOL_NAME, TOOLSET
from lume_timing.runner import Runner

from .support import DEV, World


class FakeCtx:
    def __init__(self):
        self.calls = []

    def register_tool(self, **kw):
        self.calls.append(kw)


class Register(World):
    def test_inert_registration(self):
        ctx = FakeCtx()
        lume_timing.register(ctx)
        self.assertEqual(len(ctx.calls), 1)
        c = ctx.calls[0]
        self.assertEqual((c["name"], c["toolset"]), (TOOL_NAME, TOOLSET))
        self.assertIs(c["override"], False)
        self.assertFalse(c["check_fn"](), "tool must stay hidden without an injected config")
        self.assertEqual(json.loads(c["handler"]({"case_ids": [DEV[0]], "iterations": 1, "timeout_sec": 1}))["error"], "not_configured")

    def test_toolset_is_not_a_terminal_toolset(self):
        self.assertNotIn(TOOLSET, ("terminal", "code_execution", "browser", "computer_use", "delegation", "cronjob"))
        self.assertEqual(TOOLSET, "lume_timing")

    def test_check_fn_follows_profile(self):
        ctx = FakeCtx()
        lume_timing.register(ctx, Runner(self.config()))
        check = ctx.calls[0]["check_fn"]
        self.assertTrue(check())
        for p in (None, "main", "default", "LAW"):
            self.profile = p
            self.assertFalse(check())

    def test_schema_matches_contract(self):
        p = SCHEMA["parameters"]
        self.assertIs(p["additionalProperties"], False)
        self.assertEqual(set(p["properties"]), {"case_ids", "iterations", "timeout_sec"})
        for name in ("path", "command", "model", "env", "profile", "endpoint"):
            self.assertNotIn(name, p["properties"])

    def test_handler_ignores_extra_kwargs(self):
        ctx = FakeCtx()
        lume_timing.register(ctx, Runner(self.config()))
        r = json.loads(ctx.calls[0]["handler"]({"case_ids": [DEV[0]], "iterations": 1, "timeout_sec": 60}, task_id="t", user_task="x"))
        self.assertTrue(r["ok"])

    def test_no_default_backend_reachable(self):
        import lume_timing.runner as rn
        self.assertIsNone(Runner().cfg)
        for name in dir(rn):
            self.assertFalse(name.lower().endswith("backend") and callable(getattr(rn, name)) and name != "Config", name)


if __name__ == "__main__":
    unittest.main()


class DocHash(unittest.TestCase):
    def test_capability_document_names_the_live_code_hash(self):
        import os
        from lume_timing.grant import package_hash
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(here, "CAPABILITY.md"), encoding="utf-8") as fh:
            self.assertIn(package_hash(), fh.read())

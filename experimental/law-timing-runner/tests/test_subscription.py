import unittest

from lume_timing import subscription as sub
from lume_timing.contract import Reject
from lume_timing.process import build_claude_argv

from .support import AUTH, DEV, MODEL, World

OK = {"case_ids": [DEV[0]], "iterations": 1, "timeout_sec": 60}


class Subscription(World):
    def test_each_blocked_env_var_refuses_before_execution(self):
        for k in sub.BLOCKED_ENV + ("ANTHROPIC_FUTURE_THING", "CLAUDE_CODE_USE_ANYTHING"):
            self.environ = {"PATH": "/usr/bin", k: "x"}
            r = self.call()
            self.assertEqual(r["error"], "billing_env_present", k)
        self.assertEqual(self.backend.calls, [])

    def test_child_env_is_an_allowlist(self):
        env = sub.child_env({"PATH": "/p", "HOME": "/h", "LANG": "C", "ANTHROPIC_API_KEY": "x", "AWS_SECRET_ACCESS_KEY": "y", "FOO": "1"})
        self.assertEqual(env, {"PATH": "/p", "HOME": "/h", "LANG": "C"})

    def test_auth_status_must_be_subscription_login(self):
        for bad in (None, {}, {**AUTH, "loggedIn": False}, {**AUTH, "loggedIn": "true"}, {**AUTH, "authMethod": "api_key"},
                    {**AUTH, "apiProvider": "bedrock"}, {**AUTH, "apiProvider": "vertex"}, {**AUTH, "apiProvider": "foundry"},
                    {**AUTH, "subscriptionType": ""}, {**AUTH, "subscriptionType": None}):
            self.auth = bad
            self.assertEqual(self.call()["error"], "auth_not_subscription")
        self.assertEqual(self.backend.calls, [])

    def test_receipt_contract_violations_fail_closed(self):
        cases = {"requested_model": "claude-sonnet-5-5", "executed_models": ["claude-sonnet-5-5"], "executed_models_mixed": None,
                 "api_key_source": "ANTHROPIC_API_KEY", "fallback_used": True, "is_error": True, "synthetic": "yes",
                 "auth": {**AUTH, "authMethod": "api_key"}, "cli_duration_ms": float("nan"), "tokens": {"input": -1, "output": 1},
                 "output_chars": True}
        for k, v in cases.items():
            if v is None:
                self.backend.overrides = {"executed_models": [MODEL, "claude-sonnet-5-5"]}
            else:
                self.backend.overrides = {k: v}
            self.reset_ledger()
            r = self.call()
            self.assertFalse(r["ok"], k)
            self.assertEqual(r["status"], "unit_failed", k)
            self.assertEqual(r["subscription_proof"], False)

    def test_opus_and_unknown_models_not_allowed(self):
        for m in ("claude-opus-5-5", "claude-fable-5-2", "gpt-5", "", "claude-haiku-5-5 "):
            self.write_grant(model=m)
            self.assertEqual(self.call()["error"], "grant_mismatch")
        self.assertEqual(self.backend.calls, [])

    def test_claimed_subscription_is_not_proof(self):
        r = self.call()
        self.assertTrue(r["ok"])
        self.assertIs(r["subscription_proof"], False)
        self.assertEqual(r["backend_trust"], "TEST_DOUBLE")

    def test_argv_is_fixed_and_safe(self):
        argv = build_claude_argv(MODEL)
        self.assertIsInstance(argv, tuple)
        self.assertNotIn("--bare", argv)
        self.assertNotIn("--fallback-model", argv)
        self.assertEqual(argv[argv.index("--tools") + 1], "")
        self.assertIn("--no-session-persistence", argv)
        self.assertEqual(argv[argv.index("--model") + 1], MODEL)
        with self.assertRaises(ValueError):
            build_claude_argv("claude-opus-5-5")
        with self.assertRaises(ValueError):
            build_claude_argv(MODEL + "; rm -rf /")


if __name__ == "__main__":
    unittest.main()

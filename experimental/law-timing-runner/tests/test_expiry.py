"""Controlled-clock expiry tests. The wall clock follows the fake monotonic clock, so a delay in one step moves both."""
from unittest import mock

from lume_timing import runner as runner_mod
from lume_timing.runner import Runner

from .support import DEV, NOW, World

OK = {"case_ids": [DEV[0]], "iterations": 1, "timeout_sec": 60}


class Expiry(World):
    def setUp(self):
        super().setUp()
        self.build()

    def build(self, **over):
        self.runner = Runner(self.config(wall_clock=lambda: NOW + self.clock.t, **over))

    def delay(self, obj, name, secs):
        real = getattr(obj, name)

        def wrapped(*a, **k):
            r = real(*a, **k)
            self.clock.t += secs
            return r
        return mock.patch.object(obj, name, wrapped)

    def spent(self):
        try:
            e = self.ledger()["grant-synthetic-0001"]
        except (FileNotFoundError, KeyError):
            return (0, 0, {})
        return (e["runs"], e["units"], e["in_flight"])

    def assertExpiredWithoutExecution(self, r):
        self.assertEqual((r["ok"], r.get("error")), (False, "grant_expired"), r)
        self.assertEqual(self.backend.calls, [])
        self.assertEqual(self.spent(), (0, 0, {}))

    def test_delay_in_auth_past_expiry_is_rejected(self):
        self.write_grant(expires_at=NOW + 1)

        def slow_auth():
            self.clock.t += 2
            return self.auth
        self.build(auth_provider=slow_auth)
        self.assertExpiredWithoutExecution(self.call())

    def test_delay_in_source_verification_past_expiry_is_rejected(self):
        self.write_grant(expires_at=NOW + 1)
        with self.delay(runner_mod, "read_verified_source", 2):
            self.assertExpiredWithoutExecution(self.call())

    def test_delay_in_lock_open_past_expiry_is_rejected_before_reserve(self):
        self.write_grant(expires_at=NOW + 1)
        with self.delay(runner_mod.Ledger, "open_exclusive", 2):
            self.assertExpiredWithoutExecution(self.call())

    def test_delay_in_reserve_past_expiry_is_rejected_without_spend(self):
        self.write_grant(expires_at=NOW + 1)
        with self.delay(runner_mod.Ledger, "reserve", 2):
            self.assertExpiredWithoutExecution(self.call())

    def test_deadline_uses_real_remaining_lifetime(self):
        self.write_grant(expires_at=NOW + 30)

        def slow_auth():
            self.clock.t += 9.9
            return self.auth
        self.build(auth_provider=slow_auth)
        r = self.call()
        self.assertTrue(r["ok"], r)
        self.assertAlmostEqual(self.backend.calls[0][2], 20.1, places=6)
        self.assertEqual((r["backend_trust"], r["subscription_proof"]), ("TEST_DOUBLE", False))

    def test_sub_second_remainder_is_not_rounded_up(self):
        self.write_grant(expires_at=NOW + 10)

        def slow_auth():
            self.clock.t += 9.9
            return self.auth
        self.build(auth_provider=slow_auth)
        self.call()
        self.assertAlmostEqual(self.backend.calls[0][2], 0.1, places=6)

    def test_wall_expiry_between_units_stops_the_run(self):
        self.write_grant(expires_at=NOW + 30)
        self.wall = NOW
        self.runner = Runner(self.config())
        self.backend.mutate = lambda: setattr(self, "wall", NOW + 100)
        r = self.call({"case_ids": DEV, "iterations": 1, "timeout_sec": 60})
        self.assertEqual(r["status"], "timeout")
        self.assertFalse(r["ok"])
        self.assertEqual(len(self.backend.calls), 1)
        self.assertEqual(self.spent(), (1, 1, {}))

    def test_remaining_lifetime_shrinks_across_units(self):
        self.write_grant(expires_at=NOW + 50)
        self.backend.advance = 20.0
        self.call({"case_ids": DEV, "iterations": 1, "timeout_sec": 600})
        self.assertEqual([c[2] for c in self.backend.calls], [50, 30.0, 10.0])

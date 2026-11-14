import json
import os
import threading
import unittest

from lume_timing.runner import Runner

from .support import DEV, MODEL, World

OK = {"case_ids": [DEV[0]], "iterations": 1, "timeout_sec": 60}


class Bounds(World):
    def rejected(self, args):
        r = self.call(args)
        self.assertFalse(r["ok"], r)
        self.assertEqual(self.backend.calls, [])
        return r

    def test_zero_negative_over_limit(self):
        for k, vals in (("iterations", (0, -1, 3, 10**9)), ("timeout_sec", (0, -1, 601, 10**9)), ("case_ids", ([], DEV + ["dev-case-0004"]))):
            for v in vals:
                self.rejected({**OK, k: v})

    def test_max_request_is_accepted_and_bounded(self):
        r = self.call({"case_ids": DEV, "iterations": 2, "timeout_sec": 600})
        self.assertTrue(r["ok"], r)
        self.assertEqual(len(self.backend.calls), 6)

    def test_request_above_grant_units_rejected(self):
        self.max_units = 2
        self.write_grant(max_units=2)
        r = self.rejected({"case_ids": DEV, "iterations": 1, "timeout_sec": 60})
        self.assertEqual(r["error"], "budget_exhausted")

    def test_grant_runs_cap_and_ledger_persist(self):
        for _ in range(3):
            self.assertTrue(self.call()["ok"])
        r = self.call()
        self.assertEqual(r["error"], "budget_exhausted")
        self.assertEqual(len(self.backend.calls), 3)

    def test_restart_replay_does_not_reset_budget(self):
        for _ in range(3):
            self.call()
        self.runner = Runner(self.config())
        self.assertEqual(self.call()["error"], "budget_exhausted")
        self.assertEqual(self.ledger()["grant-synthetic-0001"]["runs"], 3)

    def test_expired_grant_not_reusable_after_restart(self):
        self.call()
        self.runner = Runner(self.config())
        self.wall += 4000
        self.assertEqual(self.call()["error"], "grant_expired")

    def test_raised_caps_under_same_grant_id_refused(self):
        self.call()
        self.write_grant(max_runs=3, max_units=6, expires_at=self.wall + 7200)
        self.assertEqual(self.call()["error"], "grant_replaced")

    def test_crash_in_flight_counts_as_spent(self):
        self.call()
        led = self.ledger()
        led["grant-synthetic-0001"]["in_flight"] = {"deadbeef": 4}
        with open(os.path.join(self.law, "state", "ledger.json"), "w") as fh:
            json.dump(led, fh)
        self.runner = Runner(self.config())
        r = self.call({"case_ids": DEV, "iterations": 1, "timeout_sec": 60})
        self.assertEqual(r["error"], "budget_exhausted")
        self.assertEqual(self.ledger()["grant-synthetic-0001"]["units"], 1)
        self.runner = Runner(self.config())
        self.call()
        e = self.ledger()["grant-synthetic-0001"]
        self.assertEqual((e["runs"], e["units"], e["in_flight"]), (3, 6, {}))

    def test_no_leaked_reservation_after_failures(self):
        self.backend.raise_text = "boom"
        r = self.call()
        self.assertFalse(r["ok"])
        e = self.ledger()["grant-synthetic-0001"]
        self.assertEqual(e["in_flight"], {})
        self.assertEqual((e["runs"], e["units"]), (1, 1))

    def test_rejected_before_execution_costs_nothing(self):
        self.rejected({**OK, "iterations": 0})
        self.profile = "main"
        self.rejected(OK)
        self.assertFalse(os.path.exists(os.path.join(self.law, "state", "ledger.json")))

    def test_failed_validation_after_reserve_is_settled(self):
        self.backend.overrides = {"fallback_used": True}
        self.call()
        e = self.ledger()["grant-synthetic-0001"]
        self.assertEqual(e["in_flight"], {})
        self.assertEqual(e["runs"], 1)

    def test_shared_deadline_stops_remaining_units(self):
        self.backend.advance = 25.0
        r = self.call({"case_ids": DEV, "iterations": 2, "timeout_sec": 60})
        self.assertEqual(r["status"], "timeout")
        self.assertFalse(r["ok"])
        self.assertEqual(len(self.backend.calls), 3, "no unit may start after the shared deadline")
        self.assertEqual(r["aggregate"]["units_started"], 3)
        self.assertEqual(self.ledger()["grant-synthetic-0001"]["units"], 3)

    def test_each_unit_gets_remaining_not_full_budget(self):
        self.backend.advance = 20.0
        self.call({"case_ids": DEV, "iterations": 1, "timeout_sec": 100})
        self.assertEqual([c[2] for c in self.backend.calls], [100, 80.0, 60.0])

    def test_grant_expiry_shortens_deadline(self):
        self.wall = self.wall + 3594
        self.backend.advance = 8
        self.call({"case_ids": DEV, "iterations": 1, "timeout_sec": 600})
        self.assertLessEqual(self.backend.calls[0][2], 6)

    def test_concurrent_call_refused_not_queued(self):
        inner = {}

        def reenter():
            inner.update(json.loads(self.runner.handle(OK)))

        self.backend.mutate = reenter
        outer = self.call()
        self.assertTrue(outer["ok"])
        self.assertEqual(inner["error"], "busy")
        self.assertEqual(len(self.backend.calls), 1)

    def test_concurrent_threads_never_exceed_cap(self):
        results, gate = [], threading.Barrier(8)

        def go():
            gate.wait()
            results.append(json.loads(self.runner.handle(OK)))

        ts = [threading.Thread(target=go) for _ in range(8)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        done = [r for r in results if r["ok"]]
        self.assertLessEqual(len(done), 3)
        self.assertLessEqual(len(self.backend.calls), 3)
        self.assertTrue(all(r["error"] in ("busy", "budget_exhausted") for r in results if not r["ok"]))

    def test_corrupt_ledger_fails_closed(self):
        with open(os.path.join(self.law, "state", "ledger.json"), "w") as fh:
            fh.write("{broken")
        r = self.call()
        self.assertEqual(r["error"], "ledger_corrupt")
        self.assertEqual(self.backend.calls, [])


if __name__ == "__main__":
    unittest.main()

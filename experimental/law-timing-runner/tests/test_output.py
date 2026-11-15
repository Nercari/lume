import json
import logging
import os
import unittest

from lume_timing.runner import Runner

from .support import DEV, SENTINEL, SRC_SENTINEL, World

OK = {"case_ids": [DEV[0]], "iterations": 1, "timeout_sec": 60}


class Output(World):
    def files(self, d):
        return sorted(os.listdir(d))

    def test_result_written_only_under_law_output_root(self):
        r = self.call()
        self.assertTrue(r["ok"])
        self.assertEqual(self.files(self.out), [r["receipt_id"] + ".json"])
        self.assertEqual(self.files(self.outside), [])
        with open(os.path.join(self.out, r["receipt_id"] + ".json")) as fh:
            body = json.load(fh)
        self.assertEqual(body["receipt_id"], r["receipt_id"])

    def test_return_value_has_no_path_or_text(self):
        r = json.dumps(self.call({"case_ids": DEV, "iterations": 1, "timeout_sec": 60}))
        for needle in (self.law, self.src, self.out, self.outside, "s1.txt", SRC_SENTINEL, "/home/", "sources", "outputs"):
            self.assertNotIn(needle, r)

    def test_output_root_outside_law_rejected(self):
        for bad in (self.outside, os.path.dirname(self.law), self.law):
            self.runner = Runner(self.config(output_dir=bad))
            r = self.call()
            self.assertEqual(r["error"], "output_root_invalid")
        self.assertEqual(self.backend.calls, [])
        self.assertEqual(self.files(self.outside), [])

    def test_output_dir_symlink_to_outside_rejected(self):
        link = os.path.join(self.law, "link-out")
        os.symlink(self.outside, link)
        self.runner = Runner(self.config(output_dir=link))
        self.assertEqual(self.call()["error"], "output_root_invalid")
        self.assertEqual(self.backend.calls, [])

    def test_output_parent_symlink_to_outside_rejected(self):
        os.symlink(self.outside, os.path.join(self.law, "via"))
        self.runner = Runner(self.config(output_dir=os.path.join(self.law, "via")))
        self.assertEqual(self.call()["error"], "output_root_invalid")

    def test_missing_output_dir_rejected_before_execution(self):
        os.rmdir(self.out)
        self.assertEqual(self.call()["error"], "output_root_invalid")
        self.assertEqual(self.backend.calls, [])

    def test_path_swap_during_run_cannot_redirect_write(self):
        moved = os.path.join(self.law, "outputs-moved")

        def swap():
            os.rename(self.out, moved)
            os.symlink(self.outside, self.out)

        self.backend.mutate = swap
        r = self.call()
        self.assertEqual(self.files(self.outside), [], "write escaped through a swapped path")
        self.assertTrue(r["ok"], r)
        self.assertEqual(self.files(moved), [r["receipt_id"] + ".json"])

    def test_preexisting_symlink_at_result_name_not_followed(self):
        import lume_timing.runner as rn
        orig = rn.secrets.token_hex
        rn.secrets.token_hex = lambda n: "feedfacefeedface"
        self.addCleanup(setattr, rn.secrets, "token_hex", orig)
        target = os.path.join(self.outside, "t")
        os.symlink(target, os.path.join(self.out, "feedfacefeedface.json"))
        r = self.call()
        self.assertEqual(r["error"], "output_write_failed")
        self.assertFalse(os.path.exists(target))

    def test_sentinels_do_not_leak_from_backend_failure(self):
        self.backend.raise_text = f"{SENTINEL} {self.src} {SRC_SENTINEL}"
        with self.assertLogs("lume_timing", level=logging.DEBUG) as cm:
            r = self.call()
            logging.getLogger("lume_timing").info("anchor")
        blob = json.dumps(r) + "\n".join(cm.output) + "".join(open(os.path.join(self.out, f)).read() for f in self.files(self.out))
        for needle in (SENTINEL, SRC_SENTINEL, self.src, self.law):
            self.assertNotIn(needle, blob)
        self.assertEqual(r["status"], "unit_failed")

    def test_extra_receipt_fields_are_dropped(self):
        self.backend.overrides = {"text": SENTINEL, "stderr": SENTINEL, "path": self.src, "prompt": SRC_SENTINEL}
        r = self.call()
        blob = json.dumps(r) + open(os.path.join(self.out, r["receipt_id"] + ".json")).read()
        self.assertTrue(r["ok"])
        for needle in (SENTINEL, SRC_SENTINEL, self.src):
            self.assertNotIn(needle, blob)

    def test_rejection_logs_have_fixed_codes_only(self):
        with self.assertLogs("lume_timing", level=logging.DEBUG) as cm:
            self.call({"case_ids": [SENTINEL], "iterations": 1, "timeout_sec": 1})
        self.assertNotIn(SENTINEL, "\n".join(cm.output))

    def test_internal_error_has_no_message(self):
        self.runner = Runner(self.config(gates_provider=lambda: (_ for _ in ()).throw(RuntimeError(SENTINEL))))
        r = self.call()
        self.assertEqual(r, {"ok": False, "error": "internal_error"})

    def test_labels_and_no_baseline_claim(self):
        r = self.call()
        self.assertEqual(r["timing_kind"], "SYNTHETIC_PROXY")
        for k in ("chat_upload_to_final_voto_sec", "human_review_sec", "edit_burden"):
            self.assertEqual(r[k], "UNMEASURED")
        self.assertIs(r["baseline_claimed"], False)
        self.assertIs(r["improvement_claimed"], False)
        self.assertIs(r["subscription_proof"], False)
        self.assertIn("cli_pipeline_sec", r["aggregate"])
        self.assertNotIn("chat_upload_to_final_voto_sec", r["aggregate"])

    def test_fake_backend_is_labeled_test_double(self):
        self.assertEqual(self.call()["backend_trust"], "TEST_DOUBLE")
        self.backend.SYNTHETIC = False
        self.backend.overrides = {"synthetic": False}
        self.assertEqual(self.call()["backend_trust"], "BACKEND_REPORTED_UNVERIFIED")
        self.assertIs(self.call()["subscription_proof"], False)


if __name__ == "__main__":
    unittest.main()

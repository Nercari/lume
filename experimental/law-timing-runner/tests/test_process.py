"""Process helper tests use a synthetic Python child only. No claude binary, no network."""
import os
import subprocess
import sys
import tempfile
import time
import unittest

from lume_timing.process import run_bounded

ENV = {"PATH": os.environ.get("PATH", "")}


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    try:
        with open(f"/proc/{pid}/stat") as fh:
            return fh.read().split(")")[-1].split()[0] != "Z"
    except OSError:
        return False


class Process(unittest.TestCase):
    def run_py(self, code, **kw):
        kw.setdefault("timeout_sec", 5)
        kw.setdefault("max_output", 1000)
        return run_bounded((sys.executable, "-I", "-c", code), env=ENV, cwd=tempfile.gettempdir(), **kw)

    def test_normal_exit(self):
        r = self.run_py("import sys;sys.stdout.write('hi');sys.stderr.write('SECRET-ERR')")
        self.assertEqual((r.returncode, r.stdout, r.stderr_bytes, r.timed_out), (0, b"hi", 10, False))
        self.assertFalse(hasattr(r, "stderr"))

    def test_timeout_kills_child_and_grandchild(self):
        with tempfile.TemporaryDirectory() as d:
            pidfile = os.path.join(d, "pid")
            code = ("import subprocess,sys,time;"
                    "p=subprocess.Popen([sys.executable,'-I','-c','import time;time.sleep(60)']);"
                    f"open({pidfile!r},'w').write(str(p.pid));time.sleep(60)")
            t0 = time.monotonic()
            r = self.run_py(code, timeout_sec=1)
            self.assertTrue(r.timed_out)
            self.assertLess(time.monotonic() - t0, 5)
            grand = int(open(pidfile).read())
            for _ in range(50):
                if not alive(grand):
                    break
                time.sleep(0.1)
            self.assertFalse(alive(grand), "grandchild survived the timeout")

    def test_output_overflow_kills_and_caps(self):
        r = self.run_py("import sys,time\nwhile True: sys.stdout.write('x'*4096); sys.stdout.flush()", max_output=5000)
        self.assertTrue(r.overflow)
        self.assertLessEqual(len(r.stdout), 5000)

    def test_no_shell_interpretation(self):
        r = self.run_py("import sys;sys.stdout.write(sys.argv[0])")
        r2 = run_bounded((sys.executable, "-I", "-c", "import sys;print(sys.argv[1:])", "$(id);`id`;|x"), timeout_sec=5, max_output=1000, env=ENV, cwd=tempfile.gettempdir())
        self.assertIn(b"$(id);`id`;|x", r2.stdout)

    def test_rejects_string_argv_and_bad_bounds(self):
        for args in ("echo hi", ["echo", "hi"], (), (1,)):
            with self.assertRaises(ValueError):
                run_bounded(args, timeout_sec=1, max_output=10, env=ENV, cwd="/")
        for t, m in ((0, 10), (-1, 10), (1, 0), (1, -5), (10**6, 10)):
            with self.assertRaises(ValueError):
                run_bounded((sys.executable,), timeout_sec=t, max_output=m, env=ENV, cwd="/")

    def test_env_not_inherited(self):
        os.environ["LUME_TEST_LEAK"] = "leak"
        self.addCleanup(os.environ.pop, "LUME_TEST_LEAK", None)
        r = self.run_py("import os;print(os.environ.get('LUME_TEST_LEAK'))")
        self.assertEqual(r.stdout.strip(), b"None")

    def test_runner_module_does_not_import_process(self):
        import lume_timing.runner as rn
        self.assertNotIn("process", rn.__dict__)
        src = open(rn.__file__).read()
        self.assertNotIn("subprocess", src)
        self.assertNotIn("from .process", src)


if __name__ == "__main__":
    unittest.main()

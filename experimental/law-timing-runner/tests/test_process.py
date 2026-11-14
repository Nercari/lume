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

    def wait_dead(self, *pids):
        for _ in range(50):
            if not any(alive(p) for p in pids):
                return
            time.sleep(0.1)
        self.fail("process survived: " + ",".join(str(p) for p in pids if alive(p)))

    def test_nonreading_child_with_large_stdin_times_out_fast(self):
        t0 = time.monotonic()
        r = self.run_py("import time;time.sleep(0.5)", timeout_sec=0.05, stdin=b"x" * 200000)
        self.assertTrue(r.timed_out)
        self.assertLess(time.monotonic() - t0, 0.4)

    def test_nonexiting_child_never_reading_is_killed_with_descendant(self):
        with tempfile.TemporaryDirectory() as d:
            pidfile = os.path.join(d, "pids")
            code = ("import os,subprocess,sys,time;"
                    "p=subprocess.Popen([sys.executable,'-I','-c','import time;time.sleep(60)']);"
                    f"open({pidfile!r},'w').write(f'{{os.getpid()}} {{p.pid}}');time.sleep(60)")
            t0 = time.monotonic()
            r = self.run_py(code, timeout_sec=0.5, stdin=b"y" * 5_000_000)
            self.assertTrue(r.timed_out)
            self.assertLess(time.monotonic() - t0, 3)
            with open(pidfile) as fh:
                self.wait_dead(*map(int, fh.read().split()))

    def test_child_closes_outputs_then_reads_large_stdin(self):
        with tempfile.TemporaryDirectory() as d:
            mark = os.path.join(d, "mark")
            code = ("import hashlib,os,sys;os.close(1);os.close(2);"
                    "d=sys.stdin.buffer.read();"
                    f"open({mark!r},'w').write(f'{{len(d)}} {{hashlib.sha256(d).hexdigest()}}')")
            data = bytes(range(256)) * 782 + b"SYNTHETIC-MARKER"
            t0 = time.monotonic()
            r = self.run_py(code, stdin=data[:200000])
            import hashlib
            self.assertEqual((r.returncode, r.timed_out, r.overflow), (0, False, False))
            self.assertLess(time.monotonic() - t0, 3)
            self.assertEqual(open(mark).read(), f"200000 {hashlib.sha256(data[:200000]).hexdigest()}")

    def test_child_closes_outputs_and_never_reads_times_out_with_descendant(self):
        with tempfile.TemporaryDirectory() as d:
            pidfile = os.path.join(d, "pids")
            code = ("import os,subprocess,sys,time;"
                    "p=subprocess.Popen([sys.executable,'-I','-c','import os,time;os.close(1);os.close(2);time.sleep(60)']);"
                    f"open({pidfile!r},'w').write(f'{{os.getpid()}} {{p.pid}}');os.close(1);os.close(2);time.sleep(60)")
            t0 = time.monotonic()
            r = self.run_py(code, timeout_sec=0.6, stdin=b"y" * 200000)
            self.assertTrue(r.timed_out)
            self.assertLess(time.monotonic() - t0, 3)
            with open(pidfile) as fh:
                self.wait_dead(*map(int, fh.read().split()))

    def test_output_fills_before_child_reads_stdin(self):
        code = ("import sys;o=sys.stdout.buffer;o.write(b'x'*1000000);o.flush();"
                "n=len(sys.stdin.buffer.read());o.write(str(n).encode())")
        r = self.run_py(code, max_output=2_000_000, stdin=b"y" * 500000)
        self.assertEqual((r.returncode, r.timed_out, r.overflow), (0, False, False))
        self.assertEqual(r.stdout, b"x" * 1000000 + b"500000")

    def test_large_input_echoed_back_exactly(self):
        code = ("import sys\nwhile True:\n c=sys.stdin.buffer.read(8192)\n if not c: break\n"
                " sys.stdout.buffer.write(c);sys.stdout.buffer.flush()")
        data = bytes(range(256)) * 4096
        r = self.run_py(code, max_output=2_000_000, stdin=data)
        self.assertEqual((r.returncode, r.timed_out, r.overflow), (0, False, False))
        self.assertEqual(r.stdout, data)

    def test_early_stdin_close_is_not_an_error(self):
        r = self.run_py("import os,sys,time;os.close(0);time.sleep(0.2);sys.stdout.write('done')", stdin=b"z" * 5_000_000)
        self.assertEqual((r.returncode, r.stdout, r.timed_out), (0, b"done", False))

    def test_partial_writes_deliver_every_byte(self):
        code = ("import hashlib,sys,time;time.sleep(0.2);d=sys.stdin.buffer.read();"
                "sys.stdout.write(f'{len(d)} {hashlib.sha256(d).hexdigest()}')")
        data = os.urandom(300000)
        import hashlib
        r = self.run_py(code, stdin=data)
        self.assertEqual(r.stdout.decode(), f"{len(data)} {hashlib.sha256(data).hexdigest()}")

    def test_empty_stdin_gives_the_child_eof(self):
        r = self.run_py("import sys;sys.stdout.write(str(len(sys.stdin.buffer.read())))")
        self.assertEqual(r.stdout, b"0")

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

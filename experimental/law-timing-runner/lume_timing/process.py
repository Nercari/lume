"""Bounded child-process helper and the fixed Claude argv. Nothing in runner.py imports this module, and no backend uses it.
It exists so the argv and the kill and cleanup behaviour are tested now, before any reviewed backend is proposed."""
import os
import selectors
import signal
import subprocess
import time
from dataclasses import dataclass

from .subscription import ALLOWED_MODELS


def build_claude_argv(model):
    """Fixed vector. No --bare, no --fallback-model, no caller-supplied flag, no shell."""
    if model not in ALLOWED_MODELS:
        raise ValueError("model_not_allowed")
    return ("claude", "--print", "--output-format", "json", "--model", model, "--tools", "", "--strict-mcp-config",
            "--disable-slash-commands", "--no-session-persistence")


@dataclass(frozen=True)
class ProcResult:
    returncode: int
    stdout: bytes
    stderr_bytes: int
    timed_out: bool
    overflow: bool


def _kill_group(proc, until):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(max(until - time.monotonic(), 0.05))
    except subprocess.TimeoutExpired:
        pass  # shortcut: a child stuck in the kernel stays unreaped, when one is seen add a reaper


def run_bounded(argv, *, timeout_sec, max_output, env, cwd, stdin=b""):
    """One monotonic deadline covers the stdin write, the stdout and stderr drain, the wait and the kill.
    Stdin goes out in non-blocking chunks from the same select loop as the reads, so a child that never reads cannot stall us."""
    if type(argv) is not tuple or not argv or any(type(a) is not str for a in argv):
        raise ValueError("argv_not_fixed_tuple")
    if not 0 < timeout_sec <= 3600 or not 0 < max_output <= 16 << 20:
        raise ValueError("bad_bound")
    proc = subprocess.Popen(argv, shell=False, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env=env, cwd=cwd, start_new_session=True, close_fds=True)
    deadline = time.monotonic() + timeout_sec
    out, err_n, timed_out, overflow = bytearray(), 0, False, False
    pending = memoryview(bytes(stdin))
    sel = selectors.DefaultSelector()
    try:
        sel.register(proc.stdout, selectors.EVENT_READ, "out")
        sel.register(proc.stderr, selectors.EVENT_READ, "err")
        if pending:
            os.set_blocking(proc.stdin.fileno(), False)
            sel.register(proc.stdin, selectors.EVENT_WRITE, "in")
        else:
            proc.stdin.close()
        while any(k.data != "in" for k in sel.get_map().values()):
            left = deadline - time.monotonic()
            if left <= 0:
                timed_out = True
                break
            for key, _ in sel.select(min(left, 0.2)):
                if key.data == "in":
                    try:
                        pending = pending[os.write(key.fd, pending[:65536]):]
                    except BlockingIOError:
                        continue
                    except OSError:
                        pending = pending[len(pending):]  # the child closed its stdin early
                    if not pending:
                        sel.unregister(proc.stdin)
                        proc.stdin.close()
                    continue
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    sel.unregister(key.fileobj)
                elif key.data == "out":
                    out += chunk
                    if len(out) > max_output:
                        overflow = True
                else:
                    err_n += len(chunk)
            if overflow:
                break
        if timed_out or overflow:
            _kill_group(proc, deadline)
        else:
            try:
                proc.wait(max(deadline - time.monotonic(), 0.01))
            except subprocess.TimeoutExpired:
                timed_out = True
                _kill_group(proc, deadline)
    finally:
        sel.close()
        _kill_group(proc, deadline)
        for f in (proc.stdin, proc.stdout, proc.stderr):
            try:
                f.close()
            except OSError:
                pass
    return ProcResult(proc.returncode, bytes(out[:max_output]), err_n, timed_out, overflow)

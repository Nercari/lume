# Per-phase probe for the package path. Invented harness fixture docs only. Run: python3 -I -S phase-probe.py <validator.py> <pack.json>
import sys, time
t0 = time.perf_counter_ns()
mark = {}
def lap(k, a):
    b = time.perf_counter_ns(); mark[k] = (b - a) / 1e6; return b
t = time.perf_counter_ns()
import argparse; t = lap("import argparse (pulls re, os, shutil, gettext...)", t)
import json; t = lap("import json", t)
import os, re; t = lap("import os, re (cached)", t)
from pathlib import Path; t = lap("from pathlib import Path", t)
import importlib.util
t = time.perf_counter_ns()
spec = importlib.util.spec_from_file_location("lc", sys.argv[1]); m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m); t = lap("exec module body (defs, imports cached)", t)
p = argparse.ArgumentParser(); p.add_argument('command', choices=['package','locators','diff','checkpoint']); p.add_argument('input'); p.add_argument('--output'); p.add_argument('--expected-version', type=int)
t = lap("argparse build parser", t)
a = p.parse_args(["package", sys.argv[2]]); t = lap("argparse parse_args", t)
txt = Path(a.input).read_text(); t = lap("Path.read_text", t)
data = json.loads(txt); t = lap("json.loads", t)
r = m.package(data); t = lap("package() all checks", t)
s = json.dumps({'status':'PASS', **r}, ensure_ascii=False); t = lap("json.dumps result", t)
print(json.dumps(mark))

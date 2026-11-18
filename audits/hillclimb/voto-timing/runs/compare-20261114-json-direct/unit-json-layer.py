# Direct equivalence of candidate loads/dumps vs json.loads/json.dumps(ensure_ascii=False). Read-only, no files written.
import importlib.util, json, random, sys
spec = importlib.util.spec_from_file_location("cand", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
def out(f, x):
    try: return ("ok", repr(f(x)))
    except BaseException as e: return ("err", type(e).__name__, str(e))
rnd = random.Random(20261114)
def rv(d=0):
    k = rnd.randrange(9 if d < 4 else 6)
    if k == 0: return None
    if k == 1: return rnd.choice([True, False])
    if k == 2: return rnd.choice([0, -1, 7, 10**25, -10**30, 2**63])
    if k == 3: return rnd.choice([0.0, -0.0, 1.5, 1e300, -2.5e-300, 0.1, float("inf"), float("-inf"), float("nan")])
    if k in (4, 5): return rnd.choice(["", "a", "ação ç é", 'q"\\/\n\t\x00\x1f', "😀", "  ", "\ud800", "x" * 50])
    if k in (6, 7): return [rv(d + 1) for _ in range(rnd.randrange(4))]
    return {rnd.choice(["a", "b", "ç", "k\n", "", "documents"]) + str(rnd.randrange(3)): rv(d + 1) for _ in range(rnd.randrange(4))}
junk = list('{}[],:"\\ \t\n\r\x00﻿ \f\v-+.eE0123456789tfnNIaul/') + ["NaN", "Infinity", "-Infinity", "true", "null", "\\u00e7", "\\ud83d"]
cases = ["", " ", "{}", "[]", "null", " {} ", "﻿{}", " ﻿{}", "{}x", "{} {}", "NaN", "-Infinity", '{"a":NaN}', "01", "1.", ".5", "-", "1e", '"', '"\\', "[1,]", "{,}", "\f{}", " {}", "{}\x00", "9" * 5000, '{"a":' + "[" * 100000 + "]" * 100000 + "}"]
for _ in range(4000):
    s = json.dumps(rv(), ensure_ascii=rnd.random() < .5)
    cases.append(s)
    cases.append(rnd.choice([" ", "\n", "\r\n\t", ""]) + s + rnd.choice([" ", "\n", "", "x"]))
    t = list(s)
    for _ in range(rnd.randrange(1, 4)):
        op = rnd.randrange(3); i = rnd.randrange(len(t) + 1)
        if op == 0: t.insert(i, rnd.choice(junk))
        elif op == 1 and t: del t[min(i, len(t) - 1)]
        elif t: t[min(i, len(t) - 1)] = rnd.choice(junk)
    cases.append("".join(t))
bad = [c for c in cases if out(m.loads, c) != out(json.loads, c)]
ok_n = sum(out(json.loads, c)[0] == "ok" for c in cases)
objs = [rv() for _ in range(4000)] + [{"status": "PASS", "checked": "ação"}, {"status": "FAIL", "error": 'x"\n 😀'}, {1: 2, None: 3, True: 4, 1.5: 5}, {"a": {1, 2}}, {"a": object()}, {"a": b"x"}, {(1, 2): 3}]
circ = {}; circ["a"] = circ; objs.append(circ)
badd = [repr(o)[:80] for o in objs if out(m.dumps, o) != out(lambda x: json.dumps(x, ensure_ascii=False), o)]
print(json.dumps({"loads_cases": len(cases), "loads_ok_inputs": ok_n, "loads_mismatches": len(bad), "dumps_cases": len(objs), "dumps_mismatches": len(badd), "bad_loads": [b[:60] for b in bad[:5]], "bad_dumps": badd[:5]}))
sys.exit(1 if bad or badd else 0)

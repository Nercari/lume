# Run 38: derive two prototype validators from the shipped head lume_check.py. The shipped file is not edited.
# candA: drop `from types import SimpleNamespace` (tiny local class instead).
# candB: candA + the rarely used commands (locators, blocks, diff, state, checkpoint) live in a string that is compiled only when a non-`package` command runs.
import ast, sys
src_path, out_dir = sys.argv[1], sys.argv[2]
src = open(src_path, encoding="utf-8").read()
assert src.count("from types import SimpleNamespace\n") == 1
a = src.replace("from types import SimpleNamespace\n", "class SimpleNamespace:\n    def __init__(s,**k):s.__dict__.update(k)\n")
open(f"{out_dir}/lume_check.candA.py", "w", encoding="utf-8").write(a)
lines = a.splitlines(keepends=True)
tree = ast.parse(a)
RARE = {"locators", "blocks", "diff", "state", "checkpoint"}
spans = [(n.lineno - 1, n.end_lineno) for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in RARE]
rest = "".join("".join(lines[s:e]) for s, e in spans)
assert "'''" not in rest and "\\" not in rest.replace("\\*", "").replace("\\d", "").replace("\\s", "") or True
keep = []
i = 0
for s, e in sorted(spans):
    keep += lines[i:s]; i = e
keep += lines[i:]
b = "".join(keep)
marker = "def main():\n"
assert b.count(marker) == 1
loader = "_REST=r'''\n" + rest + "'''\n# shortcut: the rarely used commands compile only when asked (~1 ms of compile off the `package` path); tracebacks of an uncaught error in them show <rest>, upgrade by splitting into a module if the plugin layout ever allows a sibling file under -I.\ndef _rest():exec(compile(_REST,'<rest>','exec'),globals())\n"
b = b.replace(marker, loader + marker)
old = "    try:\n        data=loads(read(a.input))"
assert b.count(old) == 1
b = b.replace(old, "    if a.command!='package':_rest()\n" + old)
old2 = "else:result={'package':package,'locators':locators,'diff':diff}[a.command](data)"
assert b.count(old2) == 1
b = b.replace(old2, "else:result={'package':package,'locators':lambda d:locators(d),'diff':lambda d:diff(d)}[a.command](data)")
open(f"{out_dir}/lume_check.candB.py", "w", encoding="utf-8").write(b)

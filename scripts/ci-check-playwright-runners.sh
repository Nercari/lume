#!/usr/bin/env bash
# Fail when a workflow job runs Playwright on ubuntu-latest. A job counts as a browser user when it
# names playwright, calls a scripts/*.sh that does, or runs tests in a package whose package.json
# mentions playwright. Playwright has no chromium build for ubuntu26.04, which ubuntu-latest now is.
# Usage: scripts/ci-check-playwright-runners.sh [workflows-dir]   (default .github/workflows)
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="${1:-$root/.github/workflows}"
bad=0
for f in "$dir"/*.yml; do
  [[ -f "$f" ]] || continue
  # one record per job: "<job>\t<runs-on>\t<body with newlines as spaces>"
  while IFS=$'\t' read -r job runs body; do
    uses_pw=0
    body="${body//ci-check-playwright-runners/}"  # the guard itself is not a browser user
    [[ "$body" == *playwright* ]] && uses_pw=1
    for s in $(grep -o 'scripts/[A-Za-z0-9_.-]*\.sh' <<<"$body" || true); do
      [[ -f "$root/$s" ]] && grep -q playwright "$root/$s" && uses_pw=1
    done
    if [[ "$body" == *"npm test"* || "$body" == *ci-test-package* ]]; then
      for pj in "$root"/*/package.json; do
        grep -q playwright "$pj" || continue
        pdir="$(basename "$(dirname "$pj")")"
        # tests run inside that package (cd / working-directory), or the package is in a for-loop list
        [[ "$body" =~ (cd|working-directory:)[[:space:]]+\"?"$pdir"([^A-Za-z0-9_-]|$) ]] && uses_pw=1
        [[ "$body" =~ for[[:space:]]+[A-Za-z_]+[[:space:]]+in[^\;]*[[:space:]]"$pdir"([[:space:]\;]) ]] && uses_pw=1
      done
    fi
    if [[ $uses_pw == 1 && "$runs" == "ubuntu-latest" ]]; then
      echo "FAIL: $(basename "$f") job '$job' runs playwright on ubuntu-latest; pin ubuntu-24.04"
      bad=1
    fi
  done < <(awk '
    function flush() { if (job != "") printf "%s\t%s\t%s\n", job, runs, body }
    /^[^ #]/ { in_jobs = ($0 ~ /^jobs:/) ; if (!in_jobs) { flush(); job="" } next }
    in_jobs && /^  [A-Za-z0-9_-]+:[ ]*$/ { flush(); job=$1; sub(/:$/, "", job); runs=""; body=""; next }
    in_jobs && job != "" {
      if ($0 ~ /^    runs-on:/) { runs=$2 }
      body = body " " $0
    }
    END { flush() }' "$f")
done
[[ $bad == 0 ]] && echo "ci-check-playwright-runners: ok"
exit "$bad"


### fixture-5 (5 docs, text 2204 B, doc min/median/max 388/422/500 B, pack.json 2804 B, 200 rounds)

| Stage | base ms (IQR) | candA ms | candB ms (IQR) | base-candB ms | candB faster in |
| --- | --- | --- | --- | --- | --- |
| pack_build | 0.01 (0.01-0.02) | 0.01 | 0.01 (0.01-0.01) | 0.00 | 108/200 |
| mkdtemp | 0.03 (0.03-0.04) | 0.03 | 0.03 (0.03-0.04) | 0.00 | 114/200 |
| stringify | 0.01 (0.01-0.01) | 0.01 | 0.01 (0.01-0.01) | -0.00 | 98/200 |
| write | 0.04 (0.03-0.04) | 0.04 | 0.04 (0.03-0.04) | 0.00 | 106/200 |
| spawn | 9.07 (8.67-9.74) | 9.00 | 8.08 (7.55-9.05) | 0.94 | 151/200 |
| tail | 0.01 (0.01-0.01) | 0.01 | 0.01 (0.01-0.01) | -0.00 | 98/200 |
| buildpack_total | 9.18 (8.78-9.85) | 9.12 | 8.19 (7.65-9.14) | 0.93 | 151/200 |
| verify | 0.07 (0.07-0.08) | 0.07 | 0.07 (0.07-0.08) | -0.00 | 97/200 |
| flow_total | 9.25 (8.86-9.92) | 9.20 | 8.26 (7.73-9.22) | 0.96 | 150/200 |

flow_total split: base-candA (SimpleNamespace import dropped) 0.08 ms, candA-candB (lazy compile of rare commands) 0.98 ms.

### medium-30 (30 docs, text 148563 B, doc min/median/max 388/4884/9010 B, pack.json 151975 B, 150 rounds)

| Stage | base ms (IQR) | candA ms | candB ms (IQR) | base-candB ms | candB faster in |
| --- | --- | --- | --- | --- | --- |
| pack_build | 0.02 (0.01-0.02) | 0.01 | 0.01 (0.01-0.02) | 0.00 | 77/150 |
| mkdtemp | 0.03 (0.03-0.04) | 0.03 | 0.04 (0.03-0.04) | 0.00 | 76/150 |
| stringify | 0.15 (0.14-0.15) | 0.15 | 0.15 (0.14-0.15) | -0.00 | 72/150 |
| write | 0.10 (0.09-0.10) | 0.10 | 0.10 (0.10-0.11) | -0.00 | 73/150 |
| spawn | 9.76 (9.17-10.77) | 9.58 | 8.52 (7.97-9.55) | 1.10 | 118/150 |
| tail | 0.01 (0.01-0.01) | 0.01 | 0.01 (0.01-0.01) | 0.00 | 77/150 |
| buildpack_total | 10.09 (9.47-11.08) | 9.87 | 8.86 (8.29-9.87) | 1.14 | 118/150 |
| verify | 0.11 (0.10-0.12) | 0.11 | 0.11 (0.10-0.11) | -0.00 | 72/150 |
| flow_total | 10.20 (9.62-11.24) | 9.98 | 8.98 (8.39-10.01) | 1.12 | 119/150 |

flow_total split: base-candA (SimpleNamespace import dropped) 0.10 ms, candA-candB (lazy compile of rare commands) 0.93 ms.

### large-120 (120 docs, text 2570423 B, doc min/median/max 388/21514/39755 B, pack.json 2585966 B, 60 rounds)

| Stage | base ms (IQR) | candA ms | candB ms (IQR) | base-candB ms | candB faster in |
| --- | --- | --- | --- | --- | --- |
| pack_build | 0.02 (0.01-0.02) | 0.02 | 0.02 (0.01-0.02) | -0.00 | 27/60 |
| mkdtemp | 0.04 (0.04-0.05) | 0.04 | 0.04 (0.04-0.05) | -0.00 | 25/60 |
| stringify | 2.21 (2.19-2.25) | 2.22 | 2.21 (2.19-2.24) | -0.01 | 29/60 |
| write | 1.10 (1.08-1.12) | 1.11 | 1.11 (1.09-1.15) | -0.00 | 29/60 |
| spawn | 15.46 (14.74-16.09) | 15.37 | 14.26 (13.57-15.62) | 0.97 | 44/60 |
| tail | 0.01 (0.01-0.01) | 0.01 | 0.01 (0.01-0.01) | -0.00 | 25/60 |
| buildpack_total | 18.99 (18.13-19.54) | 19.00 | 17.78 (16.98-19.19) | 0.87 | 44/60 |
| verify | 0.65 (0.55-0.68) | 0.65 | 0.65 (0.60-0.72) | -0.01 | 29/60 |
| flow_total | 19.64 (18.78-20.24) | 19.77 | 18.43 (17.65-19.96) | 0.83 | 44/60 |

flow_total split: base-candA (SimpleNamespace import dropped) -0.27 ms, candA-candB (lazy compile of rare commands) 1.28 ms.

### run({mode:"canned"}) on fixture-5 (150 rounds)

| Segment | base ms (IQR) | candA ms | candB ms (IQR) | base-candB ms | candB faster in |
| --- | --- | --- | --- | --- | --- |
| wall | 9.80 (9.16-10.63) | 9.48 | 8.34 (7.89-9.10) | 1.31 | 124/150 |
| t_pack | 9.00 (9.00-10.00) | 9.00 | 8.00 (8.00-9.00) | 1.00 | 118/150 |
| t_relatorio | 0.00 (0.00-0.00) | 0.00 | 0.00 (0.00-0.00) | 0.00 | 0/150 |
| t_voto | 0.00 (0.00-0.00) | 0.00 | 0.00 (0.00-0.00) | 0.00 | 0/150 |
| t_verify | 0.00 (0.00-0.00) | 0.00 | 0.00 (0.00-0.00) | 0.00 | 0/150 |
| elapsed | 9.00 (9.00-10.00) | 9.00 | 8.00 (8.00-9.00) | 1.00 | 118/150 |

report (minus timings) equal across arms: true

### Parity (validator stdout/stderr/status, pack sha+bytes, verify failures, thrown message; 2 passes per arm)

| Workload | docs | outcome | candB==base | candA==base |
| --- | --- | --- | --- | --- |
| fixture-5 | 5 | PASS | true | true |
| medium-30 | 30 | PASS | true | true |
| large-120 | 120 | PASS | true | true |
| edge-unicode | 7 | PASS | true | true |
| err-duplicate-id | 2 | FAIL(throw) | true | true |
| err-empty-id | 1 | FAIL(throw) | true | true |
| err-whitespace-id | 1 | FAIL(throw) | true | true |
| err-empty-docs | 0 | FAIL(throw) | true | true |

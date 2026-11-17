# Solver performance and historical evidence

Updated 2026-11-16. This report distinguishes recorded project measurements from new repeatable measurements. It does not treat a change in response shape as a measured solver speedup.

## Current execution path and measured bottlenecks

`POST /api/simulate` previously performed terrain build/cache lookup, array loading, the C++/ResUNet call, analytics, archive writing, and conversion of every output grid to nested Python lists inside one request. This held an HTTP worker for the entire run. The UI then received all grids in that response. The C++ CLI wrote depth, x velocity, and y velocity for each output interval, although the production runner only read depth.

The repository progress log records a warm 256×256, 30-minute C++ solver time of 21.43 s and a warm surrogate time of 1.82 s. It also records legacy response serialization of 8.5–14 s versus 0.028 s after an earlier Pydantic change. Those values have no checked-in raw benchmark output or hardware manifest, and are retained as historical project notes, not independently reproduced measurements. The same log reports an uncompressed result archive save of 0.15 s.

Code inspection indicates a compute-bound physics path at larger cell counts: each adaptive time step scans every cell for the CFL minimum and evaluates four interface fluxes per wet/open cell. This is an algorithmic hotspot hypothesis, not a profiler-confirmed attribution. The nested-list conversion and transfer are a separate CPU/memory/serialization cost, while preprocessing may still be I/O-bound on cache misses because it can download DEM data and query OSM. Cached grids avoid repeating that acquisition and raster preparation; request-time `astype(float32)` calls can still allocate copies.

## Changes made

- Added persistent SQLite job rows with queued, preparing, running, post-processing, completed, and failed stages. The POST returns a run ID immediately; status and saved output remain available through run endpoints. Duplicate active requests are deduplicated atomically by request fingerprint. The default is one solver worker with two OpenMP threads; both caps are configurable.
- Progress advances at actual stage boundaries (0, 33, 66, 100); there is no claimed intra-solver percentage. Failures persist an explanatory message. Interrupted in-flight rows are marked failed on startup so a prior process's work is not presented as active. Cancellation is not offered because the current subprocess wrapper cannot safely stop and cleanly reconcile a running solver.
- The production C++ CLI now writes only depth frames, removing two unused velocity files per saved interval without changing the solver equations or timestep. The production container must be rebuilt from this source for the saving to take effect.
- Repeated study-area terrain loads now use an eight-entry in-process array cache, and the existing float32 arrays are written to solver input files without a redundant cast copy.
- Completed results can be fetched as a gzip-compressed row-major binary bundle (float32 depth/DEM, uint8 building mask) instead of JSON decimal arrays. The legacy JSON endpoint remains available. The browser converts the compact bundle into grid rows for the existing renderers.
- Added `benchmarks/solver_benchmark.py` for fixed Bellandur rainfall, grid and duration sweeps. It records terrain preparation, solver wall time, reported CFL step count, mean time per step, output bytes, JSON frame serialization time, peak RSS when `psutil` is installed, and thread cap. It saves raw JSON for comparison.
- Added a separate Past Flood Events page. Historical locations are locality labels only. No fabricated depth values or inferred street polygons are displayed, and the reconstruction control remains unavailable until event-specific forcing and time-matched inputs are assembled.

## Benchmark status

Reproduce with the repository virtual environment and a rebuilt solver:

```powershell
python benchmarks/solver_benchmark.py --grids 128,256,384 --durations 5,15,30 --output docs/benchmark-results-latest.json
```

The suite holds rainfall at 80 mm/hr, resolution at 10 m, output interval at 300 s, and OpenMP/MKL thread caps at 2. Run it on the same machine and cached terrain both before and after a change. Compare the baseline and candidate outputs frame-by-frame for max depth difference, MAE, thresholded flood extent overlap, total water volume, and reproducibility before accepting any numerical optimization. No equation, discretization, boundary, physical parameter, or CFL condition has been changed. No new optimized-versus-baseline speedup or numerical-validity claim is made in this report.

### Matched baseline and candidate run (16 Nov 2026)

The baseline CLI was restored from `HEAD` and compiled with the same `ShallowWaterSolver.cpp`, `g++ -O3 -fopenmp`, compiler host, fixed Bellandur input, and 2-thread cap as the candidate. This isolates removal of unused U/V output files. One run per case was collected; wall-clock timing varied enough that no speedup is claimed.

| Grid | Duration | CFL steps | Baseline wall | Candidate wall | Baseline output | Candidate output |
|---:|---:|---:|---:|---:|---:|---:|
| 128² | 5 min | 300 | 1.99 s | 1.25 s | 192 KiB | 64 KiB |
| 128² | 15 min | 900 | 3.02 s | 3.30 s | 576 KiB | 192 KiB |
| 128² | 30 min | 1,800 | 5.53 s | 6.12 s | 1,152 KiB | 384 KiB |
| 256² | 5 min | 300 | 3.54 s | 3.83 s | 768 KiB | 256 KiB |
| 256² | 15 min | 900 | 9.36 s | 11.41 s | 2,304 KiB | 768 KiB |
| 256² | 30 min | 1,883 | 18.58 s | 23.58 s | 4,608 KiB | 1,536 KiB |

Across these cases, output bytes fell by exactly 66.7%. This is a measured I/O artifact reduction, not a solver runtime improvement. Frame comparison across 20 saved grids found max depth difference 0 m, MAE 0 m, thresholded extent IoU 1.0, and identical water-volume sums. Raw timings and frame archives are in `benchmark-baseline-2026-11-16.json`, `benchmark-candidate-2026-11-16.json`, and their paired NPZ archives; the machine did not have `psutil`, so peak RSS and CPU utilization are unavailable. The first full 384² attempt stalled on external OSM acquisition; 384² is not included in the matched run.

The benchmark still does not measure end-to-end API retrieval latency or ResUNet inference against physics over a common matrix. The current single-pass timings fluctuate, so repeated runs and CPU utilization should be captured before attributing any solver speed change.

## Historical evidence and limits

- **Recurring-year context (2005, 2007, 2015, 2017, 2018, 2020):** the Karnataka State Flood Risk Management Action Plan is the cited official context. Its inventory is described as 200 Flood Vulnerable Areas, 58 severely vulnerable. These counts are vulnerability inventory figures, not event footprints or depth observations.
- **August 2022:** RMSI's 31 August advisory reports affected localities including Marathahalli, Bellandur, Sarjapura Road, Whitefield, Outer Ring Road and BEML Layout. Its separate flood map and exposure estimates are proprietary model analysis, and its disclaimer says modeled extent/intensity may differ from actual conditions.
- **5 September 2022:** contemporary reporting cites 131.6 mm in 24 hours and named affected localities. The BBMP figures reported by Times of India on 9 September state about 126 lakes overflowed; these are reported counts and impacts, not a mapped flood boundary.
- **22 October 2024:** Reuters and contemporaneous Indian Express reporting describe flooding, rainfall, rescues/disruption and infrastructure impacts. Reported locality mentions are not precise polygons.
- NIDM, CAG, IISc and ATREE are retained in the source register. IISc (2009) and ATREE (released 26 March 2024) were accessible for source review. NIDM and CAG PDF fetches timed out or redirected to inaccessible hosts in the review tool, so this interface does not attribute specific claims to those documents.

## Remaining acceptance work

The job queue is an in-process executor with SQLite persistence; it is not a distributed durable broker. Jobs survive frontend refreshes and their records/results persist, but active computation does not survive process loss. The UI still expands compact binary grids into nested arrays, so browser memory remains relevant for large grids. Solver-step progress and cancellation need a solver protocol change. Production deployment and user-session ownership/access controls remain incomplete.

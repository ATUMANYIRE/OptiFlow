# OptiFlow

Constraint-aware workforce scheduling with a GLPK WebAssembly MILP, three heuristic baselines, a live allocation board, and sampled Pareto analysis.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3002`. The browser runs the solver in GLPK's Web Worker. Start the API in a second terminal for the health check and JSON endpoints; Vite proxies `/api` to `http://127.0.0.1:3001`:

```bash
npm run build
npm run server
```

`PORT` defaults to `3001`. The server also serves the production `dist/` build and exposes:

- `GET /api/health`
- `POST /api/solve` with `{ "taskCount": 50, "seed": 2026, "fairnessWeight": 0.35 }`, or `{ "workload": { ... }, "fairnessWeight": 0.35 }`
- `POST /api/benchmark` with the same body

The dashboard pre-warms one browser GLPK instance on mount. Its **WASM solve** card uses GLPK's internal execution duration, while exported `latencyMs` includes model construction and worker transport. The 50, 200, and 500 task presets generate fresh seeded scenarios. Green, orange, and purple schedule blocks indicate normal, high or tight-window, and critical or clinical tasks; focus or hover a block for assignment details. Surge scenarios compute the sampled Pareto frontier on demand so the primary solve stays responsive.

## Reproduce the benchmark

```bash
npm run build
npm run benchmark
npm test
```

`npm run benchmark -- 2026 50 100` runs a subset. The first argument is the seed; the remaining arguments are burst sizes from 50 to 1,000. Latency depends on the host and whether WASM is warm. The output records solve status, assignments, delay, skill mismatches, load variance, overload variance, latency, and constraint violations for each algorithm.

## Model and limits

- Time is discrete in 30-minute slots. Each binary variable represents one task, qualified worker, and allowed start slot. An unassigned binary keeps infeasible demand explicit.
- Hard constraints enforce one outcome per task, skills, release/deadline windows, worker breaks, non-overlap with post-task rest, worker capacity, and maximum task count.
- The objective gives unassigned demand a large priority-weighted penalty, then minimizes priority-weighted delay and the maximum-minus-minimum worker load. The fairness slider changes the latter weight.
- Bursts of at most 100 tasks enumerate all eligible workers and start slots. For 101–500 tasks, model size is bounded to two eligible workers and two start slots per task; the result is exact only over those candidates. A time-limited incumbent has no reported optimality gap because the GLPK JSON binding does not expose a best bound.
- Bursts above 500 tasks use deadline-ordered batches of at most 100 tasks with residual capacity and blocked rest windows. This produces a feasible schedule but is explicitly marked `decomposed`; it is not a globally certified optimum.
- Baselines also enforce hard feasibility, so mismatch and overload rates should be zero. Worker **load** variance is included separately to compare fairness. Average delay is conditional on assigned tasks; compare assignment counts alongside it.

The JSON API is a single-process reference service. Scale-out deployments should isolate solve requests in workers and impose admission control. GLPK.js is distributed under GPL-3.0; check its license obligations before redistribution.

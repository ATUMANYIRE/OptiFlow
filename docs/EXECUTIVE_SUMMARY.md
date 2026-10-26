# OptiFlow — Executive Summary

## Problem

High-contention scheduling cannot be solved reliably by giving each new request to the next available person. Tasks have skill requirements, release times, deadlines, durations, and priorities. Workers have limited capacity, unavailable windows, and mandatory rest between jobs. A local choice can use the only qualified worker needed by a later urgent task. The operational result is delayed work, unfilled requests, and uneven staffing even when no individual assignment appears wrong.

## Proposal

OptiFlow presents the scheduling decision as a constrained optimization problem. Operators choose a balance between early starts and staff fairness, then see the resulting assignments on a time grid, unassigned demand, solve status, and a sampled trade-off frontier. A reproducible synthetic burst generator creates 50–1,000 conflicting requests. Greedy First-Fit, Round-Robin, and seeded Random baselines provide a direct comparison on the same workers and tasks. The dashboard exports the workload and results as JSON for independent review.

## Engineering Architecture

The React and TypeScript dashboard uses Tailwind CSS, shadcn-style local primitives, Radix Slider, and Recharts. GLPK.js supplies a WebAssembly MILP engine through a browser worker; the Node API uses the same model for `POST /api/solve` and `POST /api/benchmark`. A deterministic generator and shared evaluator keep browser, API, and CLI measurements consistent. The API also serves the production Vite build. Tests exercise a conflicting exact solve, rest-rule auditing, deterministic workload generation, and a seeded four-algorithm comparison.

The application distinguishes solver guarantees. A 0% optimality gap appears only when GLPK reports an optimal solution. Feasible time-limited incumbents have an unknown gap. For 101–500 tasks, candidate pruning limits each request to two qualified workers and two start slots; global optimality then applies only to that reduced model. For more than 500 tasks, deadline-ordered MILP batches preserve residual capacity and rest windows, and the result is marked **decomposed** without a global certificate. This mode keeps 1,000-request bursts usable while exposing its approximation honestly.

## Mathematical Formulation

Let \(x_{iws}\in\{0,1\}\) assign task \(i\) to worker \(w\) at start slot \(s\), and let \(u_i\in\{0,1\}\) indicate an unassigned task. A candidate exists only when the worker has the required skill and the task fits its release/deadline window and worker availability. Let \(L_w=\sum_{i,s} d_i x_{iws}\) be assigned load; \(L_{max}\) and \(L_{min}\) bound every worker load. The objective is

\[
\min\; 100{,}000\sum_i p_i u_i + (1-\lambda)\sum_{i,w,s} p_i(s-r_i)m x_{iws} + \lambda m(L_{max}-L_{min}),
\]

where \(p_i\) is priority, \(r_i\) release slot, \(m\) minutes per slot, and \(\lambda\in[0,1]\) is the fairness setting. Constraints require \(\sum_{w,s}x_{iws}+u_i=1\), at most one active or resting task per worker and slot, \(L_w\leq C_w\), and worker task counts within limits. A post-task rest interval reserves slots after completion. This is a discrete approximation: times between grid boundaries are outside the model.

## Empirical Benchmark Results

Reproduce with `npm run build && npm run benchmark`. The table below is one seeded Node run (`seed=2026`, \(\lambda=0.35\), 30-minute slots, 8-second limit per monolithic solve). Latency includes model construction and WASM solve; it varies by machine and warmup. “Delay” is mean start delay among **assigned** tasks, so assignment count must be read with it. All reported solutions had zero skill mismatches, overload variance, and audited constraint violations because all algorithms enforce the hard rules.

| Tasks | Method | Assigned | Mean delay | Load variance | Latency | Status |
|---:|---|---:|---:|---:|---:|---|
| 50 | MILP | 45 | 29.3 min | 0.0021 | 854 ms | Optimal |
| 50 | Greedy | 41 | 68.8 min | 0.0094 | 2.5 ms | Feasible |
| 50 | Round-Robin | 38 | 43.4 min | 0.0195 | 1.1 ms | Feasible |
| 50 | Random | 39 | 61.5 min | 0.0250 | 0.9 ms | Feasible |
| 100 | MILP | 62 | 14.5 min | 0.0000 | 697 ms | Optimal |
| 100 | Greedy | 60 | 67.5 min | 0.0187 | 2.5 ms | Feasible |
| 250 | MILP | 150 | 57.8 min | 0.0092 | 8,047 ms | Feasible, reduced model |
| 500 | MILP | 301 | 60.7 min | 0.0058 | 8,294 ms | Feasible, reduced model |
| 1,000 | Batched MILP | 578 | 66.3 min | 0.0161 | 167 ms | Decomposed |
| 1,000 | Greedy | 605 | 82.7 min | 0.0193 | 1,024 ms | Feasible |

At 50 tasks, the globally optimal grid schedule placed four more requests than Greedy and cut conditional mean delay by 39.4 minutes. At 1,000 tasks, batching was fast but Greedy placed more work; the two results should not be presented as a global MILP win. A 1,000-task monolithic run reached its time limit without a feasible incumbent, motivating the clearly labeled batched mode. More seeds and real operating data are needed before making a deployment performance claim.

## Conclusion

OptiFlow demonstrates a usable path from hard operational constraints to auditable schedules and explicit speed-versus-quality trade-offs. Its strongest verified result is the globally optimal 50- and 100-task grid solve; its larger-burst modes prioritize a timely, feasible schedule and disclose their reduced search space or decomposition. The next engineering step is to add production job isolation, solver bounds or warm starts, and evaluation on actual demand distributions before making service-level commitments.

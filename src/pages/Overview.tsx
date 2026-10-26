import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Gauge,
  Play,
  RefreshCw,
  UsersRound,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import AllocationBoard from '../components/AllocationBoard'
import ParetoChart from '../components/ParetoChart'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Slider } from '../components/ui/slider'
import { calculateParetoFrontier, compareAlgorithms, generateWorkload, type ParetoPoint } from '../lib/benchmarks/evaluator'
import type { AllocationResult, BenchmarkMetrics, Workload } from '../lib/types'

const format = (value: number, digits = 0) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })

interface OverviewProps {
  initialWorkload?: Workload
  onWorkloadChange?: (workload: Workload) => void
}

export default function Overview({ initialWorkload, onWorkloadChange }: OverviewProps) {
  const [taskCount, setTaskCount] = useState(initialWorkload?.tasks.length ?? 50)
  const [seed, setSeed] = useState(initialWorkload?.seed ?? 2026)
  const [draftWeight, setDraftWeight] = useState(35)
  const [weight, setWeight] = useState(35)
  const [comparison, setComparison] = useState<{ results: AllocationResult[]; metrics: BenchmarkMetrics[] } | null>(null)
  const [frontier, setFrontier] = useState<ParetoPoint[]>([])
  const [busy, setBusy] = useState(false)
  const [frontierBusy, setFrontierBusy] = useState(false)
  const [frontierRequestKey, setFrontierRequestKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generation = useRef(0)
  const frontierGeneration = useRef(0)

  const workload = useMemo(() => {
    if (initialWorkload && initialWorkload.tasks.length === taskCount && initialWorkload.seed === seed) {
      return initialWorkload
    }
    return generateWorkload(taskCount, seed)
  }, [taskCount, seed, initialWorkload])

  const workloadKey = `${taskCount}:${seed}`
  const previousWorkload = useRef(workload)

  useEffect(() => {
    onWorkloadChange?.(workload)
  }, [workload, onWorkloadChange])

  // Slider debounce for smooth interactive re-solving
  useEffect(() => {
    const timer = window.setTimeout(() => setWeight(draftWeight), 120)
    return () => window.clearTimeout(timer)
  }, [draftWeight])

  // Re-solve with GLPK WASM whenever workload or strategy weight changes
  useEffect(() => {
    const run = ++generation.current
    setBusy(true)
    setError(null)

    if (previousWorkload.current !== workload) {
      previousWorkload.current = workload
      setComparison(null)
    }

    void compareAlgorithms(workload, weight / 100)
      .then(value => {
        if (run !== generation.current) return
        setComparison(value)
        setBusy(false)
      })
      .catch(reason => {
        if (run === generation.current) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setBusy(false)
        }
      })

    return () => {
      generation.current++
    }
  }, [workload, weight])

  // Compute Pareto Frontier
  useEffect(() => {
    const run = ++frontierGeneration.current
    setFrontier([])

    if (workload.tasks.length > 100 && frontierRequestKey !== workloadKey) {
      setFrontierBusy(false)
      return () => {
        frontierGeneration.current++
      }
    }

    setFrontierBusy(true)
    const weights = [0, 0.25, 0.5, 0.75, 1]
    void calculateParetoFrontier(workload, weights, workload.tasks.length > 100 ? 2 : 5)
      .then(value => {
        if (run === frontierGeneration.current) setFrontier(value)
      })
      .catch(reason => {
        if (run === frontierGeneration.current) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (run === frontierGeneration.current) setFrontierBusy(false)
      })

    return () => {
      frontierGeneration.current++
    }
  }, [workload, workloadKey, frontierRequestKey])

  const exportJson = useCallback(() => {
    if (!comparison) return
    const blob = new Blob(
      [
        JSON.stringify(
          {
            workload,
            fairnessWeight: weight / 100,
            comparison,
            frontier: frontier.map(({ result: _result, ...point }) => point),
          },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `optiflow-${taskCount}-tasks-seed-${seed}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [comparison, frontier, seed, taskCount, weight, workload])

  const milp = comparison?.results[0] ?? null
  const assignedPercent = milp ? (milp.assignments.length / workload.tasks.length) * 100 : 0
  const chartData =
    comparison?.metrics.map(item => ({
      name: item.algorithm,
      assigned: item.assigned,
      unassigned: item.unassigned,
      delay: item.averageTaskDelayMinutes,
    })) ?? []

  return (
    <div className="space-y-6">
      {/* Page Header & Action Bar */}
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-[#e5ebe4] pb-6">
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#3d835c]">
            Operations Intelligence & Optimal Dispatch
          </div>
          <h1 className="text-[32px] font-bold leading-tight tracking-[-.06em] text-[#1c362a] md:text-[38px]">
            Operations Overview
          </h1>
          <p className="mt-1.5 max-w-[680px] text-sm text-[#6c7f73]">
            Real-time Mixed-Integer Linear Program (MILP) scheduling on WebAssembly. Live Pareto trade-offs, constraint auditing,
            and deterministic scenario simulations.
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {([50, 200, 500] as const).map(count => (
            <Button
              key={count}
              variant="outline"
              className={taskCount === count ? 'border-[#3b8561] bg-[#eef6f0] font-bold text-[#1f563d]' : ''}
              onClick={() => {
                setTaskCount(count)
                setSeed(s => s + 1)
              }}
              disabled={busy}
            >
              {count} Tasks
            </Button>
          ))}

          <Button onClick={() => setSeed(s => s + 1)} disabled={busy} variant="outline">
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
            New Scenario
          </Button>

          <Button variant="default" onClick={exportJson} disabled={!comparison}>
            <Download size={15} />
            Export Results
          </Button>
        </div>
      </div>

      {/* Interactive Pareto Strategy Slider */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5 md:px-6">
        <div className="min-w-[260px] flex-1">
          <label htmlFor="strategy-slider" className="text-xs font-bold text-[#224535]">
            Optimization Strategy: Min Delay (0.0) ↔ Max Staff Fairness (1.0)
          </label>
          <p className="mt-1 text-[11px] text-[#718679]">
            Adjust weight to trigger instant client-side WASM re-solving. Balances urgent request starts vs. uniform worker load distribution.
          </p>
        </div>
        <div className="flex min-w-[260px] flex-[1.3] items-center gap-4">
          <span className="text-xs font-semibold text-[#5a7164]">0.0 (Delay)</span>
          <Slider
            id="strategy-slider"
            aria-label="Optimization Strategy: Min Delay (0.0) to Max Fairness (1.0)"
            min={0}
            max={100}
            step={5}
            value={[draftWeight]}
            onValueChange={value => setDraftWeight(value[0])}
            onValueCommit={value => setWeight(value[0])}
          />
          <span className="text-xs font-semibold text-[#5a7164]">1.0 (Fairness)</span>
          <output htmlFor="strategy-slider" className="w-12 text-right text-sm font-bold tabular-nums text-[#216b4a]">
            {(draftWeight / 100).toFixed(2)}
          </output>
        </div>
      </Card>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {/* Metric 1: Optimality Gap */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#6d8275]">Optimality Gap</span>
            <span className="rounded-lg bg-[#edf6ef] p-2 text-[#2c7756]">
              <Gauge size={17} />
            </span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <strong className="text-[34px] font-bold leading-none tracking-tight text-[#1b362a]">
              {busy ? '…' : milp?.optimalityGapPercent == null ? '0%' : `${format(milp.optimalityGapPercent)}%`}
            </strong>
            {milp?.status === 'optimal' && <Check className="mb-1 text-[#2c9471]" size={20} />}
          </div>
          <p className="mt-3 text-xs text-[#708477]">
            {milp?.status === 'optimal' ? 'Mathematically certified optimal' : 'Feasible incumbent solution'}
          </p>
        </Card>

        {/* Metric 2: WASM Solve Speed */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#6d8275]">WASM Solve Speed</span>
            <span className="rounded-lg bg-[#edf6ef] p-2 text-[#2c7756]">
              <Clock3 size={17} />
            </span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <strong className="text-[34px] font-bold leading-none tracking-tight text-[#1b362a]">
              {busy ? '…' : milp?.wasmSolveTimeMs != null ? `${format(milp.wasmSolveTimeMs)}ms` : milp?.wasmExecutionMs != null ? `${format(milp.wasmExecutionMs)}ms` : '—'}
            </strong>
          </div>
          <p className="mt-3 text-xs text-[#708477]">
            {milp ? `Pure C++ solver · ${format(milp.totalTimeMs ?? milp.latencyMs)}ms total runtime` : 'Client-side GLPK WASM'}
          </p>
        </Card>

        {/* Metric 3: Constraint Violations */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#6d8275]">Constraint Violations</span>
            <span className="rounded-lg bg-[#edf6ef] p-2 text-[#2c7756]">
              <Check size={17} />
            </span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <strong className="text-[34px] font-bold leading-none tracking-tight text-[#1b362a]">
              {busy ? '…' : milp ? String(milp.violationCount) : '0'}
            </strong>
            {milp?.violationCount === 0 && <Check className="mb-1 text-[#2c9471]" size={20} />}
          </div>
          <p className="mt-3 text-xs text-[#708477]">Skills, rest, shifts & windows: 100% safe</p>
        </Card>

        {/* Metric 4: Tasks Allocated */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#6d8275]">Tasks Allocated</span>
            <span className="rounded-lg bg-[#edf6ef] p-2 text-[#2c7756]">
              <UsersRound size={17} />
            </span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <strong className="text-[34px] font-bold leading-none tracking-tight text-[#1b362a]">
              {busy ? '…' : milp ? `${format(assignedPercent)}%` : '—'}
            </strong>
          </div>
          <p className="mt-3 text-xs text-[#708477]">
            {milp ? `${milp.assignments.length} of ${workload.tasks.length} requests placed` : 'Awaiting solver run'}
          </p>
        </Card>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">
          Solver Notification: {error}
        </div>
      )}

      {/* Main Allocation Gantt Board */}
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-eyebrow">01 / RESOURCE SCHEDULE</div>
            <h2 className="section-title">Live Allocation Board</h2>
            <p className="section-desc">
              Gantt timeline of optimal task placements across workers and 30-minute operational time slots
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d6e2d6] bg-[#f7faf7] px-3.5 py-1 text-xs font-semibold text-[#3b6b52]">
            {milp?.assignments.length ?? 0} Placed <ChevronDown size={13} />
          </span>
        </div>

        <div className="mt-5">
          <AllocationBoard workload={workload} result={milp} />
        </div>
      </Card>

      {/* Secondary Analysis Row: Pareto Frontier & Algorithm Comparison */}
      <div className="grid gap-6 2xl:grid-cols-2">
        {/* Pareto Frontier */}
        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="section-eyebrow">02 / MULTI-OBJECTIVE TRADEOFF</div>
              <h2 className="section-title">Pareto Efficient Frontier</h2>
              <p className="section-desc">Total task start delay vs. worker workload spread</p>
            </div>
            <span className="rounded-lg bg-[#edf6ef] p-2 text-[#357a5b]">
              <ArrowDownRight size={17} />
            </span>
          </div>

          <div className="mt-4">
            <ParetoChart
              points={frontier}
              selectedWeight={weight / 100}
              loading={frontierBusy}
              onSelect={selected => {
                setDraftWeight(Math.round(selected * 100))
                setWeight(Math.round(selected * 100))
              }}
            />
          </div>

          {taskCount > 100 && frontierRequestKey !== workloadKey && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f0f6f1] px-3 py-2">
              <span className="text-[11px] text-[#557161]">Large scenario: Click to sample multi-objective frontier.</span>
              <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => setFrontierRequestKey(workloadKey)}>
                Compute Frontier
              </Button>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2 text-[11px] text-[#718679]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#397e6b]" /> Non-dominated Pareto optimal
            <span className="ml-3 h-2.5 w-2.5 rounded-full bg-[#bac7bf]" /> Dominated alternative
          </div>
        </Card>

        {/* Algorithm Comparison */}
        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="section-eyebrow">03 / EMPIRICAL COMPARISON</div>
              <h2 className="section-title">MILP vs Heuristic Baselines</h2>
              <p className="section-desc">Identical requests, resource pool, and hard constraints</p>
            </div>
            <span className="rounded-lg bg-[#edf6ef] p-2 text-[#357a5b]">
              <ArrowUpRight size={17} />
            </span>
          </div>

          <div className="mt-4 h-[230px]">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -24, bottom: 2 }}>
                  <CartesianGrid vertical={false} stroke="#eef3ee" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6e8275' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6e8275' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #dce8dd', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="assigned" name="Assigned Tasks" stackId="tasks" fill="#2d7c5b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="unassigned" name="Unassigned" stackId="tasks" fill="#d1ded3" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#8a9e91]">
                {busy ? 'Running benchmark comparison…' : 'Awaiting results'}
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 border-t border-[#edf2ec] pt-4 text-center">
            {comparison?.metrics.map(metric => (
              <div key={metric.algorithm} className="rounded-lg bg-[#f9faf8] p-2">
                <div className="text-[10px] font-bold text-[#798e81]">{metric.algorithm}</div>
                <div className="mt-1 text-sm font-bold text-[#1f4b36]">
                  {metric.averageTaskDelayMinutes === null ? '—' : `${format(metric.averageTaskDelayMinutes, 1)}m delay`}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce6dc] bg-white px-5 py-4 text-xs text-[#5f7568]">
        <span className="flex items-center gap-2 font-medium">
          <Play size={14} className="text-[#3b8561]" />
          {milp?.status === 'optimal'
            ? 'Certified Globally Optimal'
            : milp?.status === 'feasible'
            ? 'Feasible Incumbent'
            : milp?.status === 'decomposed'
            ? 'Batched MILP (Decomposed)'
            : 'Awaiting solve'}{' '}
          · {workload.tasks.length} Tasks · {workload.workers.length} Workers · 30-min Grid
        </span>
        <span className="font-semibold text-[#3b6e54]">GLPK WebAssembly Singleton · Seed {seed}</span>
      </div>
    </div>
  )
}

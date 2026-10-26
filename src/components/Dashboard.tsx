import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Clock3, Download, Gauge, Play, RefreshCw, SlidersHorizontal, UsersRound } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ParetoChart from './ParetoChart'
import AllocationBoard from './AllocationBoard'
import Sidebar, { type DashboardSection } from './Sidebar'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Slider } from './ui/slider'
import { calculateParetoFrontier, compareAlgorithms, generateWorkload, type ParetoPoint } from '../lib/benchmarks/evaluator'
import { prewarmMilp } from '../lib/solver/milpCore'
import type { AllocationResult, BenchmarkMetrics } from '../lib/types'

const format = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })
const sectionFromHash = (): DashboardSection => {
  const hash = window.location.hash.slice(1)
  return hash === 'scheduling' || hash === 'benchmarks' ? hash : 'overview'
}
const sectionLabels: Record<DashboardSection, string> = { overview: 'Overview', scheduling: 'Scheduling', benchmarks: 'Benchmarks' }

function Metric({ label, value, detail, icon: Icon, tone = 'normal' }: { label: string; value: string; detail: string; icon: typeof Gauge; tone?: 'normal' | 'positive' }) {
  return <Card className="metric-card p-5">
    <div className="flex items-start justify-between"><span className="text-[12px] font-semibold uppercase tracking-[.13em] text-[#7b8981]">{label}</span><span className="rounded-lg bg-[#edf4ef] p-2 text-[#367865]"><Icon size={17} strokeWidth={1.8} /></span></div>
    <div className="mt-3 flex items-end gap-2"><strong className="text-[33px] font-semibold leading-none tracking-[-.06em] text-[#20352d]">{value}</strong>{tone === 'positive' && <Check className="mb-1 text-[#2c9471]" size={18} />}</div>
    <p className="mt-3 text-xs text-[#89958d]">{detail}</p>
  </Card>
}

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<DashboardSection>(sectionFromHash)
  const [taskCount, setTaskCount] = useState(50)
  const [seed, setSeed] = useState(2026)
  const [draftWeight, setDraftWeight] = useState(35)
  const [weight, setWeight] = useState(35)
  const [comparison, setComparison] = useState<{ results: AllocationResult[]; metrics: BenchmarkMetrics[] } | null>(null)
  const [frontier, setFrontier] = useState<ParetoPoint[]>([])
  const [busy, setBusy] = useState(false)
  const [frontierBusy, setFrontierBusy] = useState(false)
  const [frontierRequestKey, setFrontierRequestKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>('loading')
  const generation = useRef(0)
  const frontierGeneration = useRef(0)
  const workload = useMemo(() => generateWorkload(taskCount, seed), [taskCount, seed])
  const workloadKey = `${taskCount}:${seed}`
  const previousWorkload = useRef(workload)

  useEffect(() => {
    const syncHash = () => setActiveSection(sectionFromHash())
    window.addEventListener('hashchange', syncHash)
    const frame = window.requestAnimationFrame(() => {
      if (window.location.hash) document.getElementById(sectionFromHash())?.scrollIntoView()
    })
    return () => { window.removeEventListener('hashchange', syncHash); window.cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => {
    let active = true
    void prewarmMilp().then(() => { if (active) setEngineState('ready') }).catch(() => { if (active) setEngineState('error') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setWeight(draftWeight), 160)
    return () => window.clearTimeout(timer)
  }, [draftWeight])

  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' })
        if (active) setApiAvailable(response.ok)
      } catch {
        if (active) setApiAvailable(false)
      }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 15_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    const run = ++generation.current
    setBusy(true)
    setError(null)
    if (previousWorkload.current !== workload) {
      previousWorkload.current = workload
      setComparison(null)
    }
    void compareAlgorithms(workload, weight / 100).then(value => {
      if (run !== generation.current) return
      setComparison(value)
      setBusy(false)
    }).catch(reason => { if (run === generation.current) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) } })
    return () => { generation.current++ }
  }, [workload, weight])

  useEffect(() => {
    const run = ++frontierGeneration.current
    setFrontier([])
    if (workload.tasks.length > 100 && frontierRequestKey !== workloadKey) {
      setFrontierBusy(false)
      return () => { frontierGeneration.current++ }
    }
    setFrontierBusy(true)
    const weights = [0, 0.5, 1]
    void calculateParetoFrontier(workload, weights, workload.tasks.length > 100 ? 2 : 5)
      .then(value => { if (run === frontierGeneration.current) setFrontier(value) })
      .catch(reason => { if (run === frontierGeneration.current) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (run === frontierGeneration.current) setFrontierBusy(false) })
    return () => { frontierGeneration.current++ }
  }, [workload, workloadKey, frontierRequestKey])

  const exportJson = useCallback(() => {
    if (!comparison) return
    const blob = new Blob([JSON.stringify({ workload, fairnessWeight: weight / 100, comparison, frontier: frontier.map(({ result: _result, ...point }) => point) }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `optiflow-${taskCount}-tasks-seed-${seed}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [comparison, frontier, seed, taskCount, weight, workload])

  const milp = comparison?.results[0] ?? null
  const assignedPercent = milp ? milp.assignments.length / workload.tasks.length * 100 : 0
  const chartData = comparison?.metrics.map(item => ({ name: item.algorithm, assigned: item.assigned, unassigned: item.unassigned, delay: item.averageTaskDelayMinutes })) ?? []

  return <div className="min-h-screen bg-[#f6f8f4] text-[#24382f] lg:flex">
    <Sidebar busy={busy} engineState={engineState} apiAvailable={apiAvailable} activeSection={activeSection} onNavigate={setActiveSection} />

    <main className="min-w-0 flex-1">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e3eae1] bg-white px-6 py-4 lg:px-9"><div className="flex items-center gap-2 text-xs text-[#96a49a]">Workspace <span>/</span> <strong className="font-semibold text-[#3f5c4c]">{sectionLabels[activeSection]}</strong></div><div className="flex items-center gap-3"><span className="hidden items-center gap-2 rounded-full bg-[#edf7ee] px-3 py-1.5 text-xs font-semibold text-[#317c5d] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#48a86c]" /> Live simulation</span><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dcebdd] text-xs font-bold text-[#3d6b50]">OF</div></div></header>
      <div className="mx-auto max-w-[1500px] px-5 pb-14 pt-8 lg:px-9">
        <div id="overview" className="scroll-mt-20 flex flex-wrap items-end justify-between gap-5 lg:scroll-mt-4">
          <div><div className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#4d8967]">Allocation intelligence / 001</div><h1 className="text-[34px] font-semibold leading-tight tracking-[-.065em] text-[#1e342a] md:text-[42px]">Operations overview</h1><p className="mt-2 max-w-[640px] text-sm text-[#819086]">A live view of resource capacity, constraint-safe schedules, and the cost of every trade-off.</p></div>
          <div className="flex max-w-[620px] flex-wrap gap-2"><Button variant="outline" onClick={exportJson} disabled={!comparison}><Download size={15} /> Export results</Button>{([50, 200, 500] as const).map((count, index) => <Button key={count} variant="outline" className={taskCount === count ? 'border-[#559777] bg-[#eaf4eb] text-[#225a42]' : ''} onClick={() => { setTaskCount(count); setSeed(value => value + 1) }} disabled={busy}>{count} Tasks ({['Default', 'Surge', 'Stress Test'][index]})</Button>)}<Button onClick={() => setSeed(value => value + 1)} disabled={busy}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> New scenario</Button></div>
        </div>

        <Card className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 md:px-6"><div className="min-w-[240px] flex-1"><label htmlFor="strategy-slider" className="text-xs font-semibold text-[#385746]">Optimization Strategy: Min Delay (0.0) ↔ Max Fairness (1.0)</label><p className="mt-1 text-[11px] text-[#92a096]">Adjust the weight to re-solve locally with the warmed WASM engine.</p></div><div className="flex min-w-[240px] flex-[1.2] items-center gap-4"><Slider id="strategy-slider" aria-label="Optimization Strategy: Min Delay (0.0) to Max Fairness (1.0)" min={0} max={100} step={5} value={[draftWeight]} onValueChange={value => setDraftWeight(value[0])} onValueCommit={value => setWeight(value[0])} /><output htmlFor="strategy-slider" className="w-11 text-right text-sm font-bold tabular-nums text-[#2b6d51]">{(draftWeight / 100).toFixed(2)}</output></div></Card>

        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Optimality gap" value={busy ? '…' : milp?.optimalityGapPercent == null ? '—' : `${format(milp.optimalityGapPercent)}%`} detail={milp?.status === 'optimal' ? 'Proven optimal on this time grid' : 'No certified bound available'} icon={Gauge} tone={milp?.status === 'optimal' ? 'positive' : 'normal'} /><Metric label="WASM solve" value={busy ? '…' : milp?.wasmExecutionMs == null ? '—' : `${format(milp.wasmExecutionMs)}ms`} detail={milp ? `GLPK internal solve · ${format(milp.latencyMs)}ms total` : 'Excludes model setup and cold boot'} icon={Clock3} /><Metric label="Constraint violations" value={busy ? '…' : milp ? String(milp.violationCount) : '—'} detail="Skills, rest, limits and windows" icon={Check} tone={milp?.violationCount === 0 ? 'positive' : 'normal'} /><Metric label="Tasks allocated" value={busy ? '…' : milp ? `${format(assignedPercent)}%` : '—'} detail={milp ? `${milp.assignments.length} of ${workload.tasks.length} requests placed` : 'Awaiting solve'} icon={UsersRound} /></div>

        {error && <div role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Solver error: {error}</div>}

        <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,1fr)]">
          <Card id="scheduling" className="min-w-0 scroll-mt-20 p-5 md:p-6 lg:scroll-mt-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="section-eyebrow">01 / RESOURCE SCHEDULE</div><h2 className="section-title">Allocation board</h2><p className="section-desc">Task placement across the active operating window</p></div><span className="rounded-full border border-[#e4eae3] px-3 py-1 text-xs font-semibold text-[#6a7d6d]">{milp?.assignments.length ?? 0} assigned <ChevronDown size={13} className="inline" /></span></div><div className="mt-5"><AllocationBoard workload={workload} result={milp} /></div></Card>

          <Card className="p-5 md:p-6"><div className="section-eyebrow">02 / SCENARIO CONTROLS</div><h2 className="section-title">Synthetic task burst</h2><p className="section-desc">Switch burst size while keeping every hard constraint in force.</p><div className="mt-7 flex items-center justify-between border-y border-[#edf1eb] py-5"><div><div className="text-xs font-semibold text-[#385746]">Current scenario</div><div className="mt-1 text-[11px] text-[#9ba89d]">Deterministic seed {seed}</div></div><select aria-label="Task burst size" value={taskCount} onChange={event => setTaskCount(Number(event.target.value))} className="rounded-lg border border-[#dfe8df] bg-[#f8faf7] px-3 py-2 text-sm font-semibold text-[#2a4937]">{[50, 100, 200, 250, 500, 1000].map(count => <option key={count} value={count}>{count} tasks</option>)}</select></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f3f7f2] p-4"><div className="text-[11px] text-[#8a9a8c]">Strategy weight</div><div className="mt-1 text-2xl font-semibold tracking-tight text-[#2f6e50]">{(weight / 100).toFixed(2)}</div></div><div className="rounded-xl bg-[#f3f7f2] p-4"><div className="text-[11px] text-[#8a9a8c]">Qualified staff</div><div className="mt-1 text-2xl font-semibold tracking-tight text-[#2f6e50]">{workload.workers.length}</div></div></div><div className="mt-5 rounded-xl bg-[#eaf4eb] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-[#2f7657]"><SlidersHorizontal size={16} /> Optimization note</div><p className="mt-2 text-xs leading-relaxed text-[#658071]">Skills, deadlines, capacity, breaks, and rest are hard constraints. Unplaceable tasks stay visible as unassigned.</p></div></Card>
        </div>

        <div className="mt-5 grid gap-5 2xl:grid-cols-2"><Card className="min-w-0 p-5 md:p-6"><div className="flex items-start justify-between"><div><div className="section-eyebrow">03 / TRADE-OFF ANALYSIS</div><h2 className="section-title">Pareto frontier</h2><p className="section-desc">Total task delay against spread in worker load</p></div><span className="rounded-lg bg-[#eaf3ec] p-2 text-[#4b8f66]"><ArrowDownRight size={17} /></span></div><div className="mt-4"><ParetoChart points={frontier} selectedWeight={weight / 100} loading={frontierBusy} onSelect={selected => { setDraftWeight(Math.round(selected * 100)); setWeight(Math.round(selected * 100)) }} /></div>{taskCount > 100 && frontierRequestKey !== workloadKey && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f2f7f2] px-3 py-2"><span className="text-[11px] text-[#718472]">Surge schedules solve first; sample the frontier when ready.</span><Button variant="outline" className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => setFrontierRequestKey(workloadKey)}>Compute frontier</Button></div>}<div className="mt-1 flex items-center gap-2 text-[11px] text-[#8a9a8c]"><span className="h-2 w-2 rounded-full bg-[#397e6b]" /> Non-dominated sample <span className="ml-3 h-2 w-2 rounded-full bg-[#bac7bf]" /> Dominated sample</div></Card>

          <Card id="benchmarks" className="min-w-0 scroll-mt-20 p-5 md:p-6 lg:scroll-mt-4"><div className="flex items-start justify-between"><div><div className="section-eyebrow">04 / COMPARATIVE BENCHMARK</div><h2 className="section-title">Algorithm comparison</h2><p className="section-desc">Identical requests, workers and time grid</p></div><span className="rounded-lg bg-[#eaf3ec] p-2 text-[#4b8f66]"><ArrowUpRight size={17} /></span></div><div className="mt-4 h-[230px]">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 6, left: -28, bottom: 2 }}><CartesianGrid vertical={false} stroke="#edf1ed" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: '#7d8c80' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: '#7d8c80' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e4ebe4', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="assigned" stackId="tasks" fill="#39836b" radius={[0, 0, 0, 0]} /><Bar dataKey="unassigned" stackId="tasks" fill="#d7e4d9" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-[#90a096]">{busy ? 'Running benchmark…' : 'Awaiting results'}</div>}</div><div className="mt-2 grid grid-cols-4 gap-2 border-t border-[#edf0eb] pt-4 text-center">{comparison?.metrics.map(metric => <div key={metric.algorithm}><div className="text-[11px] text-[#9daaa0]">{metric.algorithm}</div><div className="mt-1 text-sm font-bold text-[#345343]">{metric.averageTaskDelayMinutes === null ? '—' : `${format(metric.averageTaskDelayMinutes, 1)}m`}</div></div>)}</div><p className="mt-3 text-center text-[11px] text-[#9aa79d]">Average delay per assigned task · full metrics in exported JSON</p></Card></div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e9df] bg-white px-5 py-4 text-xs text-[#708476]"><span className="flex items-center gap-2"><Play size={13} className="text-[#498b67]" /> {milp?.status === 'optimal' ? 'Proven optimal' : milp?.status === 'feasible' ? 'Feasible incumbent' : milp?.status === 'decomposed' ? 'Batched MILP · no global certificate' : milp?.status === 'time_limit' ? 'Time limit · no incumbent' : 'Awaiting result'} · {workload.tasks.length} tasks · {workload.workers.length} workers · {workload.slotMinutes}-minute grid</span><span>GLPK WebAssembly · Seed {seed}</span></div>
      </div>
    </main>
  </div>
}

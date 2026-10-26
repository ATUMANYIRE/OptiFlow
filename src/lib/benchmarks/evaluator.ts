import { canPlace, solveMilp, toAllocationResult, validateWorkload } from '../solver/milpCore.js'
import type { AllocationResult, Assignment, BenchmarkMetrics, Task, Worker, Workload } from '../types.js'

const skills = ['Dispatch', 'Clinical', 'Electrical', 'Logistics', 'Quality']

function randomSource(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const items = [...values]
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const current = items[index]
    items[index] = items[other]
    items[other] = current
  }
  return items
}

export function generateWorkload(taskCount: number, seed = 2026): Workload {
  if (!Number.isInteger(taskCount) || taskCount < 50 || taskCount > 1000) throw new Error('Task count must be an integer from 50 to 1,000')
  const random = randomSource(seed)
  const workerCount = Math.max(9, Math.ceil(taskCount / 8))
  const workers: Worker[] = Array.from({ length: workerCount }, (_, index) => {
    const primary = index % skills.length
    const secondary = (primary + 1 + Math.floor(random() * (skills.length - 1))) % skills.length
    const breakStart = 7 + Math.floor(random() * 4)
    return {
      id: `W${String(index + 1).padStart(2, '0')}`,
      name: ['Avery', 'Jordan', 'Morgan', 'Casey', 'Taylor', 'Riley', 'Sam', 'Alex', 'Jamie'][index % 9] + ` ${String(index + 1).padStart(2, '0')}`,
      skills: [skills[primary], skills[secondary]],
      capacitySlots: 9,
      maxTasks: 5,
      unavailable: [{ start: breakStart, end: breakStart + 2 }],
    }
  })
  const tasks: Task[] = Array.from({ length: taskCount }, (_, index) => {
    const durationSlots = 1 + Math.floor(random() * 3)
    const releaseSlot = Math.floor(random() * 14)
    const deadlineSlot = Math.min(20, releaseSlot + durationSlots + 2 + Math.floor(random() * 5))
    const skill = skills[Math.floor(random() * skills.length)]
    return {
      id: `T${String(index + 1).padStart(4, '0')}`,
      label: `${['Priority response', 'Field inspection', 'Resource transfer', 'Service request', 'Compliance check'][index % 5]} ${String(index + 1).padStart(3, '0')}`,
      skill, durationSlots, releaseSlot, deadlineSlot, priority: 1 + Math.floor(random() * 3),
    }
  })
  return { tasks, workers, horizonSlots: 20, slotMinutes: 30, restSlots: 1, seed }
}

type Baseline = 'Greedy' | 'Round-Robin' | 'Random'

export function runBaseline(workload: Workload, algorithm: Baseline): AllocationResult {
  validateWorkload(workload)
  const started = performance.now()
  const random = randomSource(workload.seed ^ 0x9e3779b9)
  const assignments: Assignment[] = []
  const tasks = algorithm === 'Greedy'
    ? [...workload.tasks].sort((a, b) => a.deadlineSlot - b.deadlineSlot || b.priority - a.priority)
    : workload.tasks
  let cursor = 0
  for (const task of tasks) {
    let order = workload.workers
    if (algorithm === 'Round-Robin') order = [...workload.workers.slice(cursor), ...workload.workers.slice(0, cursor)]
    if (algorithm === 'Random') order = shuffled(workload.workers, random)
    let placed = false
    for (const worker of order) {
      const starts = Array.from({ length: Math.max(0, task.deadlineSlot - task.durationSlots - task.releaseSlot + 1) }, (_, index) => task.releaseSlot + index)
      const startChoices = algorithm === 'Random' ? shuffled(starts, random) : starts
      for (const start of startChoices) {
        if (!canPlace(task, worker, start, assignments, workload)) continue
        assignments.push({ taskId: task.id, workerId: worker.id, startSlot: start, endSlot: start + task.durationSlots })
        if (algorithm === 'Round-Robin') cursor = (workload.workers.indexOf(worker) + 1) % workload.workers.length
        placed = true
        break
      }
      if (placed) break
    }
  }
  return toAllocationResult(workload, algorithm, assignments, performance.now() - started)
}

export function evaluateAllocation(workload: Workload, result: AllocationResult): BenchmarkMetrics {
  const tasks = new Map(workload.tasks.map(task => [task.id, task]))
  const workers = new Map(workload.workers.map(worker => [worker.id, worker]))
  const mismatch = result.assignments.filter(item => !workers.get(item.workerId)?.skills.includes(tasks.get(item.taskId)?.skill ?? '')).length
  const load = workload.workers.map(worker => result.assignments.filter(item => item.workerId === worker.id).reduce((sum, item) => sum + item.endSlot - item.startSlot, 0) / Math.max(1, worker.capacitySlots))
  const mean = load.reduce((sum, value) => sum + value, 0) / load.length
  const variance = load.reduce((sum, value) => sum + (value - mean) ** 2, 0) / load.length
  const overload = load.map(value => Math.max(0, value - 1))
  const overloadMean = overload.reduce((sum, value) => sum + value, 0) / overload.length
  const overloadVariance = overload.reduce((sum, value) => sum + (value - overloadMean) ** 2, 0) / overload.length
  const delay = result.assignments.reduce((sum, item) => sum + (item.startSlot - (tasks.get(item.taskId)?.releaseSlot ?? item.startSlot)) * workload.slotMinutes, 0)
  return {
    algorithm: result.algorithm,
    assigned: result.assignments.length,
    unassigned: result.unassignedTaskIds.length,
    averageTaskDelayMinutes: result.assignments.length ? delay / result.assignments.length : null,
    skillMismatchRatePercent: result.assignments.length ? mismatch / result.assignments.length * 100 : 0,
    workerLoadVariance: variance,
    workerOverloadVariance: overloadVariance,
    computeLatencyMs: result.latencyMs,
    violations: result.violationCount,
  }
}

export async function compareAlgorithms(workload: Workload, fairnessWeight: number, timeLimitSeconds = 8): Promise<{ results: AllocationResult[]; metrics: BenchmarkMetrics[] }> {
  const milp = await solveMilp(workload, fairnessWeight, timeLimitSeconds)
  const results = [milp, runBaseline(workload, 'Greedy'), runBaseline(workload, 'Round-Robin'), runBaseline(workload, 'Random')]
  return { results, metrics: results.map(result => evaluateAllocation(workload, result)) }
}

export interface BatchRow { taskCount: number; seed: number; metrics: BenchmarkMetrics[]; milpStatus: AllocationResult['status'] }

export async function runBatchComparison(sizes: readonly number[] = [50, 100, 250, 500, 1000], seed = 2026, fairnessWeight = 0.35, timeLimitSeconds = 8): Promise<BatchRow[]> {
  const rows: BatchRow[] = []
  for (const size of sizes) {
    const workload = generateWorkload(size, seed)
    const comparison = await compareAlgorithms(workload, fairnessWeight, timeLimitSeconds)
    rows.push({ taskCount: size, seed, metrics: comparison.metrics, milpStatus: comparison.results[0].status })
  }
  return rows
}

export interface ParetoPoint { fairnessWeight: number; delayMinutes: number; loadSpreadSlots: number; assigned: number; result: AllocationResult; dominated: boolean }

export async function calculateParetoFrontier(workload: Workload, weights: readonly number[] = [0, 0.25, 0.5, 0.75, 1], timeLimitSeconds = 5): Promise<ParetoPoint[]> {
  const points: ParetoPoint[] = []
  for (const fairnessWeight of weights) {
    const result = await solveMilp(workload, fairnessWeight, timeLimitSeconds)
    const taskLookup = new Map(workload.tasks.map(task => [task.id, task]))
    const loads = workload.workers.map(worker => result.assignments.filter(item => item.workerId === worker.id).reduce((sum, item) => sum + item.endSlot - item.startSlot, 0))
    const delayMinutes = result.assignments.reduce((sum, item) => sum + (item.startSlot - (taskLookup.get(item.taskId)?.releaseSlot ?? item.startSlot)) * workload.slotMinutes, 0)
    points.push({ fairnessWeight, delayMinutes, loadSpreadSlots: Math.max(...loads) - Math.min(...loads), assigned: result.assignments.length, result, dominated: false })
  }
  return points.map(point => ({ ...point, dominated: points.some(other => other !== point && other.assigned >= point.assigned && other.delayMinutes <= point.delayMinutes && other.loadSpreadSlots <= point.loadSpreadSlots && (other.assigned > point.assigned || other.delayMinutes < point.delayMinutes || other.loadSpreadSlots < point.loadSpreadSlots)) }))
}

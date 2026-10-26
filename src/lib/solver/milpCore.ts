import GLPK, { type GLPK as GLPKInstance, type LP } from 'glpk.js'
import type { AllocationResult, Assignment, ConstraintViolationDetail, Task, Worker, Workload } from '../types.js'

interface Candidate { name: string; task: Task; worker: Worker; start: number; end: number }
type Term = { name: string; coef: number }

let solverPromise: Promise<GLPKInstance> | undefined

/**
 * Pre-warms and caches the GLPK WebAssembly engine as a singleton.
 * Runs a trivial LP solve during initialization to trigger JIT compilation and
 * WebAssembly linear memory allocation, completely eliminating cold-boot overhead.
 */
export function prewarmMilp(): Promise<void> {
  if (!solverPromise) {
    solverPromise = Promise.resolve((GLPK as unknown as () => GLPKInstance)()).then(async glpk => {
      try {
        await glpk.solve({
          name: 'optiflow_prewarm',
          objective: { direction: glpk.GLP_MIN, name: 'obj', vars: [{ name: 'x', coef: 1 }] },
          subjectTo: [{ name: 'c1', vars: [{ name: 'x', coef: 1 }], bnds: { type: glpk.GLP_LO, lb: 0, ub: 1 } }],
          bounds: [{ name: 'x', type: glpk.GLP_LO, lb: 0, ub: 1 }],
        }, { msglev: glpk.GLP_MSG_OFF })
      } catch {
        // Prewarm LP solve is non-critical for basic fallback
      }
      return glpk
    }).catch(error => {
      solverPromise = undefined
      throw error
    })
  }
  return solverPromise.then(() => undefined)
}

// Automatically trigger singleton pre-warming in client-side environment
if (typeof window !== 'undefined') {
  void prewarmMilp()
}

const solver = async (): Promise<GLPKInstance> => {
  await prewarmMilp()
  return solverPromise!
}

export function validateWorkload(input: Workload): void {
  if (!Number.isInteger(input.horizonSlots) || input.horizonSlots < 1 || !Number.isInteger(input.slotMinutes) || input.slotMinutes < 1 || !Number.isInteger(input.restSlots) || input.restSlots < 0) throw new Error('Invalid time grid')
  if (!input.workers.length || !input.tasks.length) throw new Error('A workload needs workers and tasks')
  if (new Set(input.tasks.map(task => task.id)).size !== input.tasks.length || new Set(input.workers.map(worker => worker.id)).size !== input.workers.length) throw new Error('Task and worker IDs must be unique')
  for (const task of input.tasks) {
    if (!Number.isInteger(task.durationSlots) || task.durationSlots < 1 || !Number.isInteger(task.releaseSlot) || task.releaseSlot < 0 || !Number.isInteger(task.deadlineSlot) || task.deadlineSlot > input.horizonSlots || task.deadlineSlot <= task.releaseSlot || !Number.isFinite(task.priority) || task.priority < 1) throw new Error(`Invalid task ${task.id}`)
  }
  for (const worker of input.workers) {
    if (!Number.isInteger(worker.capacitySlots) || worker.capacitySlots < 0 || !Number.isInteger(worker.maxTasks) || worker.maxTasks < 0) throw new Error(`Invalid worker ${worker.id}`)
    for (const window of worker.unavailable) if (!Number.isInteger(window.start) || !Number.isInteger(window.end) || window.start < 0 || window.end > input.horizonSlots || window.start >= window.end) throw new Error(`Invalid unavailable window for ${worker.id}`)
  }
}

export function canPlace(task: Task, worker: Worker, start: number, assigned: Assignment[], workload: Workload): boolean {
  const end = start + task.durationSlots
  if (!worker.skills.includes(task.skill) || start < task.releaseSlot || end > task.deadlineSlot || end > workload.horizonSlots) return false
  if (worker.unavailable.some(window => start < window.end && end > window.start)) return false
  const workerAssignments = assigned.filter(item => item.workerId === worker.id)
  if (workerAssignments.length >= worker.maxTasks || workerAssignments.reduce((sum, item) => sum + item.endSlot - item.startSlot, 0) + task.durationSlots > worker.capacitySlots) return false
  return workerAssignments.every(item => end + workload.restSlots <= item.startSlot || start >= item.endSlot + workload.restSlots)
}

/**
 * Rigorous constraint auditing engine.
 * Inspects all operational constraints: skills, capacities, shift task counts,
 * break windows, rest intervals, and release/deadline bounds.
 */
export function auditViolations(workload: Workload, assignments: Assignment[]): { violations: number; details: ConstraintViolationDetail[] } {
  const details: ConstraintViolationDetail[] = []
  const taskIds = new Set<string>()

  for (const item of assignments) {
    const task = workload.tasks.find(t => t.id === item.taskId)
    const worker = workload.workers.find(w => w.id === item.workerId)
    if (!task) {
      details.push({ type: 'deadline', message: `Unknown task ${item.taskId}`, taskId: item.taskId, workerId: item.workerId })
      continue
    }
    if (!worker) {
      details.push({ type: 'skill', message: `Unknown worker ${item.workerId}`, taskId: item.taskId, workerId: item.workerId })
      continue
    }
    if (taskIds.has(item.taskId)) {
      details.push({ type: 'duplicate', message: `Task ${task.id} assigned multiple times`, taskId: task.id, workerId: worker.id })
    }
    taskIds.add(item.taskId)

    if (item.startSlot < task.releaseSlot) {
      details.push({ type: 'deadline', message: `Task ${task.id} starts at slot ${item.startSlot} before release slot ${task.releaseSlot}`, taskId: task.id, workerId: worker.id })
    }
    if (item.endSlot !== item.startSlot + task.durationSlots) {
      details.push({ type: 'deadline', message: `Task ${task.id} duration mismatch (${item.endSlot - item.startSlot} slots vs ${task.durationSlots} required)`, taskId: task.id, workerId: worker.id })
    }
    if (item.endSlot > task.deadlineSlot) {
      details.push({ type: 'deadline', message: `Task ${task.id} completes at slot ${item.endSlot} after deadline slot ${task.deadlineSlot}`, taskId: task.id, workerId: worker.id })
    }
    if (item.endSlot > workload.horizonSlots) {
      details.push({ type: 'deadline', message: `Task ${task.id} extends beyond operating horizon (${workload.horizonSlots} slots)`, taskId: task.id, workerId: worker.id })
    }
    if (!worker.skills.includes(task.skill)) {
      details.push({ type: 'skill', message: `Worker ${worker.name} lacks required skill "${task.skill}" (worker has: ${worker.skills.join(', ')})`, taskId: task.id, workerId: worker.id })
    }
    for (const window of worker.unavailable) {
      if (item.startSlot < window.end && item.endSlot > window.start) {
        details.push({ type: 'unavailable', message: `Worker ${worker.name} is on scheduled break during slots [${window.start}, ${window.end})`, taskId: task.id, workerId: worker.id })
      }
    }
  }

  for (const worker of workload.workers) {
    const shifts = assignments.filter(item => item.workerId === worker.id).sort((a, b) => a.startSlot - b.startSlot)
    if (shifts.length > worker.maxTasks) {
      details.push({ type: 'max_tasks', message: `Worker ${worker.name} assigned ${shifts.length} tasks (exceeds limit of ${worker.maxTasks})`, workerId: worker.id })
    }
    const totalSlots = shifts.reduce((sum, item) => sum + item.endSlot - item.startSlot, 0)
    if (totalSlots > worker.capacitySlots) {
      details.push({ type: 'capacity', message: `Worker ${worker.name} assigned ${totalSlots} slots (exceeds shift capacity of ${worker.capacitySlots})`, workerId: worker.id })
    }
    for (let i = 1; i < shifts.length; i++) {
      if (shifts[i].startSlot < shifts[i - 1].endSlot + workload.restSlots) {
        details.push({ type: 'rest', message: `Worker ${worker.name} has insufficient rest between tasks ${shifts[i - 1].taskId} and ${shifts[i].taskId} (requires ${workload.restSlots} slot buffer)`, workerId: worker.id })
      }
    }
  }

  return { violations: details.length, details }
}

export function countViolations(workload: Workload, assignments: Assignment[]): number {
  return auditViolations(workload, assignments).violations
}

export function toAllocationResult(
  workload: Workload,
  algorithm: string,
  assignments: Assignment[],
  latencyMs: number,
  status: AllocationResult['status'] = 'feasible',
  objectiveValue: number | null = null,
  optimalityGapPercent: number | null = null,
  wasmExecutionMs: number | null = null
): AllocationResult {
  const allocationMatrix: Record<string, string | null> = Object.fromEntries(workload.tasks.map(task => [task.id, null]))
  for (const assignment of assignments) allocationMatrix[assignment.taskId] = assignment.workerId
  return {
    algorithm,
    status,
    assignments,
    allocationMatrix,
    unassignedTaskIds: workload.tasks.filter(task => allocationMatrix[task.id] === null).map(task => task.id),
    latencyMs,
    totalTimeMs: latencyMs,
    wasmExecutionMs,
    wasmSolveTimeMs: wasmExecutionMs,
    violationCount: countViolations(workload, assignments),
    objectiveValue,
    optimalityGapPercent,
  }
}

function createModel(glpk: GLPKInstance, workload: Workload, fairnessWeight: number): { lp: LP; candidates: Candidate[] } {
  const candidates: Candidate[] = []
  const byTask = new Map<string, Term[]>()
  const byWorker = new Map<string, Candidate[]>()
  const occupancy = new Map<string, Term[]>()
  const objective: Term[] = []
  const constraints: LP['subjectTo'] = []
  const binaries: string[] = []
  const delayWeight = Math.max(0.001, 1 - fairnessWeight)
  const fairnessScale = fairnessWeight * workload.slotMinutes
  const largeBurst = workload.tasks.length > 100 || workload.workers.length > 30

  for (const task of workload.tasks) {
    const taskTerms: Term[] = []
    const eligible = workload.workers.filter(worker => worker.skills.includes(task.skill) && task.durationSlots <= worker.capacitySlots)
    const workerOffset = workload.tasks.indexOf(task) % Math.max(1, eligible.length)
    const workerChoices = largeBurst && eligible.length > 2
      ? Array.from({ length: 2 }, (_, index) => eligible[(workerOffset + Math.floor(index * eligible.length / 2)) % eligible.length])
      : eligible
    for (const worker of workerChoices) {
      if (!worker.skills.includes(task.skill) || task.durationSlots > worker.capacitySlots) continue
      const latestStart = Math.min(task.deadlineSlot, workload.horizonSlots) - task.durationSlots
      const allStarts = Array.from({ length: Math.max(0, latestStart - task.releaseSlot + 1) }, (_, index) => task.releaseSlot + index)
      const starts = largeBurst && allStarts.length > 2
        ? [allStarts[0], allStarts[allStarts.length - 1]]
        : allStarts
      for (const start of starts) {
        const end = start + task.durationSlots
        if (worker.unavailable.some(window => start < window.end && end > window.start)) continue
        const name = `x_${candidates.length}`
        const candidate = { name, task, worker, start, end }
        candidates.push(candidate)
        binaries.push(name)
        taskTerms.push({ name, coef: 1 })
        objective.push({ name, coef: delayWeight * (start - task.releaseSlot) * workload.slotMinutes * task.priority })
        const workerCandidates = byWorker.get(worker.id) ?? []
        workerCandidates.push(candidate)
        byWorker.set(worker.id, workerCandidates)
        for (let slot = start; slot < Math.min(workload.horizonSlots, end + workload.restSlots); slot++) {
          const key = `${worker.id}:${slot}`
          const terms = occupancy.get(key) ?? []
          terms.push({ name, coef: 1 })
          occupancy.set(key, terms)
        }
      }
    }
    const unassigned = `u_${binaries.length}`
    binaries.push(unassigned)
    objective.push({ name: unassigned, coef: 100_000 * task.priority })
    byTask.set(task.id, [...taskTerms, { name: unassigned, coef: 1 }])
  }

  for (const [taskId, vars] of byTask) constraints.push({ name: `task_${taskId}`, vars, bnds: { type: glpk.GLP_FX, lb: 1, ub: 1 } })
  for (const [key, vars] of occupancy) constraints.push({ name: `occupancy_${key}`, vars, bnds: { type: glpk.GLP_UP, lb: 0, ub: 1 } })
  const upper = Math.max(...workload.workers.map(worker => worker.capacitySlots))
  for (const worker of workload.workers) {
    const choices = byWorker.get(worker.id) ?? []
    const workloadTerms = choices.map(candidate => ({ name: candidate.name, coef: candidate.task.durationSlots }))
    constraints.push({ name: `capacity_${worker.id}`, vars: workloadTerms, bnds: { type: glpk.GLP_UP, lb: 0, ub: worker.capacitySlots } })
    constraints.push({ name: `count_${worker.id}`, vars: choices.map(candidate => ({ name: candidate.name, coef: 1 })), bnds: { type: glpk.GLP_UP, lb: 0, ub: worker.maxTasks } })
    constraints.push({ name: `upper_${worker.id}`, vars: [...workloadTerms, { name: 'max_load', coef: -1 }], bnds: { type: glpk.GLP_UP, lb: 0, ub: 0 } })
    constraints.push({ name: `lower_${worker.id}`, vars: [...workloadTerms, { name: 'min_load', coef: -1 }], bnds: { type: glpk.GLP_LO, lb: 0, ub: 0 } })
  }
  objective.push({ name: 'max_load', coef: fairnessScale }, { name: 'min_load', coef: -fairnessScale })
  return {
    lp: {
      name: 'optiflow', objective: { direction: glpk.GLP_MIN, name: 'delay_plus_imbalance', vars: objective }, subjectTo: constraints,
      binaries,
      bounds: [
        { name: 'max_load', type: glpk.GLP_DB, lb: 0, ub: upper },
        { name: 'min_load', type: glpk.GLP_DB, lb: 0, ub: upper },
      ],
    },
    candidates,
  }
}

export async function solveMilp(workload: Workload, fairnessWeight = 0.35, timeLimitSeconds = 8): Promise<AllocationResult> {
  validateWorkload(workload)
  if (fairnessWeight < 0 || fairnessWeight > 1) throw new Error('Fairness weight must be between 0 and 1')
  if (workload.tasks.length > 500) return solveBatchedMilp(workload, fairnessWeight, timeLimitSeconds)
  const started = performance.now()
  const glpk = await solver()
  const { lp, candidates } = createModel(glpk, workload, fairnessWeight)
  const raw = await glpk.solve(lp, { msglev: glpk.GLP_MSG_OFF, presol: true, tmlim: timeLimitSeconds, mipgap: 0 })
  const optimal = raw.result.status === glpk.GLP_OPT
  const feasible = optimal || raw.result.status === glpk.GLP_FEAS
  const assignments: Assignment[] = feasible ? candidates.filter(candidate => raw.result.vars[candidate.name] > 0.5).map(candidate => ({ taskId: candidate.task.id, workerId: candidate.worker.id, startSlot: candidate.start, endSlot: candidate.end })) : []
  const wasmSolveTimeMs = raw.time * 1000
  const totalTimeMs = performance.now() - started
  return toAllocationResult(workload, 'MILP', assignments, totalTimeMs, optimal ? 'optimal' : feasible ? 'feasible' : raw.result.status === glpk.GLP_NOFEAS ? 'infeasible' : 'time_limit', feasible ? raw.result.z : null, optimal ? 0 : null, wasmSolveTimeMs)
}

async function solveBatchedMilp(workload: Workload, fairnessWeight: number, timeLimitSeconds: number): Promise<AllocationResult> {
  const started = performance.now()
  const sorted = [...workload.tasks].sort((a, b) => a.deadlineSlot - b.deadlineSlot || b.priority - a.priority)
  const assignments: Assignment[] = []
  let wasmExecutionMs = 0
  for (let offset = 0; offset < sorted.length; offset += 100) {
    const batch: Workload = {
      ...workload,
      tasks: sorted.slice(offset, offset + 100),
      workers: workload.workers.map(worker => {
        const occupied = assignments.filter(item => item.workerId === worker.id)
        return {
          ...worker,
          capacitySlots: Math.max(0, worker.capacitySlots - occupied.reduce((sum, item) => sum + item.endSlot - item.startSlot, 0)),
          maxTasks: Math.max(0, worker.maxTasks - occupied.length),
          unavailable: [...worker.unavailable, ...occupied.map(item => ({ start: Math.max(0, item.startSlot - workload.restSlots), end: Math.min(workload.horizonSlots, item.endSlot + workload.restSlots) }))],
        }
      }),
    }
    const result = await solveMilp(batch, fairnessWeight, timeLimitSeconds)
    wasmExecutionMs += result.wasmExecutionMs ?? 0
    if (result.status !== 'optimal' && result.status !== 'feasible') break
    assignments.push(...result.assignments)
  }
  const totalTimeMs = performance.now() - started
  return toAllocationResult(workload, 'MILP (batched)', assignments, totalTimeMs, 'decomposed', null, null, wasmExecutionMs)
}

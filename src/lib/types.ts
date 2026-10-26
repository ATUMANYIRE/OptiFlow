export interface TimeWindow { start: number; end: number }
export interface Worker {
  id: string
  name: string
  skills: string[]
  capacitySlots: number
  maxTasks: number
  unavailable: TimeWindow[]
}
export interface Task {
  id: string
  label: string
  skill: string
  durationSlots: number
  releaseSlot: number
  deadlineSlot: number
  priority: number
}
export interface Workload {
  tasks: Task[]
  workers: Worker[]
  horizonSlots: number
  slotMinutes: number
  restSlots: number
  seed: number
}
export interface Assignment { taskId: string; workerId: string; startSlot: number; endSlot: number }
export type SolveStatus = 'optimal' | 'feasible' | 'decomposed' | 'time_limit' | 'infeasible' | 'error'
export interface AllocationResult {
  algorithm: string
  status: SolveStatus
  assignments: Assignment[]
  allocationMatrix: Record<string, string | null>
  unassignedTaskIds: string[]
  latencyMs: number
  totalTimeMs?: number
  wasmExecutionMs: number | null
  wasmSolveTimeMs?: number | null
  violationCount: number
  optimalityGapPercent: number | null
  objectiveValue: number | null
}
export interface BenchmarkMetrics {
  algorithm: string
  assigned: number
  unassigned: number
  averageTaskDelayMinutes: number | null
  averageTaskDelaySeconds?: number | null
  skillMismatchRatePercent: number
  workerLoadVariance: number
  workerOverloadVariance: number
  computeLatencyMs: number
  violations: number
  violationRatePercent?: number
}
export interface ConstraintViolationDetail {
  type: 'skill' | 'capacity' | 'max_tasks' | 'rest' | 'unavailable' | 'deadline' | 'duplicate'
  message: string
  taskId?: string
  workerId?: string
}

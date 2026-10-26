import { describe, expect, it } from 'vitest'
import { countViolations, prewarmMilp, solveMilp } from './milpCore'
import { evaluateAllocation, generateWorkload, runBaseline } from '../benchmarks/evaluator'
import type { Workload } from '../types'

const small: Workload = {
  seed: 4, horizonSlots: 5, slotMinutes: 30, restSlots: 1,
  workers: [
    { id: 'A', name: 'A', skills: ['a'], capacitySlots: 4, maxTasks: 3, unavailable: [] },
    { id: 'B', name: 'B', skills: ['b'], capacitySlots: 4, maxTasks: 3, unavailable: [] },
  ],
  tasks: [
    { id: '1', label: '1', skill: 'a', durationSlots: 2, releaseSlot: 0, deadlineSlot: 3, priority: 1 },
    { id: '2', label: '2', skill: 'a', durationSlots: 2, releaseSlot: 1, deadlineSlot: 5, priority: 1 },
    { id: '3', label: '3', skill: 'b', durationSlots: 1, releaseSlot: 0, deadlineSlot: 3, priority: 1 },
  ],
}

describe('constraint-aware allocation', () => {
  it('solves a conflicting workload with a certified optimal schedule', async () => {
    await Promise.all([prewarmMilp(), prewarmMilp()])
    const result = await solveMilp(small, 0.35, 5)
    expect(result.status).toBe('optimal')
    expect(result.optimalityGapPercent).toBe(0)
    expect(result.assignments).toHaveLength(3)
    expect(result.violationCount).toBe(0)
    expect(result.wasmExecutionMs).not.toBeNull()
    expect(result.latencyMs).toBeGreaterThanOrEqual(result.wasmExecutionMs ?? 0)
    expect(result.assignments.find(item => item.taskId === '2')?.startSlot).toBe(3)
  })

  it('detects rest conflicts in external schedules', () => {
    expect(countViolations(small, [
      { taskId: '1', workerId: 'A', startSlot: 0, endSlot: 2 },
      { taskId: '2', workerId: 'A', startSlot: 2, endSlot: 4 },
    ])).toBe(1)
  })

  it('generates reproducible 50 and 1000 task bursts with valid baselines', () => {
    for (const size of [50, 1000]) {
      const workload = generateWorkload(size, 2026)
      expect(generateWorkload(size, 2026)).toEqual(workload)
      const baseline = runBaseline(workload, 'Greedy')
      const metrics = evaluateAllocation(workload, baseline)
      expect(baseline.violationCount).toBe(0)
      expect(metrics.skillMismatchRatePercent).toBe(0)
      expect(metrics.assigned + metrics.unassigned).toBe(size)
    }
  })

  it('keeps batched 1000-task allocations globally constraint-safe', async () => {
    const workload = generateWorkload(1000, 2026)
    const result = await solveMilp(workload, 0.35, 8)
    expect(result.status).toBe('decomposed')
    expect(result.assignments.length).toBeGreaterThan(0)
    expect(result.violationCount).toBe(0)
    expect(result.optimalityGapPercent).toBeNull()
  }, 30_000)
})

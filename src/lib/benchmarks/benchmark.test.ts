import { expect, it } from 'vitest'
import { compareAlgorithms, generateWorkload } from './evaluator'

it('records a seeded comparison on the same 50-task workload', async () => {
  const workload = generateWorkload(50, 2026)
  const comparison = await compareAlgorithms(workload, 0.35, 8)
  expect(comparison.metrics).toHaveLength(4)
  expect(comparison.results.every(result => result.violationCount === 0)).toBe(true)
  console.log('BENCHMARK_50', JSON.stringify({ seed: 2026, status: comparison.results[0].status, metrics: comparison.metrics }))
}, 30_000)

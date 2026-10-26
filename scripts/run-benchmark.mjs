import { compareAlgorithms, generateWorkload } from '../server-dist/src/lib/benchmarks/evaluator.js'

const seed = Number(process.argv[2] ?? 2026)
const sizes = process.argv.slice(3).map(Number)
const selected = sizes.length ? sizes : [50, 100, 250, 500, 1000]

for (const taskCount of selected) {
  const workload = generateWorkload(taskCount, seed)
  const { results, metrics } = await compareAlgorithms(workload, 0.35, 8)
  process.stdout.write(`${JSON.stringify({ taskCount, seed, status: results[0].status, metrics })}\n`)
}

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareAlgorithms, generateWorkload } from '../src/lib/benchmarks/evaluator.js'
import { solveMilp } from '../src/lib/solver/milpCore.js'
import type { Workload } from '../src/lib/types.js'

const root = resolve(fileURLToPath(new URL('../../dist/', import.meta.url)))
const port = Number(process.env.PORT ?? 3001)
const allowedOrigins = new Set(['http://localhost:3002', 'http://127.0.0.1:3002'])
const contentTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json' }

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

async function body(request: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1_000_000) throw new Error('Request exceeds 1 MB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object')
  return value as Record<string, unknown>
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? 'GET'
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  const origin = request.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (method === 'OPTIONS' && path.startsWith('/api/')) {
    response.writeHead(origin && !allowedOrigins.has(origin) ? 403 : 204)
    response.end()
    return
  }
  if (path === '/api/health' && method === 'GET') return json(response, 200, { status: 'ok', solver: 'GLPK WebAssembly' })
  if ((path === '/api/solve' || path === '/api/benchmark') && method === 'POST') {
    try {
      const payload = asObject(await body(request))
      const fairnessWeight = payload.fairnessWeight === undefined ? 0.35 : Number(payload.fairnessWeight)
      if (!Number.isFinite(fairnessWeight) || fairnessWeight < 0 || fairnessWeight > 1) throw new Error('fairnessWeight must be between 0 and 1')
      const workload = payload.workload
        ? payload.workload as Workload
        : generateWorkload(Number(payload.taskCount ?? 50), Number(payload.seed ?? 2026))
      if (workload.tasks.length > 1000 || workload.workers.length > 200) throw new Error('Workload exceeds API limits')
      return json(response, 200, path === '/api/solve' ? await solveMilp(workload, fairnessWeight) : await compareAlgorithms(workload, fairnessWeight))
    } catch (error) {
      return json(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
  if (method !== 'GET' && method !== 'HEAD') return json(response, 405, { error: 'Method not allowed' })
  try {
    const requested = path === '/' ? '/index.html' : path
    const file = resolve(root, `.${requested}`)
    if (file !== root && !file.startsWith(root + sep)) return json(response, 403, { error: 'Forbidden' })
    const info = await stat(file)
    if (!info.isFile()) return json(response, 404, { error: 'Not found' })
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' })
    if (method === 'HEAD') { response.end(); return }
    response.end(await readFile(file))
  } catch { json(response, 404, { error: 'Not found' }) }
}

createServer((request, response) => { void handle(request, response).catch(error => json(response, 500, { error: error instanceof Error ? error.message : 'Internal error' })) }).listen(port, '0.0.0.0', () => {
  process.stdout.write(`OptiFlow listening on http://localhost:${port}\n`)
})

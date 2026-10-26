import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import { generateWorkload } from './lib/benchmarks/evaluator'
import { prewarmMilp } from './lib/solver/milpCore'
import type { Workload } from './lib/types'
import Benchmarks from './pages/Benchmarks'
import Overview from './pages/Overview'
import Scheduling from './pages/Scheduling'
import { RouterProvider, useRouter, type RouteSection } from './router'

const sectionLabels: Record<RouteSection, string> = {
  overview: 'Operations Overview',
  scheduling: 'Resource & Task Management',
  benchmarks: 'Empirical Benchmark Suite',
}

function MainAppShell() {
  const { route, navigate } = useRouter()
  const [workload, setWorkload] = useState<Workload>(() => generateWorkload(50, 2026))
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>('loading')

  // Pre-warm the GLPK WebAssembly engine as a singleton on mount
  useEffect(() => {
    let active = true
    void prewarmMilp()
      .then(() => {
        if (active) setEngineState('ready')
      })
      .catch(() => {
        if (active) setEngineState('error')
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#f5f8f5] text-[#20362c] lg:flex">
      {/* Universal Workspace Sidebar */}
      <Sidebar
        busy={false}
        engineState={engineState}
        activeSection={route}
        onNavigate={navigate}
      />

      {/* Main Content Viewport */}
      <main className="min-w-0 flex-1">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-[#e1e9e0] bg-white/95 px-6 py-3.5 backdrop-blur-sm lg:px-9">
          <div className="flex items-center gap-2 text-xs text-[#7f9486]">
            <span>OptiFlow</span>
            <span className="text-[#a5b6ab]">/</span>
            <strong className="font-semibold text-[#29563f]">{sectionLabels[route]}</strong>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full bg-[#edf7ee] px-3 py-1.5 text-xs font-semibold text-[#2f7a55] sm:flex shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#48a86c] animate-pulse" />
              Client Edge WASM
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dbeadc] text-xs font-bold text-[#2d6146] shadow-sm">
              OF
            </div>
          </div>
        </header>

        {/* Dynamic Route View */}
        <div className="mx-auto max-w-[1540px] px-5 pb-16 pt-7 lg:px-9">
          {route === 'overview' && (
            <Overview initialWorkload={workload} onWorkloadChange={setWorkload} />
          )}
          {route === 'scheduling' && (
            <Scheduling initialWorkload={workload} onWorkloadUpdate={setWorkload} />
          )}
          {route === 'benchmarks' && <Benchmarks />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <RouterProvider>
      <MainAppShell />
    </RouterProvider>
  )
}

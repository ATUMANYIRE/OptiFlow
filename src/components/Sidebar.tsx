import { useState } from 'react'
import { Activity, CalendarDays, Gauge, Layers3, Menu, Sparkles, X } from 'lucide-react'

export type DashboardSection = 'overview' | 'scheduling' | 'benchmarks'

interface SidebarProps {
  busy: boolean
  engineState: 'loading' | 'ready' | 'error'
  apiAvailable: boolean | null
  activeSection: DashboardSection
  onNavigate: (section: DashboardSection) => void
}

const links = [
  { section: 'overview', label: 'Overview', icon: Gauge },
  { section: 'scheduling', label: 'Scheduling', icon: CalendarDays },
  { section: 'benchmarks', label: 'Benchmarks', icon: Activity },
] as const

export default function Sidebar({ busy, engineState, apiAvailable, activeSection, onNavigate }: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const engineLabel = engineState === 'ready'
    ? 'Edge WASM Engine Active (Client-side)'
    : engineState === 'error' ? 'WASM engine failed to initialize' : 'Initializing WASM engine'

  const navigate = (section: DashboardSection) => {
    onNavigate(section)
    setMenuOpen(false)
  }

  return <aside className="sidebar sticky top-0 z-40 flex w-full shrink-0 self-start flex-col bg-[#102823] text-white lg:h-screen lg:w-[222px]">
    <div className="flex items-center justify-between gap-2 px-6 py-4 lg:pb-8 lg:pt-7">
      <a href="#overview" onClick={() => navigate('overview')} className="flex items-center gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9cddae]" aria-label="OptiFlow overview">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#9cddae] text-[#173c31]"><Layers3 size={18} /></span>
        <span className="text-[21px] font-semibold tracking-[-.06em]">opti<span className="text-[#9cddae]">flow</span></span>
      </a>
      <button type="button" onClick={() => setMenuOpen(open => !open)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="workspace-navigation" className="rounded-md p-2 text-[#c4e5cc] hover:bg-[#224b3e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9cddae] lg:hidden">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
    </div>
    <nav id="workspace-navigation" aria-label="Workspace" className={`${menuOpen ? 'block' : 'hidden'} px-4 pb-4 lg:block lg:pb-0`}>
      <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[#6d9788]">Workspace</div>
      {links.map(({ section, label, icon: Icon }) => <a key={section} href={`#${section}`} onClick={() => navigate(section)} aria-current={activeSection === section ? 'location' : undefined} className={`mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9cddae] ${activeSection === section ? 'bg-[#224b3e] font-semibold text-white' : 'text-[#a4beb2] hover:bg-[#1b4035] hover:text-white'}`}><Icon size={17} /> {label}</a>)}
    </nav>
    <div className={`${menuOpen ? 'block' : 'hidden'} mx-5 mb-5 rounded-xl border border-[#376356] bg-[#193c32] p-4 lg:mt-8 lg:block`}><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#a9d9b8]"><Sparkles size={14} /> Solver status</div><p className="mt-3 text-sm font-medium">GLPK / WebAssembly</p><div className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#c4e5cc]"><span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${engineState === 'ready' ? 'bg-[#a5e2a2]' : engineState === 'error' ? 'bg-rose-400' : 'bg-amber-300'}`} />{engineLabel}</div><div className="mt-2 pl-4 text-[11px] text-[#8caf9e]">{busy ? 'Optimizing workload' : apiAvailable ? 'Backend API connected' : 'Client-side scheduling ready'}</div></div>
    <div className="mt-auto hidden border-t border-[#2a4a3e] px-6 py-6 text-xs text-[#789e8d] lg:block">ICC 2026 · Operations intelligence</div>
  </aside>
}

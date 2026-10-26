import { useState } from 'react'
import { Activity, CalendarDays, Gauge, Layers3, Menu, Sparkles, X } from 'lucide-react'
import type { RouteSection } from '../router'

export type DashboardSection = RouteSection

interface SidebarProps {
  busy?: boolean
  engineState?: 'loading' | 'ready' | 'error'
  activeSection: DashboardSection
  onNavigate: (section: DashboardSection) => void
}

const navItems = [
  { section: 'overview' as const, path: '/overview', label: 'Operations Overview', shortLabel: 'Overview', icon: Gauge },
  { section: 'scheduling' as const, path: '/scheduling', label: 'Resource & Tasks', shortLabel: 'Scheduling', icon: CalendarDays },
  { section: 'benchmarks' as const, path: '/benchmarks', label: 'Empirical Benchmarks', shortLabel: 'Benchmarks', icon: Activity },
]

export default function Sidebar({ busy = false, engineState = 'ready', activeSection, onNavigate }: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleNavClick = (section: DashboardSection) => {
    onNavigate(section)
    setMenuOpen(false)
  }

  return (
    <aside className="sidebar sticky top-0 z-40 flex w-full shrink-0 self-start flex-col bg-[#102823] text-white lg:h-screen lg:w-[240px]">
      {/* Brand Header */}
      <div className="flex items-center justify-between gap-2 px-6 py-4 lg:pb-8 lg:pt-7">
        <a
          href="/overview"
          onClick={e => {
            e.preventDefault()
            handleNavClick('overview')
          }}
          className="flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9cddae]"
          aria-label="OptiFlow overview"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#9cddae] text-[#173c31] shadow-sm">
            <Layers3 size={19} />
          </span>
          <span className="text-[22px] font-bold tracking-[-.06em]">
            opti<span className="text-[#9cddae]">flow</span>
          </span>
        </a>

        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen(open => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="workspace-navigation"
          className="rounded-md p-2 text-[#c4e5cc] hover:bg-[#224b3e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9cddae] lg:hidden"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Navigation Links with Active Highlighting */}
      <nav id="workspace-navigation" aria-label="Workspace" className={`${menuOpen ? 'block' : 'hidden'} px-4 pb-4 lg:block lg:pb-0`}>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[#6d9788]">Workspace Navigation</div>
        <div className="space-y-1">
          {navItems.map(({ section, path, label, icon: Icon }) => {
            const isActive = activeSection === section
            return (
              <a
                key={section}
                href={path}
                onClick={e => {
                  e.preventDefault()
                  handleNavClick(section)
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9cddae] ${
                  isActive
                    ? 'bg-[#224b3e] font-semibold text-white shadow-sm ring-1 ring-[#3a6e5b]'
                    : 'text-[#a4beb2] hover:bg-[#183c31] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} className={isActive ? 'text-[#9cddae]' : 'text-[#7e9e8f]'} />
                  <span>{label}</span>
                </span>
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-[#9cddae]" />}
              </a>
            )
          })}
        </div>
      </nav>

      {/* Solver Status Badge: Updated with Edge WASM Engine Active (Client-side) & Green Active Dot */}
      <div className={`${menuOpen ? 'block' : 'hidden'} mx-4 mb-5 rounded-xl border border-[#2b5648] bg-[#163a30] p-4 lg:mt-8 lg:block shadow-sm`}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-[#a9d9b8]">
            <Sparkles size={14} className="text-[#9cddae]" /> Solver Status
          </span>
          <span className="rounded bg-[#20493d] px-2 py-0.5 text-[10px] font-semibold text-[#8ed4a2]">WASM</span>
        </div>

        <p className="mt-2.5 text-xs font-semibold text-[#f0f6f2]">GLPK / WebAssembly Engine</p>

        {/* Engine status indicator */}
        <div className="mt-2.5 flex items-center gap-2 text-xs font-medium text-[#c4e5cc]">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {engineState === 'ready' && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#48a86c] opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                engineState === 'ready' ? 'bg-[#48a86c]' : engineState === 'error' ? 'bg-rose-400' : 'bg-amber-300'
              }`}
            />
          </span>
          <span className="text-[12px] leading-tight">
            {engineState === 'error' ? 'Engine failed to initialize' : 'Edge WASM Engine Active (Client-side)'}
          </span>
        </div>

        <div className="mt-2 pl-4 text-[11px] text-[#8caf9e]">
          {busy ? 'Solving MILP model…' : 'Client-side scheduling ready'}
        </div>
      </div>

      {/* Footer Meta */}
      <div className="mt-auto hidden border-t border-[#1e4438] px-6 py-5 text-xs text-[#789e8d] lg:block">
        <div className="font-semibold text-[#a4beb2]">OptiFlow v1.0</div>
        <div className="mt-0.5 text-[11px]">Operations Research Hackathon</div>
      </div>
    </aside>
  )
}

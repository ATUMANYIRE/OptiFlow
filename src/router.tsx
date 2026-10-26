import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type RouteSection = 'overview' | 'scheduling' | 'benchmarks'

export interface RouterContextType {
  route: RouteSection
  navigate: (target: RouteSection | string) => void
}

const RouterContext = createContext<RouterContextType>({
  route: 'overview',
  navigate: () => {},
})

export function parseRouteFromLocation(): RouteSection {
  if (typeof window === 'undefined') return 'overview'

  const path = window.location.pathname.toLowerCase().replace(/^\/+/, '')
  const hash = window.location.hash.toLowerCase().replace(/^[#/]+/, '')

  const candidate = hash || path

  if (candidate.startsWith('scheduling')) return 'scheduling'
  if (candidate.startsWith('benchmarks') || candidate.startsWith('benchmark')) return 'benchmarks'
  return 'overview'
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RouteSection>(parseRouteFromLocation)

  useEffect(() => {
    const handleLocationChange = () => {
      setRoute(parseRouteFromLocation())
    }

    window.addEventListener('popstate', handleLocationChange)
    window.addEventListener('hashchange', handleLocationChange)

    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      window.removeEventListener('hashchange', handleLocationChange)
    }
  }, [])

  const navigate = (target: RouteSection | string) => {
    const cleaned = target.replace(/^[#/]+/, '') as RouteSection
    const resolved: RouteSection =
      cleaned.startsWith('scheduling') ? 'scheduling' : cleaned.startsWith('benchmark') ? 'benchmarks' : 'overview'

    setRoute(resolved)

    const targetUrl = `/${resolved}`
    if (window.location.pathname !== targetUrl && window.location.hash !== `#${resolved}`) {
      window.history.pushState({ route: resolved }, '', targetUrl)
    }
  }

  return <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterContextType {
  return useContext(RouterContext)
}

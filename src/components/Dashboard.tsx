import App from '../App'

export type { DashboardSection } from './Sidebar'

/**
 * OptiFlow Dashboard Component
 * Serves the full multi-page application shell including Operations Overview,
 * Resource & Task Scheduling Studio, and Empirical Benchmarks Suite.
 */
export default function Dashboard() {
  return <App />
}

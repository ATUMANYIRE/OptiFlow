import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { ParetoPoint } from '../lib/benchmarks/evaluator'

interface Props { points: ParetoPoint[]; selectedWeight: number; loading: boolean; onSelect: (weight: number) => void }

export default function ParetoChart({ points, selectedWeight, loading, onSelect }: Props) {
  const data = points.map(point => ({ x: point.delayMinutes, y: point.loadSpreadSlots, weight: point.fairnessWeight, assigned: point.assigned, dominated: point.dominated }))
  return <div className="relative h-[230px] w-full" aria-label="Pareto frontier: total delay versus workload spread">
    {loading && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/75 text-sm text-[#60716b]">Computing frontier…</div>}
    {data.length ? <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 12, right: 18, bottom: 12, left: -14 }}>
        <CartesianGrid stroke="#e7ece7" strokeDasharray="3 4" />
        <XAxis type="number" dataKey="x" name="Total delay" unit="m" tick={{ fill: '#75837c', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="number" dataKey="y" name="Load spread" unit=" slots" tick={{ fill: '#75837c', fontSize: 11 }} axisLine={false} tickLine={false} width={47} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg border border-[#dce5dc] bg-white p-3 text-xs shadow-lg"><div className="font-bold text-[#203932]">Fairness weight {Math.round(Number(payload[0].payload.weight) * 100)}%</div><div>Total delay {Math.round(Number(payload[0].payload.x))} min</div><div>Load spread {payload[0].payload.y} slots</div><div>Assigned {payload[0].payload.assigned}</div></div> : null} />
        <Scatter data={data} fill="#387d6c" shape={(props: { cx?: number; cy?: number; payload?: { weight: number; dominated: boolean } }) => {
          const active = props.payload?.weight === selectedWeight
          return <circle cx={props.cx} cy={props.cy} r={active ? 8 : 6} fill={props.payload?.dominated ? '#bac7bf' : '#397e6b'} stroke="white" strokeWidth="2" className="cursor-pointer" onClick={() => props.payload && onSelect(props.payload.weight)} />
        }} />
      </ScatterChart>
    </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-[#7b8a81]">Awaiting optimization results</div>}
  </div>
}

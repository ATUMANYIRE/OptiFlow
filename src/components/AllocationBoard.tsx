import { useEffect, useMemo, useState, type FocusEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { AllocationResult, Assignment, Task, Workload, Worker } from '../lib/types'

const priorityColors = { normal: '#318467', high: '#d1883f', critical: '#8468b5' } as const
type PriorityTone = keyof typeof priorityColors

const clock = (slot: number, slotMinutes: number): string => {
  const minutes = 7 * 60 + slot * slotMinutes
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function priorityTone(task: Task): PriorityTone {
  if (task.priority >= 3 || task.skill === 'Clinical') return 'critical'
  if (task.priority >= 2 || task.deadlineSlot - task.releaseSlot - task.durationSlots <= 2) return 'high'
  return 'normal'
}

interface TooltipData { assignment: Assignment; task: Task; worker: Worker; left: number; top: number }

export default function AllocationBoard({ workload, result }: { workload: Workload; result: AllocationResult | null }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  useEffect(() => { setTooltip(null) }, [workload, result])
  const tasks = useMemo(() => new Map(workload.tasks.map(task => [task.id, task])), [workload])
  const assignmentsByWorker = useMemo(() => {
    const groups = new Map<string, Assignment[]>()
    for (const assignment of result?.assignments ?? []) {
      const group = groups.get(assignment.workerId) ?? []
      group.push(assignment)
      groups.set(assignment.workerId, group)
    }
    return groups
  }, [result])

  const showTooltip = (event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>, assignment: Assignment, task: Task, worker: Worker) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    setTooltip({
      assignment, task, worker,
      left: Math.min(bounds.left, Math.max(12, window.innerWidth - 238)),
      top: bounds.bottom + 132 > window.innerHeight ? bounds.top - 132 : bounds.bottom + 8,
    })
  }

  return <>
    <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[#edf1eb] py-3 text-[11px] font-medium text-[#6b7d71]" aria-label="Task priority color legend">
      <span className="mr-1 font-semibold uppercase tracking-[.1em] text-[#8d9d90]">Priority key</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: priorityColors.normal }} />Green · Normal Priority</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: priorityColors.high }} />Orange · High Priority / Tight Window</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: priorityColors.critical }} />Purple · Critical / Skilled Task</span>
    </div>
    <div className="overflow-x-auto"><div className="min-w-[760px]">
      <div className="mb-2 grid grid-cols-[126px_1fr] items-center"><span className="pl-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#9ba69f]">Resource</span><div className="relative flex justify-between pr-2 text-[10px] font-medium text-[#9ba69f]">{Array.from({ length: 6 }, (_, index) => <span key={index}>{clock(index * 4, workload.slotMinutes)}</span>)}</div></div>
      {workload.workers.slice(0, 9).map(worker => <div className="grid grid-cols-[126px_1fr] items-center border-t border-[#eef1ed] py-2.5" key={worker.id}>
        <div className="pr-2"><div className="truncate text-xs font-semibold text-[#34473d]">{worker.name}</div><div className="mt-0.5 text-[10px] text-[#9aa69e]">{worker.id} · {worker.skills.length} skills</div></div>
        <div className="schedule-track relative h-[30px] rounded-md bg-[#f4f7f3]">
          {worker.unavailable.map((window, index) => <div key={index} className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,#e5eae5,#e5eae5_3px,#f1f4ef_3px,#f1f4ef_7px)]" style={{ left: `${window.start / workload.horizonSlots * 100}%`, width: `${(window.end - window.start) / workload.horizonSlots * 100}%` }} title="Unavailable window" />)}
          {(assignmentsByWorker.get(worker.id) ?? []).map(assignment => {
            const task = tasks.get(assignment.taskId)
            if (!task) return null
            const label = `${task.id}, ${task.skill}, ${clock(assignment.startSlot, workload.slotMinutes)} to ${clock(assignment.endSlot, workload.slotMinutes)}, assigned to ${worker.name}`
            return <button key={assignment.taskId} type="button" aria-label={label} aria-describedby={tooltip?.assignment.taskId === assignment.taskId ? 'allocation-tooltip' : undefined} className="absolute inset-y-[3px] overflow-hidden rounded-[5px] px-1.5 text-left text-[10px] font-semibold leading-[24px] text-white transition-[filter,transform] hover:z-10 hover:brightness-110 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e4938]" style={{ left: `${assignment.startSlot / workload.horizonSlots * 100}%`, width: `calc(${(assignment.endSlot - assignment.startSlot) / workload.horizonSlots * 100}% - 2px)`, backgroundColor: priorityColors[priorityTone(task)] }} onMouseEnter={event => showTooltip(event, assignment, task, worker)} onMouseLeave={() => setTooltip(null)} onFocus={event => showTooltip(event, assignment, task, worker)} onBlur={() => setTooltip(null)} onClick={event => tooltip?.assignment.taskId === assignment.taskId ? setTooltip(null) : showTooltip(event, assignment, task, worker)} onKeyDown={event => { if (event.key === 'Escape') setTooltip(null) }}>{assignment.taskId}</button>
          })}
        </div>
      </div>)}
    </div></div>
    {tooltip && createPortal(<div id="allocation-tooltip" role="tooltip" className="pointer-events-none fixed z-50 w-[226px] rounded-xl border border-[#d9e4d9] bg-white p-3 text-xs shadow-[0_12px_32px_rgba(13,39,26,.18)]" style={{ left: tooltip.left, top: tooltip.top }}><div className="font-bold text-[#263e31]">Task {tooltip.task.id}</div><dl className="mt-2 grid grid-cols-[76px_1fr] gap-y-1 text-[#66766c]"><dt>Skill</dt><dd className="font-medium text-[#30483a]">{tooltip.task.skill}</dd><dt>Start / End</dt><dd className="font-medium text-[#30483a]">{clock(tooltip.assignment.startSlot, workload.slotMinutes)} – {clock(tooltip.assignment.endSlot, workload.slotMinutes)}</dd><dt>Worker</dt><dd className="font-medium text-[#30483a]">{tooltip.worker.name}</dd></dl></div>, document.body)}
    <div className="mt-3 text-right text-[11px] text-[#93a197]">Striped bands indicate unavailable worker windows</div>
  </>
}

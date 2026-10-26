import { useEffect, useMemo, useState, type FocusEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { AllocationResult, Assignment, Task, Workload, Worker } from '../lib/types'

const priorityColors = {
  normal: '#2c8a66',
  high: '#d97706',
  critical: '#7c3aed',
} as const

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

interface TooltipData {
  assignment: Assignment
  task: Task
  worker: Worker
  left: number
  top: number
}

interface AllocationBoardProps {
  workload: Workload
  result: AllocationResult | null
  maxWorkersShown?: number
}

export default function AllocationBoard({ workload, result, maxWorkersShown = 9 }: AllocationBoardProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  useEffect(() => {
    setTooltip(null)
  }, [workload, result])

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

  const showTooltip = (
    event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>,
    assignment: Assignment,
    task: Task,
    worker: Worker
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const tooltipWidth = 260
    const tooltipHeight = 160
    const left = Math.min(bounds.left, Math.max(12, window.innerWidth - tooltipWidth - 12))
    const top = bounds.bottom + tooltipHeight > window.innerHeight
      ? Math.max(12, bounds.top - tooltipHeight - 8)
      : bounds.bottom + 8

    setTooltip({
      assignment,
      task,
      worker,
      left,
      top,
    })
  }

  const workersToDisplay = workload.workers.slice(0, maxWorkersShown)

  return (
    <div className="w-full">
      {/* Horizontal Priority Color Legend */}
      <div
        className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-xl border border-[#e2eae1] bg-[#f8faf7] px-4 py-3 text-xs font-medium text-[#4b6154]"
        aria-label="Task priority color legend"
      >
        <span className="font-bold uppercase tracking-[.14em] text-[#345c48]">Priority Legend:</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-[3px] shadow-sm" style={{ backgroundColor: priorityColors.normal }} />
          <span>Green = Normal Priority</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-[3px] shadow-sm" style={{ backgroundColor: priorityColors.high }} />
          <span>Orange = High Priority</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-[3px] shadow-sm" style={{ backgroundColor: priorityColors.critical }} />
          <span>Purple = Critical / Skilled Task</span>
        </span>
      </div>

      {/* Gantt Timeline Grid */}
      <div className="overflow-x-auto rounded-xl border border-[#e4ebe3] bg-white p-3">
        <div className="min-w-[760px]">
          {/* Header Row: Clock Times */}
          <div className="mb-2 grid grid-cols-[140px_1fr] items-center">
            <span className="pl-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#788d80]">Resource</span>
            <div className="relative flex justify-between pr-2 text-[11px] font-semibold text-[#667e70]">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index}>{clock(index * 4, workload.slotMinutes)}</span>
              ))}
            </div>
          </div>

          {/* Worker Rows */}
          {workersToDisplay.map(worker => {
            const workerAssignments = assignmentsByWorker.get(worker.id) ?? []
            const totalAssignedSlots = workerAssignments.reduce((sum, a) => sum + (a.endSlot - a.startSlot), 0)

            return (
              <div
                className="grid grid-cols-[140px_1fr] items-center border-t border-[#edf2ec] py-2.5 transition-colors hover:bg-[#fafbfa]"
                key={worker.id}
              >
                <div className="pr-3">
                  <div className="truncate text-xs font-semibold text-[#20362b]">{worker.name}</div>
                  <div className="mt-0.5 text-[10px] text-[#7a8c80]">
                    {worker.id} · {totalAssignedSlots}/{worker.capacitySlots} slots
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {worker.skills.slice(0, 2).map(skill => (
                      <span key={skill} className="rounded bg-[#ebf3ec] px-1 py-0.2 text-[9px] font-medium text-[#2d6349]">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="schedule-track relative h-[32px] rounded-md bg-[#f3f6f2]">
                  {/* Unavailable Break Windows */}
                  {worker.unavailable.map((window, index) => (
                    <div
                      key={index}
                      className="absolute inset-y-0 rounded-[4px] bg-[repeating-linear-gradient(45deg,#dfe6df,#dfe6df_3px,#edf2ec_3px,#edf2ec_7px)] opacity-90"
                      style={{
                        left: `${(window.start / workload.horizonSlots) * 100}%`,
                        width: `${((window.end - window.start) / workload.horizonSlots) * 100}%`,
                      }}
                      title={`Break Window: ${clock(window.start, workload.slotMinutes)} - ${clock(window.end, workload.slotMinutes)}`}
                    />
                  ))}

                  {/* Task Blocks */}
                  {workerAssignments.map(assignment => {
                    const task = tasks.get(assignment.taskId)
                    if (!task) return null
                    const tone = priorityTone(task)
                    const label = `Task ${task.id}: ${task.skill}, ${clock(assignment.startSlot, workload.slotMinutes)} to ${clock(assignment.endSlot, workload.slotMinutes)}, assigned to ${worker.name}`

                    return (
                      <button
                        key={assignment.taskId}
                        type="button"
                        aria-label={label}
                        aria-describedby={tooltip?.assignment.taskId === assignment.taskId ? 'allocation-tooltip' : undefined}
                        className="absolute inset-y-[3px] overflow-hidden rounded-[5px] px-2 text-left text-[11px] font-bold leading-[26px] text-white shadow-sm transition-[filter,transform] hover:z-20 hover:scale-[1.02] hover:brightness-110 focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173d2e]"
                        style={{
                          left: `${(assignment.startSlot / workload.horizonSlots) * 100}%`,
                          width: `calc(${((assignment.endSlot - assignment.startSlot) / workload.horizonSlots) * 100}% - 2px)`,
                          backgroundColor: priorityColors[tone],
                        }}
                        onMouseEnter={event => showTooltip(event, assignment, task, worker)}
                        onMouseLeave={() => setTooltip(null)}
                        onFocus={event => showTooltip(event, assignment, task, worker)}
                        onBlur={() => setTooltip(null)}
                        onClick={event => (tooltip?.assignment.taskId === assignment.taskId ? setTooltip(null) : showTooltip(event, assignment, task, worker))}
                        onKeyDown={event => {
                          if (event.key === 'Escape') setTooltip(null)
                        }}
                      >
                        <span className="truncate">{assignment.taskId}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rich Interactive Tooltip with All 5 Required Fields */}
      {tooltip &&
        createPortal(
          <div
            id="allocation-tooltip"
            role="tooltip"
            className="pointer-events-none fixed z-50 w-[260px] rounded-xl border border-[#cde0d1] bg-white p-3.5 text-xs shadow-[0_16px_36px_rgba(16,42,29,.22)] animate-in fade-in zoom-in-95 duration-150"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            <div className="flex items-center justify-between border-b border-[#eef3ee] pb-2">
              <span className="font-bold text-[#1a382b]">Task ID: {tooltip.task.id}</span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: priorityColors[priorityTone(tooltip.task)] }}
              >
                {priorityTone(tooltip.task)}
              </span>
            </div>

            <dl className="mt-2.5 space-y-1.5 text-[#506357]">
              <div className="flex justify-between">
                <dt className="text-[#7d9084]">Required Skill:</dt>
                <dd className="font-semibold text-[#1f372a]">{tooltip.task.skill}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7d9084]">Start / End Time:</dt>
                <dd className="font-semibold text-[#1f372a]">
                  {clock(tooltip.assignment.startSlot, workload.slotMinutes)} – {clock(tooltip.assignment.endSlot, workload.slotMinutes)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7d9084]">Duration:</dt>
                <dd className="font-semibold text-[#1f372a]">
                  {tooltip.task.durationSlots * workload.slotMinutes} mins ({tooltip.task.durationSlots} slots)
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#7d9084]">Worker Assignment:</dt>
                <dd className="font-semibold text-[#29684c]">{tooltip.worker.name}</dd>
              </div>
            </dl>
          </div>,
          document.body
        )}

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#7d9084]">
        <span>Operating window: 07:00 – 17:00 (30-min slots)</span>
        <span>Striped zones indicate mandatory worker break windows</span>
      </div>
    </div>
  )
}

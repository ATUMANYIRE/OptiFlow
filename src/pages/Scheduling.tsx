import { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react'
import AllocationBoard from '../components/AllocationBoard'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { generateWorkload, skills as defaultSkills } from '../lib/benchmarks/evaluator'
import { canPlace, solveMilp } from '../lib/solver/milpCore'
import type { AllocationResult, Assignment, Task, Worker, Workload } from '../lib/types'

const clock = (slot: number, slotMinutes = 30): string => {
  const minutes = 7 * 60 + slot * slotMinutes
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

const priorityLabel = (priority: number) => {
  if (priority >= 3) return { text: 'Critical', bg: 'bg-[#7c3aed] text-white' }
  if (priority === 2) return { text: 'High', bg: 'bg-[#d97706] text-white' }
  return { text: 'Normal', bg: 'bg-[#2c8a66] text-white' }
}

interface SchedulingProps {
  initialWorkload?: Workload
  onWorkloadUpdate?: (workload: Workload) => void
}

export default function Scheduling({ initialWorkload, onWorkloadUpdate }: SchedulingProps) {
  // Master Workload State
  const [workload, setWorkload] = useState<Workload>(() => initialWorkload ?? generateWorkload(50, 2026))
  const [solution, setSolution] = useState<AllocationResult | null>(null)
  const [solving, setSolving] = useState(false)
  const [solveMessage, setSolveMessage] = useState<string | null>(null)

  // Active Tab: 'override' | 'workers' | 'tasks'
  const [activeTab, setActiveTab] = useState<'override' | 'workers' | 'tasks'>('override')

  // Search & Filters
  const [taskSearch, setTaskSearch] = useState('')
  const [taskSkillFilter, setTaskSkillFilter] = useState<string>('all')
  const [workerSearch, setWorkerSearch] = useState('')

  // Worker Form Modal State
  const [workerModalOpen, setWorkerModalOpen] = useState(false)
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null)
  const [workerName, setWorkerName] = useState('')
  const [workerSkills, setWorkerSkills] = useState<string[]>(['Dispatch'])
  const [workerCapacity, setWorkerCapacity] = useState(9)
  const [workerMaxTasks, setWorkerMaxTasks] = useState(5)
  const [workerBreakStart, setWorkerBreakStart] = useState(7)
  const [workerBreakEnd, setWorkerBreakEnd] = useState(9)

  // Task Form Modal State
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [taskLabel, setTaskLabel] = useState('')
  const [taskSkill, setTaskSkill] = useState('Dispatch')
  const [taskDuration, setTaskDuration] = useState(2)
  const [taskRelease, setTaskRelease] = useState(0)
  const [taskDeadline, setTaskDeadline] = useState(10)
  const [taskPriority, setTaskPriority] = useState(1)

  // Manual Override Tester State
  const [selectedTaskId, setSelectedTaskId] = useState<string>(() => workload.tasks[0]?.id ?? '')
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(() => workload.workers[0]?.id ?? '')
  const [selectedStartSlot, setSelectedStartSlot] = useState<number>(() => workload.tasks[0]?.releaseSlot ?? 0)
  const [manualAssignments, setManualAssignments] = useState<Assignment[]>([])
  const [overrideSuccessMessage, setOverrideSuccessMessage] = useState<string | null>(null)

  // Active assignments from solver or manual overrides
  const effectiveAssignments = useMemo(() => {
    if (manualAssignments.length > 0) {
      return manualAssignments
    }
    return solution?.assignments ?? []
  }, [manualAssignments, solution])

  // Synchronize with parent workload updates
  const updateWorkload = (newWorkload: Workload) => {
    setWorkload(newWorkload)
    onWorkloadUpdate?.(newWorkload)
    setManualAssignments([])
  }

  // Trigger GLPK WASM Solver
  const handleSolve = async () => {
    setSolving(true)
    setSolveMessage(null)
    try {
      const result = await solveMilp(workload, 0.35, 8)
      setSolution(result)
      setManualAssignments(result.assignments)
      setSolveMessage(
        `WASM solve complete: ${result.assignments.length}/${workload.tasks.length} tasks scheduled in ${(result.wasmSolveTimeMs ?? result.latencyMs).toFixed(1)}ms (${result.violationCount} violations)`
      )
    } catch (err) {
      setSolveMessage(`Solver error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSolving(false)
    }
  }

  // Reset to default scenario
  const handleReset = () => {
    const fresh = generateWorkload(50, 2026)
    updateWorkload(fresh)
    setSolution(null)
    setManualAssignments([])
    setSelectedTaskId(fresh.tasks[0]?.id ?? '')
    setSelectedWorkerId(fresh.workers[0]?.id ?? '')
    setSelectedStartSlot(fresh.tasks[0]?.releaseSlot ?? 0)
    setSolveMessage('Reset to default 50-task scenario')
  }

  // Worker CRUD Handlers
  const handleOpenAddWorker = () => {
    setEditingWorkerId(null)
    setWorkerName(`Operator ${String(workload.workers.length + 1).padStart(2, '0')}`)
    setWorkerSkills(['Dispatch', 'Quality'])
    setWorkerCapacity(9)
    setWorkerMaxTasks(5)
    setWorkerBreakStart(7)
    setWorkerBreakEnd(9)
    setWorkerModalOpen(true)
  }

  const handleOpenEditWorker = (worker: Worker) => {
    setEditingWorkerId(worker.id)
    setWorkerName(worker.name)
    setWorkerSkills([...worker.skills])
    setWorkerCapacity(worker.capacitySlots)
    setWorkerMaxTasks(worker.maxTasks)
    setWorkerBreakStart(worker.unavailable[0]?.start ?? 7)
    setWorkerBreakEnd(worker.unavailable[0]?.end ?? 9)
    setWorkerModalOpen(true)
  }

  const handleSaveWorker = () => {
    if (editingWorkerId) {
      const updatedWorkers = workload.workers.map(w =>
        w.id === editingWorkerId
          ? {
              ...w,
              name: workerName,
              skills: workerSkills,
              capacitySlots: workerCapacity,
              maxTasks: workerMaxTasks,
              unavailable: [{ start: workerBreakStart, end: workerBreakEnd }],
            }
          : w
      )
      updateWorkload({ ...workload, workers: updatedWorkers })
    } else {
      const newId = `W${String(workload.workers.length + 1).padStart(2, '0')}`
      const newWorker: Worker = {
        id: newId,
        name: workerName,
        skills: workerSkills.length ? workerSkills : ['Dispatch'],
        capacitySlots: workerCapacity,
        maxTasks: workerMaxTasks,
        unavailable: [{ start: workerBreakStart, end: workerBreakEnd }],
      }
      updateWorkload({ ...workload, workers: [...workload.workers, newWorker] })
    }
    setWorkerModalOpen(false)
  }

  const handleDeleteWorker = (workerId: string) => {
    if (workload.workers.length <= 1) {
      alert('A scenario requires at least 1 registered worker.')
      return
    }
    const updated = workload.workers.filter(w => w.id !== workerId)
    updateWorkload({ ...workload, workers: updated })
    if (selectedWorkerId === workerId) {
      setSelectedWorkerId(updated[0]?.id ?? '')
    }
  }

  // Task CRUD Handlers
  const handleOpenAddTask = () => {
    setEditingTaskId(null)
    setTaskLabel(`Custom task ${String(workload.tasks.length + 1).padStart(3, '0')}`)
    setTaskSkill('Clinical')
    setTaskDuration(2)
    setTaskRelease(0)
    setTaskDeadline(8)
    setTaskPriority(2)
    setTaskModalOpen(true)
  }

  const handleOpenEditTask = (task: Task) => {
    setEditingTaskId(task.id)
    setTaskLabel(task.label)
    setTaskSkill(task.skill)
    setTaskDuration(task.durationSlots)
    setTaskRelease(task.releaseSlot)
    setTaskDeadline(task.deadlineSlot)
    setTaskPriority(task.priority)
    setTaskModalOpen(true)
  }

  const handleSaveTask = () => {
    if (taskDeadline <= taskRelease) {
      alert('Deadline slot must be greater than release slot.')
      return
    }
    if (editingTaskId) {
      const updatedTasks = workload.tasks.map(t =>
        t.id === editingTaskId
          ? {
              ...t,
              label: taskLabel,
              skill: taskSkill,
              durationSlots: taskDuration,
              releaseSlot: taskRelease,
              deadlineSlot: taskDeadline,
              priority: taskPriority,
            }
          : t
      )
      updateWorkload({ ...workload, tasks: updatedTasks })
    } else {
      const newId = `T${String(workload.tasks.length + 1).padStart(4, '0')}`
      const newTask: Task = {
        id: newId,
        label: taskLabel,
        skill: taskSkill,
        durationSlots: taskDuration,
        releaseSlot: taskRelease,
        deadlineSlot: taskDeadline,
        priority: taskPriority,
      }
      updateWorkload({ ...workload, tasks: [...workload.tasks, newTask] })
    }
    setTaskModalOpen(false)
  }

  const handleDeleteTask = (taskId: string) => {
    if (workload.tasks.length <= 1) {
      alert('A scenario requires at least 1 task.')
      return
    }
    const updated = workload.tasks.filter(t => t.id !== taskId)
    updateWorkload({ ...workload, tasks: updated })
    if (selectedTaskId === taskId) {
      setSelectedTaskId(updated[0]?.id ?? '')
    }
  }

  // Manual Override Tester Constraints Engine
  const targetTask = useMemo(() => workload.tasks.find(t => t.id === selectedTaskId), [workload, selectedTaskId])
  const targetWorker = useMemo(() => workload.workers.find(w => w.id === selectedWorkerId), [workload, selectedWorkerId])

  // Real-time constraints evaluation for the proposed manual override move
  const constraintCheck = useMemo(() => {
    if (!targetTask || !targetWorker) {
      return { isValid: false, errors: ['Please select a task and worker.'] }
    }

    const errors: string[] = []
    const start = selectedStartSlot
    const end = start + targetTask.durationSlots

    // 1. Skill Constraint
    if (!targetWorker.skills.includes(targetTask.skill)) {
      errors.push(
        `Skill Mismatch: Worker "${targetWorker.name}" lacks required skill "${targetTask.skill}". Certified skills: [${targetWorker.skills.join(', ')}]`
      )
    }

    // 2. Task Release / Deadline Bounds
    if (start < targetTask.releaseSlot) {
      errors.push(`Release Slot Violation: Task cannot start at slot ${start} before release slot ${targetTask.releaseSlot} (${clock(targetTask.releaseSlot)})`)
    }
    if (end > targetTask.deadlineSlot) {
      errors.push(`Deadline Violation: Task completion at slot ${end} (${clock(end)}) exceeds hard deadline slot ${targetTask.deadlineSlot} (${clock(targetTask.deadlineSlot)})`)
    }
    if (end > workload.horizonSlots) {
      errors.push(`Horizon Violation: Task completes at slot ${end}, which exceeds the total operating horizon (${workload.horizonSlots} slots)`)
    }

    // 3. Worker Unavailable Break Windows
    for (const window of targetWorker.unavailable) {
      if (start < window.end && end > window.start) {
        errors.push(`Break Conflict: Worker "${targetWorker.name}" is on mandatory break during slots [${window.start}, ${window.end}) (${clock(window.start)} – ${clock(window.end)})`)
      }
    }

    // Existing assignments for this worker (excluding the task being moved)
    const otherWorkerAssignments = effectiveAssignments.filter(
      a => a.workerId === targetWorker.id && a.taskId !== targetTask.id
    )

    // 4. Max Task Count
    if (otherWorkerAssignments.length >= targetWorker.maxTasks) {
      errors.push(`Task Limit Exceeded: Worker "${targetWorker.name}" already has ${otherWorkerAssignments.length} tasks (max allowed: ${targetWorker.maxTasks})`)
    }

    // 5. Shift Capacity Slots
    const currentSlots = otherWorkerAssignments.reduce((sum, a) => sum + (a.endSlot - a.startSlot), 0)
    if (currentSlots + targetTask.durationSlots > targetWorker.capacitySlots) {
      errors.push(
        `Capacity Overload: Assigning this ${targetTask.durationSlots}-slot task would require ${currentSlots + targetTask.durationSlots} slots, exceeding capacity limit of ${targetWorker.capacitySlots} slots (${targetWorker.capacitySlots * 30} mins)`
      )
    }

    // 6. Rest Period Buffer
    for (const existing of otherWorkerAssignments) {
      const restViolated = !(end + workload.restSlots <= existing.startSlot || start >= existing.endSlot + workload.restSlots)
      if (restViolated) {
        errors.push(
          `Rest Buffer Violation: Less than ${workload.restSlots * 30} mins rest between proposed move and Task ${existing.taskId} (Slots ${existing.startSlot}–${existing.endSlot})`
        )
      }
    }

    // Overall placement verification
    const isValid = canPlace(targetTask, targetWorker, start, otherWorkerAssignments, workload) && errors.length === 0

    return { isValid, errors }
  }, [targetTask, targetWorker, selectedStartSlot, effectiveAssignments, workload])

  // Apply Manual Override Reassignment
  const handleApplyOverride = () => {
    if (!targetTask || !targetWorker) return

    const newAssignment: Assignment = {
      taskId: targetTask.id,
      workerId: targetWorker.id,
      startSlot: selectedStartSlot,
      endSlot: selectedStartSlot + targetTask.durationSlots,
    }

    // Replace or add assignment
    const filtered = effectiveAssignments.filter(a => a.taskId !== targetTask.id)
    const updated = [...filtered, newAssignment]
    setManualAssignments(updated)

    setOverrideSuccessMessage(
      `Manual assignment applied: Task ${targetTask.id} assigned to ${targetWorker.name} at ${clock(selectedStartSlot)}.`
    )
    setTimeout(() => setOverrideSuccessMessage(null), 4000)
  }

  // Filtered views
  const filteredTasks = useMemo(() => {
    return workload.tasks.filter(task => {
      const matchesSearch = task.id.toLowerCase().includes(taskSearch.toLowerCase()) || task.label.toLowerCase().includes(taskSearch.toLowerCase())
      const matchesSkill = taskSkillFilter === 'all' || task.skill === taskSkillFilter
      return matchesSearch && matchesSkill
    })
  }, [workload.tasks, taskSearch, taskSkillFilter])

  const filteredWorkers = useMemo(() => {
    return workload.workers.filter(worker => {
      return (
        worker.name.toLowerCase().includes(workerSearch.toLowerCase()) ||
        worker.id.toLowerCase().includes(workerSearch.toLowerCase()) ||
        worker.skills.some(s => s.toLowerCase().includes(workerSearch.toLowerCase()))
      )
    })
  }, [workload.workers, workerSearch])

  // Synthetic result for Gantt board preview
  const currentAllocationResult: AllocationResult = useMemo(() => {
    const allocationMatrix: Record<string, string | null> = Object.fromEntries(workload.tasks.map(t => [t.id, null]))
    for (const a of effectiveAssignments) {
      allocationMatrix[a.taskId] = a.workerId
    }
    return {
      algorithm: 'Custom Schedule / Manual Override',
      status: 'feasible',
      assignments: effectiveAssignments,
      allocationMatrix,
      unassignedTaskIds: workload.tasks.filter(t => allocationMatrix[t.id] === null).map(t => t.id),
      latencyMs: solution?.latencyMs ?? 0,
      totalTimeMs: solution?.totalTimeMs ?? 0,
      wasmExecutionMs: solution?.wasmExecutionMs ?? 0,
      wasmSolveTimeMs: solution?.wasmSolveTimeMs ?? 0,
      violationCount: solution?.violationCount ?? 0,
      optimalityGapPercent: solution?.optimalityGapPercent ?? null,
      objectiveValue: solution?.objectiveValue ?? null,
    }
  }, [effectiveAssignments, workload, solution])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e5ebe4] pb-6">
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#3d835c]">
            Resource & Task Constraint Management
          </div>
          <h1 className="text-[32px] font-bold leading-tight tracking-[-.06em] text-[#1c362a] md:text-[38px]">
            Scheduling Studio
          </h1>
          <p className="mt-1.5 max-w-[720px] text-sm text-[#6c7f73]">
            Configure worker capacities and skills, adjust incoming task queues and priority windows, and test manual dispatch
            reassignments with real-time constraint auditing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RefreshCw size={15} /> Reset Default
          </Button>
          <Button variant="default" onClick={handleSolve} disabled={solving}>
            <Sparkles size={15} className={solving ? 'animate-spin' : ''} />
            {solving ? 'Solving MILP…' : 'Re-solve with GLPK WASM'}
          </Button>
        </div>
      </div>

      {/* Global Notification Banner */}
      {solveMessage && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-[#c4e2cd] bg-[#edf8ef] px-4 py-3 text-xs font-semibold text-[#1e5437]"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#2b885b]" />
            {solveMessage}
          </span>
          <button type="button" onClick={() => setSolveMessage(null)} className="text-sm font-bold text-[#4d7e63]">
            ×
          </button>
        </div>
      )}

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6d8275]">Personnel Pool</span>
            <span className="rounded-md bg-[#edf6ef] p-1.5 text-[#2c7756]">
              <Users size={16} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1b362a]">{workload.workers.length} Workers</div>
          <div className="mt-1 text-[11px] text-[#708477]">
            {workload.workers.reduce((s, w) => s + w.skills.length, 0)} total skill certifications
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6d8275]">Shift Capacity</span>
            <span className="rounded-md bg-[#edf6ef] p-1.5 text-[#2c7756]">
              <Clock size={16} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1b362a]">
            {workload.workers.reduce((s, w) => s + w.capacitySlots, 0) * 0.5} Hours
          </div>
          <div className="mt-1 text-[11px] text-[#708477]">
            {workload.workers.reduce((s, w) => s + w.capacitySlots, 0)} slots across 30-min grid
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6d8275]">Task Demand</span>
            <span className="rounded-md bg-[#edf6ef] p-1.5 text-[#2c7756]">
              <Layers size={16} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1b362a]">{workload.tasks.length} Requests</div>
          <div className="mt-1 text-[11px] text-[#708477]">
            {effectiveAssignments.length} placed · {workload.tasks.length - effectiveAssignments.length} unassigned
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6d8275]">Skill Domains</span>
            <span className="rounded-md bg-[#edf6ef] p-1.5 text-[#2c7756]">
              <Wrench size={16} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#1b362a]">{defaultSkills.length} Domains</div>
          <div className="mt-1 text-[11px] text-[#708477]">Dispatch, Clinical, Electrical, etc.</div>
        </Card>
      </div>

      {/* Navigation Tabs for Scheduling Subsections */}
      <div className="flex border-b border-[#dde5de]">
        <button
          type="button"
          onClick={() => setActiveTab('override')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
            activeTab === 'override'
              ? 'border-[#2d7c5b] text-[#1e523b]'
              : 'border-transparent text-[#667e70] hover:text-[#254737]'
          }`}
        >
          <ArrowRightLeft size={16} />
          Manual Override Tester
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('workers')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
            activeTab === 'workers'
              ? 'border-[#2d7c5b] text-[#1e523b]'
              : 'border-transparent text-[#667e70] hover:text-[#254737]'
          }`}
        >
          <UserCheck size={16} />
          Worker Registry ({workload.workers.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
            activeTab === 'tasks'
              ? 'border-[#2d7c5b] text-[#1e523b]'
              : 'border-transparent text-[#667e70] hover:text-[#254737]'
          }`}
        >
          <CalendarDays size={16} />
          Task Queue Manager ({workload.tasks.length})
        </button>
      </div>

      {/* SECTION 1: MANUAL OVERRIDE TESTER */}
      {activeTab === 'override' && (
        <div className="space-y-6">
          <Card className="p-5 md:p-6">
            <div className="border-b border-[#edf2ec] pb-4">
              <div className="section-eyebrow">SANDBOX & DISPATCH REASSIGNMENT</div>
              <h2 className="section-title">Manual Reassignment & Constraint Audit</h2>
              <p className="section-desc">
                Test manual moves before deploying. Real-time constraint engines verify skills, shift capacities, rest periods,
                and deadline windows instantly.
              </p>
            </div>

            {/* Selection Controls */}
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Select Task */}
              <div>
                <label className="text-xs font-bold text-[#234434]">1. Select Task to Reassign</label>
                <select
                  value={selectedTaskId}
                  onChange={e => {
                    setSelectedTaskId(e.target.value)
                    const task = workload.tasks.find(t => t.id === e.target.value)
                    if (task) setSelectedStartSlot(task.releaseSlot)
                  }}
                  className="mt-1.5 w-full rounded-lg border border-[#cfdacd] bg-white px-3 py-2 text-sm font-semibold text-[#1c382a] focus:border-[#2d7c5b] focus:outline-none"
                >
                  {workload.tasks.map(task => (
                    <option key={task.id} value={task.id}>
                      {task.id} — {task.label} ({task.skill})
                    </option>
                  ))}
                </select>
                {targetTask && (
                  <div className="mt-2 text-[11px] text-[#6d8475]">
                    Required: <strong>{targetTask.skill}</strong> · Duration: {targetTask.durationSlots * 30}m · Window: [
                    {clock(targetTask.releaseSlot)} – {clock(targetTask.deadlineSlot)}]
                  </div>
                )}
              </div>

              {/* Select Target Worker */}
              <div>
                <label className="text-xs font-bold text-[#234434]">2. Select Target Worker</label>
                <select
                  value={selectedWorkerId}
                  onChange={e => setSelectedWorkerId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#cfdacd] bg-white px-3 py-2 text-sm font-semibold text-[#1c382a] focus:border-[#2d7c5b] focus:outline-none"
                >
                  {workload.workers.map(worker => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name} ({worker.id}) · Skills: {worker.skills.join(', ')}
                    </option>
                  ))}
                </select>
                {targetWorker && (
                  <div className="mt-2 text-[11px] text-[#6d8475]">
                    Capacity: {targetWorker.capacitySlots * 30}m · Max tasks: {targetWorker.maxTasks} · Break: [
                    {clock(targetWorker.unavailable[0]?.start ?? 0)} – {clock(targetWorker.unavailable[0]?.end ?? 0)}]
                  </div>
                )}
              </div>

              {/* Select Start Slot */}
              <div>
                <label className="text-xs font-bold text-[#234434]">3. Select Execution Start Time</label>
                <select
                  value={selectedStartSlot}
                  onChange={e => setSelectedStartSlot(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-[#cfdacd] bg-white px-3 py-2 text-sm font-semibold text-[#1c382a] focus:border-[#2d7c5b] focus:outline-none"
                >
                  {Array.from({ length: 18 }, (_, slot) => (
                    <option key={slot} value={slot}>
                      Slot {slot} ({clock(slot)}) → Finish {clock(slot + (targetTask?.durationSlots ?? 1))}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-[11px] text-[#6d8475]">
                  Task completes in {targetTask?.durationSlots ?? 1} slots ({((targetTask?.durationSlots ?? 1) * 30)} mins)
                </div>
              </div>
            </div>

            {/* REAL-TIME CONSTRAINT AUDIT ALERTS */}
            <div className="mt-6">
              {constraintCheck.isValid ? (
                <div className="rounded-xl border border-[#b8dfc4] bg-[#eff9f1] p-4 text-[#1a5a3a]">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 size={18} className="text-[#258a59]" />
                    Hard Constraints Satisfied (Safe Move)
                  </div>
                  <p className="mt-1.5 text-xs text-[#2e6b4d]">
                    Worker &ldquo;{targetWorker?.name}&rdquo; possesses certified skill &ldquo;{targetTask?.skill}&rdquo;. Shift capacity, rest
                    interval buffers, and time window bounds are 100% compliant.
                  </p>
                  <div className="mt-3">
                    <Button onClick={handleApplyOverride} variant="default" className="text-xs">
                      Confirm Manual Assignment Override
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
                  <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
                    <AlertCircle size={18} className="text-rose-600" />
                    Constraint Violation Alert ({constraintCheck.errors.length} Hard Rule Breaches)
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {constraintCheck.errors.map((err, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-rose-800">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-500" />
                        <span>{err}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      onClick={handleApplyOverride}
                      variant="outline"
                      className="border-rose-300 bg-white text-rose-800 hover:bg-rose-100 text-xs"
                    >
                      Force Override (Demonstrate Audit Violation)
                    </Button>
                    <span className="text-[11px] text-rose-700">
                      Warning: Forcing invalid manual moves increases violation count and compromises optimality.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {overrideSuccessMessage && (
              <div className="mt-4 rounded-lg bg-[#ebf7ee] p-3 text-xs font-semibold text-[#25734a]">
                ✓ {overrideSuccessMessage}
              </div>
            )}
          </Card>

          {/* Allocation Board Preview for Scheduling */}
          <Card className="p-5 md:p-6">
            <div className="flex items-center justify-between border-b border-[#edf2ec] pb-4">
              <div>
                <div className="section-eyebrow">SCHEDULE IMPACT PREVIEW</div>
                <h3 className="section-title">Active Schedule with Applied Overrides</h3>
              </div>
              <span className="rounded-full bg-[#f1f6f1] px-3 py-1 text-xs font-bold text-[#35634b]">
                {effectiveAssignments.length} Assignments Placed
              </span>
            </div>
            <div className="mt-5">
              <AllocationBoard workload={workload} result={currentAllocationResult} />
            </div>
          </Card>
        </div>
      )}

      {/* SECTION 2: WORKER REGISTRY CRUD */}
      {activeTab === 'workers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[280px]">
              <Search size={15} className="absolute left-3 top-3 text-[#7a8d80]" />
              <input
                type="text"
                placeholder="Search workers by name, ID, or skill…"
                value={workerSearch}
                onChange={e => setWorkerSearch(e.target.value)}
                className="w-full rounded-lg border border-[#d2ddd1] bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#223f30] focus:border-[#2d7c5b] focus:outline-none"
              />
            </div>
            <Button onClick={handleOpenAddWorker}>
              <UserPlus size={15} /> Add Operator
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredWorkers.map(worker => {
              const assignedTasks = effectiveAssignments.filter(a => a.workerId === worker.id)
              const totalSlots = assignedTasks.reduce((s, a) => s + (a.endSlot - a.startSlot), 0)

              return (
                <Card key={worker.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-[#1b382a]">{worker.name}</span>
                        <span className="rounded bg-[#ebf3ec] px-1.5 py-0.5 text-[10px] font-bold text-[#2d684c]">
                          {worker.id}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {worker.skills.map(skill => (
                          <span
                            key={skill}
                            className="rounded-full border border-[#cbe0d0] bg-[#f4f9f4] px-2 py-0.5 text-[10px] font-semibold text-[#285d44]"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleOpenEditWorker(worker)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-8 px-2 text-xs text-rose-600 hover:bg-rose-50"
                        onClick={() => handleDeleteWorker(worker.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#edf2ec] pt-3 text-xs text-[#5f7568]">
                    <div>
                      <span className="text-[#87998d]">Shift Capacity:</span>
                      <div className="font-semibold text-[#1e3c2e]">
                        {totalSlots} / {worker.capacitySlots} slots ({(worker.capacitySlots * 0.5).toFixed(1)}h)
                      </div>
                    </div>
                    <div>
                      <span className="text-[#87998d]">Max Tasks:</span>
                      <div className="font-semibold text-[#1e3c2e]">
                        {assignedTasks.length} / {worker.maxTasks} tasks
                      </div>
                    </div>
                    <div className="col-span-2 mt-1">
                      <span className="text-[#87998d]">Break Window:</span>
                      <div className="font-semibold text-[#1e3c2e]">
                        Slot {worker.unavailable[0]?.start ?? 0}–{worker.unavailable[0]?.end ?? 0} (
                        {clock(worker.unavailable[0]?.start ?? 0)} – {clock(worker.unavailable[0]?.end ?? 0)})
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: TASK QUEUE MANAGER CRUD */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[260px]">
                <Search size={15} className="absolute left-3 top-3 text-[#7a8d80]" />
                <input
                  type="text"
                  placeholder="Search tasks by ID or description…"
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  className="w-full rounded-lg border border-[#d2ddd1] bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#223f30] focus:border-[#2d7c5b] focus:outline-none"
                />
              </div>

              <select
                value={taskSkillFilter}
                onChange={e => setTaskSkillFilter(e.target.value)}
                className="rounded-lg border border-[#d2ddd1] bg-white px-3 py-2 text-xs font-semibold text-[#223f30]"
              >
                <option value="all">All Skills</option>
                {defaultSkills.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleOpenAddTask}>
              <Plus size={15} /> Add Task Request
            </Button>
          </div>

          {/* Task Table */}
          <div className="overflow-x-auto rounded-xl border border-[#e2e9e1] bg-white shadow-sm">
            <table className="w-full text-left text-xs text-[#345242]">
              <thead className="border-b border-[#e6eee5] bg-[#f9faf8] text-[10px] font-bold uppercase tracking-wider text-[#6c8273]">
                <tr>
                  <th className="px-4 py-3">Task ID</th>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Required Skill</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Window (Release ➔ Deadline)</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Assigned Operator</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef3ee]">
                {filteredTasks.slice(0, 50).map(task => {
                  const assigned = effectiveAssignments.find(a => a.taskId === task.id)
                  const workerObj = assigned ? workload.workers.find(w => w.id === assigned.workerId) : null
                  const priority = priorityLabel(task.priority)

                  return (
                    <tr key={task.id} className="hover:bg-[#f6f9f6] transition-colors">
                      <td className="px-4 py-3 font-bold text-[#1f4231]">{task.id}</td>
                      <td className="px-4 py-3 font-medium text-[#253d30]">{task.label}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-[#eaf4ec] px-2 py-0.5 text-[10px] font-bold text-[#236043]">
                          {task.skill}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${priority.bg}`}>
                          {priority.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#587262]">
                        {clock(task.releaseSlot)} ➔ {clock(task.deadlineSlot)} (Slots {task.releaseSlot}–{task.deadlineSlot})
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#1e3c2e]">
                        {task.durationSlots * 30}m ({task.durationSlots}s)
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {workerObj ? (
                          <span className="text-[#20704d]">
                            {workerObj.name} ({clock(assigned!.startSlot)})
                          </span>
                        ) : (
                          <span className="text-[#96a69b]">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleOpenEditTask(task)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WORKER MODAL */}
      {workerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6 bg-white shadow-xl">
            <h3 className="text-lg font-bold text-[#183628]">
              {editingWorkerId ? 'Edit Operator Profile' : 'Add New Operator'}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-[#355242]">Operator Name</label>
                <input
                  type="text"
                  value={workerName}
                  onChange={e => setWorkerName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#355242]">Certified Skill Specializations</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {defaultSkills.map(s => {
                    const active = workerSkills.includes(s)
                    return (
                      <button
                        type="button"
                        key={s}
                        onClick={() => {
                          setWorkerSkills(prev => (active ? prev.filter(x => x !== s) : [...prev, s]))
                        }}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          active ? 'bg-[#2d7c5b] text-white' : 'bg-[#eef3ee] text-[#556c5e]'
                        }`}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#355242]">Capacity (Slots)</label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={workerCapacity}
                    onChange={e => setWorkerCapacity(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                  />
                  <span className="text-[10px] text-[#788e80]">{(workerCapacity * 0.5).toFixed(1)} hours</span>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#355242]">Max Task Count</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={workerMaxTasks}
                    onChange={e => setWorkerMaxTasks(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#355242]">Break Start Slot</label>
                  <input
                    type="number"
                    min={0}
                    max={18}
                    value={workerBreakStart}
                    onChange={e => setWorkerBreakStart(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                  />
                  <span className="text-[10px] text-[#788e80]">{clock(workerBreakStart)}</span>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#355242]">Break End Slot</label>
                  <input
                    type="number"
                    min={workerBreakStart + 1}
                    max={20}
                    value={workerBreakEnd}
                    onChange={e => setWorkerBreakEnd(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                  />
                  <span className="text-[10px] text-[#788e80]">{clock(workerBreakEnd)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setWorkerModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveWorker}>Save Operator</Button>
            </div>
          </Card>
        </div>
      )}

      {/* TASK MODAL */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6 bg-white shadow-xl">
            <h3 className="text-lg font-bold text-[#183628]">{editingTaskId ? 'Edit Task Request' : 'Add Task Request'}</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-[#355242]">Task Description / Label</label>
                <input
                  type="text"
                  value={taskLabel}
                  onChange={e => setTaskLabel(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#355242]">Required Skill</label>
                  <select
                    value={taskSkill}
                    onChange={e => setTaskSkill(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                  >
                    {defaultSkills.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#355242]">Priority Level</label>
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                  >
                    <option value={1}>Normal (1)</option>
                    <option value={2}>High (2)</option>
                    <option value={3}>Critical (3)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#355242]">Duration (Slots)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={taskDuration}
                  onChange={e => setTaskDuration(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                />
                <span className="text-[10px] text-[#788e80]">{taskDuration * 30} minutes</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#355242]">Release Slot (Earliest)</label>
                  <input
                    type="number"
                    min={0}
                    max={17}
                    value={taskRelease}
                    onChange={e => setTaskRelease(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                  />
                  <span className="text-[10px] text-[#788e80]">{clock(taskRelease)}</span>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#355242]">Deadline Slot (Latest)</label>
                  <input
                    type="number"
                    min={taskRelease + taskDuration}
                    max={20}
                    value={taskDeadline}
                    onChange={e => setTaskDeadline(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#cdd8cc] px-3 py-2 text-xs text-[#203c2e]"
                  />
                  <span className="text-[10px] text-[#788e80]">{clock(taskDeadline)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTaskModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTask}>Save Task</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

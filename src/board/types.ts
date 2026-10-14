export type AestheticArchetype =
  | "High-Craft Technical Dark"
  | "Warm Editorial Studio Light"
  | "Swiss Grid / Data-Dense Workbench"
  | "Atmospheric Minimalist Product"
  | string

export interface ProjectCharter {
  name: string
  vision: string
  aestheticArchetype: AestheticArchetype
  updatedAt: string
}

export interface Contract {
  id: string
  title: string
  files: string[]
  invariants: string[]
  lockedAt: string
  lockedBy?: string
}

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "ready_for_qa"
  | "qa_rejected"
  | "verified"
  | "superseded"

export interface QAReceipt {
  verdict: "PASS" | "REJECT"
  summary: string
  defects: string[]
  testCommand?: string
  timestamp: string
}

export interface Task {
  id: string
  title: string
  owner: "staff-backend" | "staff-ui" | "architect" | string
  ownedPaths: string[]
  worktree?: string
  tournamentId?: string
  status: TaskStatus
  qaReceipts: QAReceipt[]
  createdAt: string
  updatedAt: string
}

export interface TournamentCandidate {
  label: string
  taskId: string
  worktree: string
}

export interface Tournament {
  id: string
  title: string
  role: "staff-backend" | "staff-ui" | string
  ownedPaths: string[]
  candidates: TournamentCandidate[]
  status: "active" | "resolved"
  winningTaskId?: string
  resolutionSummary?: string
  createdAt: string
  updatedAt: string
}

export interface ReleaseReadinessReport {
  ready: boolean
  hasCharter: boolean
  lockedContractCount: number
  verifiedTasks: string[]
  unverifiedTasks: string[]
  rejectedTasks: string[]
  supersededTasks: string[]
  activeTournaments: string[]
  blockers: string[]
  checkedAt: string
}

export interface OrgBoard {
  version: string
  project: ProjectCharter | null
  contracts: Contract[]
  tasks: Task[]
  tournaments?: Tournament[]
}

export interface InitProjectInput {
  name: string
  vision: string
  aestheticArchetype: AestheticArchetype
}

export interface LockContractInput {
  id: string
  title: string
  files: string[]
  invariants: string[]
  lockedBy?: string
}

export interface CreateTaskInput {
  id: string
  title: string
  owner: string
  ownedPaths: string[]
  worktree?: string
  tournamentId?: string
}

export interface SubmitQAReceiptInput {
  taskId: string
  verdict: "PASS" | "REJECT"
  summary: string
  defects: string[]
  testCommand?: string
}

export interface PlanTournamentInput {
  id: string
  title: string
  role: "staff-backend" | "staff-ui" | string
  ownedPaths: string[]
  candidates?: number
}

export interface ResolveTournamentInput {
  tournamentId: string
  winningTaskId: string
  summary: string
}

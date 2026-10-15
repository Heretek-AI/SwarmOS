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
  /** `tools.verify.run` run backing a PASS verdict. */
  verifyRunId?: string
  /** Working-tree fingerprint the verify run was taken at. */
  fingerprint?: string | null
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
  /** Git branch backing the worktree (`swarmos/<taskId>`). */
  branch?: string
  /** Whether a real git worktree exists at `worktree` (false outside git repositories). */
  provisioned?: boolean
  provisionNote?: string
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
  /** Commit the candidates branched from. */
  baseRef?: string
  /** Merge commit created when the winner was merged into the main tree. */
  mergeCommit?: string
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
  latestFullVerifyRunId?: string
  checkedAt: string
}

export interface BoardPolicy {
  /** PASS receipts must cite a passing `tools.verify.run` taken on the current working tree. */
  requireVerifiedReceipts: boolean
}

export interface OrgBoard {
  version: string
  policy?: BoardPolicy
  project: ProjectCharter | null
  contracts: Contract[]
  tasks: Task[]
  tournaments?: Tournament[]
}

export interface InitProjectInput {
  name: string
  vision: string
  aestheticArchetype: AestheticArchetype
  /** Defaults to true for new projects. */
  requireVerifiedReceipts?: boolean
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
  verifyRunId?: string
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
  /** Merge the winner's branch and remove all candidate worktrees (default true when worktrees exist). */
  merge?: boolean
}

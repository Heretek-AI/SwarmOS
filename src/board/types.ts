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

export type TaskStatus = "pending" | "in_progress" | "ready_for_qa" | "qa_rejected" | "verified"

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
  status: TaskStatus
  qaReceipts: QAReceipt[]
  createdAt: string
  updatedAt: string
}

export interface OrgBoard {
  version: string
  project: ProjectCharter | null
  contracts: Contract[]
  tasks: Task[]
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
}

export interface SubmitQAReceiptInput {
  taskId: string
  verdict: "PASS" | "REJECT"
  summary: string
  defects: string[]
  testCommand?: string
}

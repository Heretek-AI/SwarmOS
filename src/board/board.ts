import * as fs from "node:fs/promises"
import * as path from "node:path"
import type {
  Contract,
  CreateTaskInput,
  InitProjectInput,
  LockContractInput,
  OrgBoard,
  ProjectCharter,
  SubmitQAReceiptInput,
  Task,
  TaskStatus,
} from "./types.js"

export const BOARD_VERSION = "4.0.0"

const boardLocks = new Map<string, Promise<unknown>>()

export function getBoardPath(rootDir: string): string {
  return path.join(rootDir, ".opencode", "org", "board.json")
}

export function createEmptyBoard(): OrgBoard {
  return {
    version: BOARD_VERSION,
    project: null,
    contracts: [],
    tasks: [],
  }
}

export async function loadBoard(rootDir: string): Promise<OrgBoard> {
  const file = getBoardPath(rootDir)
  try {
    const raw = await fs.readFile(file, "utf8")
    const parsed = JSON.parse(raw) as Partial<OrgBoard>
    return {
      version: parsed.version ?? BOARD_VERSION,
      project: parsed.project ?? null,
      contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    }
  } catch {
    return createEmptyBoard()
  }
}

export async function saveBoard(rootDir: string, board: OrgBoard): Promise<void> {
  const dir = path.join(rootDir, ".opencode", "org")
  await fs.mkdir(dir, { recursive: true })

  const targetFile = path.join(dir, "board.json")
  const tempFile = path.join(dir, `board.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`)

  const payload = JSON.stringify(board, null, 2)
  await fs.writeFile(tempFile, payload, "utf8")
  await fs.rename(tempFile, targetFile)
}

/**
 * Serializes concurrent read-modify-write board mutations per workspace root
 * so parallel subagents (e.g., staff-backend and staff-ui) never clobber updates.
 */
export async function withBoardLock<T>(
  rootDir: string,
  mutator: (board: OrgBoard) => Promise<T> | T,
): Promise<T> {
  const key = path.resolve(rootDir)
  const previous = boardLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const current = previous.then(() => gate)
  boardLocks.set(key, current)

  await previous
  try {
    const board = await loadBoard(rootDir)
    const result = await mutator(board)
    await saveBoard(rootDir, board)
    return result
  } finally {
    release()
    if (boardLocks.get(key) === current) {
      boardLocks.delete(key)
    }
  }
}

export async function initProject(rootDir: string, input: InitProjectInput): Promise<ProjectCharter> {
  return withBoardLock(rootDir, (board) => {
    const charter: ProjectCharter = {
      name: input.name,
      vision: input.vision,
      aestheticArchetype: input.aestheticArchetype,
      updatedAt: new Date().toISOString(),
    }
    board.project = charter
    return charter
  })
}

export async function lockContract(rootDir: string, input: LockContractInput): Promise<Contract> {
  return withBoardLock(rootDir, (board) => {
    const contract: Contract = {
      id: input.id,
      title: input.title,
      files: input.files,
      invariants: input.invariants,
      lockedAt: new Date().toISOString(),
      ...(input.lockedBy ? { lockedBy: input.lockedBy } : {}),
    }
    const idx = board.contracts.findIndex((c) => c.id === input.id)
    if (idx >= 0) {
      board.contracts[idx] = contract
    } else {
      board.contracts.push(contract)
    }
    return contract
  })
}

export async function createTask(rootDir: string, input: CreateTaskInput): Promise<Task> {
  return withBoardLock(rootDir, (board) => {
    const existing = board.tasks.find((t) => t.id === input.id)
    const now = new Date().toISOString()

    const task: Task = {
      id: input.id,
      title: input.title,
      owner: input.owner,
      ownedPaths: input.ownedPaths,
      worktree: input.worktree,
      status: existing?.status ?? "pending",
      qaReceipts: existing?.qaReceipts ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    if (existing) {
      Object.assign(existing, task)
    } else {
      board.tasks.push(task)
    }
    return task
  })
}

export async function updateTaskStatus(rootDir: string, taskId: string, status: TaskStatus): Promise<Task> {
  return withBoardLock(rootDir, (board) => {
    const task = board.tasks.find((t) => t.id === taskId)
    if (!task) {
      throw new Error(`SwarmOS Task not found: ${taskId}`)
    }
    task.status = status
    task.updatedAt = new Date().toISOString()
    return task
  })
}

export async function submitQAReceipt(rootDir: string, input: SubmitQAReceiptInput): Promise<Task> {
  return withBoardLock(rootDir, (board) => {
    const task = board.tasks.find((t) => t.id === input.taskId)
    if (!task) {
      throw new Error(`SwarmOS Task not found: ${input.taskId}`)
    }

    const receipt = {
      verdict: input.verdict,
      summary: input.summary,
      defects: input.defects,
      testCommand: input.testCommand,
      timestamp: new Date().toISOString(),
    }

    task.qaReceipts.push(receipt)
    task.status = input.verdict === "PASS" ? "verified" : "qa_rejected"
    task.updatedAt = receipt.timestamp
    return task
  })
}

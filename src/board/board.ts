import * as fs from "node:fs/promises"
import * as path from "node:path"
import { computeTreeFingerprint, loadLatestVerifyRun, loadVerifyRun } from "../omni/verify.js"
import type {
  Contract,
  CreateTaskInput,
  InitProjectInput,
  LockContractInput,
  OrgBoard,
  PlanTournamentInput,
  ProjectCharter,
  ReleaseReadinessReport,
  ResolveTournamentInput,
  SubmitQAReceiptInput,
  Task,
  TaskStatus,
  Tournament,
  TournamentCandidate,
} from "./types.js"

export const BOARD_VERSION = "4.1.0"

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
    tournaments: [],
  }
}

export async function loadBoard(rootDir: string): Promise<OrgBoard> {
  const file = getBoardPath(rootDir)
  try {
    const raw = await fs.readFile(file, "utf8")
    const parsed = JSON.parse(raw) as Partial<OrgBoard>
    return {
      version: parsed.version ?? BOARD_VERSION,
      ...(parsed.policy ? { policy: parsed.policy } : {}),
      project: parsed.project ?? null,
      contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      tournaments: Array.isArray(parsed.tournaments) ? parsed.tournaments : [],
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
    if (!board.policy || input.requireVerifiedReceipts !== undefined) {
      board.policy = { requireVerifiedReceipts: input.requireVerifiedReceipts ?? true }
    }
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
      ...(input.tournamentId ? { tournamentId: input.tournamentId } : {}),
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

/** Directory a task's code lives in: its worktree when it has one, else the workspace root. */
export function taskWorkdir(rootDir: string, task: Pick<Task, "worktree">): string {
  return task.worktree ? path.resolve(rootDir, task.worktree) : path.resolve(rootDir)
}

/**
 * Checks that a PASS verdict is backed by a passing `tools.verify.run` taken on the task's
 * current working tree. Returns the fingerprint to store on the receipt.
 */
async function assertVerifiedPass(rootDir: string, task: Task, verifyRunId: string | undefined): Promise<string | null> {
  if (!verifyRunId) {
    throw new Error(
      `SwarmOS Verify Gate: PASS for task [${task.id}] must cite a passing \`tools.verify.run\` (pass \`verifyRunId\`). Run verification instead of asserting it.`,
    )
  }
  const workdir = taskWorkdir(rootDir, task)
  const run = (await loadVerifyRun(workdir, verifyRunId)) ?? (await loadVerifyRun(rootDir, verifyRunId))
  if (!run) throw new Error(`SwarmOS Verify Gate: verify run [${verifyRunId}] not found for task [${task.id}].`)
  if (!run.passed) {
    throw new Error(`SwarmOS Verify Gate: verify run [${verifyRunId}] FAILED; a failing run cannot back a PASS receipt.`)
  }
  if (path.resolve(run.rootDir) !== workdir) {
    throw new Error(`SwarmOS Verify Gate: verify run [${verifyRunId}] ran in ${run.rootDir}, but task [${task.id}] lives in ${workdir}.`)
  }
  const current = await computeTreeFingerprint(workdir)
  if (current !== null && run.fingerprint !== current) {
    throw new Error(
      `SwarmOS Verify Gate: code changed since verify run [${verifyRunId}]. Re-run \`tools.verify.run\` on the current tree.`,
    )
  }
  return current
}

export async function submitQAReceipt(rootDir: string, input: SubmitQAReceiptInput): Promise<Task> {
  const snapshot = await loadBoard(rootDir)
  const target = snapshot.tasks.find((t) => t.id === input.taskId)
  let fingerprint: string | null | undefined
  if (target && input.verdict === "PASS" && snapshot.policy?.requireVerifiedReceipts) {
    fingerprint = await assertVerifiedPass(rootDir, target, input.verifyRunId)
  }

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
      ...(input.verifyRunId ? { verifyRunId: input.verifyRunId } : {}),
      ...(fingerprint !== undefined ? { fingerprint } : {}),
      timestamp: new Date().toISOString(),
    }

    task.qaReceipts.push(receipt)
    task.status = input.verdict === "PASS" ? "verified" : "qa_rejected"
    task.updatedAt = receipt.timestamp
    return task
  })
}

/**
 * Provisions a Best-of-N Worktree Tournament with isolated candidate tasks and worktree paths.
 */
export async function planTournament(rootDir: string, input: PlanTournamentInput): Promise<Tournament> {
  return withBoardLock(rootDir, (board) => {
    if (!Array.isArray(board.tournaments)) {
      board.tournaments = []
    }
    const count = Math.min(Math.max(input.candidates ?? 2, 2), 4)
    const now = new Date().toISOString()
    const candidates: TournamentCandidate[] = []

    for (let i = 0; i < count; i++) {
      const suffix = String.fromCharCode(97 + i) // 'a', 'b', 'c', 'd'
      const label = `candidate-${suffix}`
      const taskId = `${input.id}-${label}`
      const worktree = `.worktrees/${taskId}`

      candidates.push({ label, taskId, worktree })

      const existingTask = board.tasks.find((t) => t.id === taskId)
      const task: Task = {
        id: taskId,
        title: `[Tournament ${input.id} · ${label.toUpperCase()}] ${input.title}`,
        owner: input.role,
        ownedPaths: input.ownedPaths,
        worktree,
        tournamentId: input.id,
        status: existingTask?.status ?? "pending",
        qaReceipts: existingTask?.qaReceipts ?? [],
        createdAt: existingTask?.createdAt ?? now,
        updatedAt: now,
      }
      if (existingTask) {
        Object.assign(existingTask, task)
      } else {
        board.tasks.push(task)
      }
    }

    const tournament: Tournament = {
      id: input.id,
      title: input.title,
      role: input.role,
      ownedPaths: input.ownedPaths,
      candidates,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }

    const existingIdx = board.tournaments.findIndex((t) => t.id === input.id)
    if (existingIdx >= 0) {
      board.tournaments[existingIdx] = tournament
    } else {
      board.tournaments.push(tournament)
    }

    return tournament
  })
}

/**
 * Resolves an active Best-of-N Tournament by crowning a QA-verified winning candidate task
 * and marking all competing candidate tasks as `superseded`.
 */
export async function resolveTournament(rootDir: string, input: ResolveTournamentInput): Promise<Tournament> {
  return withBoardLock(rootDir, (board) => {
    if (!Array.isArray(board.tournaments)) {
      board.tournaments = []
    }
    const tournament = board.tournaments.find((t) => t.id === input.tournamentId)
    if (!tournament) {
      throw new Error(`SwarmOS Tournament not found: ${input.tournamentId}`)
    }

    const isCandidate = tournament.candidates.some((c) => c.taskId === input.winningTaskId)
    if (!isCandidate) {
      throw new Error(
        `SwarmOS Tournament Guard: Task "${input.winningTaskId}" is not a registered candidate of tournament "${input.tournamentId}".`,
      )
    }

    const winningTask = board.tasks.find((t) => t.id === input.winningTaskId)
    const latestReceipt = winningTask?.qaReceipts[winningTask.qaReceipts.length - 1]
    if (!winningTask || winningTask.status !== "verified" || latestReceipt?.verdict !== "PASS") {
      throw new Error(
        `SwarmOS Tournament Guard: Winning candidate task [${input.winningTaskId}] must have a verified PASS QA receipt before resolving the tournament.`,
      )
    }

    const now = new Date().toISOString()
    for (const candidate of tournament.candidates) {
      if (candidate.taskId === input.winningTaskId) continue
      const loser = board.tasks.find((t) => t.id === candidate.taskId)
      if (loser) {
        loser.status = "superseded"
        loser.updatedAt = now
      }
    }

    tournament.status = "resolved"
    tournament.winningTaskId = input.winningTaskId
    tournament.resolutionSummary = input.summary
    tournament.updatedAt = now

    return tournament
  })
}

/**
 * Evaluates whether the entire project board satisfies the SwarmOS 5-Gate Release Protocol.
 */
export async function verifyReleaseReady(rootDir: string): Promise<ReleaseReadinessReport> {
  const board = await loadBoard(rootDir)
  const hasCharter = board.project !== null
  const lockedContractCount = board.contracts.length

  const verifiedTasks: string[] = []
  const unverifiedTasks: string[] = []
  const rejectedTasks: string[] = []
  const supersededTasks: string[] = []
  const blockers: string[] = []

  if (!hasCharter) {
    blockers.push("Missing project charter: call `tools.org.init_project` before shipping.")
  }

  if (lockedContractCount === 0) {
    blockers.push("Zero locked contracts: `architect` must lock at least one contract via `tools.org.lock_contract`.")
  }

  const activeTasks = board.tasks.filter((t) => t.status !== "superseded")
  if (activeTasks.length === 0) {
    blockers.push("Zero engineering tasks registered on the board.")
  }

  for (const task of board.tasks) {
    if (task.status === "superseded") {
      supersededTasks.push(task.id)
      continue
    }

    const latestReceipt = task.qaReceipts[task.qaReceipts.length - 1]
    if (
      task.status === "verified" &&
      latestReceipt?.verdict === "PASS" &&
      Array.isArray(latestReceipt.defects) &&
      latestReceipt.defects.length === 0
    ) {
      verifiedTasks.push(task.id)
    } else if (task.status === "qa_rejected" || latestReceipt?.verdict === "REJECT") {
      rejectedTasks.push(task.id)
      blockers.push(`Task [${task.id}] (${task.owner}) was REJECTED by qa-adversary: ${latestReceipt?.summary ?? "defects unresolved"}.`)
    } else {
      unverifiedTasks.push(task.id)
      blockers.push(`Task [${task.id}] (${task.owner}) is "${task.status}" and lacks a signed PASS receipt from qa-adversary.`)
    }
  }

  let latestFullVerifyRunId: string | undefined
  let verifyBlocked = false
  if (board.policy?.requireVerifiedReceipts) {
    for (const id of verifiedTasks) {
      const task = board.tasks.find((t) => t.id === id)!
      if (!task.qaReceipts[task.qaReceipts.length - 1]?.verifyRunId) {
        verifyBlocked = true
        blockers.push(`Task [${id}] PASS receipt does not cite a \`tools.verify.run\` result.`)
      }
    }
    const full = await loadLatestVerifyRun(rootDir, "full")
    const fingerprint = await computeTreeFingerprint(rootDir)
    if (!full) {
      verifyBlocked = true
      blockers.push("No full verification run: call `tools.verify.run({ scope: \"full\" })` before release.")
    } else if (!full.passed) {
      verifyBlocked = true
      blockers.push(`Latest full verification run [${full.id}] FAILED.`)
    } else if (fingerprint !== null && full.fingerprint !== fingerprint) {
      verifyBlocked = true
      blockers.push(`Code changed since full verification run [${full.id}]: re-run \`tools.verify.run({ scope: "full" })\`.`)
    } else {
      latestFullVerifyRunId = full.id
    }
  }

  const tournaments = Array.isArray(board.tournaments) ? board.tournaments : []
  const activeTournaments = tournaments.filter((t) => t.status === "active").map((t) => t.id)
  for (const tid of activeTournaments) {
    blockers.push(`Tournament [${tid}] is still active: call \`tools.org.resolve_tournament\` after QA verification.`)
  }

  const ready =
    hasCharter &&
    lockedContractCount > 0 &&
    activeTasks.length > 0 &&
    unverifiedTasks.length === 0 &&
    rejectedTasks.length === 0 &&
    activeTournaments.length === 0 &&
    !verifyBlocked

  return {
    ready,
    hasCharter,
    lockedContractCount,
    verifiedTasks,
    unverifiedTasks,
    rejectedTasks,
    supersededTasks,
    activeTournaments,
    blockers,
    ...(latestFullVerifyRunId ? { latestFullVerifyRunId } : {}),
    checkedAt: new Date().toISOString(),
  }
}

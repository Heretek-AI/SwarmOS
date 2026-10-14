import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import {
  createEmptyBoard,
  createTask,
  initProject,
  loadBoard,
  lockContract,
  saveBoard,
  submitQAReceipt,
  updateTaskStatus,
} from "../src/board/board.js"

describe("SwarmOS Board Persistence", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "swarmos-board-test-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("loads an empty board when no board.json exists", async () => {
    const board = await loadBoard(tmpDir)
    expect(board.version).toBe("4.0.0")
    expect(board.project).toBeNull()
    expect(board.contracts).toEqual([])
    expect(board.tasks).toEqual([])
  })

  it("initializes project charter and persists to disk", async () => {
    const charter = await initProject(tmpDir, {
      name: "SwarmOS Test App",
      vision: "Build a real-time reactive canvas",
      aestheticArchetype: "High-Craft Technical Dark",
    })

    expect(charter.name).toBe("SwarmOS Test App")
    expect(charter.aestheticArchetype).toBe("High-Craft Technical Dark")
    expect(charter.updatedAt).toBeDefined()

    const loaded = await loadBoard(tmpDir)
    expect(loaded.project?.name).toBe("SwarmOS Test App")
    expect(loaded.project?.vision).toBe("Build a real-time reactive canvas")
  })

  it("locks architectural contracts idempotently", async () => {
    const contract = await lockContract(tmpDir, {
      id: "contract-auth",
      title: "Authentication & Session Types",
      files: ["src/auth/types.ts", "src/auth/session.ts"],
      invariants: ["Tokens must be cryptographically signed", "Zero any types"],
      lockedBy: "architect",
    })

    expect(contract.id).toBe("contract-auth")
    expect(contract.lockedBy).toBe("architect")

    let loaded = await loadBoard(tmpDir)
    expect(loaded.contracts.length).toBe(1)
    expect(loaded.contracts[0].title).toBe("Authentication & Session Types")

    // Update existing contract
    await lockContract(tmpDir, {
      id: "contract-auth",
      title: "Authentication & Session Types v2",
      files: ["src/auth/types.ts"],
      invariants: ["Tokens must be signed"],
    })

    loaded = await loadBoard(tmpDir)
    expect(loaded.contracts.length).toBe(1)
    expect(loaded.contracts[0].title).toBe("Authentication & Session Types v2")
  })

  it("manages task lifecycle and enforces QA receipt gatekeeping", async () => {
    const task = await createTask(tmpDir, {
      id: "task-backend-api",
      title: "Implement /api/auth endpoints",
      owner: "staff-backend",
      ownedPaths: ["src/server/auth.ts", "src/server/routes.ts"],
      worktree: ".worktrees/task-backend-api",
    })

    expect(task.status).toBe("pending")
    expect(task.owner).toBe("staff-backend")
    expect(task.ownedPaths).toContain("src/server/auth.ts")

    // Update status to in_progress
    await updateTaskStatus(tmpDir, "task-backend-api", "in_progress")
    let loaded = await loadBoard(tmpDir)
    expect(loaded.tasks[0].status).toBe("in_progress")

    // QA REJECT
    await submitQAReceipt(tmpDir, {
      taskId: "task-backend-api",
      verdict: "REJECT",
      summary: "Found unhandled null token exception",
      defects: ["TypeError: token is undefined at auth.ts:42"],
      testCommand: "bun test src/server/auth.test.ts",
    })

    loaded = await loadBoard(tmpDir)
    expect(loaded.tasks[0].status).toBe("qa_rejected")
    expect(loaded.tasks[0].qaReceipts.length).toBe(1)
    expect(loaded.tasks[0].qaReceipts[0].verdict).toBe("REJECT")

    // Engineer fixes and QA PASS
    await submitQAReceipt(tmpDir, {
      taskId: "task-backend-api",
      verdict: "PASS",
      summary: "All 18 unit tests pass with zero compiler warnings",
      defects: [],
      testCommand: "bun test src/server/auth.test.ts",
    })

    loaded = await loadBoard(tmpDir)
    expect(loaded.tasks[0].status).toBe("verified")
    expect(loaded.tasks[0].qaReceipts.length).toBe(2)
    expect(loaded.tasks[0].qaReceipts[1].verdict).toBe("PASS")
  })

  it("throws error when submitting receipt for non-existent task", async () => {
    expect(
      submitQAReceipt(tmpDir, {
        taskId: "does-not-exist",
        verdict: "PASS",
        summary: "test",
        defects: [],
      }),
    ).rejects.toThrow("SwarmOS Task not found: does-not-exist")
  })

  it("serializes concurrent parallel subagent updates without lost writes via withBoardLock", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, idx) =>
        createTask(tmpDir, {
          id: `task-parallel-${idx}`,
          title: `Parallel Task ${idx}`,
          owner: idx % 2 === 0 ? "staff-backend" : "staff-ui",
          ownedPaths: [`src/mod-${idx}.ts`],
        }),
      ),
    )
    const loaded = await loadBoard(tmpDir)
    expect(loaded.tasks.length).toBe(10)
  })
})

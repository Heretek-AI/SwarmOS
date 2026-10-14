import {
  createTask,
  initProject,
  loadBoard,
  lockContract,
  submitQAReceipt,
  updateTaskStatus,
} from "../board/board.js"
import type {
  CreateTaskInput,
  InitProjectInput,
  LockContractInput,
  SubmitQAReceiptInput,
  TaskStatus,
} from "../board/types.js"

export function registerOrgTools(editor: any, rootDir: string): void {
  editor.namespace({
    name: "org",
    description: "SwarmOS organizational blackboard for locking contracts, assigning tasks, and recording QA receipts.",
  })

  editor.add({
    name: "get_board",
    description: "Read the current SwarmOS project charter, locked contracts, tasks, and QA receipts.",
    options: { namespace: "org", codemode: true, pinned: true },
    input: { type: "object", properties: {} },
    output: { type: "object" },
    execute: async () => {
      const board = await loadBoard(rootDir)
      return { output: board, content: JSON.stringify(board, null, 2) }
    },
  })

  editor.add({
    name: "init_project",
    description: "Initialize or update the SwarmOS project charter and aesthetic archetype.",
    options: { namespace: "org", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the software project" },
        vision: { type: "string", description: "High-level product vision and requirements" },
        aestheticArchetype: {
          type: "string",
          description:
            "Design archetype: 'High-Craft Technical Dark', 'Warm Editorial Studio Light', 'Swiss Grid / Data-Dense Workbench', or 'Atmospheric Minimalist Product'",
        },
      },
      required: ["name", "vision", "aestheticArchetype"],
    },
    output: { type: "object" },
    execute: async (input: InitProjectInput) => {
      const charter = await initProject(rootDir, input)
      return { output: charter, content: `Initialized SwarmOS project: ${charter.name}` }
    },
  })

  editor.add({
    name: "lock_contract",
    description: "Lock an architectural schema, interface, or design-token contract before feature implementation.",
    options: { namespace: "org", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "Contract ID (e.g. 'contract-auth-schema', 'contract-tokens')" },
        title: { type: "string", description: "Descriptive title of the contract" },
        files: { type: "array", items: { type: "string" }, description: "Contract source file paths" },
        invariants: { type: "array", items: { type: "string" }, description: "Architectural invariants enforced" },
        lockedBy: { type: "string", description: "Agent ID locking the contract" },
      },
      required: ["id", "title", "files", "invariants"],
    },
    output: { type: "object" },
    execute: async (input: LockContractInput) => {
      const contract = await lockContract(rootDir, input)
      return { output: contract, content: `Locked contract [${contract.id}]: ${contract.title}` }
    },
  })

  editor.add({
    name: "create_task",
    description: "Create or update an engineering task with explicit file ownership boundaries to prevent collisions.",
    options: { namespace: "org", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task identifier (e.g. 'task-auth-endpoints')" },
        title: { type: "string", description: "Task summary and acceptance criteria" },
        owner: { type: "string", description: "Responsible role: 'staff-backend' | 'staff-ui' | 'architect'" },
        ownedPaths: { type: "array", items: { type: "string" }, description: "Disjoint file paths owned by this task" },
        worktree: { type: "string", description: "Optional isolated Git worktree path" },
      },
      required: ["id", "title", "owner", "ownedPaths"],
    },
    output: { type: "object" },
    execute: async (input: CreateTaskInput) => {
      const task = await createTask(rootDir, input)
      return { output: task, content: `Registered task [${task.id}] assigned to ${task.owner}` }
    },
  })

  editor.add({
    name: "update_task",
    description: "Transition an engineering task status ('pending' | 'in_progress' | 'ready_for_qa' | 'qa_rejected' | 'verified').",
    options: { namespace: "org", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to update" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "ready_for_qa", "qa_rejected", "verified"],
          description: "New status for the task",
        },
      },
      required: ["taskId", "status"],
    },
    output: { type: "object" },
    execute: async (input: { taskId: string; status: TaskStatus }) => {
      const task = await updateTaskStatus(rootDir, input.taskId, input.status)
      return { output: task, content: `Updated task [${task.id}] status to ${task.status}` }
    },
  })

  editor.add({
    name: "submit_qa_receipt",
    description: "Record an adversarial QA PASS or REJECT receipt for a task. Only tasks with a PASS receipt can be released.",
    options: { namespace: "org", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID being verified" },
        verdict: { type: "string", enum: ["PASS", "REJECT"], description: "PASS or REJECT verdict" },
        summary: { type: "string", description: "Executive summary of verification findings" },
        defects: { type: "array", items: { type: "string" }, description: "List of defects or regressions found (must be empty for PASS)" },
        testCommand: { type: "string", description: "Exact command executed to verify" },
      },
      required: ["taskId", "verdict", "summary", "defects"],
    },
    output: { type: "object" },
    execute: async (input: SubmitQAReceiptInput) => {
      const task = await submitQAReceipt(rootDir, input)
      return { output: task, content: `Recorded QA Receipt [${input.verdict}] for task [${input.taskId}]` }
    },
  })
}

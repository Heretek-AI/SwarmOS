import { registerSwarmOSAgents, SWARMOS_ROLES } from "./agents/roles.js"
import {
  PROMPT_ARCHITECT,
  PROMPT_DIRECTOR,
  PROMPT_MANAGER,
  PROMPT_QA_ADVERSARY,
  PROMPT_RELEASE_OPS,
  PROMPT_STAFF_BACKEND,
  PROMPT_STAFF_UI,
} from "./agents/prompts.js"
import {
  createTask,
  getBoardPath,
  initProject,
  loadBoard,
  lockContract,
  saveBoard,
  submitQAReceipt,
  updateTaskStatus,
} from "./board/board.js"
import type {
  Contract,
  CreateTaskInput,
  InitProjectInput,
  LockContractInput,
  OrgBoard,
  ProjectCharter,
  QAReceipt,
  SubmitQAReceiptInput,
  Task,
  TaskStatus,
} from "./board/types.js"
import { registerFSTools } from "./codemode/fs-outline.js"
import { registerOrgTools } from "./codemode/org-tools.js"
import { registerUITools } from "./codemode/ui-tools.js"
import { registerShipCommand } from "./commands/ship.js"
import { registerSwarmCommand } from "./commands/swarm.js"
import { registerDiagnosticHook, runQuickDiagnostics } from "./diagnostics/runner.js"
import { DOM_GEOMETRY_AUDIT_SCRIPT, type DOMAuditResult, type DOMDefect } from "./geometry/audit-script.js"
import { STANDARD_VIEWPORTS, type ViewportDefinition } from "./geometry/viewports.js"
import { registerMuseOverlay } from "./muse/overlay.js"
import { registerUICraftSkill, UI_CRAFT_SKILL_ID, UI_CRAFT_SKILL_NAME } from "./skills/ui-craft/skill.js"

export {
  // Agent roles and prompts
  SWARMOS_ROLES,
  PROMPT_DIRECTOR,
  PROMPT_ARCHITECT,
  PROMPT_MANAGER,
  PROMPT_STAFF_BACKEND,
  PROMPT_STAFF_UI,
  PROMPT_QA_ADVERSARY,
  PROMPT_RELEASE_OPS,

  // Board operations
  loadBoard,
  saveBoard,
  initProject,
  lockContract,
  createTask,
  updateTaskStatus,
  submitQAReceipt,
  getBoardPath,

  // Geometry auditor
  DOM_GEOMETRY_AUDIT_SCRIPT,
  STANDARD_VIEWPORTS,

  // Diagnostics
  runQuickDiagnostics,

  // Skills & Commands
  UI_CRAFT_SKILL_ID,
  UI_CRAFT_SKILL_NAME,
}

export type {
  OrgBoard,
  ProjectCharter,
  Contract,
  Task,
  TaskStatus,
  QAReceipt,
  InitProjectInput,
  LockContractInput,
  CreateTaskInput,
  SubmitQAReceiptInput,
  DOMDefect,
  DOMAuditResult,
  ViewportDefinition,
}

/**
 * OpenCode SwarmOS Plugin Entrypoint.
 *
 * Turns OpenCode V2 into an autonomous multi-agent software engineering company
 * and visual UI engine with hardware-enforced separation of powers.
 */
export default async function SwarmOSPlugin(ctx: any): Promise<void> {
  const rootDir = ctx.location?.directory ?? process.cwd()

  // 1. Register 7 Specialized Engineering Roles with strict permission matrices
  if (ctx.agent?.transform) {
    await ctx.agent.transform((editor: any) => {
      registerSwarmOSAgents(editor)
    })
  }

  // 2. Register Code Mode namespaces: tools.org.*, tools.ui.*, tools.fs.*
  if (ctx.tool?.transform) {
    await ctx.tool.transform((editor: any) => {
      registerOrgTools(editor, rootDir)
      registerUITools(editor)
      registerFSTools(editor, rootDir)
    })
  }

  // 3. Register live post-mutation compiler & linter diagnostic feedback loop
  registerDiagnosticHook(ctx, rootDir)

  // 4. Register Anti-Slop UI Craft & Spatial Architecture Skill
  await registerUICraftSkill(ctx, rootDir)

  // 5. Register Muse 1.3 / High-Context Model Overlay & Compaction Isolation
  registerMuseOverlay(ctx)

  // 6. Register Slash Commands: /ship and /swarm
  registerShipCommand(ctx)
  registerSwarmCommand(ctx, rootDir)
}

export const plugin = SwarmOSPlugin

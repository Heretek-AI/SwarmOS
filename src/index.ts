import { registerSwarmOSAgents, SWARMOS_ROLES } from "./agents/roles.js"
import {
  evaluateBoardGuard,
  evaluatePermissionGuard,
  matchesPathPattern,
  normalizeResourcePath,
  registerPermissionGuard,
  type GuardDecision,
  type PermissionEvaluationEvent,
} from "./agents/guard.js"
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
  BOARD_VERSION,
  createEmptyBoard,
  createTask,
  getBoardPath,
  initProject,
  loadBoard,
  lockContract,
  planTournament,
  resolveTournament,
  saveBoard,
  submitQAReceipt,
  updateTaskStatus,
  verifyReleaseReady,
  withBoardLock,
} from "./board/board.js"
import type {
  AestheticArchetype,
  Contract,
  CreateTaskInput,
  InitProjectInput,
  LockContractInput,
  OrgBoard,
  PlanTournamentInput,
  ProjectCharter,
  QAReceipt,
  ReleaseReadinessReport,
  ResolveTournamentInput,
  SubmitQAReceiptInput,
  Task,
  TaskStatus,
  Tournament,
  TournamentCandidate,
} from "./board/types.js"
import { extractOutline, registerFSTools } from "./codemode/fs-outline.js"
import { registerOrgTools } from "./codemode/org-tools.js"
import { registerUITools } from "./codemode/ui-tools.js"
import { registerShipCommand } from "./commands/ship.js"
import { registerSwarmCommand } from "./commands/swarm.js"
import { extractMutatedPaths, registerDiagnosticHook, runQuickDiagnostics } from "./diagnostics/runner.js"
import { DOM_GEOMETRY_AUDIT_SCRIPT, type DOMAuditResult, type DOMDefect } from "./geometry/audit-script.js"
import { STANDARD_VIEWPORTS, type ViewportDefinition } from "./geometry/viewports.js"
import { MUSE_SOTA_BASE_PROMPT, registerMuseOverlay } from "./muse/overlay.js"
import {
  EMBEDDED_UI_CRAFT_SKILL_MD,
  loadSkillContent,
  registerUICraftSkill,
  UI_CRAFT_SKILL_ID,
  UI_CRAFT_SKILL_NAME,
} from "./skills/ui-craft/skill.js"

export {
  // Agent roles, prompts & runtime guard
  SWARMOS_ROLES,
  PROMPT_DIRECTOR,
  PROMPT_ARCHITECT,
  PROMPT_MANAGER,
  PROMPT_STAFF_BACKEND,
  PROMPT_STAFF_UI,
  PROMPT_QA_ADVERSARY,
  PROMPT_RELEASE_OPS,
  normalizeResourcePath,
  matchesPathPattern,
  evaluateBoardGuard,
  evaluatePermissionGuard,
  registerPermissionGuard,

  // Board operations, tournaments & release readiness gate
  BOARD_VERSION,
  createEmptyBoard,
  loadBoard,
  saveBoard,
  withBoardLock,
  initProject,
  lockContract,
  createTask,
  updateTaskStatus,
  submitQAReceipt,
  planTournament,
  resolveTournament,
  verifyReleaseReady,
  getBoardPath,

  // Geometry auditor & Code Mode helpers
  DOM_GEOMETRY_AUDIT_SCRIPT,
  STANDARD_VIEWPORTS,
  extractOutline,

  // Diagnostics & Muse overlay
  runQuickDiagnostics,
  extractMutatedPaths,
  MUSE_SOTA_BASE_PROMPT,
  registerMuseOverlay,

  // Skills & Commands
  UI_CRAFT_SKILL_ID,
  UI_CRAFT_SKILL_NAME,
  EMBEDDED_UI_CRAFT_SKILL_MD,
  loadSkillContent,
}

export type {
  AestheticArchetype,
  OrgBoard,
  ProjectCharter,
  Contract,
  Task,
  TaskStatus,
  QAReceipt,
  Tournament,
  TournamentCandidate,
  ReleaseReadinessReport,
  InitProjectInput,
  LockContractInput,
  CreateTaskInput,
  SubmitQAReceiptInput,
  PlanTournamentInput,
  ResolveTournamentInput,
  GuardDecision,
  PermissionEvaluationEvent,
  DOMDefect,
  DOMAuditResult,
  ViewportDefinition,
}

export const SWARMOS_PLUGIN_ID = "heretek.swarmos"

/**
 * OpenCode SwarmOS Plugin Setup Function (v0.3.0).
 *
 * Turns OpenCode V2 into an autonomous multi-agent software engineering company
 * and visual UI engine with hardware-enforced separation of powers.
 */
export async function setup(ctx: any): Promise<void> {
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

  // 3. Register runtime Contract Lock, Disjoint OwnedPaths & Shell Mutation Guard
  await registerPermissionGuard(ctx, rootDir)

  // 4. Register live post-mutation compiler & linter diagnostic feedback loop
  await registerDiagnosticHook(ctx, rootDir)

  // 5. Register Anti-Slop UI Craft & Spatial Architecture Skill
  await registerUICraftSkill(ctx, rootDir)

  // 6. Register Muse 1.3 / High-Context Model Overlay & Compaction Isolation
  await registerMuseOverlay(ctx)

  // 7. Register Slash Commands: /ship and /swarm
  await registerShipCommand(ctx)
  await registerSwarmCommand(ctx, rootDir)
}

export interface SwarmOSPluginCallable {
  (ctx: any): Promise<void>
  readonly id: string
  readonly setup: (ctx: any) => Promise<void>
}

/**
 * Dual-compatible plugin export:
 * 1. Satisfies OpenCode V2's `PluginModule.load` Effect Schema (`{ id: string, setup: (ctx) => Promise<void> }`)
 * 2. Remains directly callable (`await SwarmOSPlugin(ctx)`) for existing unit tests and scripts.
 */
export const SwarmOSPlugin: SwarmOSPluginCallable = Object.assign(
  async function SwarmOSPlugin(ctx: any): Promise<void> {
    return setup(ctx)
  },
  {
    id: SWARMOS_PLUGIN_ID,
    setup,
  },
)

export default SwarmOSPlugin
export const plugin = SwarmOSPlugin

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
  PROMPT_OFFICE_ANALYST,
  PROMPT_QA_ADVERSARY,
  PROMPT_RELEASE_OPS,
  PROMPT_RESEARCHER,
  PROMPT_STAFF_BACKEND,
  PROMPT_STAFF_UI,
  PROMPT_STUDIO_GUI,
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
import { registerOmniCommands } from "./commands/omni.js"
import { registerShipCommand } from "./commands/ship.js"
import { registerSwarmCommand } from "./commands/swarm.js"
import { extractMutatedPaths, registerDiagnosticHook, runQuickDiagnostics } from "./diagnostics/runner.js"
import { DOM_GEOMETRY_AUDIT_SCRIPT, type DOMAuditResult, type DOMDefect } from "./geometry/audit-script.js"
import { STANDARD_VIEWPORTS, type ViewportDefinition } from "./geometry/viewports.js"
import { MUSE_SOTA_BASE_PROMPT, registerMuseOverlay } from "./muse/overlay.js"
import {
  getArtifactsDir,
  listArtifacts,
  readArtifact,
  registerArtifactContextHook,
  registerArtifactTools,
  writeArtifact,
  type ArtifactName,
} from "./omni/artifacts.js"
import {
  createCheckpoint,
  getCheckpointsDir,
  listCheckpoints,
  registerCheckpointTools,
  rollbackCheckpoint,
  type CheckpointFileEntry,
  type CheckpointManifest,
} from "./omni/checkpoints.js"
import {
  recordAndEvaluateCircuitBreaker,
  registerCircuitBreakerHook,
  resetCircuitBreaker,
  type ToolAttemptRecord,
} from "./omni/circuit-breaker.js"
import {
  captureDesktopWindow,
  registerGuiStudioTools,
  VISUAL_QUALITY_CHECKLIST,
} from "./omni/gui-studio.js"
import {
  computeLineHash,
  hashEditFile,
  hashReadFile,
  registerHashlineTools,
  type HashEditResult,
  type HashLineHunk,
  type HashReadResult,
} from "./omni/hashline.js"
import {
  getMemoryFilePath,
  loadLessons,
  recordLesson,
  registerMemoryContextHook,
  registerMemoryTools,
  type EpisodicLesson,
} from "./omni/memory.js"
import {
  extractOfficeOrDataFile,
  registerOfficeTools,
  renderDocumentPreviews,
  SUPPORTED_OFFICE_EXTENSIONS,
} from "./omni/office.js"
import {
  readDevServerLogs,
  registerPtyTapTools,
  type PtyLogReadInput,
} from "./omni/pty-tap.js"
import {
  analyzeBlastRadius,
  buildRepoMap,
  registerRepoMapTools,
  type BlastRadiusReport,
  type RepoMapNode,
  type RepoMapReport,
} from "./omni/repomap.js"
import {
  auditMarkdownCitations,
  getResearchLedgerPath,
  loadResearchSources,
  recordResearchSource,
  registerResearchTools,
  type CitationAuditReport,
  type ResearchSource,
} from "./omni/research.js"
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
  PROMPT_STUDIO_GUI,
  PROMPT_RESEARCHER,
  PROMPT_OFFICE_ANALYST,
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

  // Omni-Harness: Hashline (Oh-My-Pi precision editing)
  computeLineHash,
  hashReadFile,
  hashEditFile,
  registerHashlineTools,

  // Omni-Harness: Persistent Artifacts (Antigravity state sync)
  getArtifactsDir,
  writeArtifact,
  readArtifact,
  listArtifacts,
  registerArtifactTools,
  registerArtifactContextHook,

  // Omni-Harness: Universal Office & Document Suite (Claude Cowork equivalence)
  SUPPORTED_OFFICE_EXTENSIONS,
  extractOfficeOrDataFile,
  renderDocumentPreviews,
  registerOfficeTools,

  // Omni-Harness: Deep Research & Citation Verification
  getResearchLedgerPath,
  loadResearchSources,
  recordResearchSource,
  auditMarkdownCitations,
  registerResearchTools,

  // Omni-Harness: Web & Desktop GUI Studio
  VISUAL_QUALITY_CHECKLIST,
  captureDesktopWindow,
  registerGuiStudioTools,
  DOM_GEOMETRY_AUDIT_SCRIPT,
  STANDARD_VIEWPORTS,
  extractOutline,

  // v0.5.0: PageRank RepoMap & Reverse-Import Blast-Radius Analyzer
  buildRepoMap,
  analyzeBlastRadius,
  registerRepoMapTools,

  // v0.5.0: Doom-Loop Circuit Breaker
  resetCircuitBreaker,
  recordAndEvaluateCircuitBreaker,
  registerCircuitBreakerHook,

  // v0.5.0: Zero-Git-Noise Time-Travel Checkpoints
  getCheckpointsDir,
  createCheckpoint,
  rollbackCheckpoint,
  listCheckpoints,
  registerCheckpointTools,

  // v0.5.0: Cross-Session Episodic Memory
  getMemoryFilePath,
  loadLessons,
  recordLesson,
  registerMemoryTools,
  registerMemoryContextHook,

  // v0.5.0: Live Persistent Terminal & Dev-Server Log Tap
  readDevServerLogs,
  registerPtyTapTools,

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
  registerOmniCommands,
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
  HashLineHunk,
  HashReadResult,
  HashEditResult,
  ArtifactName,
  ResearchSource,
  CitationAuditReport,
  RepoMapNode,
  RepoMapReport,
  BlastRadiusReport,
  ToolAttemptRecord,
  CheckpointFileEntry,
  CheckpointManifest,
  EpisodicLesson,
  PtyLogReadInput,
}

export const SWARMOS_PLUGIN_ID = "heretek.swarmos"

/**
 * OpenCode SwarmOS Omni-Harness Plugin Setup Function (v0.5.0).
 */
export async function setup(ctx: any): Promise<void> {
  const rootDir = ctx.location?.directory ?? process.cwd()

  // 1. Register 10 Specialized Roles (7 Swarm Engineering + 3 Domain Product Adapters)
  if (ctx.agent?.transform) {
    await ctx.agent.transform((editor: any) => {
      registerSwarmOSAgents(editor)
    })
  }

  // 2. Register Code Mode namespaces & in-place tool upgrades (`read`, `websearch`, `webfetch`)
  if (ctx.tool?.transform) {
    await ctx.tool.transform((editor: any) => {
      registerOrgTools(editor, rootDir)
      registerUITools(editor)
      registerFSTools(editor, rootDir)
      registerHashlineTools(editor, rootDir)
      registerArtifactTools(editor, rootDir)
      registerOfficeTools(editor, rootDir)
      registerResearchTools(editor, rootDir)
      registerGuiStudioTools(editor, rootDir)
      registerRepoMapTools(editor, rootDir)
      registerCheckpointTools(editor, rootDir)
      registerMemoryTools(editor, rootDir)
      registerPtyTapTools(editor, ctx, rootDir)
    })
  }

  // 3. Register runtime Contract Lock, Disjoint OwnedPaths & Shell Mutation Guard
  await registerPermissionGuard(ctx, rootDir)

  // 4. Register live post-mutation compiler & linter diagnostic feedback loop + Doom-Loop Circuit Breaker
  await registerDiagnosticHook(ctx, rootDir)
  await registerCircuitBreakerHook(ctx)

  // 5. Register Anti-Slop UI Craft & Spatial Architecture Skill
  await registerUICraftSkill(ctx, rootDir)

  // 6. Register Muse 1.3 Overlay, Antigravity Artifact Sync & Episodic Memory Recall
  await registerMuseOverlay(ctx)
  await registerArtifactContextHook(ctx, rootDir)
  await registerMemoryContextHook(ctx, rootDir)

  // 7. Register Slash Commands: /ship, /swarm, /gui, /research, /office, /artifacts, /map
  await registerShipCommand(ctx)
  await registerSwarmCommand(ctx, rootDir)
  await registerOmniCommands(ctx, rootDir)
}

export interface SwarmOSPluginCallable {
  (ctx: any): Promise<void>
  readonly id: string
  readonly setup: (ctx: any) => Promise<void>
}

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

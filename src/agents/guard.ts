import * as path from "node:path"
import { loadBoard } from "../board/board.js"
import type { OrgBoard } from "../board/types.js"

export interface PermissionEvaluationEvent {
  sessionID?: string
  agent?: string
  action: string
  resources: string[]
  metadata?: unknown
  source?: string
  effect: "allow" | "ask" | "deny"
  message?: string
}

export interface GuardDecision {
  allowed: boolean
  reason?: string
}

/**
 * Normalizes a resource path to a forward-slash path relative to rootDir.
 */
export function normalizeResourcePath(rootDir: string, resource: string): string {
  const trimmed = resource.trim()
  const absRoot = path.resolve(rootDir)
  const resolved = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(absRoot, trimmed)
  const rel = path.relative(absRoot, resolved).split(path.sep).join("/")
  return rel.startsWith("./") ? rel.slice(2) : rel
}

/**
 * Matches a normalized relative file path against an ownership pattern:
 * - Exact file path ("src/server/auth.ts")
 * - Directory prefix ("src/server" or "src/server/")
 * - Glob wildcard ("src/ui/**", "*.test.*", "test/**")
 */
export function matchesPathPattern(relPath: string, pattern: string): boolean {
  const normPath = relPath.replace(/^\/+/, "")
  const normPattern = pattern.trim().replace(/^\.\//, "").replace(/^\/+/, "")
  if (!normPattern) return false

  if (normPath === normPattern) return true

  // Directory prefix match when pattern has no wildcard characters
  if (!normPattern.includes("*") && !normPattern.includes("?")) {
    const dirPrefix = normPattern.endsWith("/") ? normPattern : `${normPattern}/`
    if (normPath.startsWith(dirPrefix)) return true
    return false
  }

  // Convert glob pattern to RegExp without token collision
  let res = ""
  for (let i = 0; i < normPattern.length; i++) {
    const ch = normPattern[i]
    if (ch === "*") {
      if (normPattern[i + 1] === "*") {
        if (normPattern[i + 2] === "/") {
          res += "(?:.+/)?"
          i += 2
        } else {
          res += ".*"
          i++
        }
      } else {
        res += "[^/]*"
      }
    } else if (ch === "?") {
      res += "[^/]"
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      res += "\\" + ch
    } else {
      res += ch
    }
  }

  const regex = new RegExp(`^${res}$`)
  return regex.test(normPath)
}

const DESTRUCTIVE_GIT_RE =
  /\bgit\s+(?:reset\s+--hard|clean\s+-[a-zA-Z]*f|push\s+[^;|\n]*--force(?!-with-lease)|checkout\s+--\s+)/i

const LEADERSHIP_MUTATING_SHELL_RE =
  /(?:^|[;&|]\s*)(?:rm|mv|cp|chmod|chown|truncate|dd)\s+|\b(?:sed|perl)\s+-[a-zA-Z]*i\b|\bgit\s+(?:commit|merge|rebase|cherry-pick|am|apply|stash\s+pop)\b|(?:^|[^2>])>>?\s*(?!\/dev\/null\b)\S+/i

const QA_SOURCE_MUTATING_SHELL_RE =
  /\b(?:sed|perl)\s+-[a-zA-Z]*i\b|\bgit\s+(?:commit|merge|rebase|reset|checkout\s+--)\b|(?:^|[;&|]\s*)(?:rm|mv)\s+(?![^;&|\n]*(?:\.test\.|\.spec\.|\btest\/|\btests\/|\be2e\/|\/tmp\/))|(?:^|[^2>])>>?\s*(?!\/dev\/null\b)(?![^;&|\n]*(?:\.test\.|\.spec\.|\btest\/|\btests\/|\be2e\/|\/tmp\/))\S+/i

/**
 * Pure synchronous evaluator against an already-loaded OrgBoard.
 */
export function evaluateBoardGuard(
  rootDir: string,
  board: OrgBoard,
  event: Pick<PermissionEvaluationEvent, "agent" | "action" | "resources">,
): GuardDecision {
  const agent = (event.agent ?? "").toLowerCase()
  const action = (event.action ?? "").toLowerCase()
  const resources = Array.isArray(event.resources) ? event.resources : []

  // 1. File Mutation Guards (edit, write, patch all assert action="edit" or "write" or "patch")
  if (action === "edit" || action === "write" || action === "patch") {
    for (const rawResource of resources) {
      if (typeof rawResource !== "string" || rawResource === "*") continue
      const relPath = normalizeResourcePath(rootDir, rawResource)

      // 1A. Locked Architectural Contract Immutability Guard
      if (agent && agent !== "architect") {
        for (const contract of board.contracts) {
          const hitsContract = contract.files.some((cf) => matchesPathPattern(relPath, cf))
          if (hitsContract) {
            return {
              allowed: false,
              reason: `SwarmOS Contract Guard: File "${relPath}" is locked under architectural contract [${contract.id}] ("${contract.title}"). Only the "architect" role may modify locked contract files.`,
            }
          }
        }
      }

      // 1B. Disjoint Task Ownership (`ownedPaths`) Guard for Implementation Engineers
      if (agent === "staff-backend" || agent === "staff-ui") {
        const activeTasks = board.tasks.filter(
          (t) =>
            t.status === "pending" ||
            t.status === "in_progress" ||
            t.status === "ready_for_qa" ||
            t.status === "qa_rejected",
        )

        const ownedBySelf = activeTasks.some(
          (t) => t.owner === agent && t.ownedPaths.some((pattern) => matchesPathPattern(relPath, pattern)),
        )

        if (!ownedBySelf) {
          const conflictingTask = activeTasks.find(
            (t) => t.owner !== agent && t.ownedPaths.some((pattern) => matchesPathPattern(relPath, pattern)),
          )
          if (conflictingTask) {
            return {
              allowed: false,
              reason: `SwarmOS Ownership Guard: File "${relPath}" is claimed by active task [${conflictingTask.id}] assigned to "${conflictingTask.owner}". Role "${agent}" cannot modify files outside its disjoint ownedPaths boundary.`,
            }
          }
        }
      }
    }
  }

  // 2. Shell Command Guards
  if (action === "shell" || action === "bash") {
    for (const cmd of resources) {
      if (typeof cmd !== "string") continue

      if (DESTRUCTIVE_GIT_RE.test(cmd)) {
        return {
          allowed: false,
          reason: `SwarmOS Git Safety Guard: Destructive git command "${cmd.slice(0, 80)}" is blocked across all SwarmOS roles.`,
        }
      }

      if ((agent === "director" || agent === "manager") && LEADERSHIP_MUTATING_SHELL_RE.test(cmd)) {
        return {
          allowed: false,
          reason: `SwarmOS Separation-of-Powers Guard: Leadership role "${agent}" is read-only and cannot execute file-mutating or git-committing shell commands ("${cmd.slice(0, 80)}"). Delegate implementation to subagents.`,
        }
      }

      if (agent === "qa-adversary" && QA_SOURCE_MUTATING_SHELL_RE.test(cmd)) {
        return {
          allowed: false,
          reason: `SwarmOS Red-Team Guard: "qa-adversary" is forbidden from mutating production source files or git history via shell ("${cmd.slice(0, 80)}").`,
        }
      }
    }
  }

  return { allowed: true }
}

/**
 * Evaluates permission guard asynchronously by loading the workspace OrgBoard.
 */
export async function evaluatePermissionGuard(
  rootDir: string,
  event: PermissionEvaluationEvent,
): Promise<GuardDecision> {
  const board = await loadBoard(rootDir)
  return evaluateBoardGuard(rootDir, board, event)
}

/**
 * Registers the SwarmOS runtime permission guard on OpenCode V2's `permission.hook("evaluate", ...)`.
 * Setting `event.effect = "deny"` and `event.message` produces a clean, typed `Permission.BlockedError`
 * that OpenCode V2 tools surface directly to the model as a `ToolFailure`.
 */
export async function registerPermissionGuard(ctx: any, rootDir: string): Promise<void> {
  if (ctx.permission?.hook) {
    await ctx.permission.hook("evaluate", async (event: PermissionEvaluationEvent) => {
      if (event.effect === "deny") return
      const decision = await evaluatePermissionGuard(rootDir, event)
      if (!decision.allowed) {
        event.effect = "deny"
        event.message = decision.reason
      }
    })
  }
}

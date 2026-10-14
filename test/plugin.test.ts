import { describe, expect, it } from "bun:test"
import SwarmOSPlugin, { SWARMOS_ROLES } from "../src/index.js"
import { extractOutline } from "../src/codemode/fs-outline.js"
import * as path from "node:path"

describe("SwarmOS Plugin & Roles Setup", () => {
  it("defines all 7 specialized roles with correct modes", () => {
    const roles = Object.keys(SWARMOS_ROLES)
    expect(roles).toContain("director")
    expect(roles).toContain("architect")
    expect(roles).toContain("manager")
    expect(roles).toContain("staff-backend")
    expect(roles).toContain("staff-ui")
    expect(roles).toContain("qa-adversary")
    expect(roles).toContain("release-ops")

    expect(SWARMOS_ROLES.director.mode).toBe("primary")
    expect(SWARMOS_ROLES.architect.mode).toBe("subagent")
    expect(SWARMOS_ROLES.manager.mode).toBe("subagent")
    expect(SWARMOS_ROLES["staff-backend"].mode).toBe("subagent")
    expect(SWARMOS_ROLES["staff-ui"].mode).toBe("subagent")
    expect(SWARMOS_ROLES["qa-adversary"].mode).toBe("subagent")
    expect(SWARMOS_ROLES["release-ops"].mode).toBe("subagent")
  })

  it("enforces separation of powers via permission rules", () => {
    // Director must be denied edit and write
    const directorPerms = SWARMOS_ROLES.director.permissions
    const editRule = directorPerms.find((p) => p.action === "edit" && p.resource === "*")
    expect(editRule?.effect).toBe("deny")

    // Director subagents must be strictly restricted to leadership reports
    const subagentRules = directorPerms.filter((p) => p.action === "subagent")
    expect(subagentRules.find((p) => p.resource === "*" && p.effect === "deny")).toBeDefined()
    expect(subagentRules.find((p) => p.resource === "architect" && p.effect === "allow")).toBeDefined()
    expect(subagentRules.find((p) => p.resource === "manager" && p.effect === "allow")).toBeDefined()
    expect(subagentRules.find((p) => p.resource === "release-ops" && p.effect === "allow")).toBeDefined()
    expect(subagentRules.find((p) => p.resource === "explore" && p.effect === "allow")).toBeDefined()

    // Manager must be denied edit
    const managerPerms = SWARMOS_ROLES.manager.permissions
    expect(managerPerms.find((p) => p.action === "edit" && p.resource === "*")?.effect).toBe("deny")

    // QA Adversary must deny general edit on * and allow edit on test patterns
    const qaPerms = SWARMOS_ROLES["qa-adversary"].permissions
    expect(qaPerms.find((p) => p.action === "edit" && p.resource === "*")?.effect).toBe("deny")
    expect(qaPerms.find((p) => p.action === "edit" && p.resource === "*.test.*")?.effect).toBe("allow")
    expect(qaPerms.find((p) => p.action === "edit" && p.resource === "*.spec.*")?.effect).toBe("allow")
  })

  it("registers all domains on plugin initialization", async () => {
    const agentsRegistered: Record<string, any> = {}
    const toolsRegistered: Record<string, any> = {}
    const namespaces: string[] = []
    const commandsRegistered: Record<string, any> = {}

    const mockCtx = {
      location: { directory: process.cwd() },
      agent: {
        transform: async (fn: any) => {
          fn({
            update: (id: string, updater: any) => {
              const item = { id, permissions: [] }
              updater(item)
              agentsRegistered[id] = item
            },
          })
        },
      },
      tool: {
        transform: async (fn: any) => {
          fn({
            namespace: (ns: any) => namespaces.push(ns.name),
            add: (tool: any) => {
              toolsRegistered[tool.name] = tool
            },
          })
        },
        hook: () => {},
      },
      command: {
        transform: async (fn: any) => {
          fn({
            add: (cmd: any) => {
              commandsRegistered[cmd.name] = cmd
            },
          })
        },
      },
      skill: {
        transform: async () => {},
      },
      session: {
        hook: () => {},
      },
    }

    await SwarmOSPlugin(mockCtx)

    // Agents registered
    expect(Object.keys(agentsRegistered).length).toBe(7)
    expect(agentsRegistered.director.name).toBe("Director")

    // Namespaces registered
    expect(namespaces).toContain("org")
    expect(namespaces).toContain("ui")
    expect(namespaces).toContain("fs")

    // Tools registered
    expect(toolsRegistered.get_board).toBeDefined()
    expect(toolsRegistered.init_project).toBeDefined()
    expect(toolsRegistered.lock_contract).toBeDefined()
    expect(toolsRegistered.create_task).toBeDefined()
    expect(toolsRegistered.submit_qa_receipt).toBeDefined()
    expect(toolsRegistered.get_audit_script).toBeDefined()
    expect(toolsRegistered.get_viewports).toBeDefined()
    expect(toolsRegistered.outline).toBeDefined()

    // Commands registered
    expect(commandsRegistered.ship).toBeDefined()
    expect(commandsRegistered.swarm).toBeDefined()
  })

  it("extracts symbols accurately with fs-outline", async () => {
    const outline = await extractOutline(process.cwd(), "src/board/types.ts")
    expect(outline.path).toBe("src/board/types.ts")
    expect(outline.totalLines).toBeGreaterThan(20)
    expect(outline.symbols.length).toBeGreaterThan(0)
    expect(outline.symbols.some((s) => s.includes("ProjectCharter"))).toBe(true)
  })
})

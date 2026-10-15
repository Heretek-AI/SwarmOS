import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// Pillar 2: Claude Code Compatibility Bridge (src/compat/claude-code.ts)
// Absorbs Heretek-AI/claude-4-opencode directly into SwarmOS:
// Discovers .claude/commands star-md, .claude/agents star-md, and
// .claude/skills star/SKILL.md from the workspace root (and optionally
// ~/.claude/) and registers them into OpenCode V2 command, agent, and
// skill catalogs automatically.

export interface ClaudeCommandDef {
  name: string;
  description: string;
  template: string;
  path: string;
}

export interface ClaudeAgentDef {
  id: string;
  name: string;
  description: string;
  system: string;
  path: string;
}

export interface ClaudeSkillDef {
  id: string;
  name: string;
  description: string;
  content: string;
  path: string;
}

export interface ClaudeBridgeInventory {
  commands: ClaudeCommandDef[];
  agents: ClaudeAgentDef[];
  skills: ClaudeSkillDef[];
}

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(line.trim());
    if (kv)
      meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2].trim() };
}

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

export async function discoverClaudeCodeAssets(
  rootDir: string,
  includeUserHome: boolean = false,
): Promise<ClaudeBridgeInventory> {
  const roots = [
    path.join(rootDir, ".claude"),
    ...(includeUserHome ? [path.join(os.homedir(), ".claude")] : []),
  ];

  const commands: ClaudeCommandDef[] = [];
  const agents: ClaudeAgentDef[] = [];
  const skills: ClaudeSkillDef[] = [];
  const seenCmds = new Set<string>();
  const seenAgents = new Set<string>();
  const seenSkills = new Set<string>();

  for (const base of roots) {
    // 1. .claude/commands/*.md
    for (const file of await listMdFiles(path.join(base, "commands"))) {
      const name = path
        .basename(file, ".md")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-");
      if (seenCmds.has(name)) continue;
      seenCmds.add(name);
      const raw = await fs.readFile(file, "utf8");
      const { meta, body } = parseFrontmatter(raw);
      commands.push({
        name,
        description: meta.description ?? `Claude Code command /${name}`,
        template: body,
        path: file,
      });
    }

    // 2. .claude/agents/*.md
    for (const file of await listMdFiles(path.join(base, "agents"))) {
      const raw = await fs.readFile(file, "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const id = (meta.name ?? path.basename(file, ".md"))
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-");
      if (seenAgents.has(id)) continue;
      seenAgents.add(id);
      agents.push({
        id,
        name: meta.name ?? id,
        description: meta.description ?? `Claude Code subagent ${id}`,
        system: body,
        path: file,
      });
    }

    // 3. .claude/skills/*/SKILL.md
    try {
      const skillDirs = await fs.readdir(path.join(base, "skills"), {
        withFileTypes: true,
      });
      for (const d of skillDirs) {
        if (!d.isDirectory()) continue;
        const skillFile = path.join(base, "skills", d.name, "SKILL.md");
        try {
          const raw = await fs.readFile(skillFile, "utf8");
          const { meta } = parseFrontmatter(raw);
          const id = (meta.name ?? d.name)
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "-");
          if (seenSkills.has(id)) continue;
          seenSkills.add(id);
          skills.push({
            id,
            name: meta.name ?? d.name,
            description: meta.description ?? `Claude Code skill ${id}`,
            content: raw,
            path: skillFile,
          });
        } catch {
          // ignore missing SKILL.md
        }
      }
    } catch {
      // no skills dir
    }
  }

  return { commands, agents, skills };
}

export async function registerClaudeCodeBridge(
  ctx: any,
  rootDir: string,
): Promise<ClaudeBridgeInventory> {
  const inv = await discoverClaudeCodeAssets(rootDir, false);

  if (inv.agents.length > 0 && ctx.agent?.transform) {
    await ctx.agent.transform((editor: any) => {
      for (const a of inv.agents) {
        editor.update(a.id, (item: any) => {
          item.name = a.name;
          item.description = a.description;
          item.mode = "subagent";
          item.system = a.system;
        });
      }
    });
  }

  if (inv.skills.length > 0 && ctx.skill?.transform) {
    await ctx.skill.transform((editor: any) => {
      for (const s of inv.skills) {
        editor.add({
          id: s.id,
          name: s.name,
          description: s.description,
          autoinvoke: false,
          path: s.path,
          content: s.content,
        });
      }
    });
  }

  if (inv.commands.length > 0 && ctx.command?.transform) {
    await ctx.command.transform((editor: any) => {
      for (const cmd of inv.commands) {
        editor.add({
          name: cmd.name,
          description: cmd.description,
          execute: async (input: any) => {
            const args = String(
              input?.prompt?.text ?? input?.prompt ?? "",
            ).trim();
            const rendered = cmd.template.includes("$ARGUMENTS")
              ? cmd.template.replaceAll("$ARGUMENTS", args)
              : `${cmd.template}${args ? `\n\n${args}` : ""}`;
            if (ctx.session?.prompt) {
              await ctx.session.prompt({
                ...input.prompt,
                sessionID: input.sessionID,
                text: rendered,
                delivery: input.delivery ?? "steer",
              });
            }
          },
        });
      }
    });
  }

  return inv;
}

export function registerClaudeBridgeTools(editor: any, rootDir: string): void {
  editor.namespace({
    name: "claude",
    description:
      "Claude Code Compatibility Bridge (`claude-4-opencode`): inspects and loads `.claude/commands/*.md`, `.claude/agents/*.md`, and `.claude/skills/*/SKILL.md`.",
  });

  editor.add({
    name: "inventory",
    description:
      "List all Claude Code commands, subagents, and skills discovered in `.claude/`.",
    options: { namespace: "claude", codemode: true, pinned: false },
    input: {
      type: "object",
      properties: {
        includeUserHome: {
          type: "boolean",
          description: "Also scan ~/.claude/ (default false)",
        },
      },
    },
    output: { type: "object" },
    execute: async (input: { includeUserHome?: boolean }) => {
      const inv = await discoverClaudeCodeAssets(
        rootDir,
        Boolean(input?.includeUserHome),
      );
      return { output: inv, content: JSON.stringify(inv, null, 2) };
    },
  });
}

export const registerClaudeCompatTools = registerClaudeBridgeTools

import { SWARMOS_VERSION } from "../version.js"
import { listArtifacts, readArtifact } from "../omni/artifacts.js"
import { listCheckpoints } from "../omni/checkpoints.js"
import { loadLessons } from "../omni/memory.js"
import { buildRepoMap } from "../omni/repomap.js"
import { loadResearchSources } from "../omni/research.js"

export async function registerOmniCommands(ctx: any, rootDir: string): Promise<void> {
  if (!ctx.command?.transform) return

  await ctx.command.transform((editor: any) => {
    editor.add({
      name: "gui",
      description:
        "Switch to the Studio GUI agent to design, build, and visually verify Web or Native Desktop GUIs",
      execute: async (input: any) => {
        if (ctx.session?.switchAgent) {
          await ctx.session.switchAgent({ sessionID: input.sessionID, agent: "studio-gui" })
        }
        if (ctx.session?.prompt) {
          await ctx.session.prompt({
            ...input.prompt,
            sessionID: input.sessionID,
            text: `Execute the SwarmOS Studio GUI Protocol (Token Lock -> Hashline Implementation -> Live DOM Geometry / Desktop Window Screenshot -> 4-Pillar Visual Critique) for:\n\n${input.prompt?.text ?? input.prompt ?? ""}`,
            delivery: input.delivery,
          })
        }
      },
    })

    editor.add({
      name: "research",
      description:
        "Switch to the Deep Researcher agent to run parallel web/document discovery with verified inline citations",
      execute: async (input: any) => {
        if (ctx.session?.switchAgent) {
          await ctx.session.switchAgent({ sessionID: input.sessionID, agent: "researcher" })
        }
        if (ctx.session?.prompt) {
          await ctx.session.prompt({
            ...input.prompt,
            sessionID: input.sessionID,
            text: `Execute the SwarmOS Deep Research Protocol (Decompose in task.md -> Parallel Web/Doc Discovery -> Record Sources -> Audit Citations) for:\n\n${input.prompt?.text ?? input.prompt ?? ""}`,
            delivery: input.delivery,
          })
        }
      },
    })

    editor.add({
      name: "office",
      description:
        "Switch to the Office Analyst agent to read or generate Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, or SQLite deliverables with visual page previews",
      execute: async (input: any) => {
        if (ctx.session?.switchAgent) {
          await ctx.session.switchAgent({ sessionID: input.sessionID, agent: "office-analyst" })
        }
        if (ctx.session?.prompt) {
          await ctx.session.prompt({
            ...input.prompt,
            sessionID: input.sessionID,
            text: `Execute the SwarmOS Office & Deliverable Protocol (Extract Inputs -> Plan in plan.md -> Build Deliverable -> Render Page Previews -> Visual Critique) for:\n\n${input.prompt?.text ?? input.prompt ?? ""}`,
            delivery: input.delivery,
          })
        }
      },
    })

    editor.add({
      name: "artifacts",
      description:
        "Inspect active Antigravity-style workspace artifacts (`task.md`, `plan.md`), checkpoints, episodic memory, and research sources",
      execute: async (input: any) => {
        const [files, taskArt, planArt, sources, lessons, checkpoints] = await Promise.all([
          listArtifacts(rootDir),
          readArtifact(rootDir, "task.md"),
          readArtifact(rootDir, "plan.md"),
          loadResearchSources(rootDir),
          loadLessons(rootDir),
          listCheckpoints(rootDir),
        ])

        const summary = [
          `# SwarmOS Omni-Harness Artifacts, Memory & Checkpoints (v${SWARMOS_VERSION})`,
          "",
          `**Files in \`.opencode/artifacts/\` (${files.length})**: ${files.length ? files.join(", ") : "_none_"}`,
          `**Episodic Memory Lessons (${lessons.length})**: ${lessons.length ? lessons.map((l) => `\`${l.id}\``).join(", ") : "_none_"}`,
          `**Time-Travel Checkpoints (${checkpoints.length})**: ${checkpoints.length ? checkpoints.map((c) => `\`${c.id}\` (${c.label})`).join(", ") : "_none_"}`,
          `**Recorded Research Sources (${sources.length})**: ${sources.length ? sources.map((s) => `[${s.id}](${s.url})`).join(", ") : "_none_"}`,
          ...(taskArt.exists ? ["", "### Active Task Checklist (`task.md`)", taskArt.content.trim()] : []),
          ...(planArt.exists ? ["", "### Active Implementation Plan (`plan.md`)", planArt.content.trim()] : []),
        ].join("\n")

        if (ctx.session?.prompt) {
          await ctx.session.prompt({
            sessionID: input.sessionID,
            text: summary,
            delivery: "steer",
          })
        }
      },
    })

    editor.add({
      name: "map",
      description:
        "Generate a PageRank-weighted Repository Architecture Map showing the highest-centrality files, exported symbols, and dependency edges",
      execute: async (input: any) => {
        const report = await buildRepoMap(rootDir, 20)
        const rows = report.topFiles.map(
          (n, idx) =>
            `${idx + 1}. **\`${n.path}\`** (score: \`${n.centralityScore}\`, imported by ${n.importedBy.length} file(s)) — symbols: \`${n.symbols.join(", ") || "none"}\``,
        )
        const summary = [
          `# PageRank Repository Map (${report.totalFilesScanned} files scanned)`,
          "",
          ...(rows.length ? rows : ["_No source files found._"]),
        ].join("\n")

        if (ctx.session?.prompt) {
          await ctx.session.prompt({
            sessionID: input.sessionID,
            text: summary,
            delivery: "steer",
          })
        }
      },
    })
  })
}

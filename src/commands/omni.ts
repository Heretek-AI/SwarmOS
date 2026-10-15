import { listArtifacts, readArtifact } from "../omni/artifacts.js"
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
        "Inspect active Antigravity-style workspace artifacts (`task.md`, `plan.md`, `walkthrough.md`) and recorded research sources",
      execute: async (input: any) => {
        const [files, taskArt, planArt, sources] = await Promise.all([
          listArtifacts(rootDir),
          readArtifact(rootDir, "task.md"),
          readArtifact(rootDir, "plan.md"),
          loadResearchSources(rootDir),
        ])

        const summary = [
          "# SwarmOS Omni-Harness Artifacts & Research Ledger",
          "",
          `**Files in \`.opencode/artifacts/\` (${files.length})**: ${files.length ? files.join(", ") : "_none_"}`,
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
  })
}

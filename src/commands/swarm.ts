import { loadBoard } from "../board/board.js"

export async function registerSwarmCommand(ctx: any, rootDir: string): Promise<void> {
  if (!ctx.command?.transform) return

  await ctx.command.transform((editor: any) => {
    editor.add({
      name: "swarm",
      description: "Inspect SwarmOS multi-agent organizational status, active tasks, locked contracts, and QA receipts",
      execute: async (input: any) => {
        const board = await loadBoard(rootDir)

        const summary = [
          "# SwarmOS Organizational Status",
          "",
          board.project
            ? `**Project**: ${board.project.name} (${board.project.aestheticArchetype})\n**Vision**: ${board.project.vision}`
            : "_No active project charter. Run `/ship <spec>` to initialize._",
          "",
          `### Locked Contracts (${board.contracts.length})`,
          board.contracts.length === 0
            ? "- No contracts locked yet."
            : board.contracts.map((c) => `- **[${c.id}]** ${c.title} (${c.files.join(", ")})`).join("\n"),
          "",
          `### Engineering Tasks (${board.tasks.length})`,
          board.tasks.length === 0
            ? "- No tasks created yet."
            : board.tasks
                .map((t) => {
                  const latestReceipt = t.qaReceipts[t.qaReceipts.length - 1]
                  const receiptTag = latestReceipt ? ` [QA: ${latestReceipt.verdict}]` : " [QA: Unverified]"
                  return `- **[${t.id}]** ${t.title} -> **${t.owner}** (${t.status})${receiptTag}`
                })
                .join("\n"),
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

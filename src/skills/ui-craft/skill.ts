import * as fs from "node:fs/promises"
import * as path from "node:path"

export const UI_CRAFT_SKILL_ID = "ui-craft"
export const UI_CRAFT_SKILL_NAME = "UI Craft & Spatial Architecture"

export async function loadSkillContent(fallbackDir?: string): Promise<string> {
  const candidates = [
    path.join(__dirname, "SKILL.md"),
    path.join(process.cwd(), "src", "skills", "ui-craft", "SKILL.md"),
    ...(fallbackDir ? [path.join(fallbackDir, "src", "skills", "ui-craft", "SKILL.md")] : []),
  ]

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf8")
    } catch {
      // try next
    }
  }

  return `# SwarmOS UI Craft & Spatial Architecture Contract
Bound by the Anti-Slop Aesthetic Contract. High-craft interfaces look intentional and disciplined.
Choose an Archetype in tools.org:
- High-Craft Technical Dark (Linear/Raycast style)
- Warm Editorial Studio Light (Stripe/Notion style)
- Swiss Grid / Data-Dense Workbench
- Atmospheric Minimalist Product
Banned: No neon gradients, no descender clipping, no mismatched padding, no blind JSX without browser DOM geometry audits.`
}

export async function registerUICraftSkill(ctx: any, rootDir: string): Promise<void> {
  if (!ctx.skill?.transform) return

  const content = await loadSkillContent(rootDir)

  await ctx.skill.transform((editor: any) => {
    editor.add({
      id: UI_CRAFT_SKILL_ID,
      name: UI_CRAFT_SKILL_NAME,
      description: "Anti-Slop Aesthetic Contract, Intentional Design Archetypes & Deterministic Spatial Engineering for High-Craft UIs",
      autoinvoke: true,
      path: path.join(rootDir, ".opencode", "skills", "ui-craft"),
      content,
    })
  })
}

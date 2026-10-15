import * as fs from "node:fs/promises"
import * as path from "node:path"

export interface EpisodicLesson {
  id: string
  trigger: string
  lesson: string
  scopePaths?: string[]
  createdAt: string
}

export function getMemoryFilePath(rootDir: string): string {
  return path.join(rootDir, ".opencode", "memory", "lessons.json")
}

export async function loadLessons(rootDir: string): Promise<EpisodicLesson[]> {
  try {
    const raw = await fs.readFile(getMemoryFilePath(rootDir), "utf8")
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function recordLesson(
  rootDir: string,
  input: Omit<EpisodicLesson, "createdAt">,
): Promise<EpisodicLesson> {
  const lessons = await loadLessons(rootDir)
  const entry: EpisodicLesson = {
    ...input,
    createdAt: new Date().toISOString(),
  }
  const idx = lessons.findIndex((l) => l.id === input.id)
  if (idx >= 0) lessons[idx] = entry
  else lessons.push(entry)

  const file = getMemoryFilePath(rootDir)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(lessons, null, 2), "utf8")
  return entry
}

export function registerMemoryTools(editor: any, rootDir: string): void {
  editor.namespace({
    name: "memory",
    description:
      "Cross-Session Episodic Memory for recording repository quirks, build/test gotchas, and architectural lessons that auto-inject into future sessions.",
  })

  editor.add({
    name: "record_lesson",
    description:
      "Record a permanent repository lesson or non-obvious gotcha in `.opencode/memory/lessons.json` so future sessions never repeat the same mistake.",
    options: { namespace: "memory", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "Short lesson ID (e.g. 'sqlite-wal-test-env')" },
        trigger: { type: "string", description: "When this lesson applies (e.g. 'Running bun test on database modules')" },
        lesson: { type: "string", description: "The exact actionable rule or fix" },
        scopePaths: { type: "array", items: { type: "string" }, description: "Optional file globs this applies to" },
      },
      required: ["id", "trigger", "lesson"],
    },
    output: { type: "object" },
    execute: async (input: Omit<EpisodicLesson, "createdAt">) => {
      const entry = await recordLesson(rootDir, input)
      return { output: entry, content: `Recorded episodic lesson [${entry.id}]` }
    },
  })

  editor.add({
    name: "recall",
    description: "Retrieve all recorded episodic lessons for this repository.",
    options: { namespace: "memory", codemode: true, pinned: true },
    input: { type: "object", properties: {} },
    output: { type: "object" },
    execute: async () => {
      const lessons = await loadLessons(rootDir)
      return { output: { lessons }, content: JSON.stringify(lessons, null, 2) }
    },
  })
}

export async function registerMemoryContextHook(ctx: any, rootDir: string): Promise<void> {
  if (!ctx.session?.hook) return

  const injectMemory = async (event: any) => {
    if (event.agent === "compaction" || event.kind === "compaction") return
    if (!Array.isArray(event.system) || event.system.length === 0) return

    const lessons = await loadLessons(rootDir)
    if (lessons.length === 0) return

    const formatted = lessons
      .slice(-20)
      .map((l) => `- **[${l.id}]** (${l.trigger}): ${l.lesson}`)
      .join("\n")

    const block = `<episodic-repository-memory>\n## Learned Repository Rules & Gotchas\n${formatted}\n</episodic-repository-memory>`
    const lastIdx = event.system.length - 1
    const lastPart = event.system[lastIdx]
    if (lastPart && typeof lastPart.text === "string" && !lastPart.text.includes("<episodic-repository-memory>")) {
      event.system[lastIdx] = {
        ...lastPart,
        text: `${lastPart.text}\n\n${block}`,
      }
    }
  }

  await ctx.session.hook("context", injectMemory)
}

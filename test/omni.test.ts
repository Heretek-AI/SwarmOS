import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import {
  auditMarkdownCitations,
  computeLineHash,
  extractOfficeOrDataFile,
  hashEditFile,
  hashReadFile,
  listArtifacts,
  readArtifact,
  recordResearchSource,
  registerArtifactContextHook,
  VISUAL_QUALITY_CHECKLIST,
  writeArtifact,
} from "../src/index.js"

describe("SwarmOS v0.4.0 Omni-Harness Capabilities", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "swarmos-omni-test-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("reads and edits files with Oh-My-Pi hashline precision and +-3 line drift recovery", async () => {
    const sampleFile = path.join(tmpDir, "sample.js")
    await fs.writeFile(
      sampleFile,
      [
        "export function greet(name) {",
        "  const prefix = 'Hello';",
        "  return prefix + ', ' + name;",
        "}",
      ].join("\n"),
      "utf8",
    )

    const readRes = await hashReadFile(tmpDir, "sample.js")
    expect(readRes.totalLines).toBe(4)

    const h2 = computeLineHash("  const prefix = 'Hello';")
    const h3 = computeLineHash("  return prefix + ', ' + name;")
    expect(readRes.content).toContain(`2#${h2}:   const prefix = 'Hello';`)

    // Test +-2 line drift recovery (pass startLine=4 instead of 2, but with exact hashes h2..h3)
    const editRes = await hashEditFile(tmpDir, "sample.js", [
      {
        startLine: 4,
        startHash: h2,
        endLine: 5,
        endHash: h3,
        replacement: "  const prefix = 'Hi';\n  return `${prefix}, ${name}!`;",
      },
    ])

    expect(editRes.appliedHunks).toBe(1)
    expect(editRes.diagnostics).toBeUndefined()

    const updated = await fs.readFile(sampleFile, "utf8")
    expect(updated).toContain("const prefix = 'Hi';")
    expect(updated).toContain("return `${prefix}, ${name}!`;")
  })

  it("rejects hashline edits when content hashes do not match", async () => {
    const sampleFile = path.join(tmpDir, "mismatch.js")
    await fs.writeFile(sampleFile, "const x = 1;\nconst y = 2;\n", "utf8")

    expect(
      hashEditFile(tmpDir, "mismatch.js", [
        {
          startLine: 1,
          startHash: "ff",
          endLine: 1,
          endHash: "ff",
          replacement: "const x = 99;",
        },
      ]),
    ).rejects.toThrow("Hashline mismatch")
  })

  it("persists and auto-injects Antigravity-style task.md and plan.md artifacts", async () => {
    await writeArtifact(tmpDir, "task.md", "- [x] Lock schema\n- [/] Build GUI")
    await writeArtifact(tmpDir, "plan.md", "## Architecture\nUse Swiss Grid archetype.")

    const list = await listArtifacts(tmpDir)
    expect(list).toEqual(["plan.md", "task.md"])

    const task = await readArtifact(tmpDir, "task.md")
    expect(task.exists).toBe(true)
    expect(task.content).toContain("Build GUI")

    let hookFn: any = null
    await registerArtifactContextHook(
      {
        session: {
          hook: async (name: string, fn: any) => {
            if (name === "context") hookFn = fn
          },
        },
      },
      tmpDir,
    )

    const mockEvent = {
      agent: "director",
      system: [{ type: "text", text: "Base system prompt" }],
    }
    await hookFn(mockEvent)
    expect(mockEvent.system[0].text).toContain("<active-workspace-artifacts>")
    expect(mockEvent.system[0].text).toContain("Use Swiss Grid archetype.")
  })

  it("extracts tabular CSV and SQLite files via the Universal Office Extractor", async () => {
    const csvFile = path.join(tmpDir, "metrics.csv")
    await fs.writeFile(csvFile, "quarter,revenue,margin\nQ1,1200,0.42\nQ2,1550,0.46\n", "utf8")

    const extracted = await extractOfficeOrDataFile(tmpDir, "metrics.csv")
    expect(extracted).toBeDefined()
    expect(extracted).toContain("# Tabular Dataset: metrics.csv")
    expect(extracted).toContain("| Q1 | 1200 | 0.42 |")
  })

  it("tracks research sources and audits Markdown citations against fabricated or bare-root URLs", async () => {
    await recordResearchSource(tmpDir, {
      id: "rfc-9110",
      url: "https://httpwg.org/specs/rfc9110.html",
      title: "HTTP Semantics RFC 9110",
      keyFindings: ["Defines GET, POST, PUT, DELETE semantics"],
    })

    // Valid specific citation -> passed: true
    const cleanAudit = await auditMarkdownCitations(
      tmpDir,
      "According to [RFC 9110](https://httpwg.org/specs/rfc9110.html), GET is read-only.",
    )
    expect(cleanAudit.passed).toBe(true)
    expect(cleanAudit.verifiedLinks).toEqual(["https://httpwg.org/specs/rfc9110.html"])

    // Unverified link + bare root link -> passed: false
    const badAudit = await auditMarkdownCitations(
      tmpDir,
      "See [Example Root](https://example.com/) and [Hallucinated Doc](https://example.com/fake-page).",
    )
    expect(badAudit.passed).toBe(false)
    expect(badAudit.bareRootLinks).toContain("https://example.com/")
    expect(badAudit.unverifiedLinks).toContain("https://example.com/fake-page")
  })

  it("exports the 4-Pillar Visual Quality Checklist for GUI Studio", () => {
    expect(VISUAL_QUALITY_CHECKLIST.macroBalance.length).toBeGreaterThan(0)
    expect(VISUAL_QUALITY_CHECKLIST.typographyAndContrast.length).toBeGreaterThan(0)
  })
})

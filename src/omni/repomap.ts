import * as fs from "node:fs/promises"
import * as path from "node:path"

export interface RepoMapNode {
  path: string
  imports: string[]
  importedBy: string[]
  centralityScore: number
  symbols: string[]
}

export interface RepoMapReport {
  totalFilesScanned: number
  topFiles: RepoMapNode[]
}

export interface BlastRadiusReport {
  targetFile: string
  directDependents: string[]
  transitiveDependents: string[]
  impactScore: number
}

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".rs", ".go"])
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".opencode", ".worktrees", "target", "__pycache__"])

async function walkSourceFiles(dir: string, rootDir: string, maxFiles: number = 400, acc: string[] = []): Promise<string[]> {
  if (acc.length >= maxFiles) return acc
  let entries: any[] = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (acc.length >= maxFiles) break
    if (entry.name.startsWith(".") && entry.name !== ".github") continue
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      await walkSourceFiles(path.join(dir, entry.name), rootDir, maxFiles, acc)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SOURCE_EXTS.has(ext)) {
        const rel = path.relative(rootDir, path.join(dir, entry.name)).split(path.sep).join("/")
        acc.push(rel)
      }
    }
  }
  return acc
}

function resolveRelativeImport(fromFile: string, spec: string, knownSet: Set<string>): string | undefined {
  if (!spec.startsWith(".")) return undefined
  const fromDir = path.posix.dirname(fromFile)
  const base = path.posix.normalize(path.posix.join(fromDir, spec))
  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}/index.ts`,
    `${base}/index.js`,
  ]
  return candidates.find((c) => knownSet.has(c))
}

export async function buildRepoMap(rootDir: string, topN: number = 25): Promise<RepoMapReport> {
  const files = await walkSourceFiles(rootDir, rootDir, 400)
  const knownSet = new Set(files)
  const nodes = new Map<string, RepoMapNode>()

  for (const f of files) {
    nodes.set(f, { path: f, imports: [], importedBy: [], centralityScore: 1, symbols: [] })
  }

  const importRe = /(?:import\s+[^'"]*from\s+|import\s*\(|export\s+[^'"]*from\s+)['"]([^'"]+)['"]/g
  const declRe = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|enum|struct|fn|def)\s+([A-Za-z0-9_$]+)/

  for (const f of files) {
    const node = nodes.get(f)!
    try {
      const raw = await fs.readFile(path.resolve(rootDir, f), "utf8")
      let match: RegExpExecArray | null
      importRe.lastIndex = 0
      while ((match = importRe.exec(raw)) !== null) {
        const resolved = resolveRelativeImport(f, match[1], knownSet)
        if (resolved && resolved !== f && !node.imports.includes(resolved)) {
          node.imports.push(resolved)
          const targetNode = nodes.get(resolved)
          if (targetNode && !targetNode.importedBy.includes(f)) {
            targetNode.importedBy.push(f)
          }
        }
      }
      for (const line of raw.split("\n").slice(0, 300)) {
        const m = declRe.exec(line)
        if (m && node.symbols.length < 12 && !node.symbols.includes(m[1])) {
          node.symbols.push(m[1])
        }
      }
    } catch {
      // ignore unreadable file
    }
  }

  // 3 iterations of PageRank-style centrality propagation
  const damping = 0.85
  for (let iter = 0; iter < 3; iter++) {
    const nextScores = new Map<string, number>()
    for (const [f, node] of nodes.entries()) {
      let sum = 0
      for (const caller of node.importedBy) {
        const callerNode = nodes.get(caller)!
        const outDegree = Math.max(1, callerNode.imports.length)
        sum += callerNode.centralityScore / outDegree
      }
      nextScores.set(f, +(1 - damping + damping * (sum + node.importedBy.length)).toFixed(3))
    }
    for (const [f, score] of nextScores.entries()) {
      nodes.get(f)!.centralityScore = score
    }
  }

  const sorted = Array.from(nodes.values()).sort(
    (a, b) => b.centralityScore - a.centralityScore || b.importedBy.length - a.importedBy.length,
  )

  return {
    totalFilesScanned: files.length,
    topFiles: sorted.slice(0, topN),
  }
}

export async function analyzeBlastRadius(rootDir: string, targetFile: string): Promise<BlastRadiusReport> {
  const relTarget = path.relative(rootDir, path.resolve(rootDir, targetFile)).split(path.sep).join("/")
  const fullMap = await buildRepoMap(rootDir, 400)
  const byPath = new Map(fullMap.topFiles.map((n) => [n.path, n]))

  const direct = byPath.get(relTarget)?.importedBy ?? []
  const visited = new Set<string>(direct)
  const queue = [...direct]

  while (queue.length > 0) {
    const cur = queue.shift()!
    const callers = byPath.get(cur)?.importedBy ?? []
    for (const c of callers) {
      if (c !== relTarget && !visited.has(c)) {
        visited.add(c)
        queue.push(c)
      }
    }
  }

  const transitive = Array.from(visited)
  return {
    targetFile: relTarget,
    directDependents: direct,
    transitiveDependents: transitive,
    impactScore: direct.length * 2 + transitive.length,
  }
}

export function registerRepoMapTools(editor: any, rootDir: string): void {
  editor.namespace({
    name: "repo",
    description:
      "Aider-style PageRank Repository Map & Reverse-Import Blast-Radius Analyzer for instant architectural orientation.",
  })

  editor.add({
    name: "map",
    description:
      "Build a PageRank-weighted repository dependency map showing the highest-centrality files, their exported symbols, and their importers/dependents.",
    options: { namespace: "repo", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        topN: { type: "number", description: "Number of top-ranked files to return (default 25)" },
      },
    },
    output: { type: "object" },
    execute: async (input: { topN?: number }) => {
      const report = await buildRepoMap(rootDir, input?.topN ?? 25)
      return { output: report, content: JSON.stringify(report, null, 2) }
    },
  })

  editor.add({
    name: "blast_radius",
    description:
      "Compute the direct and transitive reverse-import blast radius (all files that directly or indirectly import `targetFile`) before or after modifying an interface.",
    options: { namespace: "repo", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        path: { type: "string", description: "Target file path to analyze" },
      },
      required: ["path"],
    },
    output: { type: "object" },
    execute: async (input: { path: string }) => {
      const report = await analyzeBlastRadius(rootDir, input.path)
      return { output: report, content: JSON.stringify(report, null, 2) }
    },
  })
}

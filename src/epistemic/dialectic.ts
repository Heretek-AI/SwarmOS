import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Pillar 1: IUMBTEMS Epistemic Sovereignty & Dialectic Engine (src/epistemic/dialectic.ts)
// Absorbs Heretek-AI epistemic-swarm (IUMBTEMS) directly into SwarmOS:
// 1. Content-addressed SHA-256 raw source cache (.opencode/epistemic/sources).
// 2. Epistemic Tagging Taxonomy ([VERIFIED: <hash>], [INFERRED:], [HYPOTHESIS:],
//    [NEGATIVE_KNOWLEDGE:]) with verbatim quote verification.
// 3. Socratic Assumption-Inversion Grill (/grill & tools.epistemic.grill).
// 4. Competitor Teardown & SPDX License Contamination Scout (/darkharvest).

export type EpistemicLicenseCategory =
  "permissive" | "weak-copyleft" | "copyleft-contaminating" | "unknown";

export interface CachedEpistemicSource {
  hash: string;
  shortHash: string;
  url?: string;
  title: string;
  spdxLicense?: string;
  licenseCategory: EpistemicLicenseCategory;
  cachedAt: string;
  path: string;
  filePath: string;
  byteLength: number;
}

export interface EpistemicVerificationReport {
  totalClaimsChecked: number;
  verifiedCount: number;
  failedClaims: Array<{ tag: string; reason: string }>;
  passed: boolean;
  verifiedClaims: Array<{
    hash: string;
    quote?: string;
    valid: boolean;
    reason?: string;
  }>;
  inferredClaims: string[];
  hypothesisClaims: string[];
  negativeKnowledgeClaims: string[];
  untaggedParagraphs: number;
  integrityScore: number;
}

export interface LicenseAuditItem {
  name: string;
  license: string;
  classification:
    | "permissive"
    | "weak-copyleft"
    | "strong-copyleft"
    | "copyleft-contaminating"
    | "unknown";
  verdict:
    | "depend-or-vendor"
    | "dynamic-link-only"
    | "clean-room-rebuild-only"
    | "manual-review";
}

const PERMISSIVE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
]);
const WEAK_COPYLEFT_LICENSES = new Set([
  "MPL-2.0",
  "LGPL-2.1",
  "LGPL-2.1-only",
  "LGPL-3.0",
  "LGPL-3.0-only",
  "EPL-2.0",
]);
const STRONG_COPYLEFT_LICENSES = new Set([
  "GPL-2.0",
  "GPL-2.0-only",
  "GPL-3.0",
  "GPL-3.0-only",
  "AGPL-3.0",
  "AGPL-3.0-only",
  "SSPL-1.0",
]);

export function classifySpdxLicense(
  spdx: string | undefined,
): EpistemicLicenseCategory;
export function classifySpdxLicense(
  pkgName: string,
  spdx: string,
): LicenseAuditItem;
export function classifySpdxLicense(
  a?: string,
  b?: string,
): EpistemicLicenseCategory | LicenseAuditItem {
  if (b === undefined) {
    const spdx = a ?? "";
    if (!spdx.trim()) return "unknown";
    const norm = spdx.trim();
    if (PERMISSIVE_LICENSES.has(norm)) return "permissive";
    if (WEAK_COPYLEFT_LICENSES.has(norm)) return "weak-copyleft";
    if (STRONG_COPYLEFT_LICENSES.has(norm) || /\b(?:AGPL|GPL|SSPL)/i.test(norm))
      return "copyleft-contaminating";
    return "unknown";
  }
  const pkgName = a ?? "";
  const spdx = b;
  const category = classifySpdxLicense(spdx);
  const classification =
    category === "copyleft-contaminating"
      ? "copyleft-contaminating"
      : category === "permissive"
        ? "permissive"
        : category === "weak-copyleft"
          ? "weak-copyleft"
          : "unknown";
  const verdict =
    classification === "permissive"
      ? "depend-or-vendor"
      : classification === "weak-copyleft"
        ? "dynamic-link-only"
        : classification === "copyleft-contaminating"
          ? "clean-room-rebuild-only"
          : "manual-review";
  return { name: pkgName, license: spdx, classification, verdict };
}

export function getEpistemicDir(rootDir: string): string {
  return path.join(rootDir, ".opencode", "epistemic");
}

export function getEpistemicSourcesDir(rootDir: string): string {
  return path.join(getEpistemicDir(rootDir), "sources");
}

interface EpistemicIndexEntry extends CachedEpistemicSource {}

async function loadEpistemicIndex(
  rootDir: string,
): Promise<EpistemicIndexEntry[]> {
  try {
    const raw = await fs.readFile(
      path.join(getEpistemicDir(rootDir), "index.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveEpistemicIndex(
  rootDir: string,
  entries: EpistemicIndexEntry[],
): Promise<void> {
  const dir = getEpistemicDir(rootDir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "index.json"),
    JSON.stringify(entries, null, 2),
    "utf8",
  );
}

export async function cacheEpistemicSource(
  rootDir: string,
  input: { url?: string; title: string; content: string; spdxLicense?: string },
): Promise<CachedEpistemicSource> {
  const normalizedContent = input.content.replace(/\r\n/g, "\n");
  const sha256 = createHash("sha256")
    .update(normalizedContent, "utf8")
    .digest("hex");
  const shortHash = sha256.slice(0, 12);
  const sourcesDir = getEpistemicSourcesDir(rootDir);
  await fs.mkdir(sourcesDir, { recursive: true });
  const filePath = path.join(sourcesDir, `${shortHash}.md`);
  const header = [
    "---",
    `hash: ${sha256}`,
    `shortHash: ${shortHash}`,
    `title: ${input.title}`,
    "---",
    "",
  ].join("\n");
  await fs.writeFile(filePath, `${header}${normalizedContent}`, "utf8");
  const entry: CachedEpistemicSource = {
    hash: sha256,
    shortHash,
    title: input.title,
    ...(input.url ? { url: input.url } : {}),
    ...(input.spdxLicense ? { spdxLicense: input.spdxLicense } : {}),
    licenseCategory: classifySpdxLicense(input.spdxLicense),
    cachedAt: new Date().toISOString(),
    path: filePath,
    filePath: path.relative(rootDir, filePath).split(path.sep).join("/"),
    byteLength: Buffer.byteLength(normalizedContent, "utf8"),
  };
  const index = await loadEpistemicIndex(rootDir);
  const existingIdx = index.findIndex((e) => e.shortHash === shortHash);
  if (existingIdx >= 0) index[existingIdx] = entry;
  else index.push(entry);
  await saveEpistemicIndex(rootDir, index);
  return entry;
}

export async function verifyEpistemicClaims(
  rootDir: string,
  markdownText: string,
): Promise<EpistemicVerificationReport> {
  const index = await loadEpistemicIndex(rootDir);
  const byHash = new Map<string, EpistemicIndexEntry>();
  for (const e of index) {
    byHash.set(e.shortHash.toLowerCase(), e);
    byHash.set(e.hash.toLowerCase(), e);
  }
  // Fall back to scanning sources/ dir for entries cached without index (legacy layout).
  if (byHash.size === 0) {
    try {
      const files = await fs.readdir(getEpistemicSourcesDir(rootDir));
      for (const f of files) {
        if (!f.endsWith(".md")) continue;
        const stem = path.basename(f, ".md").toLowerCase();
        if (!byHash.has(stem)) {
          byHash.set(stem, {
            hash: stem,
            shortHash: stem.slice(0, 12),
            title: stem,
            licenseCategory: "unknown",
            cachedAt: new Date().toISOString(),
            path: path.join(getEpistemicSourcesDir(rootDir), f),
            filePath: `.opencode/epistemic/sources/${f}`,
            byteLength: 0,
          });
        }
      }
    } catch {
      // no sources dir
    }
  }
  const tagRe = /\[VERIFIED:\s*([a-fA-F0-9]{6,64})(?:\s*\|\s*"([^"]+)")?\]/g;
  const failedClaims: Array<{ tag: string; reason: string }> = [];
  const verifiedClaims: EpistemicVerificationReport["verifiedClaims"] = [];
  let verifiedCount = 0;
  let totalClaimsChecked = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(markdownText)) !== null) {
    totalClaimsChecked++;
    const rawTag = match[0];
    const hashKey = match[1].toLowerCase();
    const quote = match[2];
    const entry =
      byHash.get(hashKey) ??
      [...byHash.values()].find(
        (e) =>
          e.shortHash.startsWith(hashKey) || hashKey.startsWith(e.shortHash),
      );
    if (!entry) {
      failedClaims.push({
        tag: rawTag,
        reason: `Unknown source hash "${hashKey}" not found in .opencode/epistemic/index.json`,
      });
      verifiedClaims.push({
        hash: hashKey,
        quote,
        valid: false,
        reason: "Source hash not found",
      });
      continue;
    }
    const absFile = path.isAbsolute(entry.filePath)
      ? entry.filePath
      : path.resolve(rootDir, entry.filePath);
    let sourceText = "";
    try {
      sourceText = await fs.readFile(entry.path ?? absFile, "utf8");
      if (!sourceText) sourceText = await fs.readFile(absFile, "utf8");
    } catch {
      failedClaims.push({
        tag: rawTag,
        reason: `Cached source file missing on disk: ${entry.filePath}`,
      });
      verifiedClaims.push({
        hash: hashKey,
        quote,
        valid: false,
        reason: "Cached source file missing",
      });
      continue;
    }
    if (quote) {
      const normSource = sourceText.replace(/\s+/g, " ").trim();
      const normQuote = quote.replace(/\s+/g, " ").trim();
      if (!normSource.includes(normQuote)) {
        failedClaims.push({
          tag: rawTag,
          reason: `Verbatim quote "${quote.slice(0, 60)}" not found inside cached source [${entry.shortHash}] (${entry.title})`,
        });
        verifiedClaims.push({
          hash: hashKey,
          quote,
          valid: false,
          reason: "Verbatim quote not found",
        });
        continue;
      }
    }
    verifiedCount++;
    verifiedClaims.push({ hash: hashKey, quote, valid: true });
  }

  const inferredClaims = [
    ...markdownText.matchAll(/\[INFERRED:\s*([^\]]+)\]/gi),
  ].map((m) => m[1].trim());
  const hypothesisClaims = [
    ...markdownText.matchAll(/\[HYPOTHESIS:\s*([^\]]+)\]/gi),
  ].map((m) => m[1].trim());
  const negativeKnowledgeClaims = [
    ...markdownText.matchAll(/\[NEGATIVE_KNOWLEDGE:\s*([^\]]+)\]/gi),
  ].map((m) => m[1].trim());
  const paragraphs = markdownText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(
      (p) =>
        p.length > 60 &&
        !p.startsWith("#") &&
        !p.startsWith("|") &&
        !p.startsWith("```"),
    );
  const untaggedParagraphs = paragraphs.filter(
    (p) => !/\[(?:VERIFIED|INFERRED|HYPOTHESIS|NEGATIVE_KNOWLEDGE):/i.test(p),
  ).length;
  const totalTagged =
    verifiedClaims.length +
    inferredClaims.length +
    hypothesisClaims.length +
    negativeKnowledgeClaims.length;
  const baseScore = totalTagged > 0 ? 100 : 60;
  const integrityScore = Math.max(
    0,
    Math.min(
      100,
      baseScore - failedClaims.length * 25 - untaggedParagraphs * 5,
    ),
  );

  return {
    totalClaimsChecked,
    verifiedCount,
    failedClaims,
    passed: failedClaims.length === 0,
    verifiedClaims,
    inferredClaims,
    hypothesisClaims,
    negativeKnowledgeClaims,
    untaggedParagraphs,
    integrityScore,
  };
}

export async function listEpistemicSources(
  rootDir: string,
): Promise<CachedEpistemicSource[]> {
  return loadEpistemicIndex(rootDir);
}

export function generateSocraticGrillPrompt(objective: string): string {
  return [
    "# IUMBTEMS Socratic Grill & Assumption Inversion Protocol",
    "",
    `Target Objective: **${objective}**`,
    "",
    "Before writing any code or locking any contract, execute these 4 dialectic steps:",
    "1. **Premise Inversion**: List the top 3 unstated assumptions in the objective and invert each one (what if the opposite is true?).",
    "2. **Decision Tree Frontier**: Identify the 2–3 load-bearing architectural forks where choosing wrong forces a rewrite. Use `question` to ask the user with concrete tradeoffs.",
    "3. **Thesis vs. Antithesis (Red-Team)**: State the strongest argument FOR the proposed design (Agent Alpha) and the sharpest failure mode that will break it in production (Agent Beta).",
    "4. **Falsifiable Spike**: Define the smallest 1-command verification test that proves the core assumption works.",
  ].join("\n");
}

export function generateGrillQuestions(
  specText: string,
  focusAreas: string[] = [],
): { topic: string; questions: string[] } {
  const lines = specText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const topic =
    lines[0]?.replace(/^#+\s*/, "") || "System Architecture & Specification";
  const questions = [
    `[State & Concurrency] What happens in "${topic}" if two subagents or requests mutate the same state concurrently or a process crashes mid-write?`,
    `[Failure Modes & Recovery] Which external dependencies or I/O boundaries in "${topic}" can fail or time out, and what is the deterministic fallback or rollback path?`,
    `[Boundary Invariants] What untrusted inputs enter "${topic}", and where is the schema validation boundary enforced before business logic executes?`,
    `[Verification & Observability] What single automated command or invariant assertion proves "${topic}" works without human guesswork?`,
    `[Scope & Blast Radius] Which existing modules or contracts could break if "${topic}" changes, and what is the minimal viable slice we should lock first?`,
  ];
  for (const area of focusAreas) {
    questions.push(
      `[Focused Stress-Test: ${area}] What implicit assumption in "${area}" has not yet been verified against actual code or primary sources?`,
    );
  }
  return { topic, questions };
}

export function registerEpistemicTools(editor: any, rootDir: string): void {
  editor.namespace({
    name: "epistemic",
    description:
      "IUMBTEMS Epistemic & Dialectic Engine: SHA-256 content-addressed source cache, verbatim quote verifier, SPDX license contamination guard, and Socratic grill stress-tester.",
  });

  editor.add({
    name: "cache_source",
    description:
      "Cache raw source text or documentation in `.opencode/epistemic/sources/<shortHash>.md`, compute its SHA-256 hash, and classify its SPDX license.",
    options: { namespace: "epistemic", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        url: { type: "string" },
        spdxLicense: { type: "string" },
      },
      required: ["title", "content"],
    },
    output: { type: "object" },
    execute: async (input: {
      url?: string;
      title: string;
      content: string;
      spdxLicense?: string;
    }) => {
      const entry = await cacheEpistemicSource(rootDir, input);
      return {
        output: entry,
        content: `Cached epistemic source [${entry.shortHash}] (${entry.licenseCategory}): ${entry.title}`,
      };
    },
  });

  editor.add({
    name: "verify_claims",
    description:
      "Verify all `[VERIFIED: <shortHash> | 'exact quote']` tags in a Markdown text against `.opencode/epistemic/sources/`.",
    options: { namespace: "epistemic", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: { markdown: { type: "string" } },
      required: ["markdown"],
    },
    output: { type: "object" },
    execute: async (input: { markdown: string }) => {
      const report = await verifyEpistemicClaims(rootDir, input.markdown);
      return { output: report, content: JSON.stringify(report, null, 2) };
    },
  });

  editor.add({
    name: "grill_spec",
    description:
      "Generate Socratic stress-test questions to expose hidden assumptions, race conditions, and unverified boundaries in a specification.",
    options: { namespace: "epistemic", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        specText: { type: "string" },
        focusAreas: { type: "array", items: { type: "string" } },
      },
      required: ["specText"],
    },
    output: { type: "object" },
    execute: async (input: { specText: string; focusAreas?: string[] }) => {
      const res = generateGrillQuestions(
        input.specText,
        input.focusAreas ?? [],
      );
      return { output: res, content: JSON.stringify(res, null, 2) };
    },
  });
}

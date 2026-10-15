import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";

// Pillar 4: On-Demand Domain Packs (src/packs/index.ts)
// Consolidates Heretek-AI vertical plugins into one unified registry:
// - re (opencode-rea): Reverse Engineering & Binary Triage.
// - godot (godot-opencode): Godot 4.x Engine .tscn scene tree parser.
// - gdevelop (GDevelop-Unlocked): GDevelop 5 game.json inspector.

export type DomainPackId = "re" | "godot" | "gdevelop";

export interface DomainPackStatus {
  id: DomainPackId;
  title: string;
  replacesRepo: string;
  active: boolean;
  autoDetected: boolean;
  reason: string;
}

export interface DomainDetection {
  godot: boolean;
  gdevelop: boolean;
  reverseEngineering: boolean;
  recommendedPacks: string[];
}

const activePacksByRoot = new Map<string, Set<DomainPackId>>();

export async function detectDomainPacks(
  rootDir: string,
): Promise<DomainDetection> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    return {
      godot: false,
      gdevelop: false,
      reverseEngineering: false,
      recommendedPacks: [],
    };
  }
  const godot =
    entries.includes("project.godot") ||
    entries.some((n) => n.endsWith(".tscn") || n.endsWith(".gd"));
  const gdevelop =
    entries.includes("game.json") || entries.some((n) => n.endsWith(".gdg"));
  const reverseEngineering = entries.some((n) =>
    /\.(?:exe|dll|so|dylib|bin|elf|apk|ipa|pcap)$/i.test(n),
  );
  const recommendedPacks: string[] = [];
  if (godot) recommendedPacks.push("godot");
  if (gdevelop) recommendedPacks.push("gdevelop");
  if (reverseEngineering) recommendedPacks.push("re");
  const key = path.resolve(rootDir);
  const manual = activePacksByRoot.get(key) ?? new Set<DomainPackId>();
  if (godot) manual.add("godot");
  if (gdevelop) manual.add("gdevelop");
  if (reverseEngineering) manual.add("re");
  activePacksByRoot.set(key, manual);
  return { godot, gdevelop, reverseEngineering, recommendedPacks };
}

export async function listDomainPackStatus(
  rootDir: string,
): Promise<DomainPackStatus[]> {
  const d = await detectDomainPacks(rootDir);
  const key = path.resolve(rootDir);
  const manual = activePacksByRoot.get(key) ?? new Set<DomainPackId>();
  return [
    {
      id: "re",
      title: "Reverse Engineering & Binary Analysis Pack",
      replacesRepo: "Heretek-AI/opencode-rea",
      active: manual.has("re"),
      autoDetected: d.reverseEngineering,
      reason: d.reverseEngineering
        ? "Detected binary artifact in workspace"
        : "Dormant (0 token overhead)",
    },
    {
      id: "godot",
      title: "Godot 4.x Scene & GDScript Pack",
      replacesRepo: "Heretek-AI/godot-opencode",
      active: manual.has("godot"),
      autoDetected: d.godot,
      reason: d.godot
        ? "Detected Godot project/scene"
        : "Dormant (0 token overhead)",
    },
    {
      id: "gdevelop",
      title: "GDevelop 5 Project & Debug Log Pack",
      replacesRepo: "Heretek-AI/GDevelop-Unlocked",
      active: manual.has("gdevelop"),
      autoDetected: d.gdevelop,
      reason: d.gdevelop
        ? "Detected GDevelop game.json/.gdg"
        : "Dormant (0 token overhead)",
    },
  ];
}

export function activateDomainPack(
  rootDir: string,
  packId: DomainPackId,
): void {
  const key = path.resolve(rootDir);
  const set = activePacksByRoot.get(key) ?? new Set<DomainPackId>();
  set.add(packId);
  activePacksByRoot.set(key, set);
}

export interface GodotSceneReport {
  path: string;
  formatVersion: number;
  nodeCount: number;
  nodes: Array<{ name: string; type: string; parent: string }>;
  extResources: Array<{ id: string; type: string; path: string }>;
  externalScripts: string[];
  signalConnections: Array<{
    signal: string;
    from: string;
    to: string;
    method: string;
  }>;
}

export async function inspectGodotScene(
  rootDir: string,
  scenePath: string,
): Promise<GodotSceneReport> {
  const abs = path.resolve(rootDir, scenePath);
  const raw = await fs.readFile(abs, "utf8");
  const headerMatch = /\[gd_scene[^\]]*format=(\d+)/.exec(raw);
  const formatVersion = headerMatch ? Number(headerMatch[1]) : 3;
  const nodes: Array<{ name: string; type: string; parent: string }> = [];
  const nodeRe =
    /\[node\s+name="([^"]+)"(?:\s+type="([^"]+)")?(?:\s+parent="([^"]+)")?[^\]]*\]/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(raw)) !== null) {
    nodes.push({ name: m[1], type: m[2] || "Instance", parent: m[3] || "." });
  }
  const extResources: Array<{ id: string; type: string; path: string }> = [];
  for (const em of raw.matchAll(/\[ext_resource\s+([^\]]+)\]/g)) {
    const attrs = em[1];
    const id =
      /id="([^"]+)"/.exec(attrs)?.[1] ?? /id=(\S+)/.exec(attrs)?.[1] ?? "";
    const type = /type="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const p = /path="([^"]+)"/.exec(attrs)?.[1] ?? "";
    extResources.push({ id, type, path: p });
    void p;
  }
  const externalScripts: string[] = [];
  const extRe = /\[ext_resource\s+type="Script"\s+path="([^"]+)"[^\]]*\]/g;
  while ((m = extRe.exec(raw)) !== null) {
    externalScripts.push(m[1]);
  }
  const signalConnections: Array<{
    signal: string;
    from: string;
    to: string;
    method: string;
  }> = [];
  const connRe =
    /\[connection\s+signal="([^"]+)"\s+from="([^"]+)"\s+to="([^"]+)"\s+method="([^"]+)"[^\]]*\]/g;
  while ((m = connRe.exec(raw)) !== null) {
    signalConnections.push({
      signal: m[1],
      from: m[2],
      to: m[3],
      method: m[4],
    });
  }
  return {
    path: scenePath,
    formatVersion,
    nodeCount: nodes.length,
    nodes,
    extResources,
    externalScripts,
    signalConnections,
  };
}

export interface GDevelopSceneSummary {
  name: string;
  objectCount: number;
  objectsCount: number;
  layerCount: number;
  eventCount: number;
  eventsCount: number;
}

export interface GDevelopProjectReport {
  projectName: string;
  name: string;
  version: string;
  windowWidth: number;
  windowHeight: number;
  sceneCount: number;
  scenes: GDevelopSceneSummary[];
  globalObjectsCount: number;
  extensionsCount: number;
  extensionCount: number;
  externalEventCount: number;
}

export async function inspectGDevelopProject(
  rootDir: string,
  projectPath: string = "game.json",
): Promise<GDevelopProjectReport> {
  const abs = path.resolve(rootDir, projectPath);
  const parsed = JSON.parse(await fs.readFile(abs, "utf8"));
  const props = parsed.properties ?? {};
  const layouts = Array.isArray(parsed.layouts) ? parsed.layouts : [];
  const scenes: GDevelopSceneSummary[] = layouts.map((l: any) => ({
    name: String(l.name ?? "Untitled"),
    objectCount: Array.isArray(l.objects) ? l.objects.length : 0,
    objectsCount: Array.isArray(l.objects) ? l.objects.length : 0,
    layerCount: Array.isArray(l.layers) ? l.layers.length : 0,
    eventCount: Array.isArray(l.events) ? l.events.length : 0,
    eventsCount: Array.isArray(l.events) ? l.events.length : 0,
  }));
  return {
    projectName: String(props.name ?? "GDevelop Project"),
    name: String(props.name ?? "Untitled GDevelop Game"),
    version: String(props.version ?? "1.0.0"),
    windowWidth: Number(props.windowWidth ?? 800),
    windowHeight: Number(props.windowHeight ?? 600),
    sceneCount: scenes.length,
    scenes,
    globalObjectsCount: Array.isArray(parsed.objects)
      ? parsed.objects.length
      : 0,
    extensionsCount: Array.isArray(parsed.eventsFunctionsExtensions)
      ? parsed.eventsFunctionsExtensions.length
      : 0,
    extensionCount: Array.isArray(parsed.eventsFunctionsExtensions)
      ? parsed.eventsFunctionsExtensions.length
      : 0,
    externalEventCount: Array.isArray(parsed.externalEvents)
      ? parsed.externalEvents.length
      : 0,
  };
}

export interface BinaryTriageReport {
  path: string;
  sizeBytes: number;
  byteLength: number;
  sha256: string;
  format: string;
  entropyBitsPerByte: number;
  extractedStringsSample: string[];
  extractedStringsCount: number;
  suspiciousStrings: string[];
}

export async function inspectBinaryTarget(
  rootDir: string,
  binaryPath: string,
): Promise<BinaryTriageReport> {
  const abs = path.resolve(rootDir, binaryPath);
  const buf = await fs.readFile(abs);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  let format = "UNKNOWN";
  if (buf.length >= 4) {
    if (
      buf[0] === 0x7f &&
      buf[1] === 0x45 &&
      buf[2] === 0x4c &&
      buf[3] === 0x46
    )
      format = "ELF";
    else if (buf[0] === 0x4d && buf[1] === 0x5a) format = "PE/COFF";
    else if (
      (buf[0] === 0xfe &&
        buf[1] === 0xed &&
        buf[2] === 0xfa &&
        (buf[3] === 0xce || buf[3] === 0xcf)) ||
      (buf[3] === 0xfe &&
        buf[2] === 0xed &&
        buf[1] === 0xfa &&
        (buf[0] === 0xce || buf[0] === 0xcf))
    )
      format = "Mach-O";
    else if (
      buf[0] === 0x00 &&
      buf[1] === 0x61 &&
      buf[2] === 0x73 &&
      buf[3] === 0x6d
    )
      format = "WASM";
  }
  const counts = new Array<number>(256).fill(0);
  for (let i = 0; i < buf.length; i++) counts[buf[i]]++;
  let entropy = 0;
  if (buf.length > 0) {
    for (const c of counts) {
      if (c > 0) {
        const p = c / buf.length;
        entropy -= p * Math.log2(p);
      }
    }
  }
  const asciiContent = buf.toString("latin1");
  const strMatches = asciiContent.match(/[ -~]{5,120}/g) ?? [];
  const suspiciousRe =
    /(?:https?:\/\/|\/bin\/|\/etc\/|cmd\.exe|powershell|VirtualAlloc|LoadLibrary|dlopen|ptrace|AES|RSA|flag\{|password|token|secret)/i;
  const suspiciousStrings = strMatches
    .filter((s) => suspiciousRe.test(s))
    .slice(0, 40);
  return {
    path: binaryPath,
    sizeBytes: buf.length,
    byteLength: buf.length,
    sha256,
    format,
    entropyBitsPerByte: +entropy.toFixed(3),
    extractedStringsSample: strMatches.slice(0, 60),
    extractedStringsCount: strMatches.length,
    suspiciousStrings,
  };
}

export const DOMAIN_PACK_ROLES: Record<
  string,
  {
    id: string;
    name: string;
    description: string;
    mode: string;
    system: string;
  }
> = {
  "specialist-godot": {
    id: "specialist-godot",
    name: "Godot 4 Architect",
    description:
      "Godot 4.x GDScript, Scene Tree (.tscn), Signal & Shader Specialist (consolidates godot-opencode).",
    mode: "subagent",
    system:
      "You are the Principal Godot 4.x Engine Architect (`specialist-godot`). Inspect `.tscn` scene trees via `tools.packs.godot_inspect_scene`, enforce typed GDScript 2.0 (`class_name`, `@export`, `@onready`), and verify signal connections cleanly.",
  },
  "specialist-gdevelop": {
    id: "specialist-gdevelop",
    name: "GDevelop 5 Specialist",
    description:
      "GDevelop 5 Event Sheet, Scene JSON (`game.json`), and Custom Behavior Specialist (consolidates GDevelop-Unlocked).",
    mode: "subagent",
    system:
      "You are the Principal GDevelop 5 Game Engineer (`specialist-gdevelop`). Inspect `game.json` via `tools.packs.gdevelop_inspect_game` before mutating scenes, objects, or event sheets, and preserve valid GDevelop JSON schema invariants.",
  },
  "specialist-re": {
    id: "specialist-re",
    name: "Reverse Engineering Analyst",
    description:
      "Binary Triage, Disassembly, Protocol Reconstruction & Security Analyst (consolidates opencode-rea).",
    mode: "subagent",
    system:
      "You are the Principal Reverse Engineering & Binary Intelligence Analyst (`specialist-re`). Use `tools.packs.re_inspect_binary` for static header, entropy, and string triage before deeper disassembly or decompilation.",
  },
};

export function registerDomainPackTools(editor: any, rootDir: string): void {
  editor.namespace({
    name: "packs",
    description:
      "Unified Heretek Domain Packs (`re` from opencode-rea, `godot` from godot-opencode, `gdevelop` from GDevelop-Unlocked). Dormant until auto-detected or activated via `/pack`.",
  });

  editor.add({
    name: "status",
    description:
      "List all domain packs (`re`, `godot`, `gdevelop`) and whether they are active in this workspace.",
    options: { namespace: "packs", codemode: true, pinned: false },
    input: { type: "object", properties: {} },
    output: { type: "object" },
    execute: async () => {
      const detection = await detectDomainPacks(rootDir);
      const packs = await listDomainPackStatus(rootDir);
      return {
        output: { detection, packs },
        content: JSON.stringify({ detection, packs }, null, 2),
      };
    },
  });

  editor.add({
    name: "godot_inspect_scene",
    description:
      "Parse a Godot 4.x `.tscn` scene file into its node hierarchy, attached scripts, and external resources.",
    options: { namespace: "packs", codemode: true, pinned: false },
    input: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to .tscn file" },
      },
      required: ["path"],
    },
    output: { type: "object" },
    execute: async (input: { path: string }) => {
      const res = await inspectGodotScene(rootDir, input.path);
      return { output: res, content: JSON.stringify(res, null, 2) };
    },
  });

  editor.add({
    name: "gdevelop_inspect_project",
    description:
      "Parse a GDevelop 5 `game.json` project into scenes, object counts, event counts, and extensions.",
    options: { namespace: "packs", codemode: true, pinned: false },
    input: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to game.json (default 'game.json')",
        },
      },
    },
    output: { type: "object" },
    execute: async (input: { path?: string }) => {
      const res = await inspectGDevelopProject(
        rootDir,
        input?.path ?? "game.json",
      );
      return { output: res, content: JSON.stringify(res, null, 2) };
    },
  });

  editor.add({
    name: "gdevelop_inspect_game",
    description:
      "Inspect a GDevelop 5 game.json project (alias of gdevelop_inspect_project).",
    options: { namespace: "packs", codemode: true, pinned: false },
    input: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to game.json (default 'game.json')",
        },
      },
    },
    output: { type: "object" },
    execute: async (input: { path?: string }) => {
      const res = await inspectGDevelopProject(
        rootDir,
        input?.path ?? "game.json",
      );
      return { output: res, content: JSON.stringify(res, null, 2) };
    },
  });

  editor.add({
    name: "re_inspect_binary",
    description:
      "Identify binary format (ELF, PE, Mach-O, WASM), byte size, and printable strings sample from a binary file.",
    options: { namespace: "packs", codemode: true, pinned: false },
    input: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to binary file" },
      },
      required: ["path"],
    },
    output: { type: "object" },
    execute: async (input: { path: string }) => {
      const res = await inspectBinaryTarget(rootDir, input.path);
      return { output: res, content: JSON.stringify(res, null, 2) };
    },
  });
}

export async function registerDomainPacks(
  ctx: any,
  rootDir: string,
): Promise<void> {
  const detection = await detectDomainPacks(rootDir);
  const ids: DomainPackId[] = [];
  if (detection.godot) ids.push("godot");
  if (detection.gdevelop) ids.push("gdevelop");
  if (detection.reverseEngineering) ids.push("re");
  if (ctx?.agent?.transform) {
    await ctx.agent.transform((editor: any) => {
      for (const [id, def] of Object.entries(DOMAIN_PACK_ROLES)) {
        const packId = id.replace("specialist-", "") as string;
        const active = ids.some(
          (p) => packId.startsWith(p) || (p === "re" && packId === "re"),
        );
        if (
          !active &&
          (detection.recommendedPacks.length > 0 || ids.length > 0)
        )
          continue;
        void active;
        editor.register?.(def);
      }
    });
  }
  if (ctx?.tool?.transform) {
    await ctx.tool.transform((editor: any) => {
      registerDomainPackTools(editor, rootDir);
    });
  }
}

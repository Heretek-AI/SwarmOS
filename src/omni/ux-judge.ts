import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Pillar 3: Quantitative 100-Point Visual Quality & UI/UX Judge (`src/omni/ux-judge.ts`)
 *
 * Evaluates live DOM geometry, typography, color contrast, spacing rhythm, alignment cohesion,
 * and interactive affordances on a deterministic 0–100 scale (`grade: "S" | "A" | "B" | "C" | "F"`).
 * UI tasks require `score >= 85` (`passed: true`) before sign-off.
 */

export interface UXRawMetrics {
  viewport: { width: number; height: number }
  horizontalOverflowPx: number
  elementOverflowCount: number
  collisionCount: number
  baselineJitterCount: number
  lowContrastCount: number
  descenderClipCount: number
  tinyTargetCount: number
  missingLabelCount: number
  uniqueFontSizes: number
  arbitraryInlineHexCount: number
  consoleErrorCount: number
  failedNetworkCount: number
}

export interface UXAxisScore {
  axis: string
  score: number
  maxScore: number
  notes: string[]
}

export interface UXScorecard {
  score: number
  grade: "S" | "A" | "B" | "C" | "F"
  passed: boolean
  viewport: { width: number; height: number }
  breakdown: {
    spatialLayout: { score: number; max: number }
    alignmentHarmony: { score: number; max: number }
    typographyAndContrast: { score: number; max: number }
    interactiveCompleteness: { score: number; max: number }
    designTokenDiscipline: { score: number; max: number }
    runtimeHealth: { score: number; max: number }
  }
  remediation: string[]
  remediations: string[]
  evaluatedAt: string
}


export const UX_SCORECARD_BROWSER_SCRIPT = `(() => {
  const vw = window.innerWidth || 1440;
  const vh = window.innerHeight || 900;
  const horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - vw - 2);

  let elementOverflowCount = 0;
  let siblingCollisionCount = 0;
  let baselineJitterCount = 0;
  let lowContrastCount = 0;
  let descenderClipCount = 0;
  let tinyTargetCount = 0;
  let unlabeledControlCount = 0;
  let offGridSpacingCount = 0;
  let totalSpacingSamples = 0;
  let proseLineLengthViolations = 0;
  let neonSlopGradientCount = 0;
  let occupiedArea = 0;

  const fontSizes = new Set();
  let maxHeadingSize = 16;
  let bodyFontSize = parseFloat(getComputedStyle(document.body).fontSize) || 16;

  function parseRgb(str) {
    const m = str && str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  }
  function luminance({ r, g, b }) {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  function contrastRatio(c1, c2) {
    const l1 = luminance(c1);
    const l2 = luminance(c2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function effectiveBg(el) {
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const bg = parseRgb(getComputedStyle(cur).backgroundColor);
      if (bg && bg.a >= 0.85) return bg;
      cur = cur.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  const all = Array.from(document.querySelectorAll('body *'));
  for (const el of all) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    if (el.parentElement === document.body) {
      occupiedArea += Math.min(rect.width, vw) * Math.min(rect.height, vh);
    }

    const fs = Math.round(parseFloat(style.fontSize) || 16);
    fontSizes.add(fs);
    if (/^H[1-3]$/.test(el.tagName)) maxHeadingSize = Math.max(maxHeadingSize, fs);

    if (style.backgroundImage && /linear-gradient|radial-gradient/i.test(style.backgroundImage)) {
      if (/rgba?\(\s*(?:1[2-9]\d|2[0-5]\d)\s*,\s*[0-6]\d\s*,\s*2[0-5]\d/i.test(style.backgroundImage)) {
        neonSlopGradientCount++;
      }
    }

    for (const prop of ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'gap']) {
      const val = Math.round(parseFloat(style[prop]) || 0);
      if (val > 0) {
        totalSpacingSamples++;
        if (val % 4 !== 0 && val % 6 !== 0) offGridSpacingCount++;
      }
    }

    if (
      el.scrollWidth > el.clientWidth + 2 &&
      style.overflowX !== 'auto' &&
      style.overflowX !== 'scroll' &&
      style.overflowX !== 'hidden'
    ) {
      elementOverflowCount++;
    }

    const isInteractive = el.matches('button, a, input, select, textarea, [role="button"]');
    if (isInteractive) {
      if (rect.width < 24 || rect.height < 24) tinyTargetCount++;
      const label = (el.textContent || '') + (el.getAttribute('aria-label') || '') + (el.getAttribute('title') || '') + (el.getAttribute('placeholder') || '');
      if (!label.trim() && !el.querySelector('svg, img')) unlabeledControlCount++;
    }

    const hasDirectText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (hasDirectText) {
      const fg = parseRgb(style.color);
      const bg = effectiveBg(el);
      if (fg && bg) {
        const ratio = contrastRatio(fg, bg);
        const minR = fs >= 19 ? 3.0 : 4.5;
        if (ratio < minR) lowContrastCount++;
      }
      const lh = parseFloat(style.lineHeight);
      if (lh && fs && lh / fs < 1.15 && style.overflow === 'hidden') descenderClipCount++;
      if (el.tagName === 'P' && (el.textContent || '').trim().length > 140 && rect.width > fs * 52) {
        proseLineLengthViolations++;
      }
    }

    const children = Array.from(el.children).filter((c) => {
      const cs = getComputedStyle(c);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.position !== 'absolute' && cs.position !== 'fixed';
    });
    for (let i = 0; i < children.length; i++) {
      const r1 = children[i].getBoundingClientRect();
      for (let j = i + 1; j < children.length; j++) {
        const r2 = children[j].getBoundingClientRect();
        const overlapX = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
        const overlapY = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
        if (overlapX > 2 && overlapY > 2) siblingCollisionCount++;
        const topDiff = Math.abs(r1.top - r2.top);
        if (topDiff > 0.5 && topDiff <= 3.5 && overlapX === 0) baselineJitterCount++;
      }
    }
  }

  return {
    viewport: { width: vw, height: vh },
    horizontalOverflowPx,
    elementOverflowCount,
    siblingCollisionCount,
    baselineJitterCount,
    lowContrastCount,
    descenderClipCount,
    tinyTargetCount,
    unlabeledControlCount,
    offGridSpacingCount,
    totalSpacingSamples,
    distinctFontSizes: fontSizes.size,
    headingToBodyRatio: +(maxHeadingSize / Math.max(12, bodyFontSize)).toFixed(2),
    proseLineLengthViolations,
    neonSlopGradientCount,
    viewportCoverageRatio: +Math.min(1, occupiedArea / Math.max(1, vw * vh)).toFixed(2)
  };
})()`;

export function scoreUXMetrics(metrics: UXRawMetrics): UXScorecard {
  const remediation: string[] = []
  let spatialScore = 25
  if (metrics.horizontalOverflowPx > 2) {
    spatialScore -= 15
    remediation.push(`Eliminate horizontal page overflow (${metrics.horizontalOverflowPx}px wider than ${metrics.viewport.width}px viewport).`)
  }
  if (metrics.elementOverflowCount > 0) {
    const deduct = Math.min(10, metrics.elementOverflowCount * 4)
    spatialScore -= deduct
    remediation.push(`Fix ${metrics.elementOverflowCount} overflowing container(s) where scrollWidth > clientWidth.`)
  }
  spatialScore = Math.max(0, spatialScore)

  let alignmentScore = 20
  if (metrics.collisionCount > 0) {
    const deduct = Math.min(14, metrics.collisionCount * 7)
    alignmentScore -= deduct
    remediation.push(`Resolve ${metrics.collisionCount} sibling bounding-box overlap collision(s).`)
  }
  if (metrics.baselineJitterCount > 0) {
    const deduct = Math.min(8, metrics.baselineJitterCount * 2)
    alignmentScore -= deduct
    remediation.push(`Align ${metrics.baselineJitterCount} sibling row element(s) with 1px-3.5px vertical baseline jitter.`)
  }
  alignmentScore = Math.max(0, alignmentScore)

  let typographyScore = 20
  if (metrics.lowContrastCount > 0) {
    const deduct = Math.min(14, metrics.lowContrastCount * 4)
    typographyScore -= deduct
    remediation.push(`Increase foreground/background contrast on ${metrics.lowContrastCount} low-contrast text element(s) to meet WCAG AA (>= 4.5:1).`)
  }
  if (metrics.descenderClipCount > 0) {
    const deduct = Math.min(6, metrics.descenderClipCount * 3)
    typographyScore -= deduct
    remediation.push(`Increase line-height (>= 1.15x font-size) on ${metrics.descenderClipCount} clipped heading/text container(s).`)
  }
  typographyScore = Math.max(0, typographyScore)

  let interactiveScore = 15
  if (metrics.tinyTargetCount > 0) {
    const deduct = Math.min(9, metrics.tinyTargetCount * 3)
    interactiveScore -= deduct
    remediation.push(`Enlarge ${metrics.tinyTargetCount} interactive control(s) smaller than 24x24px minimum target size.`)
  }
  if (metrics.missingLabelCount > 0) {
    const deduct = Math.min(6, metrics.missingLabelCount * 3)
    interactiveScore -= deduct
    remediation.push(`Add accessible text or aria-label to ${metrics.missingLabelCount} unlabeled button/input control(s).`)
  }
  interactiveScore = Math.max(0, interactiveScore)

  let tokenScore = 10
  if (metrics.uniqueFontSizes > 8) {
    const deduct = Math.min(5, (metrics.uniqueFontSizes - 8) * 2)
    tokenScore -= deduct
    remediation.push(`Consolidate typography scale (${metrics.uniqueFontSizes} distinct font sizes detected; target <= 7).`)
  }
  if (metrics.arbitraryInlineHexCount > 0) {
    const deduct = Math.min(5, metrics.arbitraryInlineHexCount)
    tokenScore -= deduct
    remediation.push(`Replace ${metrics.arbitraryInlineHexCount} hardcoded inline style color(s) with semantic CSS variables.`)
  }
  tokenScore = Math.max(0, tokenScore)

  let runtimeScore = 10
  if (metrics.consoleErrorCount > 0) {
    runtimeScore -= Math.min(6, metrics.consoleErrorCount * 6)
    remediation.push(`Fix ${metrics.consoleErrorCount} uncaught browser console error(s).`)
  }
  if (metrics.failedNetworkCount > 0) {
    runtimeScore -= Math.min(4, metrics.failedNetworkCount * 4)
    remediation.push(`Fix ${metrics.failedNetworkCount} failing 4xx/5xx network request(s).`)
  }
  runtimeScore = Math.max(0, runtimeScore)

  const totalScore = spatialScore + alignmentScore + typographyScore + interactiveScore + tokenScore + runtimeScore
  const grade: UXScorecard["grade"] = totalScore >= 95 ? "S" : totalScore >= 85 ? "A" : totalScore >= 75 ? "B" : totalScore >= 60 ? "C" : "F"
  const passed = totalScore >= 85 && metrics.horizontalOverflowPx <= 2 && metrics.collisionCount === 0 && metrics.consoleErrorCount === 0

  return {
    score: totalScore,
    grade,
    passed,
    viewport: metrics.viewport,
    breakdown: {
      spatialLayout: { score: spatialScore, max: 25 },
      alignmentHarmony: { score: alignmentScore, max: 20 },
      typographyAndContrast: { score: typographyScore, max: 20 },
      interactiveCompleteness: { score: interactiveScore, max: 15 },
      designTokenDiscipline: { score: tokenScore, max: 10 },
      runtimeHealth: { score: runtimeScore, max: 10 },
    },
    remediation,
    remediations: remediation,
    evaluatedAt: new Date().toISOString(),
  }
}


export async function saveUXScorecard(
  rootDir: string,
  scorecard: UXScorecard,
): Promise<string> {
  const dir = path.join(rootDir, ".opencode", "artifacts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "ux-scorecard.json");
  await fs.writeFile(file, JSON.stringify(scorecard, null, 2), "utf8");
  return file;
}

export async function loadLatestUXScorecard(
  rootDir: string,
): Promise<UXScorecard | null> {
  try {
    const raw = await fs.readFile(
      path.join(rootDir, ".opencode", "artifacts", "ux-scorecard.json"),
      "utf8",
    );
    return JSON.parse(raw) as UXScorecard;
  } catch {
    return null;
  }
}

export function registerUXJudgeTools(editor: any, rootDir: string): void {
  editor.add({
    name: "get_ux_scorecard_script",
    description:
      "Return the JavaScript expression string to pass to `tools.browser.evaluate({ tabID, script })` to collect raw 6-axis UI/UX metrics for `tools.ui.score_ux`.",
    options: { namespace: "ui", codemode: true, pinned: true },
    input: { type: "object", properties: {} },
    output: { type: "object" },
    execute: async () => ({
      output: { script: UX_SCORECARD_BROWSER_SCRIPT },
      content: UX_SCORECARD_BROWSER_SCRIPT,
    }),
  });

  editor.add({
    name: "score_ux",
    description:
      "Compute a deterministic 0–100 Visual Quality & UI/UX Scorecard (`grade: S|A|B|C|F`, `passed: score >= 85`) from raw browser metrics returned by `get_ux_scorecard_script`, and save it to `.opencode/artifacts/ux-scorecard.json`.",
    options: { namespace: "ui", codemode: true, pinned: true },
    input: {
      type: "object",
      properties: {
        metrics: {
          type: "object",
          description:
            "Raw metrics object returned by evaluating get_ux_scorecard_script",
        },
        threshold: {
          type: "number",
          description: "Minimum passing score (default 85)",
        },
      },
      required: ["metrics"],
    },
    output: { type: "object" },
    execute: async (input: { metrics: UXRawMetrics; threshold?: number }) => {
      const card = scoreUXMetrics(input.metrics);
      await saveUXScorecard(rootDir, card);
      return {
        output: card,
        content: `UX Scorecard: ${card.score}/100 (Grade ${card.grade}) — ${card.passed ? "PASSED" : "FAILED"}\n${card.remediation.map((r) => "- " + r).join("\n")}`,
      };
    },
  });
}

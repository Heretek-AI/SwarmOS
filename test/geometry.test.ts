import { describe, expect, it } from "bun:test"
import { DOM_GEOMETRY_AUDIT_SCRIPT } from "../src/geometry/audit-script.js"
import { STANDARD_VIEWPORTS } from "../src/geometry/viewports.js"

describe("SwarmOS Visual & DOM Geometry Engine", () => {
  it("provides standard responsive viewports", () => {
    expect(STANDARD_VIEWPORTS.mobile.width).toBe(375)
    expect(STANDARD_VIEWPORTS.mobile.height).toBe(812)
    expect(STANDARD_VIEWPORTS.tablet.width).toBe(768)
    expect(STANDARD_VIEWPORTS.desktop.width).toBe(1440)
    expect(STANDARD_VIEWPORTS.wide.width).toBe(1920)
  })

  it("exports a syntactically valid DOM geometry audit script", () => {
    expect(typeof DOM_GEOMETRY_AUDIT_SCRIPT).toBe("string")
    expect(DOM_GEOMETRY_AUDIT_SCRIPT.length).toBeGreaterThan(100)

    // Verify syntax compiles without errors
    const fn = new Function(DOM_GEOMETRY_AUDIT_SCRIPT)
    expect(typeof fn).toBe("function")
  })

  it("evaluates clean DOM without defects in simulated environment", () => {
    const mockWindow = {
      innerWidth: 1440,
      innerHeight: 900,
    }

    const mockDocument = {
      documentElement: { scrollWidth: 1440 },
      querySelectorAll: () => [],
    }

    const runner = new Function(
      "window",
      "document",
      "getComputedStyle",
      `return ${DOM_GEOMETRY_AUDIT_SCRIPT}`,
    )

    const result = runner(mockWindow, mockDocument, () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
    }))

    expect(result.viewport.width).toBe(1440)
    expect(result.defectCount).toBe(0)
    expect(result.passed).toBe(true)
    expect(result.defects).toEqual([])
  })

  it("detects horizontal page overflow when document exceeds viewport", () => {
    const mockWindow = {
      innerWidth: 375,
      innerHeight: 812,
    }

    const mockDocument = {
      documentElement: { scrollWidth: 420 }, // 420 > 375 + 2
      querySelectorAll: () => [],
    }

    const runner = new Function(
      "window",
      "document",
      "getComputedStyle",
      `return ${DOM_GEOMETRY_AUDIT_SCRIPT}`,
    )

    const result = runner(mockWindow, mockDocument, () => ({}))
    expect(result.passed).toBe(false)
    expect(result.defectCount).toBe(1)
    expect(result.defects[0].kind).toBe("page-horizontal-overflow")
    expect(result.defects[0].detail).toContain("420px")
  })

  it("detects tiny interactive targets (< 24px)", () => {
    const mockWindow = {
      innerWidth: 1440,
      innerHeight: 900,
    }

    const mockButton = {
      tagName: "BUTTON",
      id: "close-btn",
      className: "btn-icon",
      matches: (selector: string) => selector.includes("button"),
      childNodes: [],
      children: [],
      getBoundingClientRect: () => ({ width: 18, height: 18, top: 10, bottom: 28, left: 10, right: 28 }),
    }

    const mockDocument = {
      documentElement: { scrollWidth: 1440 },
      querySelectorAll: () => [mockButton],
    }

    const runner = new Function(
      "window",
      "document",
      "getComputedStyle",
      `return ${DOM_GEOMETRY_AUDIT_SCRIPT}`,
    )

    const result = runner(mockWindow, mockDocument, () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      overflowX: "hidden",
    }))

    expect(result.passed).toBe(false)
    const tinyDefect = result.defects.find((d: any) => d.kind === "tiny-interactive-target")
    expect(tinyDefect).toBeDefined()
    expect(tinyDefect?.detail).toContain("18x18px")
  })
})

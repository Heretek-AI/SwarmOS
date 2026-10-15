#!/usr/bin/env bun
// Usage: bun scripts/check-host-contract.ts <path-to-opencode-v2-checkout>
import { checkHostContract, formatContractCheck } from "../src/host/contract-check.js"

const sourceDir = process.argv[2] ?? process.env.OPENCODE_V2_SRC
if (!sourceDir) {
  console.error("Usage: bun scripts/check-host-contract.ts <path-to-opencode-v2-checkout> (or set OPENCODE_V2_SRC)")
  process.exit(2)
}

const report = await checkHostContract(sourceDir)
console.log(formatContractCheck(report))
process.exit(report.ok ? 0 : 1)

#!/usr/bin/env node
/**
 * dsh-switch one-shot installer — no pnpm, no network.
 *
 * Why this exists: `dsh plugin add` forwards to pnpm, and a profile that
 * already contains a git dependency (e.g. aegis) can hang pnpm's resolution
 * forever. This script performs the same registration the CLI would emit,
 * directly on the profile manifest:
 *
 *   1. locate DSH_HOME (env override wins; else standard per-OS locations);
 *   2. validate <DSH_HOME>/profiles/<profile>/package.json parses as JSON;
 *   3. copy this package (lib/, vendored node_modules/, cordis.patch.yml,
 *      manifests) into <profile>/node_modules/dsh-switch/ — whole replace;
 *   4. register in TWO places (both are required by host reconcile):
 *        dependencies["dsh-switch"] = "file:./node_modules/dsh-switch"
 *        dsh.profile.bundles       += "dsh-switch"   (append, dedup)
 *      written back as UTF-8 WITHOUT BOM (PowerShell Set-Content utf8 BOM
 *      breaks the host's JSON.parse).
 *   5. print the restart reminder.
 *
 * It deliberately does NOT touch dsh.desktop.generationProjection — that is
 * the marketplace/staging private layer; hand-merged installs must not forge
 * projection entries.
 *
 * Usage:
 *   node install.mjs [--profile web] [--home <DSH_HOME>] [--dry-run]
 * Idempotent: re-running replaces the copy and leaves the manifest unchanged.
 */
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

const PKG_NAME = "dsh-switch"
const here = path.dirname(fileURLToPath(import.meta.url))

/* ---------------------------------------------------------------- */
/*  Args                                                            */
/* ---------------------------------------------------------------- */

function parseArgs(argv) {
  const out = { profile: "web", home: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--profile") out.profile = argv[++i]
    else if (a === "--home") out.home = argv[++i]
    else if (a === "--dry-run") out.dryRun = true
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node install.mjs [--profile web] [--home <DSH_HOME>] [--dry-run]")
      process.exit(0)
    } else {
      fail(`unknown argument: ${a}`)
    }
  }
  if (!out.profile) fail("--profile requires a value")
  // Refuse anything that could escape the profiles/ directory (path traversal)
  // or sneak in a nested path: a profile name is a single directory name.
  if (/[\\/]/.test(out.profile) || out.profile === "." || out.profile === "..") {
    fail(`invalid profile name: ${out.profile}`)
  }
  return out
}

function fail(msg) {
  console.error(`[dsh-switch install] ERROR: ${msg}`)
  process.exit(1)
}

/* ---------------------------------------------------------------- */
/*  Step 1: locate DSH_HOME                                         */
/* ---------------------------------------------------------------- */

function candidateHomes() {
  const homes = []
  if (process.env.DSH_HOME) homes.push(process.env.DSH_HOME)
  if (process.platform === "win32") {
    if (process.env.APPDATA) homes.push(path.join(process.env.APPDATA, "dsh-desktop", "harness"))
  } else if (process.platform === "darwin") {
    homes.push(path.join(os.homedir(), "Library", "Application Support", "dsh-desktop", "harness"))
  } else {
    homes.push(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "dsh-desktop", "harness"))
  }
  // Legacy layouts seen in the wild.
  homes.push(path.join(os.homedir(), ".dsh"))
  return homes.filter(Boolean)
}

function findHome(explicit) {
  if (explicit) {
    if (!fs.existsSync(path.join(explicit, "profiles"))) fail(`--home ${explicit} has no profiles/ directory`)
    return explicit
  }
  for (const c of candidateHomes()) {
    try {
      if (fs.statSync(path.join(c, "profiles")).isDirectory()) return c
    } catch {}
  }
  fail(`could not locate DSH_HOME (tried: ${candidateHomes().join(", ")}). Pass --home <path>.`)
}

/* ---------------------------------------------------------------- */
/*  Steps 2–4: profile manifest                                     */
/* ---------------------------------------------------------------- */

function readManifest(manifestPath) {
  let raw
  try {
    raw = fs.readFileSync(manifestPath, "utf8")
  } catch (e) {
    fail(`cannot read ${manifestPath}: ${e.message}`)
  }
  let doc
  try {
    doc = JSON.parse(raw)
  } catch (e) {
    fail(`${manifestPath} is not valid JSON — refusing to write: ${e.message}`)
  }
  return doc
}

/** Serialize exactly like the host would: 2-space JSON, LF, trailing newline, no BOM. */
function serialize(doc) {
  return JSON.stringify(doc, null, 2).replace(/\r\n/g, "\n") + "\n"
}

function assertNoBom(buf, where) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    fail(`regression guard: ${where} was written with a UTF-8 BOM`)
  }
}

function writeManifest(manifestPath, doc, dryRun) {
  const text = serialize(doc)
  if (dryRun) {
    console.log(`[dry-run] would write ${manifestPath}:`)
    console.log(text.split("\n").map((l) => "  | " + l).join("\n"))
    return
  }
  const tmp = manifestPath + `.tmp-${process.pid}`
  const buf = Buffer.from(text, "utf8")
  assertNoBom(buf, manifestPath)
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, manifestPath) // atomic-ish replace
  assertNoBom(fs.readFileSync(manifestPath), manifestPath) // post-write verify
}

/* ---------------------------------------------------------------- */
/*  Step 3: copy the package body                                   */
/* ---------------------------------------------------------------- */

// What ships inside an installed bundle. Everything else in the repo
// (test/, .git/, scratch dirs, this script's docs-only siblings) stays out.
const COPY_ITEMS = [
  "package.json",
  "cordis.patch.yml",
  "README.md",
  "README.zh-CN.md",
  "CHANGELOG.md",
  "lib",
  "install.mjs",
]
const VENDORED_ROOTS = ["node_modules/@deepseek-ai/schemastery", "node_modules/@deepseek-ai/cosmokit", "node_modules/@standard-schema/spec"]

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === ".DS_Store" || entry.name.endsWith(".log")) continue
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyTree(s, d)
    else fs.copyFileSync(s, d)
  }
}

function installIntoProfile(profileDir, dryRun) {
  const target = path.join(profileDir, "node_modules", PKG_NAME)
  const manifestPath = path.join(profileDir, "package.json")
  const doc = readManifest(manifestPath)

  // Sanity: the source really is this package.
  const srcPkg = readManifest(path.join(here, "package.json"))
  if (srcPkg.name !== PKG_NAME) fail(`source package.json name is "${srcPkg.name}", expected "${PKG_NAME}"`)

  // --- copy (whole replace) ---
  if (dryRun) {
    console.log(`[dry-run] would replace ${target}\\ and register in ${manifestPath}`)
  } else {
    fs.rmSync(target, { recursive: true, force: true })
    fs.mkdirSync(target, { recursive: true })
    for (const item of COPY_ITEMS) {
      const s = path.join(here, item)
      if (!fs.existsSync(s)) continue
      if (fs.statSync(s).isDirectory()) copyTree(s, path.join(target, item))
      else {
        fs.mkdirSync(path.dirname(path.join(target, item)), { recursive: true })
        fs.copyFileSync(s, path.join(target, item))
      }
    }
    // Vendored deps may sit next to the bundle (git clone) or one level up
    // (npm-installed copy inside a profile node_modules tree — pnpm layout).
    const vendorRoots = [here, path.join(here, ".."), path.join(here, "..", "..")]
      .map((root) => path.join(root, "node_modules"))
      .filter((nm) => fs.existsSync(nm))
    for (const rel of VENDORED_ROOTS) {
      let found = null
      for (const nm of vendorRoots) {
        const cand = path.join(nm, rel.replace(/^node_modules\//, ""))
        if (fs.existsSync(cand)) { found = cand; break }
      }
      if (!found) {
        // npm tarballs cannot carry node_modules/ (npm forces it out), so an
        // `npm install`-delivered copy legitimately has no vendored tree here.
        // Since v1.7.0 the same packages are declared as regular dependencies,
        // so the profile's own node_modules is guaranteed to hold them — the
        // host half resolves schemastery through normal Node lookup there.
        console.log(`[dsh-switch install] note: ${rel} not vendored here; the profile's npm-installed copy of the dependency is used.`)
        continue
      }
      copyTree(found, path.join(target, rel))
    }
  }

  // --- register: dependencies + dsh.profile.bundles (both required) ---
  doc.dependencies ??= {}
  doc.dependencies[PKG_NAME] = `file:./node_modules/${PKG_NAME}`
  doc.dsh ??= {}
  doc.dsh.profile ??= {}
  const bundles = Array.isArray(doc.dsh.profile.bundles) ? doc.dsh.profile.bundles : []
  if (!bundles.includes(PKG_NAME)) bundles.push(PKG_NAME)
  doc.dsh.profile.bundles = bundles
  // Explicitly untouched: doc.dsh.desktop?.generationProjection.

  writeManifest(manifestPath, doc, dryRun)
  return { target, version: srcPkg.version }
}

/* ---------------------------------------------------------------- */
/*  Main                                                            */
/* ---------------------------------------------------------------- */

const args = parseArgs(process.argv.slice(2))
const home = findHome(args.home)
const profileDir = path.join(home, "profiles", args.profile)
if (!fs.existsSync(profileDir)) fail(`profile directory not found: ${profileDir} (available: ${fs.readdirSync(path.join(home, "profiles")).join(", ")})`)

const { target, version } = installIntoProfile(profileDir, args.dryRun)

console.log(`[dsh-switch install] v${version} -> ${target}${args.dryRun ? "  (dry-run: nothing written)" : ""}`)
if (!args.dryRun) {
  console.log("[dsh-switch install] Registered in profile manifest (dependencies + dsh.profile.bundles).")
  console.log("[dsh-switch install] RESTART DSH Desktop (full process quit, not page reload) for the host half to load.")
  console.log("[dsh-switch install] After restart, reload the browser page once so the client bundle is fetched.")
}

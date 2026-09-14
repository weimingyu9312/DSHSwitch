# Changelog

All notable changes to `dsh-switch` are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-09-14

### Fixed
- Registry installs no longer break at plugin load time. `@deepseek-ai/schemastery`,
  `@deepseek-ai/cosmokit` and `@standard-schema/spec` moved from optional peers
  (satisfied only by the vendored tree) to exact-pinned regular `dependencies`, so
  `npm install dsh-switch` fetches them into the profile's `node_modules` and the
  static `import z from "@deepseek-ai/schemastery"` in `lib/index.js` resolves.
- `package.json` `files`: removed the three `node_modules/...` entries — npm forces
  `node_modules` out of tarballs, so they were inert and misleading.
- `install.mjs` fallback note now reflects the guaranteed npm-installed copy
  (previously claimed "relying on the profile's dependency resolution" without
  verification, which was a silent crash on registry installs).
- Removed the obsolete "registry install customers must prefer a git clone" caveat
  from both READMEs; registry installs are now self-sufficient.

### Security / publishing
- Added `.github/workflows/publish.yml`: trusted-publishing (OIDC) release flow
  triggered by `v*` tag pushes; no long-lived npm tokens on CI.

## [1.6.0] - 2026-09-14

### Added
- `install.mjs`: pnpm-free one-shot installer (locates DSH_HOME, copies the
  bundle incl. vendored deps into the profile, registers `dependencies` +
  `dsh.profile.bundles` as UTF-8 without BOM; idempotent; never touches
  `generationProjection`).
- `CHANGELOG.md` split out of the READMEs.
- Settings panel footer note explaining the two-half hot-reload asymmetry.
- Compatibility section in both READMEs (verified host contract: slots
  `conversation.input.left` / `settings.section`, `inputActions` face;
  DSH Desktop 0.8.2) and a three-tier installation chapter
  (marketplace → installer script → manual merge).

### Changed
- Composer buttons render as text labels only — the ⌨ prefix icon was removed.
- `package.json`: dropped the redundant `dsh.client.inject` edges on host-owned
  bundles (`inject` is an arrival-order constraint; this plugin's factory only
  requires the platform seed word `react`). `dsh.client` is now `{ "platform": "web" }`.
- Peer dependencies pinned to the host release they are vendored against:
  `@deepseek-ai/schemastery` `3.18.2` (was `^3.18.1`), plus the transitive
  runtime dep `@deepseek-ai/cosmokit` `1.8.3` declared explicitly.
- `files` whitelist added so a registry tarball ships lib/, patch manifest,
  installers and docs only. (npm strips every `node_modules/` path from
  tarballs — the vendored tree cannot ship via the registry; documented in
  both READMEs, and `install.mjs` now tolerates its absence by falling back
  to the profile's own dependency resolution.)

## [1.5.1] - 2026-09-14

### Changed
- Vendored Host runtime closure (`@deepseek-ai/schemastery` + deps) committed
  to the repository so fresh git clones work out of the box; synced to
  schemastery 3.18.2 / cosmokit 1.8.3.

## [1.5.0]

### Removed
- The `toggle` switch-command type: host commands are never executed anymore,
  only one-shot insertion remains. Legacy toggle buttons migrate automatically.

## [1.4.0]

### Removed
- The `persistent` sticky-insertion type and its arming registry.

### Changed
- Insertion goes through the host `setDraft` channel.

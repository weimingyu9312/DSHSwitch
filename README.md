# dsh-switch

[中文文档](README.zh-CN.md)

DSH plugin that adds customizable switch buttons to the left of the chat composer in the DSH Web GUI. Clicking a button inserts a slash command into the input box; you then fill in any arguments and send manually.

## Features

Buttons have a single behavior (`mode: "insert"`, one-shot insertion): each click inserts `/command ` **before** the existing content of the input box (at the beginning when it is empty); click again to insert again. Nothing is executed on the host, there is no persistent state, and the visual style is blue text + a ⌨ icon.

- **Settings panel**: Settings → "Switch Buttons" — add, edit, delete, enable/disable buttons; the bottom of the panel shows a live bilingual (zh/en) reference of the slash commands available in the current session
- **Persistent config**: stored under the `dsh-switch` namespace of the Host-side `settings.yaml`, survives browser cache clears; localStorage is only a first-paint cache
- **Automatic migration of legacy configs**: the old `toggle` (switch command) and `persistent` (sticky insertion) button types were removed; existing buttons are downgraded to one-shot insertion on read (the `command` is kept, `commandOff`/`projection` are dropped), so they never disappear

## Installation

```bash
# Local development install (junction link, edits take effect immediately)
dsh plugin --profile web add link:D:\DSHPlugin\DSHSwitch

# Or install from git (public repo)
dsh plugin --profile web add "github:weimingyu9312/DSHSwitch#main"
```

The Host-side dependency `@deepseek-ai/schemastery` is vendored as real directories under `node_modules/`. Do **not** run `npm install`: when the plugin is installed into a profile via a junction, Node cannot resolve the profile's own `node_modules`, and switching to symlinks creates a reparse chain that breaks startup. For external distribution these three packages need separate handling (see the header comment in `lib/index.js`).

## Usage

### Configuring buttons

1. Open the DSH Web GUI → Settings → Switch Buttons
2. Click "+ Add button"
3. Each card has two fields:
   - **Label**: button text (e.g. "Plan Off")
   - **Slash command**: the command to insert (e.g. `/plan off`)
4. Toggle the switch to enable/disable; click × to delete

### Default configuration

```json
{
  "buttons": [
    { "id": "plan", "label": "Plan", "command": "/plan", "mode": "insert", "enabled": true },
    { "id": "plan-off", "label": "Plan Off", "command": "/plan off", "mode": "insert", "enabled": true }
  ]
}
```

Defaults apply only while the Host config has no `buttons` key yet; once you change anything, the stored value wins. To restore defaults, delete the `dsh-switch:` section from `settings.yaml`, clear the browser's localStorage, and restart.

### Configuration fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique button identifier |
| `label` | string | Button display text |
| `command` | string | Slash command to insert |
| `mode` | string | Fixed `insert`; legacy values (`toggle`/`persistent`/missing) are migrated automatically on read |
| `enabled` | boolean | Whether the button is enabled |

### Verification

1. Switch buttons appear to the left of the composer
2. Click Plan: with an empty input → `/plan ` appears at the start; with existing content (e.g. `research pricing`) → it becomes `/plan research pricing`; Enter sends normally
3. The settings panel footer shows the slash-command reference list

### When a command doesn't land in the input box

Ask the plugin itself what it sees, from the browser console (F12):

```js
__dshSwitch.state()                // scopeBound / buttons / faces / draft / editorFound / editorPhase
__dshSwitch.log()                  // last 40 insertions: kind(setDraft|dom|no-editor|skip:stale-snapshot|…)/text/before/after
__dshSwitch.insert("/plan")        // run one insertion manually, check whether the draft gets the command
```

Common symptoms: `faces: []` = the host slot did not deliver `inputActions` (older host version); insertion falls back to the DOM channel with reduced reliability. `editorFound: false` = the composer DOM changed and neither channel can write. Enable verbose logging with `localStorage.setItem("dsh-switch-debug","1")`.

## Architecture at a glance

| File | Responsibility |
|------|----------------|
| `lib/index.js` | Host half: registers the `dsh-switch` settings namespace (a single `buttons` key) |
| `lib/client.js` | Client half: button bar (injected into the `conversation.input.left` slot), settings panel (injected into the `settings.section` slot), config read/write and migration |

The sole insertion behavior is a **draft write** (never command execution): the preferred path is the host composer face's `inputActions.setDraft(command + existing draft)` — committed through the editor's own state, so it cannot be wiped by Lexical reconciliation. When the draft contains citation chips, the commit machine is locked, or the session has no face, it falls back to `execCommand('insertText')`. Config changes render optimistically, mirror to localStorage, and persist via `scope.set("buttons")` on the Host.

## Development

This repository is linked into the profile via a junction, so editing workspace files takes effect directly:

- **Client half (`lib/client.js`)**: just refresh the browser page, no service restart needed
- **Host half (`lib/index.js`, `package.json`)**: restart the host process (`dsh web`, Ctrl+C and rerun / fully restart DSH Desktop)

```bash
node test/client.test.cjs   # or npm test — 32 jsdom behavior tests (migration rules, face routing, chip/phase gates, retired-symbol regressions)
node test/preview.cjs       # offline-render the settings panel to .preview/preview-{dark,light}.html for layout review
```

### Changelog

- **v1.5.0** — removed the `toggle` switch-command type: host commands are never executed, only one-shot insertion remains; legacy toggle buttons migrate automatically
- **v1.4.0** — removed the `persistent` sticky-insertion type and its arming registry; insertion now goes through the host `setDraft` channel

## License

MIT

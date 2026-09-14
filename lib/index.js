/**
 * dsh-switch — Host half.
 *
 * Owns the persistent settings namespace for the switch buttons.
 * The configuration lives in the Host settings document (settings.yaml),
 * which survives GUI restarts, port changes and browser-storage wipes.
 * The client half reads/writes it through `ctx.settingsScope`.
 *
 * Since v1.4.0 the namespace holds the button list only. The retired type-3
 * "persistent" mode kept its arming ids in a second key, `armed`; the client
 * no longer reads or writes it, and schemastery resolves a stored section that
 * still carries the key (its object typing is loose), so the upgrade needs no
 * document migration — the leftover value is simply ignored.
 *
 * Dependency note: `@deepseek-ai/schemastery` (the DSH fork of schemastery, the
 * same copy the harness itself ships) is vendored as a real directory under
 * `node_modules/`. The plugin is installed into the DSH profile as a *junction*
 * to this folder, so Node's ESM lookup walks up from `D:\DSHPlugin\...` and can
 * never see the profile's own `node_modules`. Linking the dependency onward into
 * the profile tree instead creates a 4-level reparse chain that intermittently
 * fails at startup (`Cannot find package 'schemastery'`) and makes the desktop
 * app's plugin-recovery bail out with `ELOOP`. Keep the dependency vendored.
 */
import z from "@deepseek-ai/schemastery"

export const name = "dsh-switch"

/** The user-settings namespace holding the switch-button configuration. */
export const SWITCH_PREFS_NS = "dsh-switch"

/**
 * First-run defaults. They only apply while the stored section has no
 * `buttons` key — once the user writes anything (including an empty list),
 * the stored value wins and removed buttons never come back.
 */
export const DEFAULT_BUTTONS = [
  { id: "plan", label: "Plan", command: "/plan", commandOff: "/plan off", projection: "plan", mode: "toggle", enabled: true },
  { id: "agent-teams", label: "Teams", command: "/agent-teams", mode: "insert", enabled: true },
]

const PrefsSchema = z.object({
  buttons: z.array(z.dict(z.any())).default(DEFAULT_BUTTONS),
})

export function apply(ctx) {
  ctx.inject(["settings"], (sctx) => {
    sctx.settings.register(SWITCH_PREFS_NS, PrefsSchema)
  })
}

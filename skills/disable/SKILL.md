---
name: disable
description: Take a mod out of the Hub and stop it running, or turn off just its pane, band, toasts or status. Keeps its code so add can bring it back. Use when the user wants to remove, hide, disable or turn off a mod, its pane, or its band, toasts or status. To delete it, use uninstall.
---

The kit folder is two levels up from this skill's base directory. The home is `${MODHUB_HOME:-$HOME/.claude/modhub}`; `mods.json`, `layout.config.ts`, `sources/` and the built Hub (`hub/`) live there. Edit only files in the home, never in the kit. Run sync as `node <kit>/sync.mjs`.

Input: a mod name or a slot title, plus an optional output: `disable <mod> [pane|band|toasts|status]`.

1. The mod must be in `<home>/mods.json`. If its entry already has `"enabled": false`, say it is already disabled and stop.
2. With an output named, turn off just that one and keep the mod running:
   - pane: remove all of the mod's slots from `LAYOUT.slots` in `<home>/layout.config.ts`.
   - band, toasts or status: remove the mod from `LAYOUT.bands`, `LAYOUT.toasts` or `LAYOUT.status`.
   - Say if the mod was not showing that output. Run `node <kit>/sync.mjs --layout`, then go to step 6.
3. With no output named, remove all of the mod's slots from `LAYOUT.slots`. Leave the mod in `bands`, `toasts` and `status`, so its choices survive a later add.
4. Add `"enabled": false` to the mod's entry in `<home>/mods.json`, keeping the one-entry-per-line format.
5. Run `node <kit>/sync.mjs`. It leaves the mod out of the built Hub and unwires it. Tell the user the mod's commands, band, toasts and timers have stopped. Its code stays (in `<home>/sources/<name>/` if downloaded, or in its local folder) and its saved `$.store` data stays too. The add skill turns it back on; the uninstall skill deletes it.
6. Run `claude plugin validate <home>/hub` and report the result. Do not run `claude plugin test`: it assumes the default slots.

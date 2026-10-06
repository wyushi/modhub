---
name: add
description: Show an installed mod's pane, band, toasts or status in the Hub, and turn the mod back on if it was disabled. Use when the user wants to add, show, place or re-enable a mod, its pane, or its band, toasts or status. To bring in a new mod, use install first.
---

The kit folder is two levels up from this skill's base directory. The home is `${MODHUB_HOME:-$HOME/.claude/modhub}`; `mods.json`, `layout.config.ts`, `sources/` and the built Hub (`hub/`) live there. Edit only files in the home, never in the kit. Run sync as `node <kit>/sync.mjs`.

Input: a mod, plus an optional output: `add <mod> [pane|band|toasts|status]`. For a pane, also an optional pane id, title, position and rows.

1. The mod must be in `<home>/mods.json`. If it is not, offer to run the install skill (with the user's git URL or folder), and continue with add afterwards. If the entry has `"enabled": false`, remove that field, run sync and say the mod is enabled again.
2. Read the mod's outputs from the `outputs:` line sync prints for it (run `node <kit>/sync.mjs` for it if step 1 did not). If an output was named and the mod does not have it, say so and stop.
3. With band, toasts or status named, add the mod to `LAYOUT.bands`, `LAYOUT.toasts` or `LAYOUT.status` in `<home>/layout.config.ts` (at the end, unless the user names a position; skip it if already listed). Run `node <kit>/sync.mjs --layout`, which copies just the layout into the built Hub. Go to step 6.
4. With pane named, or no output named, do the pane steps. If the mod draws no pane, enabling it was the whole job: say it runs without a slot and stop. Otherwise find the pane ids with `claude plugin validate <home>/hub/vendor/<mod>`: look for `ui.render{component=Pane, requestId=<id>}`. If there are several, ask which one. Ask for a title, defaulting to the id in title case, and a position, defaulting to last. `rows` is optional.
5. Edit `LAYOUT.slots` in `<home>/layout.config.ts`: add `{ mod: '<mod>', pane: '<id>', title: '<title>' }` (plus `rows` if given) at that position. Run `node <kit>/sync.mjs --layout`. Say the change appears on save or after `/reload-plugins`.
6. Run `claude plugin validate <home>/hub` and report the result. Do not run `claude plugin test`: it assumes the default slots.

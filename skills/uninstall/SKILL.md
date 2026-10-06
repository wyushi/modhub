---
name: uninstall
description: Stop hosting a mod: removes it from mods.json, every slot and every output list, and deletes it if it was downloaded. Use when the user wants to uninstall or stop running a mod. To stop it but keep its code, use disable.
---

The kit folder is two levels up from this skill's base directory. The home is `${MODHUB_HOME:-$HOME/.claude/modhub}`; `mods.json`, `layout.config.ts`, `sources/` and the built Hub (`hub/`) live there. Edit only files in the home, never in the kit. Run sync as `node <kit>/sync.mjs`.

Input: a mod name. It works on a disabled mod too.

1. Find the mod's entry in `<home>/mods.json` (the one whose plugin name matches; for a downloaded mod its path is `sources/<name>`). Remove the entry. Remove the mod's slots from `LAYOUT.slots`, and its name from `LAYOUT.bands`, `LAYOUT.toasts` and `LAYOUT.status`, in `<home>/layout.config.ts`.
2. Delete `<home>/sources/<name>/` only if the entry's path is under `sources/`. Never delete a local source folder; removing the entry is enough.
3. Run `node <kit>/sync.mjs`. It rebuilds the Hub without the mod. Tell the user the mod's `$.store` data is not removed.
4. Run `claude plugin validate <home>/hub` and report the result. Do not run `claude plugin test`: it assumes the default three slots.

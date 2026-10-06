---
name: install
description: Install a mod into the Hub from a git URL or a local folder, so it runs. Use when the user wants to install, download or host a new mod.
---

The kit folder is two levels up from this skill's base directory. The home is `${MODHUB_HOME:-$HOME/.claude/modhub}`; `mods.json`, `layout.config.ts`, `sources/` and the built Hub (`hub/`) live there. Edit only files in the home, never in the kit. Run sync as `node <kit>/sync.mjs`.

Input: a git URL (with an optional subfolder and ref) or a local folder path.

For a git URL, follow steps 1 to 5. For a local folder, follow the steps under "Local folder" instead of 1, 2 and 5; steps 3 and 4 apply to both.

1. Make a temp dir with `mktemp -d`. Shallow-clone into it with `git clone --depth 1 <url> <dir>`, adding `--branch <ref>` if a ref was given. Record the commit with `git -C <dir> rev-parse HEAD`.
2. Find the mod folders: those holding both `.claude-plugin/plugin.json` and `hooks/hooks.json`. If there are several and no subfolder was given, ask which one.
3. Read the plugin `name` from the mod's `.claude-plugin/plugin.json`. Stop if it is `modhub` or already in `<home>/mods.json`.
4. Run `claude plugin validate <mod folder>`. Show the user the hooks and `$` calls it lists. Also list the mod's commands: its `command.run{command=...}` hooks. Flag anything the README's "What a hosted mod can't do" section names: `turn.step`, `process.spawn`, `userConfig`, `ui.press` with `requestId`, and state of other plugins. If it has commands, ask whether to let them through; they are usually worth it when a command does more than open the mod's pane, such as an on/off switch. Then ask the user for confirmation. The mod's code runs with the Hub's access, so do not go on without a yes.
5. Copy only the mod's `.claude-plugin/`, `hooks/` and `types/` into `<home>/sources/<name>/` (the parts sync uses), so the mod's own tests never run inside the Hub. Add `{ "path": "sources/<name>", "repo": "<url>", "subdir": "<folder in repo, or empty>", "commit": "<sha>" }` to `mods` in `<home>/mods.json`, with `"commands": true` added to the entry if the user said yes to its commands. A `path` is resolved against the home. Delete the temp dir.
6. Run `node <kit>/sync.mjs`. Report the mod's `outputs:` line. Then ask which outputs to turn on, as a multi-select listing only the outputs the mod has (from that line and step 4's validate output): pane, band, toasts, status. Commands were asked in step 4. There is no default: turn on only what the user picks.
   - pane: follow the add skill's slot steps.
   - band, toasts, status: append the mod to `LAYOUT.bands`, `LAYOUT.toasts` and `LAYOUT.status` in `<home>/layout.config.ts`. Band goes last, unless the user names a position.
   - If the mod has none of these, say it runs without any.
7. Run `claude plugin validate <home>/hub` and report the result. Do not run `claude plugin test`: it assumes the default three slots.

Local folder:

- Do not clone or copy (no `sources/` copy, so no tests to leave out). Check that the folder holds both `.claude-plugin/plugin.json` and `hooks/hooks.json`.
- Do steps 3 and 4 on that folder.
- Add `{ "path": "<absolute folder>" }` to `mods` (with `"commands": true` if the user said yes to its commands) in `<home>/mods.json`. Store an absolute path.
- The entry is live: edits in that folder go in on the next sync (the kit hook also rebuilds at the next session start).
- Then continue with step 6.

---
name: setup
description: Set up the Hub for the first time, or repair it: builds the Hub into ~/.claude/modhub and makes Claude Code load it. Use when the user has just installed modhub-kit, or the Hub is missing, or the kit hook says "Run /modhub-kit:setup".
---

The kit folder is two levels up from this skill's base directory. The home is `${MODHUB_HOME:-$HOME/.claude/modhub}`: it holds the user's `mods.json`, `layout.config.ts` and `sources/`, and the generated Hub in `hub/`. Never write into the kit folder.

1. Run `node <kit>/sync.mjs`. It seeds `<home>/mods.json` and `<home>/layout.config.ts` from the kit's defaults when they are missing, then builds `<home>/hub/`. Show its output. If it fails, stop and report why.
2. Read `~/.claude/settings.json` (it may not exist). `CLAUDE_CODE_PLUGIN_DIRS` in its `env` block lists plugin folders, separated by the platform's path-list separator (`:` on macOS and Linux). If `<home>/hub` (as an absolute path; `~` counts as the home folder) is already in the list, say so and skip to step 4. Otherwise add it: append `:<home>/hub` to an existing value, or set the value to `<home>/hub`. Use an absolute path. Keep every other key in the file as it is, and ask before writing if the file is not valid JSON.
3. Tell the user what changed in `~/.claude/settings.json`.
4. Tell the user to restart Claude Code, then run `/hub`. If the old `modhub@modhub` plugin is installed, they should uninstall it (`/plugin uninstall modhub@modhub`), because two Hubs would register `/hub` twice.
5. Run `claude plugin validate <home>/hub` and report the result.

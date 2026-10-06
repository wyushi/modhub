---
name: sync
description: Rebuild the Hub in ~/.claude/modhub from mods.json and layout.config.ts. Use when the user edited mods.json or layout.config.ts by hand, or the Hub is stale or broken, or the kit hook says "Run /modhub-kit:sync".
---

The kit folder is two levels up from this skill's base directory. The home is `${MODHUB_HOME:-$HOME/.claude/modhub}`.

1. Run `node <kit>/sync.mjs` and show its output. It rebuilds `<home>/hub/` from `<home>/mods.json`, `<home>/layout.config.ts` and the hosted mods, and prints what each mod can show plus any warning.
2. If it fails, report the message as it is. If the message says another sync holds the lock and none is running, offer to remove `<home>/.sync.lock`.
3. Run `claude plugin validate <home>/hub` and report the result.

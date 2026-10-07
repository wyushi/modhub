# modhub reference

Details behind the [README](../README.md).

## What a mod can show

| Output | Where it appears |
| --- | --- |
| **Pane** | A slot in the Hub panel |
| **Band** | Lines above the prompt, plus text on the spinner |
| **Toast** | A popup that disappears after a few seconds |
| **Status** | The line below the input box, shared by all mods |

A hidden output stops showing, but the mod keeps running. A mod's own slash commands are off unless you allow them at install. Burn Meter is one example: with its commands on, `/burn` works.

## Where things live

```
~/.claude/modhub/          (or $MODHUB_HOME)
  mods.json          which mods are installed
  layout.config.ts   what each mod shows
  sources/<mod>/     downloaded mods
  hub/               the built Hub; safe to delete, it gets rebuilt
```

The kit itself (`modhub-kit`) is never written to, so `claude plugin update` can replace it safely. Setup adds `hub/` to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, and Claude Code loads it as a plugin named `modhub`. At each session start the kit rebuilds `hub/` if it is missing or out of date.

If you installed the older `modhub@modhub` plugin, uninstall it. Otherwise `/hub` is registered twice.

## Editing the layout by hand

The skills edit these files for you. To edit them by hand, change `layout.config.ts`, then run `/modhub-kit:sync`:

```ts
export const LAYOUT = {
  columns: 1,                 // 2 = two slots per row
  slots: [
    { mod: 'usage-meter', pane: 'usage', title: 'Usage' },
    { mod: 'agent-radar', pane: 'agent-radar', title: 'Agent Radar', rows: 6 },
  ],
  bands:  ['usage-meter'],    // lines above the prompt
  toasts: ['agent-radar'],    // popups
  status: [],                 // line below the input
}
```

- Slots draw in order. `mod` is the mod's plugin name and `pane` is the pane id it opens. `rows` is optional and fixes the slot's height.
- `bands`, `toasts` and `status` are lists of mod names. A mod in the list shows that output; a mod left out doesn't.

`mods.json` lists the installed mods:

```json
{
  "mods": [
    { "path": "sources/burn-meter", "repo": "https://github.com/OneWave-AI/claude-code-mods", "subdir": "burn-meter", "commit": "e6da26c…", "commands": true },
    { "path": "sources/snake", "enabled": false },
    { "path": "/Users/me/my-mod" }
  ]
}
```

- `path` is a folder. A local folder is read live, so your edits apply on the next sync.
- `"commands": true` turns on the mod's slash commands.
- `"enabled": false` keeps the mod installed but stops it from running.

## How it works

`sync.mjs` (Node + the `claude` CLI) copies each enabled mod into `hub/vendor/` and generates the code that wires the mods together. It never changes a mod's own files. It builds into `hub.tmp/` and then swaps that in, so a running session never sees a half-finished build. `node <kit>/sync.mjs --check` exits 0 if the Hub is up to date.

## Limits

Most mods run unchanged in the Hub. These don't work:
- Streaming hooks (`turn.step`, `process.spawn`).
- Reading another plugin's state.
- A mod's `userConfig` settings.
- `ui.press` hooks keyed to the mod's own pane id. Buttons with `onPress` on the element still work.
- `$.ui.blit` animations inside the mod's pane. Band animations still work.
- Data a mod saved while installed on its own. Inside the Hub it gets a fresh `$.store`.

## Troubleshooting

- **Red line at the bottom of the Hub** (`<mod>: <event> failed: …`): that mod threw an error. The other mods keep running.
- **`No pane <id> in <mod>`**: the `pane` in `layout.config.ts` doesn't match the id that mod uses.
- **Usage shows nothing**: usage figures need a Claude subscription, not an API key.
- **Context says "No reading yet"**: it updates after the first response.
- More detail: `claude --debug`, or `claude plugin validate ~/.claude/modhub/hub`.

## Develop

```sh
git clone https://github.com/wyushi/modhub.git && cd modhub
node sync.mjs --home ../.hub-dev
MODHUB_HOME=$PWD/../.hub-dev claude --plugin-dir . --plugin-dir ../.hub-dev/hub
```


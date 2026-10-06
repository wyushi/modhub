# modhub

The Hub: one plugin that runs other Claude Code mods and decides, for each one, what it shows. Their panes become slots in one live pane, and you choose per mod whether its band above the prompt, its toasts, its status text and its commands show too. Mods come from a git repo or a local folder, and none of them is changed. A fresh Hub is empty: you add mods yourself (see below).

```
┌ Hub ────────────────────────────┐
│ Usage                           │
│ 5-hour 42%                      │
│ █████████████░░░░░░░░░░░░░░░░░░ │
│ Weekly 13%                      │
│ ████░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│                                 │
│ Context                         │
│ 25% of context                  │
│ 50k / 200k tokens               │
│                                 │
│ Agent Radar                     │
│ 1 running · 2 finished          │
│                                 │
│ Burn                            │
│ $1.20 this session              │
└─────────────────────────────────┘
```

## Install

```
/plugin marketplace add wyushi/modhub
/plugin install modhub-kit@modhub
/modhub-kit:setup
```

Then restart Claude Code and run `/hub`.

**Where things live.** The marketplace installs `modhub-kit`, the builder: its skills, `sync.mjs`, the Hub's source template. It ships no mods. It is never written to, so `claude plugin update` can replace it freely. Your choices and the Hub itself live in the home, `~/.claude/modhub` (or `$MODHUB_HOME`):

```
~/.claude/modhub/
  mods.json          which mods are hosted
  layout.config.ts   what each mod shows
  sources/<mod>/     mods downloaded by the install skill
  hub/               the Hub, generated; deleting it is always safe
```

`/modhub-kit:setup` builds `hub/` and adds it to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (folders are separated by `:`), which is how Claude Code loads the Hub, under the name `modhub`. At every session start the kit rebuilds `hub/` when it is missing or out of date, and shows a toast ("Hub rebuilt"). If it can't (no Node, say), the toast tells you to run `/modhub-kit:sync`.

If you installed the earlier `modhub@modhub` plugin, uninstall it: two Hubs would register `/hub` twice.

**Don't also install a hosted mod on its own.** The Hub already runs it, so a second copy would register its commands, timers and toasts twice.

## Use it

| Command | What it does |
| --- | --- |
| `/hub` | Opens the Hub pane. |

The pane docks beside the transcript in the fullscreen layout (`/tui fullscreen`, 110 columns or wider). Otherwise it opens above the prompt. Resize it with `Ctrl+X` then an arrow while it has focus, and close it with `Ctrl+X` then `X`.

A hosted mod's own commands are off unless its `mods.json` entry has `"commands": true`. Most only opened the mod's pane, which now lives in the Hub, so `/clock-pane` and the like are not registered. Burn is the example: its entry is on, so `/burn`, `/burn lifetime` and `/burn demo` work, and `/burn` opens the Hub. Sync fails if a command is `/hub` or claimed by two mods.

Things to expect:
- Usage figures appear only on a Claude subscription. On an API key the usage slot says so.
- Context shows "No reading yet" until the first response in the session.
- Agent Radar lists only subagents started after it loaded.

## Mods to try

The kit ships no mods. These third-party ones (both repos MIT-licensed, credit to their authors) work in the Hub; install any with the skill:

```
/modhub-kit:install https://github.com/hamzafer/claude-code-mods mods/snake
/modhub-kit:install https://github.com/hamzafer/claude-code-mods mods/agent-radar
/modhub-kit:install https://github.com/OneWave-AI/claude-code-mods code-pet
/modhub-kit:install https://github.com/OneWave-AI/claude-code-mods burn-meter
```

Snake and Agent Radar are by hamzafer ([claude-code-mods](https://github.com/hamzafer/claude-code-mods)); Code Pet and Burn Meter are by OneWave-AI ([claude-code-mods](https://github.com/OneWave-AI/claude-code-mods)).

## Manage mods with the skills

Four skills do the editing for you, in two groups. Two more, `/modhub-kit:setup` and `/modhub-kit:sync`, build and rebuild the Hub.

**Mods**: bring a mod in, or delete it.

| Skill | What it does |
| --- | --- |
| `/modhub-kit:install <git url or folder>` | Shows what the mod hooks and calls, asks you to confirm (and whether to let its commands through), wires it in, then asks which outputs to turn on: pane, band, toasts, status. A git URL is downloaded into `sources/` in the home; a local folder is used in place. |
| `/modhub-kit:uninstall <mod>` | Removes the mod from `mods.json` and from every slot and list, deletes its download, and syncs. Works on a disabled mod too. |

**Hub**: choose what shows, and what runs.

| Skill | What it does |
| --- | --- |
| `/modhub-kit:add <mod> [pane\|band\|toasts\|status]` | Turns on one output, or the pane if none is named. Turns a disabled mod back on first. |
| `/modhub-kit:disable <mod> [pane\|band\|toasts\|status]` | Turns off one output while the mod keeps running. With none named, drops its slots and stops the mod, keeping its code so add can bring it back. |

Disabling stops a mod but keeps its code and its `mods.json` entry; uninstalling deletes them. An installed mod's code runs with the Hub's access, so read what install shows you before you confirm.

## Choose what each mod shows

The Hub runs every hosted mod's whole code, so every output a mod has passes through it. `layout.config.ts` in the home decides which ones show:

```ts
export const LAYOUT = {
  columns: 1,                 // 2 puts the slots side by side, two per row
  slots: [
    { mod: 'usage-meter', pane: 'usage', title: 'Usage' },
    { mod: 'context-meter', pane: 'context', title: 'Context' },
    { mod: 'agent-radar', pane: 'agent-radar', title: 'Agent Radar' },
    { mod: 'burn-meter', pane: 'burn', title: 'Burn' },
  ],
  bands: ['usage-meter', 'agent-radar', 'burn-meter'],   // band above the prompt, and spinner text
  toasts: ['usage-meter', 'agent-radar', 'burn-meter'],  // popups that expire
  status: [],                                            // text on the line below the input
}
```

| Output | What it is | How many |
| --- | --- | --- |
| Pane | A slot in the Hub pane | One slot per entry in `slots` |
| Band | Lines above the prompt, plus text added to the spinner | Any number, stacked |
| Toast | A popup that disappears after a few seconds | Any number |
| Status | The line below the input box | One per plugin, so the Hub shares it |

- **Slots** draw in list order. `mod` is the hosted mod's plugin name and `pane` the id it opens its pane under. `rows` is the slot's height; leave it out and the slot is as tall as its content.
- **`bands`, `toasts` and `status`** are lists of mod names. Listed means on; a mod left out shows nothing of that kind but keeps running. Listing a disabled mod is harmless: its choices wait for it.
- **Band order.** Bands run in `bands` order, outermost first. The final stacking also depends on how each mod joins its output to the one before it, so it is not always the order on screen.
- **Status.** Each mod in `status` gets its own part of the one status line, joined by `  ·  ` in list order. A mod that is disabled or left out leaves nothing behind.

After editing it by hand, run `/modhub-kit:sync` (the skills do this for you). The Hub reloads in a session that watches its folder; otherwise run `/reload-plugins`.

## How hosting works

`sync.mjs` builds the Hub from the template in the kit, the list in `mods.json` and `layout.config.ts`, into `hub/` in the home, copying each hosted mod to `hub/vendor/`:

```json
{
  "mods": [
    { "path": "sources/burn-meter", "repo": "https://github.com/OneWave-AI/claude-code-mods", "subdir": "burn-meter", "commit": "e6da26c…", "commands": true },
    { "path": "sources/snake", "repo": "https://github.com/hamzafer/claude-code-mods", "subdir": "mods/snake", "commit": "a775ac9…", "enabled": false },
    { "path": "/Users/me/my-mod" }
  ]
}
```

- `path` is a folder, relative to the home or absolute, used in place: edits there go in on the next sync. A mod downloaded by the install skill has `path: "sources/<mod>"`, and records where it came from (`repo`, `subdir`, `commit`). Only `.claude-plugin/`, `hooks/` and `types/` are copied, so a mod's own tests never run here.
- `"commands": true` lets the mod's commands through.
- `"enabled": false` keeps the mod but doesn't run it. A missing `enabled` means on.

The first sync copies `mods.json` and `layout.config.ts` from the kit's `defaults/` into the home (both empty: a fresh Hub hosts nothing and its pane says "No mods yet"); after that they are yours and sync never overwrites them. To rebuild by hand, run `/modhub-kit:sync` or:

```sh
node <kit>/sync.mjs [--home <dir>]
```

Sync needs Node and the `claude` CLI. It:
- builds in `hub.tmp/` and swaps it in as `hub/`, so a session that watches the folder never sees half a build; a lock (`.sync.lock`) keeps two syncs apart;
- copies each enabled mod into `hub/vendor/<mod>/`;
- asks `claude plugin validate` which hooks and `$` calls each mod uses;
- writes the marked `<view>` and `<wire>` blocks in `hub/hooks/register.tsx` and the list in `hub/hooks/mods.ts`;
- renames each mod's state to one the Hub owns (`clock-pane.ticks` becomes `modhub.clockPane_ticks`), because Claude Code lets only a value's owner write it;
- writes `hub/types/index.d.ts` from the mods' own type files;
- records a stamp of its inputs in `hub/.stamp.json`;
- prints what each mod can show, the disabled mods, and any name in the config that no mod matches:

```
outputs: burn-meter: pane (burn), band, toasts, commands (/burn)
disabled: snake, code-pet
```

Flags: `--check` exits 0 when `hub/` matches its inputs and 1 when it is stale or missing (the kit hook uses it); `--layout` copies only `layout.config.ts` into the built Hub.

The mods' source folders are never changed. Don't edit anything in `hub/`: the next sync overwrites it.

## What a hosted mod can't do

The Hub runs most mods unchanged, but not every kind:

- **Streaming hooks** (`turn.step`, `process.spawn`) aren't supported.
- **Reading another plugin's state** fails: a hosted mod reaches only its own.
- **Settings:** a mod's `userConfig` options aren't passed in; it gets none.
- **Button hooks** keyed to its own pane id (`ui.press` with `requestId`) won't fire. Buttons whose `onPress` is set on the element itself work.
- **Animations drawn into its own pane** (`$.ui.blit` to its pane id) don't play in a slot; the slot still redraws when the mod's state changes. Band animations work.
- **Saved data:** a mod's `$.store` keys get its name as a prefix and are kept under `modhub`, so data it saved while installed on its own doesn't carry over. Disabling or uninstalling doesn't delete it.

## When something goes wrong

- A red line at the bottom of the Hub (`<mod>: <event> failed: ...`) names a hosted mod whose hook threw. The other mods keep running.
- A slot that reads `No pane <id> in <mod>` has a `pane` in the config that doesn't match the id the mod opens.
- A dim `modhub: ui.render (Pane) refused: ...` line in the transcript means a tree didn't draw; the reason follows. `claude --debug` logs more.
- Check the built Hub with `claude plugin validate ~/.claude/modhub/hub` and `claude plugin test ~/.claude/modhub/hub`; check the kit with `claude plugin validate` and `claude plugin test` in its folder.

## Develop it

Work in a clone, with a throwaway home:

```sh
git clone https://github.com/wyushi/modhub.git && cd modhub
node sync.mjs --home ../.hub-dev     # build an empty Hub into ../.hub-dev/hub
MODHUB_HOME=$PWD/../.hub-dev claude --plugin-dir . --plugin-dir ../.hub-dev/hub
```

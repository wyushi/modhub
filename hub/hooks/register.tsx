import type { EngineInterface, Register } from 'claude-code'

import { composeStatus, host, keyOf, prefixKeys } from './host'
import type { AnyHook, HostedMod } from './host'
import { LAYOUT } from './layout.config'
import type { LayoutSlot } from './layout.config'
import { MODS } from './mods'

const LAYOUT_PANE = 'hub'
const LAYOUT_TITLE = 'Hub'
const SLOT_PAD = 1
const GAP = 2
const BAND_KEY = keyOf('ui.render', { component: 'AbovePrompt' })
const SPINNER_KEY = keyOf('ui.render', { component: 'Spinner' })

// Each hosted mod's status text; the status line is these, composed.
const statusTexts = new Map<string, string | undefined>()

// <view> Written by sync.mjs: the calls the hosted mods make, passed through.

function stateOf($: EngineInterface): any {
  return {
    get: (ref: any) => {
      switch (ref.key) {
      }
      throw new Error(`no hosted state ${ref.plugin}.${ref.key}`)
    },
    set: (ref: any, value: any, options?: any) => {
      switch (ref.key) {
      }
      throw new Error(`no hosted state ${ref.plugin}.${ref.key}`)
    },
  }
}

function passThrough($: EngineInterface): any {
  return {
    ui: {
      status: (...args: any[]) => ($.ui.status as any)(...args),
      toast: (...args: any[]) => ($.ui.toast as any)(...args),
    },
  }
}
// </view>

// The `$` a hosted mod sees: the calls it makes, passed through (the engine
// takes `$` only spelled `$.noun.method(...)`, never as a value), except that
// its `$.store` keys carry its name and opening one of its panes opens the
// Hub instead. sync.mjs rewrote its state addresses to this plugin's, and
// stateOf names each with a literal, the one form the engine takes. A hosted
// mod's commands are registered only for mods marked `commands` in mods.json;
// the rest only opened their pane, which /hub now does.
function hostedView($: EngineInterface, mod: HostedMod): EngineInterface {
  const prefix = `${mod.name}:`
  const view = passThrough($)
  view.state = stateOf($)
  view.store = {
    get: (key: string) => $.store.get(prefix + key),
    set: (key: string, value: unknown) => $.store.set(prefix + key, value),
    delete: (key: string) => $.store.delete(prefix + key),
    keys: async () =>
      (await $.store.keys()).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)),
  }
  view.ui = {
    ...view.ui,
    // Toasts and status text are the layout's to allow, per mod (layout.config.ts).
    toast: (...args: any[]) => (LAYOUT.toasts.includes(mod.name) ? ($.ui.toast as any)(...args) : Promise.resolve()),
    status: (text: string | undefined) => {
      statusTexts.set(mod.name, text)

      return $.ui.status(composeStatus(statusTexts, LAYOUT.status))
    },
    open: (pane: { id: string; focus?: true }) =>
      mod.panes.has(pane.id)
        ? $.ui.open({ id: LAYOUT_PANE, title: LAYOUT_TITLE, focus: pane.focus })
        : $.ui.open(pane),
    close: (pane: { id: string }) => (mod.panes.has(pane.id) ? Promise.resolve() : $.ui.close(pane)),
  }
  view.command = {
    ...view.command,
    register: (spec: { name: string }) =>
      mod.commands.length > 0 ? $.command.register(spec as any) : Promise.resolve({ command: spec.name }),
  }

  return view
}

// Hands one event to the hosted hooks recorded under `key`, outermost first,
// then on to the rest of the engine's chain.
function run(mods: HostedMod[], key: string, $: EngineInterface, e: any, next: any): any {
  let chain = mods.flatMap(mod =>
    mod.hooks.filter(one => one.key === key).map(one => ({ mod, hook: one.hook })),
  )
  // Bands and spinner text: only the mods in LAYOUT.bands, in that order.
  if (key === BAND_KEY || key === SPINNER_KEY) {
    chain = chain
      .filter(one => LAYOUT.bands.includes(one.mod.name))
      .sort((a, b) => LAYOUT.bands.indexOf(a.mod.name) - LAYOUT.bands.indexOf(b.mod.name))
  }
  // A hook that throws before handing on is skipped, as the engine skips a
  // failed hook, so one mod's failure never costs the others their turn.
  const step = async (index: number, event: any): Promise<any> => {
    if (index === chain.length) return next(event)
    const { mod, hook } = chain[index]
    let isHandedOn = false
    const rest = Object.assign((after: any) => {
      isHandedOn = true

      return step(index + 1, after)
    }, next)
    try {
      return await hook(hostedView($, mod), event, rest)
    } catch (error) {
      mod.errors = [...mod.errors, `${key} failed: ${String(error)}`].slice(-3)
      if (isHandedOn) throw error

      return step(index + 1, event)
    }
  }

  return step(0, e)
}

// The Hub's own start. session.start is wired once for every hosted mod,
// so this joins that chain rather than registering a second hook.
async function startHub($: EngineInterface, e: unknown, next: (e: unknown) => unknown) {
  await $.command.register({
    name: 'hub',
    description: 'Open the Hub: the hosted mods in one pane',
  })
  // The status line is the Hub's, shared by every hosted mod: clear it so
  // one left by a mod since disabled doesn't outlive it. Running mods set
  // theirs again further down this chain.
  $.ui.status(undefined)

  return next(e)
}

async function drawSlot(
  $: EngineInterface,
  e: any,
  next: any,
  mods: HostedMod[],
  slot: LayoutSlot,
  index: number,
  width: number,
) {
  const { Box, Text } = $.ui.resolve(e)
  // The body sits SLOT_PAD columns in from each side; the header rule spans the full width.
  const innerWidth = Math.max(1, width - 2 * SLOT_PAD)
  const mod = mods.find(one => one.name === slot.mod)
  const hook: AnyHook | undefined = mod?.panes.get(slot.pane)
  let body: unknown
  if (mod === undefined || hook === undefined) {
    body = <Text dimColor>No pane {slot.pane} in {slot.mod}.</Text>
  } else {
    try {
      const slotEvent = {
        ...e,
        requestId: slot.pane,
        props: { ...e.props, title: slot.title, bodyColumns: innerWidth },
        viewport:
          e.viewport === undefined
            ? undefined
            : { ...e.viewport, columns: innerWidth, rows: slot.rows ?? e.viewport.rows },
      }
      const nothing = Object.assign(async () => undefined, next)
      const tree = await hook(hostedView($, mod), slotEvent, nothing)
      body =
        tree === undefined || tree === null ? (
          <Text dimColor>(nothing to show)</Text>
        ) : (
          prefixKeys(tree, `slot${index}`)
        )
    } catch (error) {
      body = (
        <Text color="red">
          {slot.mod} failed: {String(error)}
        </Text>
      )
    }
  }

  // Only the terminal counts columns; other surfaces (or an old engine without `surface`) get a plain title.
  const ruled = e.surface === undefined || e.surface === 'terminal'
  const header = headerLine(slot.title, width)

  return (
    <Box flexDirection="column" width={width}>
      <Box marginBottom={1}>
        {ruled ? (
          <Text wrap="truncate-end">
            <Text dimColor>{header.before}</Text>
            <Text bold>{header.title}</Text>
            <Text dimColor>{header.after}</Text>
          </Text>
        ) : (
          <Text wrap="truncate-end">
            <Text dimColor>{'— '}</Text>
            <Text bold>{slot.title}</Text>
          </Text>
        )}
      </Box>
      <Box paddingX={SLOT_PAD} flexDirection="column">
        {body}
      </Box>
    </Box>
  )
}

// The slot header: a rule with the title set into it, `─ Title ─────`, exactly `width`
// columns. A title too long for the row is cut with `…`. The rule is terminal-only: other
// surfaces (the desktop app) use a proportional font, so a column-counted rule overflows and
// wraps there. They get `— Title` instead (see drawSlot).
function headerLine(title: string, width: number) {
  const total = Math.max(1, width)
  // `─ ` + title + ` ` + fill (at least one `─`)
  const room = total - 2 - 1 - 1
  if (room < 1) return { before: '─'.repeat(total), title: '', after: '' }
  const chars = Array.from(title)
  const shown = chars.length <= room ? title : `${chars.slice(0, room - 1).join('')}…`
  const fill = total - 2 - Array.from(shown).length - 1
  return { before: '─ ', title: shown, after: ` ${'─'.repeat(fill)}` }
}

export const register: Register = on => {
  statusTexts.clear()
  const mods: HostedMod[] = [
    { name: 'modhub', commands: ['hub'], panes: new Map(), hooks: [{ key: 'session.start', hook: startHub }], errors: [] },
    ...MODS.map(one => host(one.name, one.register, one.commands)),
  ]

  // <wire> Written by sync.mjs: one hook per event and matcher the hosted mods hook.
  on('session.start', ($, e, next) => run(mods, "session.start", $, e, next))
  // </wire>

  on('command.run', { command: 'hub' }, async $ => {
    await $.ui.open({ id: LAYOUT_PANE, title: LAYOUT_TITLE })

    return { text: 'Hub opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: LAYOUT_PANE }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const columns = Math.max(1, LAYOUT.columns)
    const width = Math.max(10, Math.floor((e.props.bodyColumns - GAP * (columns - 1)) / columns))
    const cells = []
    for (const [index, slot] of LAYOUT.slots.entries()) {
      cells.push(await drawSlot($, e, next, mods, slot, index, width))
    }
    const rows = []
    for (let start = 0; start < cells.length; start += columns) {
      rows.push(
        <Box flexDirection="row" gap={GAP}>
          {cells.slice(start, start + columns)}
        </Box>,
      )
    }
    // Nothing to draw: say how to get something on screen.
    const emptyNote =
      LAYOUT.slots.length > 0
        ? undefined
        : MODS.length === 0
          ? 'No mods yet. Run /modhub-kit:install <git url or folder>.'
          : 'No panes shown. Run /modhub-kit:add <mod>.'
    const failures = mods.flatMap(one => one.errors.map(error => `${one.name}: ${error}`))

    return (
      <Box flexDirection="column" gap={1}>
        {rows}
        {emptyNote === undefined ? null : <Text dimColor>{emptyNote}</Text>}
        {failures.map(line => (
          <Text color="red">{line}</Text>
        ))}
      </Box>
    )
  })
}

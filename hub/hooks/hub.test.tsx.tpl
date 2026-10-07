import { expect, mock, test } from 'claude-code/testing'

import { composeStatus } from './host'
import { LAYOUT } from './layout.config'
import { MODS } from './mods'

const PANE = {
  component: 'Pane',
  requestId: 'hub',
  props: { title: 'Hub', isFocused: false, bodyColumns: 40, placement: 'dock' } as any,
  viewport: { columns: 40, rows: 30, isFullscreen: true } as any,
} as const

test('the Hub draws every slot (or says it is empty), registers the enabled commands, and the clock ticks when shown', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 4, 12) })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  const registered: string[] = []
  on('command.register', ($, e) => {
    registered.push(e.name)

    return { value: { command: e.name } }
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 50_000, window: 200_000, percent: 25 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 42 }],
    },
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // the Hub's own command, plus those of mods marked `commands` in mods.json
  const commanded = MODS.flatMap(one => one.commands)
  expect(registered).toContain('hub')
  expect([...registered].sort()).toEqual(['hub', ...commanded].sort())

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'modhub', surface, ...PANE })
    if (LAYOUT.slots.length === 0) {
      const note = MODS.length === 0 ? /^No mods yet\./ : /^No panes shown\./
      expect(await ui.find({ type: 'Text', text: note })).toBeDefined()
    }
    for (const slot of LAYOUT.slots) {
      expect(await ui.find({ type: 'Text', text: slot.title })).toBeDefined()
      // the title sits in a rule that fills its row: `─ Title ─────`
      if (surface === 'terminal') {
        expect(await ui.find({ type: 'Text', text: /^─ $/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /^ ─+$/ })).toBeDefined()
      } else {
        // other surfaces: a plain `— Title`, no rule
        expect(await ui.find({ type: 'Text', text: /^— $/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /─/ })).toBeUndefined()
      }
    }
    if (LAYOUT.slots.some(slot => slot.mod === 'usage-meter')) {
      const bar = await ui.find({ type: 'Text', text: /^[█░]+$/ })
      expect(bar?.text.length).toBe(PANE.props.bodyColumns - 2) // minus the slot's side padding
    }
    if (LAYOUT.slots.some(slot => slot.mod === 'clock-pane')) {
      const before = await ui.find({ type: 'Text', text: /^ticks \d+$/ })
      expect(before).toBeDefined()
      await clock.advance(3000)
      const after = await ui.find({ type: 'Text', text: /^ticks \d+$/ })
      expect(Number(after?.text.split(' ')[1])).toBe(Number(before?.text.split(' ')[1]) + 3)
    }
    await ui.unmount()
  }
})

test('the status line joins the listed mods\' texts in list order and skips the rest', () => {
  const texts = new Map<string, string | undefined>([
    ['a', 'one'],
    ['b', undefined],
    ['c', ''],
    ['d', 'four'],
    ['e', 'five'],
  ])
  expect(composeStatus(texts, ['d', 'a', 'b', 'c', 'x'])).toBe('four  ·  one')
  expect(composeStatus(texts, ['b', 'c'])).toBeUndefined()
  expect(composeStatus(texts, [])).toBeUndefined()
})

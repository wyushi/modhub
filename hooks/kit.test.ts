import { expect, mock, test } from 'claude-code/testing'

import { namesFolder } from './register'

test('the kit folder list matches the Hub folder by path, with ~ expanded', () => {
  expect(namesFolder('/a:/h/.claude/modhub/hub', '/h/.claude/modhub/hub', '/h')).toBe(true)
  expect(namesFolder('~/.claude/modhub/hub/', '/h/.claude/modhub/hub', '/h')).toBe(true)
  expect(namesFolder('/a:/b', '/h/.claude/modhub/hub', '/h')).toBe(false)
  expect(namesFolder(undefined, '/h/.claude/modhub/hub', '/h')).toBe(false)
})


test('a stale Hub is rebuilt and announced; a setup that is missing is pointed out', async ($, on) => {
  const toasts: string[] = []
  const ran: string[][] = []
  mock.env(on, { HOME: '/h' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('process.run', ($, e) => {
    ran.push([...e.argv])

    return { value: { exitCode: e.argv.includes('--check') ? 1 : 0, stdout: '', stderr: '' } as any }
  })
  on('settings.read', () => ({ value: {} as any }))
  on('ui.toast', ($, e) => {
    toasts.push((e as any).text)

    return { value: undefined as any }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (let wait = 0; toasts.length < 2 && wait < 100; wait += 1) await new Promise(done => setTimeout(done, 20))
  expect(ran.map(argv => argv.at(-1)).slice(0, 2)).toEqual(['--check', expect.stringMatching(/sync\.mjs$/)])
  expect(toasts).toEqual(['Hub rebuilt', 'Run /modhub-kit:setup'])
})

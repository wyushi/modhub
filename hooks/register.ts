// The kit's one hook: at session start, rebuild the Hub in the home when it is
// missing or stale (`sync.mjs --check` says which), without holding the start.
// The home is $MODHUB_HOME, else ~/.claude/modhub. Registers no commands.
import type { Register } from 'claude-code'

// Whether the colon-separated CLAUDE_CODE_PLUGIN_DIRS names the folder.
export function namesFolder(dirs: string | undefined, folder: string, user: string): boolean {
  return (dirs ?? '')
    .split(':')
    .map(one => one.trim())
    .filter(Boolean)
    .map(one => (one === '~' || one.startsWith('~/') ? user + one.slice(1) : one).replace(/\/+$/, ''))
    .includes(folder)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void (async () => {
      const user = (await $.env.get('HOME')) ?? ''
      const home = (await $.env.get('MODHUB_HOME')) || `${user}/.claude/modhub`
      const sync = `${$.plugin.root}/sync.mjs`
      try {
        const check = await $.process.run(['node', sync, '--check'])
        if (check.exitCode === 1) {
          const built = await $.process.run(['node', sync], { timeoutMs: 600_000 })
          if (built.exitCode === 0) {
            $.ui.toast('Hub rebuilt')
          } else {
            const reason = (built.stderr.trim() || built.stdout.trim()).split('\n').pop() ?? ''
            $.ui.toast(`Hub rebuild failed: ${reason}`)
          }
        } else if (check.exitCode !== 0) {
          $.ui.toast('Run /modhub-kit:sync (needs node)')
        }
      } catch {
        $.ui.toast('Run /modhub-kit:sync (needs node)')
      }
      const settings = await $.settings.read()
      const dirs = settings.env?.CLAUDE_CODE_PLUGIN_DIRS ?? (await $.env.get('CLAUDE_CODE_PLUGIN_DIRS'))
      if (!namesFolder(dirs, `${home}/hub`, user)) $.ui.toast('Run /modhub-kit:setup')
    })()

    return next(e)
  })
}

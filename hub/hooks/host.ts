// Runs other mods' hooks modules inside this plugin, untouched: the parts
// that never touch `$` (the engine follows `$` only within one file, so the
// wrapped `$` and the dispatch live in register.tsx).
//
// A hosted mod's `register` gets a recorder in place of `on`: its Pane render
// hooks become the Hub's slots, and every other hook is kept under a key
// made of its event and matcher, which the wired hooks in register.tsx run.
import type { Register } from 'claude-code'

export type AnyHook = (...args: any[]) => any

export type HostedMod = {
  name: string
  commands: string[]
  panes: Map<string, AnyHook>
  hooks: { key: string; hook: AnyHook }[]
  errors: string[]
}

export function keyOf(event: string, matcher: Record<string, unknown> | undefined): string {
  if (matcher === undefined) return event
  const sorted = Object.keys(matcher)
    .sort()
    .map(key => [key, String(matcher[key])])

  return event + JSON.stringify(Object.fromEntries(sorted))
}

function recorder(mod: HostedMod) {
  return (event: string, second: any, third?: any) => {
    const [matcher, hook] = third === undefined ? [undefined, second] : [second, third]
    if (event === 'ui.render' && matcher?.component === 'Pane' && typeof matcher.requestId === 'string') {
      mod.panes.set(matcher.requestId, hook)
    } else {
      mod.hooks.push({ key: keyOf(event, matcher), hook })
    }

    return { catch: () => {} }
  }
}

export function host(name: string, register: Register, commands: string[]): HostedMod {
  const mod: HostedMod = { name, commands, panes: new Map(), hooks: [], errors: [] }
  try {
    register(recorder(mod) as any, {} as any)
  } catch (error) {
    mod.errors.push(`register failed: ${String(error)}`)
  }

  return mod
}

// Gives every keyed element of a hosted tree a key unique to its slot, so two
// mods' Buttons never share an address in the one pane.
export function prefixKeys(node: any, prefix: string): any {
  if (node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(child => prefixKeys(child, prefix))
  const key = node.props?.key

  return {
    ...node,
    ...(typeof key === 'string' ? { props: { ...node.props, key: `${prefix}:${key}` } } : {}),
    ...(node.children === undefined ? {} : { children: prefixKeys(node.children, prefix) }),
  }
}

// The one status line from each mod's text: the non-empty texts of the mods in
// `order`, in that order, joined by '  ·  '. Undefined when there are none.
export function composeStatus(texts: Map<string, string | undefined>, order: string[]): string | undefined {
  const parts = order.map(name => texts.get(name)).filter((text): text is string => typeof text === 'string' && text !== '')

  return parts.length === 0 ? undefined : parts.join('  ·  ')
}

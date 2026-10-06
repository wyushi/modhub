#!/usr/bin/env node
// Builds the Hub, a plugin named modhub, into <home>/hub/ from the kit's
// template (hub/) and the user's data in <home>:
//   <home>/mods.json, <home>/layout.config.ts, <home>/sources/<mod>/
// It copies each hosted mod into vendor/<mod>/ and writes what hosting it takes:
//   - hooks/mods.ts, the imports;
//   - the <view> and <wire> blocks of hooks/register.tsx: the calls the mods
//     make on $, passed through, and one literal on() per event and matcher
//     they hook (the engine takes no other spelling of $ or on, and follows $
//     only within one file);
//   - types/index.d.ts, this plugin's contract, holding the mods' state.
// The one change to a mod's code is its state addresses: the engine lets only
// a value's owner write it, so `{ plugin: 'clock-pane', key: 'ticks' }` is
// rewritten to `{ plugin: 'modhub', key: 'clockPane_ticks' }`.
// An entry with "enabled": false is skipped (but its name is still checked).
// An entry is { "path": "<folder>" } (relative to the home, or absolute). The
// kit ships no mods: a fresh Hub is empty.
// The build goes to <home>/hub.tmp and is swapped in, so the watched folder is
// never half-built.
// Usage: node sync.mjs [--home <dir>] [--check | --layout]
//   --check   exit 0 if <home>/hub matches its inputs, 1 if stale or missing
//   --layout  copy only layout.config.ts into the built Hub and restamp
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const kit = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flags = new Set()
let homeArg
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--home') {
    homeArg = args[(i += 1)]
    if (!homeArg) fail('--home needs a folder')
  } else if (['--check', '--layout'].includes(args[i])) {
    flags.add(args[i])
  } else {
    fail(`unknown argument ${args[i]}; usage: node sync.mjs [--home <dir>] [--check | --layout]`)
  }
}
if (flags.has('--check') && flags.size > 1) fail('--check takes no other flag')
const home = resolve(homeArg ?? process.env.MODHUB_HOME ?? join(homedir(), '.claude', 'modhub'))

function fail(message) {
  console.error(message)
  process.exit(1)
}

const BUNDLE_PARTS = ['.claude-plugin', 'hooks', 'types']

// Seeds the home's user data from the kit's defaults.
function seed() {
  mkdirSync(home, { recursive: true })
  for (const file of ['mods.json', 'layout.config.ts']) {
    if (!existsSync(join(home, file))) {
      cpSync(join(kit, 'defaults', file), join(home, file))
      console.log(`seeded ${join(home, file)}`)
    }
  }
}

// The folder an entry names.
function sourceOf(entry) {
  if (typeof entry.bundled === 'string') {
    return fail(`mods.json: "bundled" entries are no longer supported (the kit ships no mods); install ${entry.bundled} with /modhub-kit:install: ${JSON.stringify(entry)}`)
  }
  if (typeof entry.path === 'string') return resolve(home, entry.path)
  return fail(`mods.json: an entry needs "path": ${JSON.stringify(entry)}`)
}

function filesDeep(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(one =>
    one.name === 'node_modules' || (one.name === 'types' && basename(folder) === '.claude-plugin')
      ? []
      : one.isDirectory() ? filesDeep(join(folder, one.name)) : [join(folder, one.name)],
  )
}

// Everything a build depends on, as one hash.
function inputsHash() {
  const hash = createHash('sha256')
  const add = (label, data) => hash.update(`${label}\0${data}\0`)
  for (const file of filesDeep(join(kit, 'hub')).sort()) add(`template ${relative(kit, file)}`, readFileSync(file))
  add('sync.mjs', readFileSync(join(kit, 'sync.mjs')))
  add('mods.json', readFileSync(join(home, 'mods.json')))
  add('layout.config.ts', readFileSync(join(home, 'layout.config.ts')))
  for (const entry of JSON.parse(readFileSync(join(home, 'mods.json'), 'utf8')).mods) {
    if (entry.enabled === false) continue
    const source = sourceOf(entry)
    if (!existsSync(source)) {
      add(`source ${source}`, 'missing')
      continue
    }
    for (const part of BUNDLE_PARTS) {
      if (!existsSync(join(source, part))) continue
      for (const file of filesDeep(join(source, part)).sort()) {
        add(`source ${relative(source, file)}`, `${source} ${statSync(file).mtimeMs}`)
      }
    }
  }
  return hash.digest('hex')
}

function kitVersion() {
  try {
    return JSON.parse(readFileSync(join(kit, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? ''
  } catch {
    return ''
  }
}

const stampOf = () => ({ kitVersion: kitVersion(), inputs: inputsHash() })

function isFresh() {
  try {
    const stamp = JSON.parse(readFileSync(join(home, 'hub', '.stamp.json'), 'utf8'))
    const now = stampOf()
    return stamp.kitVersion === now.kitVersion && stamp.inputs === now.inputs
  } catch {
    return false
  }
}

if (flags.has('--check')) process.exit(isFresh() ? 0 : 1)

seed()

// One sync at a time: <home>/.sync.lock is a folder made with mkdir. A lock
// older than ten minutes is taken to be left by a crash.
const lock = join(home, '.sync.lock')
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
let locked = false
for (const waited = Date.now(); !locked; ) {
  try {
    mkdirSync(lock)
    locked = true
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    let age = 0
    try {
      age = Date.now() - statSync(lock).mtimeMs
    } catch {
      continue // released between the two calls
    }
    if (age > 10 * 60_000) {
      rmSync(lock, { recursive: true, force: true })
    } else if (Date.now() - waited > 120_000) {
      fail(`another sync holds ${lock}; remove it if none is running`)
    } else {
      sleep(500)
    }
  }
}
process.on('exit', () => rmSync(lock, { recursive: true, force: true }))

if (flags.has('--layout') && existsSync(join(home, 'hub', '.stamp.json'))) {
  const hooks = join(home, 'hub', 'hooks')
  cpSync(join(home, 'layout.config.ts'), join(hooks, 'layout.config.ts.tmp'))
  renameSync(join(hooks, 'layout.config.ts.tmp'), join(hooks, 'layout.config.ts'))
  const stamp = join(home, 'hub', '.stamp.json')
  writeFileSync(`${stamp}.tmp`, JSON.stringify(stampOf(), null, 2) + '\n')
  renameSync(`${stamp}.tmp`, stamp)
  console.log('Layout updated.')
  process.exit(0)
}

const out = join(home, 'hub.tmp')
rmSync(out, { recursive: true, force: true })
cpSync(join(kit, 'hub'), out, {
  recursive: true,
  filter: path => !path.includes(`${join('.claude-plugin', 'types')}`) && basename(path) !== 'node_modules',
})
// The template keeps the Hub's test as hub.test.tsx.tpl, so that the kit's own `claude plugin test` skips it.
renameSync(join(out, 'hooks', 'hub.test.tsx.tpl'), join(out, 'hooks', 'hub.test.tsx'))
mkdirSync(join(out, 'vendor'), { recursive: true })
mkdirSync(join(out, 'types'), { recursive: true })

const manifest = JSON.parse(readFileSync(join(home, 'mods.json'), 'utf8'))
const sources = manifest.mods.map(sourceOf)

// The plugin name, which can differ from the folder's name.
function nameOf(source) {
  try {
    return JSON.parse(readFileSync(join(source, '.claude-plugin', 'plugin.json'), 'utf8')).name || basename(source)
  } catch {
    return basename(source)
  }
}

const names = sources.map(nameOf)
for (const [index, name] of names.entries()) {
  if (name === 'modhub' || names.indexOf(name) !== index) {
    console.error(`mods.json: ${name === 'modhub' ? 'a mod cannot be named modhub' : `two entries are named ${name}`}`)
    process.exit(1)
  }
}

const camel = name => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '')

// `command.run{command=usage-pane}` → ['command.run', { command: 'usage-pane' }]
function parseHook(text) {
  const match = /^([^{]+)(?:\{(.*)\})?$/.exec(text.trim())
  const matcher = {}
  for (const pair of (match[2] ?? '').split(',').filter(Boolean)) {
    const [key, ...rest] = pair.split('=')
    matcher[key.trim()] = rest.join('=').trim()
  }
  return [match[1], Object.keys(matcher).length === 0 ? undefined : matcher]
}

// What the validator reads off the module's source: the hooks it registers
// and the calls it makes on $.
function readModule(folder) {
  let out
  try {
    out = execFileSync('claude', ['plugin', 'validate', '--json', folder], { encoding: 'utf8' })
  } catch (error) {
    out = error.stdout
  }
  const report = JSON.parse(out)
  const notes = report.contents.flatMap(one => one.notes ?? [])
  const listed = label => {
    const line = notes.find(note => note.includes(` ${label}: `))
    return line === undefined ? [] : line.slice(line.indexOf(` ${label}: `) + label.length + 3).split(/, (?![^{]*\})/)
  }
  const hooks = listed('hooks').map(parseHook)
  if (hooks.length === 0) throw new Error(`${folder}: the validator listed no hooks`)
  const calls = listed('calls')
    .map(call => /^\$\.(\w+)\.(\w+)/.exec(call.trim()))
    .filter(Boolean)
    .map(([, noun, method]) => [noun, method])
  return { hooks, calls }
}

// The `'<mod>': { ... }` member of the mod's PluginState, as [key, type] pairs,
// and the contract's other declarations.
function readContract(name, file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return { entries: [], declarations: '' }
  }
  const open = text.indexOf('declare module')
  const declarations = (open < 0 ? text : text.slice(0, open)).trim()
  const member = new RegExp(`['"]?${name.replace(/[-]/g, '\\-')}['"]?\\s*:\\s*\\{`).exec(text)
  if (member === null) return { entries: [], declarations }
  let depth = 1
  let at = member.index + member[0].length
  const start = at
  for (; depth > 0 && at < text.length; at += 1) {
    if (text[at] === '{') depth += 1
    if (text[at] === '}') depth -= 1
  }
  const body = text.slice(start, at - 1)
  const entries = []
  let part = ''
  depth = 0
  for (const char of body + ';') {
    if ('{[(<'.includes(char)) depth += 1
    if ('}])>'.includes(char)) depth -= 1
    if (depth === 0 && (char === ';' || char === '\n' || char === ',')) {
      const pair = /^\s*['"]?([\w$]+)['"]?\s*\??\s*:\s*([\s\S]+?)\s*$/.exec(part)
      if (pair) entries.push([pair[1], pair[2]])
      part = ''
    } else {
      part += char
    }
  }
  return { entries, declarations }
}

// Rewrites the mod's own state addresses to this plugin's, in every module file.
function readdirDeep(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(one =>
    one.isDirectory() ? readdirDeep(join(folder, one.name)) : [join(folder, one.name)],
  )
}

function rehome(folder, name) {
  const quoted = name.replace(/[-]/g, '\\-')
  const forward = new RegExp(`plugin\\s*:\\s*(['"])${quoted}\\1(\\s*,\\s*key\\s*:\\s*)(['"])([^'"]+)\\3`, 'g')
  const backward = new RegExp(`key\\s*:\\s*(['"])([^'"]+)\\1(\\s*,\\s*plugin\\s*:\\s*)(['"])${quoted}\\4`, 'g')
  for (const file of readdirDeep(folder).filter(path => /\.[mc]?[jt]sx?$/.test(path) && !path.endsWith('.d.ts'))) {
    const text = readFileSync(file, 'utf8')
    const next = text
      .replace(forward, (_, q, middle, q2, key) => `plugin: 'modhub'${middle}'${camel(name)}_${key}'`)
      .replace(backward, (_, q, key, middle) => `key: '${camel(name)}_${key}'${middle}'modhub'`)
    if (next !== text) writeFileSync(file, next)
  }
}

const mods = []
const enabled = new Map()
const commandOwner = new Map()
const stateEntries = []
const declarations = []
// Every call the Hub's own code makes is seeded here, so hostedView can
// always reference it whichever mods are enabled: ui.status (start, and the
// composed status line) and ui.toast (the toasts filter).
const calls = new Map([['ui', new Set(['status', 'toast'])]])
const wired = new Map([['session.start', ['session.start', undefined]]])
const outputLines = []
const disabled = []
for (const [index, source] of sources.entries()) {
  const name = nameOf(source)
  if (manifest.mods[index].enabled === false) {
    disabled.push(name) // kept in mods.json, but not vendored, wired or typed; the prune below drops its vendor/ folder
    continue
  }
  const commandsOn = manifest.mods[index].commands === true
  const target = join(out, 'vendor', name)
  if (!existsSync(source)) {
    console.error(`mods.json: ${sources[index]} not found`)
    process.exit(1)
  }
  for (const part of BUNDLE_PARTS) {
    cpSync(join(source, part), join(target, part), { recursive: true, force: true, errorOnExist: false })
  }
  rmSync(join(target, '.claude-plugin', 'types'), { recursive: true, force: true })
  mods.push(name)
  const found = readModule(target)
  rmSync(join(target, '.claude-plugin', 'types'), { recursive: true, force: true }) // validate may leave its own
  rehome(join(target, 'hooks'), name)
  const contract = readContract(name, join(source, 'types', 'index.d.ts'))
  for (const [key, type] of contract.entries) stateEntries.push([`${camel(name)}_${key}`, type])
  if (contract.declarations) declarations.push(`// From ${name}\n${contract.declarations}`)
  for (const [noun, method] of found.calls) {
    if (noun === 'state' || noun === 'store') continue
    calls.set(noun, new Set([...(calls.get(noun) ?? []), method]))
  }
  const ids = found.hooks.filter(([event, matcher]) => event === 'ui.render' && matcher?.component === 'Pane' && matcher.requestId).map(([, matcher]) => matcher.requestId)
  const commandNames = []
  for (const [event, matcher] of found.hooks) {
    if (event === 'ui.render' && matcher?.component === 'Pane' && matcher.requestId) continue
    if (event === 'command.run') {
      if (!commandsOn) continue // a mod's commands are registered only with "commands": true (see hostedView)
      const command = matcher?.command
      if (command !== undefined) {
        if (command === 'hub' || commandOwner.has(command)) {
          console.error(`mods.json: ${name} claims /${command}, which ${command === 'hub' ? 'is the Hub\'s own command' : `${commandOwner.get(command)} already claims`}`)
          process.exit(1)
        }
        commandOwner.set(command, name)
        commandNames.push(`/${command}`)
      }
    }
    const key = event + (matcher === undefined ? '' : JSON.stringify(Object.fromEntries(Object.entries(matcher).sort())))
    wired.set(key, [event, matcher])
  }
  enabled.set(name, commandNames.map(command => command.slice(1)))
  const has = (event, component) => found.hooks.some(([one, matcher]) => one === event && matcher?.component === component)
  const used = (noun, method) => found.calls.some(([a, b]) => a === noun && b === method)
  const outputs = [
    ids.length > 0 && `pane (${ids.join(', ')})`,
    has('ui.render', 'AbovePrompt') && 'band',
    has('ui.render', 'Spinner') && 'spinner',
    used('ui', 'toast') && 'toasts',
    used('ui', 'status') && 'status',
    commandNames.length > 0 && `commands (${commandNames.join(', ')})`,
  ].filter(Boolean)
  outputLines.push(`outputs: ${name}: ${outputs.length === 0 ? '(none)' : outputs.join(', ')}`)
}

writeFileSync(
  join(out, 'hooks', 'mods.ts'),
  [
    '// Written by sync.mjs: the mods this Hub hosts. Do not edit.',
    "import type { Register } from 'claude-code'",
    '',
    ...mods.map(name => `import { register as ${camel(name)} } from '../vendor/${name}/hooks/register'`),
    '',
    'export const MODS: { name: string; register: Register; commands: string[] }[] = [',
    ...mods.map(name => `  { name: '${name}', register: ${camel(name)}, commands: ${JSON.stringify(enabled.get(name)).replaceAll('"', "'")} },`),
    ']',
    '',
  ].join('\n'),
)

const literal = matcher =>
  `{ ${Object.entries(matcher).map(([key, value]) => `${key}: ${JSON.stringify(value).replaceAll('"', "'")}`).join(', ')} }`

const registerPath = join(out, 'hooks', 'register.tsx')
const wires = [...wired].map(([key, [event, matcher]]) =>
  matcher === undefined
    ? `  on('${event}', ($, e, next) => run(mods, ${JSON.stringify(key)}, $, e, next))`
    : `  on('${event}', ${literal(matcher)}, ($, e, next) => run(mods, ${JSON.stringify(key)}, $, e, next))`,
)
const nouns = [...calls].sort(([a], [b]) => a.localeCompare(b))
const refName = key => `STATE_${key}`
const call = (op, key, type, rest) =>
  /^StateFamily\b/.test(type)
    ? `$.state.${op}({ ...${refName(key)}, id: ref.id }${rest})`
    : `$.state.${op}(${refName(key)}${rest})`
const view = [
  ...stateEntries.map(([key]) => `const ${refName(key)} = { plugin: 'modhub', key: '${key}' } as const`),
  '',
  'function stateOf($: EngineInterface): any {',
  '  return {',
  '    get: (ref: any) => {',
  '      switch (ref.key) {',
  ...stateEntries.map(([key, type]) => `        case '${key}': return ${call('get', key, type, '')}`),
  '      }',
  "      throw new Error(`no hosted state ${ref.plugin}.${ref.key}`)",
  '    },',
  '    set: (ref: any, value: any, options?: any) => {',
  '      switch (ref.key) {',
  ...stateEntries.map(([key, type]) => `        case '${key}': return ${call('set', key, type, ', value, options')}`),
  '      }',
  "      throw new Error(`no hosted state ${ref.plugin}.${ref.key}`)",
  '    },',
  '  }',
  '}',
  '',
  'function passThrough($: EngineInterface): any {',
  '  return {',
  ...nouns.flatMap(([noun, methods]) => [
    `    ${noun}: {`,
    ...[...methods].sort().map(method => `      ${method}: (...args: any[]) => ($.${noun}.${method} as any)(...args),`),
    '    },',
  ]),
  '  }',
  '}',
]

// Replaces the lines between `// <name>` and `// </name>` in register.tsx.
function fill(source, name, lines) {
  const open = source.indexOf(`// <${name}>`)
  const close = source.indexOf(`// </${name}>`)
  if (open < 0 || close < 0) throw new Error(`register.tsx has no // <${name}> ... // </${name}> block`)
  const head = source.slice(0, source.indexOf('\n', open) + 1)
  const indent = source.slice(source.lastIndexOf('\n', close) + 1, close)
  return head + lines.map(line => line + '\n').join('') + indent + source.slice(close)
}

let source = readFileSync(registerPath, 'utf8')
source = fill(source, 'view', view)
source = fill(source, 'wire', wires)
writeFileSync(registerPath, source)

writeFileSync(
  join(out, 'types', 'index.d.ts'),
  [
    '// Written by sync.mjs: the hosted mods\' state, held as this plugin\'s. Do not edit.',
    '',
    ...declarations.flatMap(text => [text, '']),
    "declare module 'claude-code' {",
    '  interface PluginState {',
    '    modhub: {',
    ...stateEntries.map(([key, type]) => `      ${key}: ${type}`),
    '    }',
    '  }',
    '}',
    '',
  ].join('\n'),
)

cpSync(join(home, 'layout.config.ts'), join(out, 'hooks', 'layout.config.ts'))
writeFileSync(join(out, '.stamp.json'), JSON.stringify(stampOf(), null, 2) + '\n')

// Swap: the watched folder goes from the old build to the new one in two renames.
const built = join(home, 'hub')
const old = join(home, 'hub.old')
rmSync(old, { recursive: true, force: true })
if (existsSync(built)) renameSync(built, old)
renameSync(out, built)
rmSync(old, { recursive: true, force: true })

console.log(`Built ${built}: vendored ${mods.join(', ')}; wired ${wired.size} hooks.`)
for (const line of outputLines) console.log(line)
if (disabled.length > 0) console.log(`disabled: ${disabled.join(', ')}`)

// Slots that name a mod this Hub does not host.
const config = readFileSync(join(home, 'layout.config.ts'), 'utf8')
for (const [, slot] of config.matchAll(/mod:\s*'([^']+)'/g)) {
  if (!mods.includes(slot)) console.log(`warning: slot for ${slot}, which is not hosted`)
}
// Names in the bands, toasts and status lists that are neither hosted nor disabled here.
for (const list of ['bands', 'toasts', 'status']) {
  const body = new RegExp(`\\b${list}:\\s*\\[([^\\]]*)\\]`).exec(config)?.[1] ?? ''
  for (const [, name] of body.matchAll(/'([^']+)'/g)) {
    if (!mods.includes(name) && !disabled.includes(name)) console.log(`warning: ${list} lists ${name}, which is not hosted`)
  }
}

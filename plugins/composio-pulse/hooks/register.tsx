import type { EngineInterface, Register } from 'claude-code'

let budget = 0 // userConfig.search_budget_ms; 0 hides the budget mark
const KEEP = 60
// composio in command position (line start, after ; & | ( ` or a `--` wrapper), not as an argument.
const CALL = /(?:^|[;&|(`]|\s--|\b(?:do|then|else))\s*(?:\S*\/)?composio\s+(search|execute|run|proxy)(?=\s|$)([^;&|\n]*)/m
const LINK = /(?:^|[;&|(`]|\s--|\b(?:do|then|else))\s*(?:\S*\/)?composio\s+link\s+([a-z0-9_]+)([^;&|\n]*)/m
const BARS = '▁▂▃▄▅▆▇█'

type Call = { kind: string; label: string; ms: number; ok: boolean; at: number }

const fmt = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`)

const pct = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

const spark = (values: number[]) => {
  const max = Math.max(...values, 1)
  return values.map(v => BARS[Math.min(BARS.length - 1, Math.floor((v / max) * BARS.length))]).join('')
}

const labelOf = (kind: string, rest: string) =>
  kind === 'search'
    ? (/["']([^"']+)["']/.exec(rest)?.[1] ?? rest.trim().split(/\s+/)[0] ?? '').slice(0, 40)
    : (rest.split(/\s+/).find(token => /^[A-Z][A-Z0-9_]{2,}$/.test(token)) ?? kind)

async function history($: EngineInterface) {
  return ((await $.store.get('calls')) as Call[] | undefined) ?? []
}

function showStatus($: EngineInterface, calls: Call[]) {
  if (calls.length === 0) return $.ui.status(undefined)
  const searches = calls.filter(c => c.kind === 'search' && c.ok).map(c => c.ms)
  const execs = calls.filter(c => c.kind !== 'search' && c.ok).map(c => c.ms)
  const last = calls.at(-1)!
  const parts = [`composio ${spark(calls.slice(-24).map(c => c.ms))}`]
  if (searches.length) {
    const p50 = pct(searches, 50)
    parts.push(`search p50 ${fmt(p50)}${budget ? ` ${p50 <= budget ? '✓' : '✗'}${budget}` : ''}`)
  }
  if (execs.length) parts.push(`exec p50 ${fmt(pct(execs, 50))}`)
  parts.push(`last ${last.label} ${last.ok ? '✓' : '✗'} ${fmt(last.ms)}`)
  $.ui.status(parts.join(' │ '))
}

export const register: Register = (on, options) => {
  budget = Number(options.search_budget_ms) || 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pulse', description: 'Latency of the composio CLI calls Claude has made, per kind and per call' })
    showStatus($, await history($))
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const link = LINK.exec(e.command)
    if (link && !/--(alias|list)\b/.test(link[2] ?? '')) {
      const toolkit = link[1]!
      const listed = await $.process.run([`${await $.env.get('HOME')}/.composio/composio`, 'connections', 'list'], { timeoutMs: 20_000 }).catch(() => null)
      const accounts = listed?.exitCode === 0 ? (JSON.parse(listed.stdout)[toolkit] ?? []) : []
      const active = accounts.find((a: any) => a.status === 'ACTIVE')
      if (active) {
        $.ui.toast(`blocked: ${toolkit} is already connected`)
        return { deny: `composio-pulse: ${toolkit} already has an ACTIVE connection (${active.word_id}); EXPIRED rows beside it are stale. Skip linking and run \`composio execute\` directly. Pass --alias to add a second account on purpose.` }
      }
    }

    const call = CALL.exec(e.command)
    if (!call) return next(e)

    const started = await $.clock.now()
    const ran = await next(e)
    const ms = (await $.clock.now()) - started
    const kind = call[1]!
    const ok = ran.deny === undefined && !ran.isError && !/"successful":\s*false/.test(ran.text ?? '')
    const entry: Call = { kind, label: labelOf(kind, call[2] ?? ''), ms, ok, at: Date.now() }

    const calls = [...(await history($)), entry].slice(-KEEP)
    await $.store.set('calls', calls)
    showStatus($, calls)

    if (kind === 'search' && ok) {
      const best = (await $.store.get('best-search')) as number | undefined
      if (best === undefined || ms < best) {
        await $.store.set('best-search', ms)
        if (best !== undefined) $.ui.toast(`🏁 new composio search PB: ${fmt(ms)} (was ${fmt(best)})`)
      }
    }
    return ran
  })

  on('command.run', { command: 'pulse' }, async $ => {
    const calls = await history($)
    if (calls.length === 0) return { text: 'No composio calls recorded yet.' }
    const kinds = [...new Set(calls.map(c => c.kind))]
    const summary = kinds.map(kind => {
      const ms = calls.filter(c => c.kind === kind && c.ok).map(c => c.ms)
      const failed = calls.filter(c => c.kind === kind && !c.ok).length
      return `${kind.padEnd(8)} n=${String(ms.length).padEnd(3)} p50 ${fmt(pct(ms, 50)).padEnd(6)} p95 ${fmt(pct(ms, 95)).padEnd(6)}${failed ? ` failed ${failed}` : ''}`
    })
    const best = (await $.store.get('best-search')) as number | undefined
    const recent = calls.slice(-15).reverse().map(c =>
      `${new Date(c.at).toLocaleTimeString('en-GB', { hour12: false })}  ${c.ok ? '✓' : '✗'} ${fmt(c.ms).padStart(6)}  ${c.kind.padEnd(8)} ${c.label}`,
    )
    return {
      text: [
        `composio CLI latency, last ${calls.length} calls (end to end, CLI startup included${budget ? `; search budget ${budget}ms` : ''}${best ? `, PB ${fmt(best)}` : ''})`,
        spark(calls.map(c => c.ms)),
        '',
        ...summary,
        '',
        ...recent,
      ].join('\n'),
    }
  })
}

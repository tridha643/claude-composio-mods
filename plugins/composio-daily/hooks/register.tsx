import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Standup } from '../types'

type $ = EngineInterface
type Json = any // composio responses are per-tool; each caller picks the fields it needs

const PANE = 'standup'
const STANDUP_MODEL = 'claude-haiku-4-5-20251001'
const HOUR = 3_600_000

const standup = atom({ plugin: 'composio-daily', key: 'standup' } as const, null)

async function composio($: $, slug: string, data: unknown): Promise<Json | null> {
  const bin = `${await $.env.get('HOME')}/.composio/composio`
  const run = await $.process
    .run([bin, 'execute', slug, '-d', JSON.stringify(data)], { timeoutMs: 20_000 })
    .catch(() => null)
  if (!run || run.exitCode !== 0) return null
  const out = await Promise.resolve()
    .then(() => JSON.parse(run.stdout))
    .catch(() => null)
  return out?.successful ? out.data : null
}

const searchPRs = async ($: $, q: string): Promise<Json[]> =>
  (await composio($, 'GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS', { q, per_page: 30 }))?.items ?? []

const linear = async ($: $, query: string, variables: object): Promise<Json | null> =>
  (await composio($, 'LINEAR_RUN_QUERY_OR_MUTATION', { query_or_mutation: query, variables }))?.data ?? null

// ---------------------------------------------------------------- standup

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

async function buildStandup($: $, now: number) {
  const day = new Date(now).getDay()
  const since = isoDate(now - (day === 1 ? 3 : day === 0 ? 2 : 1) * 24 * HOUR) // Monday looks back to Friday
  const email = (await $.process.run(['git', 'config', 'user.email']).catch(() => null))?.stdout.trim()

  const [commits, merged, open, tickets] = await Promise.all([
    email
      ? $.process
          .run(['git', 'log', '--all', '--no-merges', `--author=${email}`, `--since=${since}`, '--pretty=%h %s'])
          .then(r => r.stdout.trim())
          .catch(() => '')
      : '',
    searchPRs($, `is:pr author:@me is:merged merged:>=${since}`),
    searchPRs($, 'is:pr author:@me is:open archived:false'),
    linear(
      $,
      'query($s: DateTimeOrDuration!){ viewer { assignedIssues(first: 30, filter:{updatedAt:{gte:$s}}){ nodes { identifier title url state{name} } } } }',
      { s: since },
    ),
  ])

  const pr = (p: Json) => `- #${p.number} ${p.title} (${p.html_url})${p.draft ? ' [draft]' : ''}`
  const facts = [
    `Commits since ${since}:\n${commits || '(none)'}`,
    `PRs merged:\n${merged.map(pr).join('\n') || '(none)'}`,
    `PRs open:\n${open.map(pr).join('\n') || '(none)'}`,
    `Linear tickets touched:\n${
      tickets?.viewer?.assignedIssues?.nodes
        ?.map((t: Json) => `- ${t.identifier} ${t.title} [${t.state?.name}] (${t.url})`)
        .join('\n') || '(none)'
    }`,
  ].join('\n\n')

  return $.model.complete({
    model: STANDUP_MODEL,
    maxTokens: 800,
    system:
      'You write a software engineer\'s daily async standup for Slack. Three sections, bold headers: **Yesterday**, **Today**, **Blockers**. ' +
      'Short bullets in plain words, grouped by theme not by commit. Link PRs and tickets as markdown links, e.g. [#123](url). ' +
      'Today is a best guess from open PRs and in-progress tickets. Blockers is "None" unless the facts show one. No preamble, no sign-off.',
    prompt: facts,
  })
}

async function generate($: $) {
  const now = await $.clock.now()
  await update($, standup, s => ({ date: isoDate(now), text: s?.text ?? '', status: 'Gathering commits, PRs and tickets…' }))
  const reply = await buildStandup($, now)
  const next: Standup = reply.isAnswered
    ? { date: isoDate(now), text: reply.text, status: '' }
    : { date: isoDate(now), text: '', status: `Draft failed: ${reply.reason}` }
  await update($, standup, () => next)
  if (reply.isAnswered) await $.store.set('standup.last', next)
}

// ---------------------------------------------------------------- seen this before

const ago = (ms: number) => {
  const d = ms / (24 * HOUR)
  return d >= 14 ? `${Math.round(d / 7)}w ago` : d >= 1 ? `${Math.round(d)}d ago` : `${Math.round(ms / HOUR)}h ago`
}

// Picks the line that names the failure and strips what differs between runs (paths, numbers, ids).
function errorSignature(output: string): string | null {
  const lines = output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 12)
  // an error message names the cause better than a FAIL banner, so it wins when both are there
  const line = lines.find(l => /(error|exception|panic|fatal)\b/i.test(l)) ?? lines.find(l => /\bfail/i.test(l))
  if (!line) return null
  const sig = line
    .replace(/\S*\/\S*/g, ' ')
    .replace(/\b[0-9a-f]{8,}\b|[\d.:]*\d[\d.:]*/gi, ' ')
    .replace(/["`]|(?<=\s)[^\w\s]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return sig.length > 12 ? sig.slice(0, 100) : null
}

async function seenBefore($: $, sig: string): Promise<string[]> {
  const now = await $.clock.now()
  const [slack, tickets, logs] = await Promise.all([
    composio($, 'SLACK_SEARCH_MESSAGES', { query: `"${sig}"`, count: 1, sort: 'timestamp' }),
    composio($, 'LINEAR_SEARCH_ISSUES', { query: sig, first: 1 }),
    composio($, 'CUSTOM_DATADOG_MCP_SEARCH_DATADOG_LOGS', {
      query: `"${sig}"`,
      from: 'now-30d',
      limit: 1,
      max_tokens: 2000,
      telemetry: { intent: 'Look up whether a local command failure was seen before in production logs' },
    }),
  ])
  const hits: string[] = []
  const msg = slack?.messages?.matches?.[0]
  if (msg) hits.push(`Slack #${msg.channel?.name ?? '?'} ${ago(now - Number(msg.ts) * 1000)} ${msg.permalink ?? ''}`.trim())
  const issue = tickets?.issues?.[0] ?? tickets?.nodes?.[0]
  if (issue) hits.push(`Linear ${issue.identifier} [${issue.state?.name ?? issue.state ?? '?'}] ${issue.title}`)
  // Datadog answers a TSV report, not JSON: read the match count and the explorer link out of it
  const report = String(logs?.data ?? '')
  const count = Number(report.match(/<count>(\d+)<\/count>/)?.[1] ?? 0)
  if (count > 0) hits.push(`Datadog ${count} logs in 30d ${report.match(/<logs_explorer_url>(.*?)<\/logs_explorer_url>/)?.[1] ?? ''}`.trim())
  return hits
}

// ---------------------------------------------------------------- agent-busy status

const BUSY_AFTER = 3 * 60_000

type Busy = { turnId: string; timer: { cancel: () => void }; isSet: boolean }

async function setBusy($: $, busy: Busy) {
  const me = (await composio($, 'SLACK_TEST_AUTH', {}))?.user_id
  const profile = me && (await composio($, 'SLACK_RETRIEVE_USER_PROFILE_INFORMATION', { user: me }))?.profile
  if (profile?.status_text) return // a status you set yourself wins
  const expiresAt = Math.round((await $.clock.now()) / 1000) + 3600 // self-clears if the session dies mid-run
  const ok = await composio($, 'SLACK_SET_STATUS', {
    profile: JSON.stringify({ status_text: 'agent cooking 🤖', status_emoji: ':robot_face:', status_expiration: expiresAt }),
  })
  busy.isSet = ok !== null
}

async function clearBusy($: $) {
  await composio($, 'SLACK_SET_STATUS', {
    profile: JSON.stringify({ status_text: '', status_emoji: '', status_expiration: 0 }),
  })
}

// ---------------------------------------------------------------- wiring

export const register: Register = (on, options) => {
  const channel = String(options.standup_channel ?? '').trim()
  const seenSigs = new Set<string>()
  let busy: Busy | null = null

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.isError !== true) return ran
    const sig = errorSignature(ran.text ?? JSON.stringify(ran.result ?? ''))
    if (sig && !seenSigs.has(sig)) {
      seenSigs.add(sig)
      void seenBefore($, sig).then(hits => hits.length > 0 && $.ui.toast(`Seen before: ${hits.join(' · ')}`))
    }
    return ran
  })

  on('turn.start', ($, e, next) => {
    if (!busy) {
      const b: Busy = { turnId: e.turnId, timer: { cancel: () => {} }, isSet: false }
      busy = b
      b.timer = $.clock.after(BUSY_AFTER, () => void setBusy($, b))
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    const b = busy
    if (b && e.turnId === b.turnId && !e.agentId) {
      busy = null
      b.timer.cancel()
      if (b.isSet) void clearBusy($)
    }
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'standup', description: 'Open the standup pane (drafts one if today has none)' })

    const last = (await $.store.get('standup.last')) as Standup | undefined
    const today = isoDate(await $.clock.now())
    if (last?.date === today) {
      await update($, standup, () => last)
    } else if (new Date().getHours() >= 6) {
      void $.ui.open({ id: PANE, title: 'Standup' })
      void generate($)
    }
    return next(e)
  })

  on('command.run', { command: 'standup' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Standup' })
    if ((await read($, standup))?.date !== isoDate(await $.clock.now())) void generate($)
    return { text: 'Standup pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const s = await read($, standup)

    return (
      <Box flexDirection="column">
        {s?.status && <Text dimColor>{s.status}</Text>}
        {s?.text ? <Markdown text={s.text} /> : !s?.status && <Text dimColor>No standup yet.</Text>}
        <Box>
          {s?.text && channel && (
            <Button
              key="post"
              label={`Post to ${channel}`}
              onPress={async () => {
                const sent = await composio($, 'SLACK_SEND_MESSAGE', { channel, markdown_text: s.text })
                $.ui.toast(sent ? `Standup posted to ${channel}` : 'Slack post failed')
              }}
            />
          )}
          {s?.text && (
            <Button
              key="copy"
              label="Copy"
              onPress={async pe => {
                const r = await $.ui.copy({ text: s.text, surface: pe.surface })
                $.ui.toast(r.isCopied ? 'Copied' : 'Copy failed')
              }}
            />
          )}
          <Button key="regen" label="Regenerate" onPress={() => void generate($)} />
        </Box>
      </Box>
    )
  })
}

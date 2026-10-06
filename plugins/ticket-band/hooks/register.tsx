import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ticket, TicketPr } from '../types'

// userConfig.team_keys narrows this to your Linear team keys; empty matches any KEY-123
let ticketInBranch = /\b([a-z]{2,10})-(\d+)\b/i
// Commands after which the branch (and so the ticket) may have changed.
const BRANCH_MOVES = /\b(git\s+(checkout|switch|worktree)|gt\s+(co|checkout|create|up|down|top|bottom|sync)|gh\s+pr\s+(checkout|merge))\b/

const ticket = atom({ plugin: 'ticket-band', key: 'ticket' } as const, null)
const isHidden = atom({ plugin: 'ticket-band', key: 'isHidden' } as const, false)

const ISSUE = `query($id: String!) { issue(id: $id) {
  id identifier title description state { name type } cycle { endsAt }
  team { states { nodes { id name } } }
  attachments { nodes { url metadata } } } }`

const MARK_DONE = `mutation($id: String!, $stateId: String!, $body: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) { success }
  commentCreate(input: { issueId: $id, body: $body }) { success } }`

async function linear($: EngineInterface, query: string, variables: Record<string, string>) {
  const args = JSON.stringify({ query_or_mutation: query, variables })
  const { stdout } = await $.process.run([`${await $.env.get('HOME')}/.composio/composio`, 'execute', 'LINEAR_RUN_QUERY_OR_MUTATION', '-d', args], { timeoutMs: 60_000 })
  const out = JSON.parse(stdout)
  if (!out.successful) throw new Error(String(out.error))
  return out.data.data
}

async function refresh($: EngineInterface) {
  const branch = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  const match = branch.exitCode === 0 ? ticketInBranch.exec(branch.stdout) : null
  if (!match) return update($, ticket, () => null)

  const { issue } = await linear($, ISSUE, { id: `${match[1]}-${match[2]}`.toUpperCase() })
  if (!issue) return update($, ticket, () => null)

  const prs: TicketPr[] = issue.attachments.nodes
    .filter((a: any) => a.metadata?.isPullRequestProjection)
    .map((a: any) => ({ number: a.metadata.number, url: a.url, status: a.metadata.draft ? 'draft' : a.metadata.status, mergedAt: a.metadata.mergedAt ?? null }))
    .sort((a: TicketPr, b: TicketPr) => a.number - b.number)
  const wanted = (issue.description ?? '').split('\n').find((line: string) => /^wanted:/i.test(line.trim()))

  const next: Ticket = {
    id: issue.identifier,
    issueId: issue.id,
    title: issue.title,
    state: issue.state.name,
    stateType: issue.state.type,
    doneStateId: issue.team.states.nodes.find((s: any) => s.name === 'Done')?.id ?? null,
    cycleEndsAt: issue.cycle?.endsAt ?? null,
    wanted: wanted?.trim() ?? null,
    prs,
  }
  await update($, ticket, () => next)
}

// Every PR merged or closed, at least one merged, ticket not closed yet.
const isStale = (t: Ticket) =>
  t.prs.length > 0 &&
  t.prs.every(pr => pr.status === 'merged' || pr.status === 'closed') &&
  t.prs.some(pr => pr.status === 'merged') &&
  t.stateType !== 'completed' &&
  t.stateType !== 'canceled'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

async function markDone($: EngineInterface, t: Ticket) {
  if (!t.doneStateId) return $.ui.toast(`${t.id}: no Done state on this team`)
  const merged = t.prs.filter(pr => pr.status === 'merged')
  const last = merged.map(pr => pr.mergedAt).filter(Boolean).sort().at(-1)
  const body = `Merged as ${merged.map(pr => `#${pr.number}`).join(', ')}${last ? ` (last on ${day(last)})` : ''}; moving to Done.`
  try {
    await linear($, MARK_DONE, { id: t.issueId, stateId: t.doneStateId, body })
    $.ui.toast(`${t.id} → Done`)
    await refresh($)
  } catch (err) {
    $.ui.toast(`${t.id}: Linear update failed: ${String(err).slice(0, 120)}`)
  }
}

async function safeRefresh($: EngineInterface) {
  try {
    await refresh($)
  } catch (err) {
    $.ui.toast(`ticket-band: ${String(err).slice(0, 120)}`)
  }
}

export const register: Register = (on, options) => {
  const keys = String(options.team_keys ?? '').split(',').map(k => k.trim()).filter(k => /^[a-z0-9]+$/i.test(k))
  if (keys.length > 0) ticketInBranch = new RegExp(`\\b(${keys.join('|')})-(\\d+)\\b`, 'i')
  on('session.start', async ($, e, next) => {
    void safeRefresh($)
    $.clock.every(5 * 60_000, () => void safeRefresh($))
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (BRANCH_MOVES.test(e.command)) void safeRefresh($)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const t = await read($, ticket)
    if (e.props.hasSurvey || t === null || (await read($, isHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const icon = { merged: '✓', open: '○', draft: '◌', closed: '✗' } as Record<string, string>
    const color = { merged: 'green', open: 'yellow', draft: 'gray', closed: 'red' } as Record<string, string>

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text bold color="magenta">{t.id}</Text>
          <Text color="cyan">{t.state}</Text>
          {t.cycleEndsAt && <Text dimColor>cycle ends {day(t.cycleEndsAt)}</Text>}
          <Text wrap="truncate-end">{t.title}</Text>
        </Box>
        {t.prs.length > 0 && (
          <Box gap={1}>
            {t.prs.map(pr => <Text color={color[pr.status] ?? 'gray'}>#{pr.number} {icon[pr.status] ?? '?'}</Text>)}
          </Box>
        )}
        {t.wanted && <Text dimColor wrap="truncate-end">{t.wanted}</Text>}
        <Box gap={1}>
          {isStale(t) && <Text color="yellow">every PR merged, still {t.state}</Text>}
          {isStale(t) && <Button key="done" hotkey="d" variant="primary" label="Move to Done" onPress={() => markDone($, t)} />}
          <Button key="refresh" hotkey="r" label="Refresh" dimColor onPress={() => safeRefresh($)} />
          <Button key="hide" label="Hide" dimColor onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}

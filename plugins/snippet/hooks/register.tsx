import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const GH = 'gh'
let channel = '' // userConfig.channel, set in register; empty hides the Post button
const PANE = 'snippet'

const draft = atom({ plugin: 'snippet', key: 'draft' } as const, null)
const phase = atom({ plugin: 'snippet', key: 'phase' } as const, 'drafting')
const note = atom({ plugin: 'snippet', key: 'note' } as const, '')

const LINEAR_TODAY = `query { viewer { assignedIssues(first: 30, filter: { updatedAt: { gt: "-P1D" } }) {
  nodes { identifier title url state { name } } } } }`

const system = () => `You write the user's daily Slack update for ${channel || 'their team channel'}.
Style: lowercase, casual, terse, like an engineer posting in their team channel. No headings, no emoji walls, no fluff, no "excited to".
Shape: 2-5 short bullet lines covering shipped, in progress, and next or blockers. Skip a category with nothing in it.
Link PRs as [repo#N](url) and tickets as [TEAM-N](url). Only state facts present in the input; never invent numbers or outcomes.
Output the message text only.`

async function composio($: EngineInterface, slug: string, data: object) {
  const { stdout } = await $.process.run([`${await $.env.get('HOME')}/.composio/composio`, 'execute', slug, '-d', JSON.stringify(data)], { timeoutMs: 60_000 })
  const out = JSON.parse(stdout)
  if (!out.successful) throw new Error(`${slug}: ${out.error}`)
  return out.data
}

async function gather($: EngineInterface) {
  const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const query = `query { search(query: "is:pr author:@me org:ComposioHQ updated:>=${since}", type: ISSUE, first: 30) {
    nodes { ... on PullRequest { number title url state isDraft mergedAt repository { name } } } } }`
  const [gh, linear] = await Promise.all([
    $.process.run([GH, 'api', 'graphql', '-f', `query=${query}`]),
    composio($, 'LINEAR_RUN_QUERY_OR_MUTATION', { query_or_mutation: LINEAR_TODAY }),
  ])
  const prs = gh.exitCode === 0 ? JSON.parse(gh.stdout).data.search.nodes : []
  return { prs, tickets: linear.data.viewer.assignedIssues.nodes }
}

async function redraft($: EngineInterface, extra: string) {
  await update($, phase, () => 'drafting')
  await update($, note, () => 'pulling Linear + GitHub from the last 24h…')
  try {
    const facts = await gather($)
    const prompt = `PRs touched in the last 24h:\n${JSON.stringify(facts.prs, null, 1)}\n\nLinear tickets updated in the last 24h:\n${JSON.stringify(facts.tickets, null, 1)}${extra ? `\n\nExtra notes from the user (include these):\n${extra}` : ''}`
    const reply = await $.model.complete({ model: 'sonnet', system: system(), prompt, maxTokens: 800, effort: 'low' })
    if (!reply.isAnswered) throw new Error(`model: ${reply.reason}`)
    await update($, draft, () => reply.text.trim())
    await update($, phase, () => 'ready')
    await update($, note, () => `${facts.prs.length} PRs, ${facts.tickets.length} tickets`)
  } catch (err) {
    await update($, phase, () => 'failed')
    await update($, note, () => String(err).slice(0, 200))
  }
}

async function post($: EngineInterface) {
  const text = await read($, draft)
  if (!text || (await read($, phase)) !== 'ready') return
  await update($, phase, () => 'posting')
  try {
    await composio($, 'SLACK_SEND_MESSAGE', { channel, markdown_text: text })
    await update($, phase, () => 'posted')
    $.ui.toast(`Posted to ${channel}`)
  } catch (err) {
    await update($, phase, () => 'ready')
    $.ui.toast(String(err).slice(0, 160))
  }
}

export const register: Register = (on, options) => {
  channel = String(options.channel ?? '').trim()
  let lastExtra = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'snippet', description: `Draft today's ${channel || 'Slack'} update from Linear + GitHub; optional notes as args` })
    return next(e)
  })

  on('command.run', { command: 'snippet' }, async ($, e) => {
    lastExtra = e.args.trim()
    await $.ui.open({ id: PANE, title: `Daily snippet → ${channel || 'Slack'}`, focus: true, closeOnEscape: true })
    void redraft($, lastExtra)
    return { text: 'Drafting snippet…' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const text = await read($, draft)
    const now = await read($, phase)
    const status = await read($, note)

    return (
      <Box flexDirection="column" gap={1}>
        {now === 'drafting' || text === null ? <Text dimColor>{status || 'drafting…'}</Text> : <Markdown text={text} />}
        <Box gap={1}>
          {now === 'ready' && channel && <Button key="post" hotkey="p" variant="primary" label={`Post to ${channel}`} onPress={() => post($)} />}
          {now === 'posting' && <Text color="yellow">posting…</Text>}
          {now === 'posted' && <Text color="green">✓ posted</Text>}
          {text && (
            <Button key="copy" hotkey="c" label="Copy" onPress={async press => {
              await $.ui.copy({ text, surface: press.surface })
              $.ui.toast('Copied')
            }} />
          )}
          {now !== 'drafting' && now !== 'posting' && <Button key="redraft" hotkey="g" label="Redraft" onPress={() => redraft($, lastExtra)} />}
          {now !== 'drafting' && <Text dimColor>{now === 'failed' ? status : status && `from ${status}`}</Text>}
        </Box>
      </Box>
    )
  })
}

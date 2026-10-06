import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ArmedNudge, Reviewer, WaitingPr } from '../types'

const GH = 'gh'
const PANE = 'reviews'

const prs = atom({ plugin: 'review-chaser', key: 'prs' } as const, null)
const armed = atom({ plugin: 'review-chaser', key: 'armed' } as const, null)
const sent = atom({ plugin: 'review-chaser', key: 'sent' } as const, [])

const OPEN_PRS = `query { search(query: "is:pr is:open draft:false author:@me org:ComposioHQ -review:approved", type: ISSUE, first: 40) {
  nodes { ... on PullRequest { number title url createdAt repository { name }
    reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login name } } } } } } } }`

async function composio($: EngineInterface, slug: string, data: object) {
  const { stdout } = await $.process.run([`${await $.env.get('HOME')}/.composio/composio`, 'execute', slug, '-d', JSON.stringify(data)], { timeoutMs: 60_000 })
  const out = JSON.parse(stdout)
  if (!out.successful) throw new Error(`${slug}: ${out.error}`)
  return out.data
}

async function refresh($: EngineInterface) {
  const { exitCode, stdout, stderr } = await $.process.run([GH, 'api', 'graphql', '-f', `query=${OPEN_PRS}`])
  if (exitCode !== 0) return $.ui.toast(`gh failed: ${stderr.slice(0, 120)}`)
  const list: WaitingPr[] = JSON.parse(stdout).data.search.nodes
    .map((pr: any) => ({
      repo: pr.repository.name,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      createdAt: pr.createdAt,
      reviewers: pr.reviewRequests.nodes.map((r: any) => r.requestedReviewer).filter((r: any) => r?.login),
    }))
    .filter((pr: WaitingPr) => pr.reviewers.length > 0)
    .sort((a: WaitingPr, b: WaitingPr) => a.createdAt.localeCompare(b.createdAt))
  await update($, prs, () => list)
}

const firstName = (r: Reviewer) => (r.name ?? r.login).split(/[\s-]/)[0] ?? r.login

async function slackUser($: EngineInterface, r: Reviewer) {
  const cached = (await $.store.get(`slack:${r.login}`)) as { id: string; name: string } | undefined
  if (cached) return cached
  const { members = [] } = await composio($, 'SLACK_FIND_USERS', { search_query: r.name ?? r.login, limit: 3 })
  const hit = members.find((m: any) => !m.is_bot && !m.deleted)
  if (!hit) return null
  const user = { id: hit.id as string, name: (hit.real_name ?? hit.name) as string }
  await $.store.set(`slack:${r.login}`, user)
  return user
}

// First press resolves the Slack user and arms; second press on the same button sends.
async function nudge($: EngineInterface, pr: WaitingPr, r: Reviewer) {
  const key = `${pr.repo}#${pr.number}:${r.login}`
  const current = await read($, armed)
  try {
    if (current?.key !== key) {
      const user = await slackUser($, r)
      if (!user) return $.ui.toast(`No Slack user found for ${r.name ?? r.login}`)
      const text = `hey ${firstName(r)}, could you take a look at <${pr.url}|${pr.repo}#${pr.number}> when you get a sec? (${pr.title})`
      return update($, armed, () => ({ key, slackId: user.id, slackName: user.name, text }))
    }
    const dm = await composio($, 'SLACK_OPEN_DM', { users: current.slackId })
    await composio($, 'SLACK_SEND_MESSAGE', { channel: dm.channel.id, markdown_text: current.text })
    await update($, armed, () => null)
    await update($, sent, list => [...list, key])
    $.ui.toast(`Nudged ${current.slackName} on ${pr.repo}#${pr.number}`)
  } catch (err) {
    $.ui.toast(String(err).slice(0, 160))
  }
}

const age = (iso: string) => {
  const hours = Math.floor((Date.now() - Date.parse(iso)) / 3_600_000)
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'reviews', description: 'Open PRs waiting on reviewers, with a Slack nudge per reviewer' })
    return next(e)
  })

  on('command.run', { command: 'reviews' }, async $ => {
    await update($, armed, () => null)
    await $.ui.open({ id: PANE, title: 'Waiting on review', focus: true, closeOnEscape: true })
    void refresh($)
    return { text: 'Review chaser opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, prs)
    const armedNudge = await read($, armed)
    const done = await read($, sent)

    if (list === null) return <Text dimColor>Loading your open PRs…</Text>

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text dimColor>{list.length} PRs waiting · press a name to arm, again to DM ·</Text>
          <Button key="refresh" hotkey="r" label="Refresh" dimColor onPress={() => refresh($)} />
        </Box>
        {list.length === 0 && <Text color="green">Nothing waiting on review.</Text>}
        {list.map(pr => (
          <Box flexDirection="column" marginTop={1}>
            <Box gap={1}>
              <Text color={Date.now() - Date.parse(pr.createdAt) > 3 * 86_400_000 ? 'red' : 'yellow'}>{age(pr.createdAt).padStart(4)}</Text>
              <Text bold>{pr.repo}#{pr.number}</Text>
              <Text wrap="truncate-end">{pr.title}</Text>
            </Box>
            <Box gap={1} marginLeft={5} flexWrap="wrap">
              {pr.reviewers.map(r => {
                const key = `${pr.repo}#${pr.number}:${r.login}`
                if (done.includes(key)) return <Text color="green">✓ {firstName(r)}</Text>
                const isArmed = armedNudge?.key === key
                return (
                  <Button
                    key={key}
                    variant={isArmed ? 'primary' : undefined}
                    dimColor={!isArmed}
                    label={isArmed ? `send to ${armedNudge.slackName}?` : `nudge ${firstName(r)}`}
                    onPress={() => nudge($, pr, r)}
                  />
                )
              })}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })
}

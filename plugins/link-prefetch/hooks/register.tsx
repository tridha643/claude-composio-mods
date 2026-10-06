import type { EngineInterface, Register } from 'claude-code'

type $ = EngineInterface
type Json = any // composio responses are per-tool; each caller picks the fields it needs

const CONTEXT_CAP = 12_000

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

const linear = async ($: $, query: string, variables: object): Promise<Json | null> =>
  (await composio($, 'LINEAR_RUN_QUERY_OR_MUTATION', { query_or_mutation: query, variables }))?.data ?? null

type Link =
  | { kind: 'slack'; url: string; channel: string; ts: string }
  | { kind: 'linear'; url: string; id: string }
  | { kind: 'github'; url: string; owner: string; repo: string; number: number }

function findLinks(text: string): Link[] {
  const links: Link[] = []
  for (const m of text.matchAll(/https:\/\/[\w-]+\.slack\.com\/archives\/(\w+)\/p(\d{10})(\d{6})\S*/g)) {
    const root = m[0].match(/thread_ts=(\d+\.\d+)/)?.[1]
    links.push({ kind: 'slack', url: m[0], channel: m[1]!, ts: root ?? `${m[2]}.${m[3]}` })
  }
  for (const m of text.matchAll(/https:\/\/linear\.app\/[\w-]+\/issue\/([A-Z]+-\d+)\S*/g)) {
    links.push({ kind: 'linear', url: m[0], id: m[1]! })
  }
  for (const m of text.matchAll(/https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\S*/g)) {
    links.push({ kind: 'github', url: m[0], owner: m[1]!, repo: m[2]!, number: Number(m[3]) })
  }
  // ponytail: first 5 links only, so a pasted wall of URLs can't stall the prompt
  return links.filter((l, i) => links.findIndex(o => o.url === l.url) === i).slice(0, 5)
}

async function fetchLink($: $, link: Link): Promise<unknown> {
  switch (link.kind) {
    case 'slack': {
      const data = await composio($, 'SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION', {
        channel: link.channel,
        ts: link.ts,
        limit: 100,
      })
      return data?.messages?.map((m: Json) => ({ user: m.user ?? m.username, ts: m.ts, text: m.text }))
    }
    case 'linear':
      return (
        await linear(
          $,
          'query($id:String!){ issue(id:$id){ identifier title url state{name} assignee{name} priorityLabel description comments(first:30){nodes{user{name} body createdAt}} } }',
          { id: link.id },
        )
      )?.issue
    case 'github': {
      const pr = await composio($, 'GITHUB_GET_A_PULL_REQUEST', {
        owner: link.owner,
        repo: link.repo,
        pull_number: link.number,
      })
      return (
        pr && {
          title: pr.title,
          state: pr.merged ? 'merged' : pr.state,
          draft: pr.draft,
          author: pr.user?.login,
          base: pr.base?.ref,
          head: pr.head?.ref,
          size: `+${pr.additions} -${pr.deletions} in ${pr.changed_files} files`,
          reviewers: pr.requested_reviewers?.map((r: Json) => r.login),
          body: pr.body,
        }
      )
    }
  }
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    const links = findLinks(e.text)
    if (links.length === 0) return next(e)

    $.ui.status(`prefetching ${links.length} link${links.length > 1 ? 's' : ''}…`)
    const fetched = await Promise.all(links.map(l => fetchLink($, l).catch(() => null)))
    $.ui.status(undefined)

    const blocks = links.flatMap((l, i) =>
      fetched[i] == null
        ? []
        : [`Prefetched via Composio (${l.kind}) ${l.url}:\n${JSON.stringify(fetched[i], null, 1).slice(0, CONTEXT_CAP)}`],
    )
    const missed = links.length - blocks.length
    $.ui.toast(`Prefetched ${blocks.length}/${links.length} link${links.length > 1 ? 's' : ''}${missed ? `, ${missed} failed` : ''}`)

    return next({ ...e, context: [...(e.context ?? []), ...blocks] })
  })
}

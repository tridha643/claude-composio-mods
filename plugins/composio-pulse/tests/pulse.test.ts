import { expect, mock, test } from 'claude-code/testing'

const ran = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

test('blocks composio link when the toolkit already has an ACTIVE connection', async ($, on) => {
  mock.store(on)
  on('ui.toast', () => {})
  on('process.run', () => ran(JSON.stringify({ slack: [{ status: 'EXPIRED', word_id: 'slack_old' }, { status: 'ACTIVE', word_id: 'slack_live' }] })))
  on('tool.call', { tool: 'Bash' }, () => { throw new Error('link should never run') })

  const result = await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'composio link slack --no-wait' } as any)

  expect(result.deny).toContain('slack_live')
})

test('lets composio link through when only EXPIRED rows exist', async ($, on) => {
  mock.store(on)
  on('process.run', () => ran(JSON.stringify({ notion: [{ status: 'EXPIRED', word_id: 'notion_old' }] })))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' }, text: 'linked' }) as any)

  const result = await $.tool.call({ tool: 'Bash', tool_use_id: 't2', command: 'composio link notion' } as any)

  expect(result.deny).toBe(undefined)
})

test('times a composio search into the status line and history', { options: { search_budget_ms: 250 } }, async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 1_000 })
  const statuses: (string | undefined)[] = []
  on('ui.status', (_, e) => { statuses.push(e.text) })
  on('ui.toast', () => {})
  on('tool.call', { tool: 'Bash' }, async () => {
    await clock.advance(240)
    return { result: { stdout: '{"successful": true}', stderr: '' }, text: '{"successful": true}' } as any
  })

  await $.tool.call({ tool: 'Bash', tool_use_id: 't3', command: 'composio search "send slack message" --limit 3' } as any)

  const calls = (await $.store.get({ key: 'calls' } as any)) as any[]
  expect(calls).toMatchObject([{ kind: 'search', label: 'send slack message', ms: 240, ok: true }])
  expect(statuses.at(-1)).toContain('search p50 240ms ✓250')
})

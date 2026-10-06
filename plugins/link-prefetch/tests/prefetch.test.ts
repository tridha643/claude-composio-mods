import { expect, mock, test } from 'claude-code/testing'

const ran = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

test('a pasted GitHub PR link puts that PR in the prompt context', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e: any) =>
    e.argv.includes('GITHUB_GET_A_PULL_REQUEST')
      ? ran(JSON.stringify({ successful: true, data: { title: 'Fix flaky search test', state: 'open', user: { login: 'octocat' } } }))
      : ran('', 1),
  )
  on('prompt.submit', (_, e) => e)

  const result = await $.prompt.submit({ text: 'review https://github.com/acme/api/pull/42 please' } as any)

  expect(result.context?.join('\n')).toContain('Fix flaky search test')
})

test('a prompt with no link enters untouched', async ($, on) => {
  on('process.run', () => { throw new Error('nothing to fetch') })
  on('prompt.submit', (_, e) => e)

  const result = await $.prompt.submit({ text: 'what does this function do?' } as any)

  expect(result).toMatchObject({ text: 'what does this function do?' })
  expect(result.context ?? []).toEqual([])
})

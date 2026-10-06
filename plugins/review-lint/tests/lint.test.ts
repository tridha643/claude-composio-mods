import { expect, test } from 'claude-code/testing'

test('hands Claude the test rules when an edit adds a call-count assertion', async ($, on) => {
  on('ui.toast', () => {})
  on('tool.call', { tool: 'Edit' }, () => ({ result: {}, text: 'edited' }) as any)

  const result = await $.tool.call({
    tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/src/search.test.ts',
    old_string: 'expect(out).toEqual(rows)', new_string: 'expect(fetchRows).toHaveBeenCalledTimes(1)', replace_all: false,
  } as any)

  expect(result.context?.join('\n')).toContain("couples the test to implementation")
})

test('hands Claude the cache checklist once per file, and stays quiet for unrelated edits', async ($, on) => {
  on('ui.toast', () => {})
  on('tool.call', { tool: 'Edit' }, () => ({ result: {}, text: 'edited' }) as any)
  const edit = (id: string, new_string: string) => $.tool.call({
    tool: 'Edit', tool_use_id: id, file_path: '/repo/src/rows.ts', old_string: 'return rows', new_string, replace_all: false,
  } as any)

  expect((await edit('e2', 'return rows.slice(0, 10)')).context).toBe(undefined)
  expect((await edit('e3', 'await redis.setex(key, ttlSeconds, rows)')).context?.join('\n')).toContain('How is hit rate measured')
  expect((await edit('e4', 'await cache.set(key, rows)')).context).toBe(undefined)
})

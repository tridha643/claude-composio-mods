import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

// Assertions that couple a test to implementation: call counts, timing, cache-hit and ORM query-shape checks.
const BRITTLE_TEST = /toHaveBeenCalledTimes|performance\.now\(\)|Date\.now\(\)\s*-|toBeLessThan(OrEqual)?\(\s*\d+\s*\)|\b(cacheHits?|hitCount|misses)\b|toHaveBeenCalledWith\([^)]*\b(findMany|findUnique|findFirst|\$queryRaw)\b/
// Case-sensitive on purpose: catches userCache / cacheTtlMs / setex without matching "settle".
const CACHE = /[Cc]ache|setex|[Ee]xpire|\b(lru|LRU|ttl|TTL)|[a-z](Ttl|TTL)|[Mm]emoiz/
const IS_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/
const IS_CODE = /\.([cm]?[jt]sx?|go|py|rs)$/

const TEST_RULES = `review-lint: this edit adds an assertion that couples the test to implementation details. Don't assert call counts (toHaveBeenCalledTimes), cache hits, ORM query shapes or wall-clock timings (performance.now() < N). Assert the observable result instead: the returned value, the persisted row, or the response the caller sees. Rework the assertion unless the user asked for exactly this.`

const CACHE_CHECKLIST = `review-lint: this edit introduces caching. Before finishing, make sure the change (code, PR body, or design doc) answers this cache-review checklist:
1. How is hit rate measured? Ship a hit/miss metric so a cache that never hits gets noticed.
2. How is it invalidated, and what is the TTL?
3. How do future code paths that change the underlying data stay invalidating it?
4. If no invalidation is needed, say why.
5. Is it behind a flag with an off or shadow mode for rollback?
Mention any gaps to the user; don't invent answers.`

// Reminded once per file and rule; resets on reload, which is fine.
const told = new Set<string>()

function lint(path: string, added: string, removed: string) {
  if (IS_TEST.test(path)) return BRITTLE_TEST.test(added) && !BRITTLE_TEST.test(removed) ? TEST_RULES : null
  return IS_CODE.test(path) && CACHE.test(added) && !CACHE.test(removed) ? CACHE_CHECKLIST : null
}

function remind($: EngineInterface, ran: ToolCallResult, path: string, rule: string | null) {
  if (!rule || ran.deny !== undefined || ran.isError || told.has(`${path}:${rule}`)) return ran
  told.add(`${path}:${rule}`)
  $.ui.toast(rule === TEST_RULES ? `brittle test assertion in ${path.split('/').pop()}` : `new cache in ${path.split('/').pop()}: checklist sent to Claude`)
  return { ...ran, context: [...(ran.context ?? []), `${rule}\n(file: ${path})`] }
}

export const register: Register = on => {
  on('tool.call', { tool: 'Edit' }, async ($, e, next) =>
    remind($, await next(e), e.file_path, lint(e.file_path, e.new_string, e.old_string)),
  )

  on('tool.call', { tool: 'Write' }, async ($, e, next) =>
    remind($, await next(e), e.file_path, lint(e.file_path, e.content, '')),
  )
}

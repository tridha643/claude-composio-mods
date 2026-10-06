export type SnippetPhase = 'drafting' | 'ready' | 'posting' | 'posted' | 'failed'

declare module 'claude-code' {
  interface PluginState {
    snippet: { draft: string | null; phase: SnippetPhase; note: string }
  }
}

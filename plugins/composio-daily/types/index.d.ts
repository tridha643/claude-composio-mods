export type Standup = { date: string; text: string; status: string }

declare module 'claude-code' {
  interface PluginState {
    'composio-daily': { standup: Standup | null }
  }
}

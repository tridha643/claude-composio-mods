export type TicketPr = { number: number; url: string; status: string; mergedAt: string | null }

export type Ticket = {
  id: string
  issueId: string
  title: string
  state: string
  stateType: string
  doneStateId: string | null
  cycleEndsAt: string | null
  wanted: string | null
  prs: TicketPr[]
}

declare module 'claude-code' {
  interface PluginState {
    'ticket-band': { ticket: Ticket | null; isHidden: boolean }
  }
}

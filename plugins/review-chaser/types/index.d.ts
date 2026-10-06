export type Reviewer = { login: string; name: string | null }

export type WaitingPr = {
  repo: string
  number: number
  title: string
  url: string
  createdAt: string
  reviewers: Reviewer[]
}

// A nudge resolved to a Slack user, waiting for the second press that sends it.
export type ArmedNudge = { key: string; slackId: string; slackName: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'review-chaser': { prs: WaitingPr[] | null; armed: ArmedNudge | null; sent: string[] }
  }
}

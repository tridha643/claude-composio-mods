# claude-composio-mods

Seven Claude Code mods (function-hook plugins) that wire your terminal into Slack, Linear, GitHub and Datadog through the [Composio CLI](https://composio.dev).

Demo: [video/out.mp4](video/out.mp4). The video is built with [fframes](https://fframes.studio); its source is in [`video/`](video/).

- **ticket-band**: Shows the Linear ticket for the current branch above the prompt, with one-press Done once every PR has merged.
- **review-chaser**: `/reviews` lists your open PRs waiting on reviewers, with a Slack nudge button per reviewer.
- **snippet**: `/snippet` drafts your daily Slack update from the last 24h of Linear + GitHub and posts it on one press.
- **composio-daily**: `/standup` pane, looks up failing-test errors in Datadog ("seen before"), and sets your Slack status while the agent is busy.
- **link-prefetch**: Paste a Slack thread, Linear issue or GitHub PR link and Claude gets its contents as context before it answers.
- **composio-pulse**: Times every `composio` CLI call into a status-line sparkline (`/pulse` for details) and blocks re-linking a toolkit that's already connected.
- **review-lint**: When an edit adds a cache or a brittle test assertion, hands Claude a cache-review checklist or rules against implementation-coupled tests.

## Install

```
/plugin marketplace add tridha643/claude-composio-mods
/plugin install ticket-band@claude-composio-mods
```

Install whichever mods you want the same way. To hack on them instead, clone the repo and run `claude --plugin-dir plugins/<mod>`.

## Requirements

- The Composio CLI, installed at `~/.composio/composio` and logged in, with the toolkits each mod uses connected (Slack, Linear, GitHub, Datadog).
- `gh`, logged in, for `review-chaser` and `snippet`.
- `review-chaser` and `snippet` search PRs in the `ComposioHQ` org; change the query in `hooks/register.tsx` for your own org.

## Settings

Set these from the `/plugin` config menu:

- `composio-daily` → `standup_channel`: the Slack channel the standup Post button sends to.
- `snippet` → `channel`: the Slack channel `/snippet` posts to.
- `ticket-band` → `team_keys`: comma-separated Linear team keys to look for in branch names. Empty matches any `KEY-123`.
- `composio-pulse` → `search_budget_ms`: marks the median search time ✓ or ✗ against this budget. `0` hides the mark.

An empty channel hides that Post button.

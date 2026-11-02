# cuehq-mcp

CueHQ finds Reddit, X, YouTube and TikTok threads where people ask for what you sell, ranks them, and drafts replies in your voice. The drafts keep learning from your edits and your own posts. You post every reply yourself. Agents get the ranked threads and the drafts, not raw posts to filter.

This repository is the `cuehq-mcp` npm package: a small stdio bridge to the CueHQ MCP server at https://www.cuehq.social/mcp, for agents that start MCP servers as a local command. CueHQ never posts and never signs in to your accounts.

## Why an agent should use it instead of scraping

- The threads arrive ranked and deduplicated across four platforms, so the agent reads the ones that matter instead of filtering raw posts.
- Every thread comes with drafts in your voice, and the drafts keep learning from the edits you make and from what your own accounts post.
- CueHQ remembers what was answered and what was skipped, so nothing comes back twice.

## Remote setup

If your agent can add a remote MCP server by URL, you do not need this package.

- URL: `https://www.cuehq.social/mcp` (streamable HTTP)
- Header: `Authorization: Bearer cuehq_sk_...`

The steps for each agent are at https://www.cuehq.social/agents.

## Local setup

1. Make a key in CueHQ under Settings, Agents. Copy it when it appears, it is shown once.
2. Add the server to your agent's MCP config. Most stdio clients use this shape:

```json
{
  "mcpServers": {
    "cuehq": {
      "command": "npx",
      "args": ["-y", "cuehq-mcp"],
      "env": {
        "CUEHQ_API_KEY": "cuehq_sk_..."
      }
    }
  }
}
```

A key acts as you, so keep it out of shared files. Revoke it under Settings, Agents at any time.

Environment:

- `CUEHQ_API_KEY`: required. Your key.
- `CUEHQ_MCP_URL`: optional. Another endpoint on www.cuehq.social, or a localhost URL for testing.

Node 20 or later.

## Tools

The bridge adds no tools of its own. These are the seven tools of the CueHQ MCP server:

- Your brands (`brands`): the brands on your account, with each one's plan, handles and how many sources it watches.
- List cues (`list_cues`): a brand's cues, newest first, by tab (all, priority, mentions, competitors) and by status (surfaced, engaged, skipped).
- Get a cue (`get_cue`): one cue in full, with the post, where it is, its top replies and any drafts already written for it.
- Draft a reply (`draft_reply`): drafts replies to a cue in your voice, or returns the drafts it already has. Nothing is posted.
- Mark replied (`mark_replied`): logs the reply you posted yourself, so CueHQ can track how the thread grows.
- Skip a cue (`skip_cue`): skips a cue so it leaves the deck.
- Weekly report (`weekly_report`): this week next to last week for one brand.

## Pricing

The free plan includes 14 cues. Paid plans start at $19 per brand a month. A key draws on the plan of the account that made it, so the agent sees the same cues and drafts you do.

## Privacy and terms

- Privacy: https://www.cuehq.social/legal/privacy
- Terms: https://www.cuehq.social/legal/terms

## License

MIT. See [LICENSE](LICENSE).

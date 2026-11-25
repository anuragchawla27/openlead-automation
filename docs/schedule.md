# Day 16: Scheduling and rate limits

## Daily cron
- `Daily Schedule` (Schedule Trigger) fires at 09:00 `Asia/Kolkata` (workflow timezone).
- `Scheduled Campaign` (Set node) supplies a fixed `campaign_prompt`. Edit that one value to change what the cron searches for.
- Both entry points (the manual `Intake Form` and the cron) go through `Prompt Not Empty`, so the rest of the pipeline is unchanged.
- `Parameter Normalizer` now reads the prompt from `Prompt Not Empty`, so a cron run does not depend on the form node.
- The cron only fires while the workflow is **Active**. The committed JSON has `active: false`. Activate it only for the demo or production.
- Repeated daily runs are safe: domain dedup against Master means the same companies are not written twice (NFR-08).
- Dispatch is deliberately **not** scheduled. Sending stays a manual, human-gated step.

## Rate limits (token-bucket style)
n8n HTTP `batching` sends N requests per interval, which acts as a token bucket.

| Node | Limit |
|---|---|
| SerpAPI Request | 1 request / 1.5 s |
| Scrape Page, Scrape About | 3 requests / 1 s |
| Groq Extract | 1 request / 25 s (Day 18b: about 2.4k tokens per call, free tier is about 8k per minute) |
| Groq Extract (fallback) | 1 request / 25 s |

Retries on SerpAPI and Groq nodes: 3 tries, 5 s wait. Every HTTP node continues on fail, so one bad lead never stops the run.

## Quota per scheduled run
Two B2B queries x up to 2 result pages = at most 4 SerpAPI credits per run.

# Incident runbook

First move for anything that looks wrong with sending: **stop the sending**. Deactivate `openlead-automation` (the daily cron) and do not run `openlead-dispatch`. Nothing is sent by itself, because dispatch is manual and starts in TEST_MODE.

Telegram alerts tell you which workflow, which node, the execution id and the error. Open n8n > Executions > that id to see the failing item.

| Symptom | Likely cause | What to do |
|---|---|---|
| Many Quarantine rows with `ERR_NOT_EXTRACTED` | Groq rate limit (429) or daily token limit | Check `Groq Extract` output for 429. Wait a few minutes (per-minute limit) or until the daily reset, then run the same prompt again: leads already in Master are skipped, the rest are retried. Do not lower the 25 s spacing. |
| Groq error 400 `json_validate_failed` | The model broke the output schema for one page | Nothing to do; it is retried on the fallback model. If it repeats for many pages, tell the maintainer. |
| SerpAPI error 429 or "out of searches" | Search quota used up | Check usage in the SerpAPI dashboard. Wait for the monthly reset or use another key. The run keeps going with the pages it already has. |
| Rows with `ERR_NO_PAGE_CONTENT: SCRAPE_FAILED` | Site slow (over 10 s), blocked (403) or down | Expected for some sites; the lead is logged, the run continues. Do not try to bypass a block. |
| Sheets or Gmail nodes fail with "token expired" or `invalid_grant` | Google OAuth app is in Testing mode, tokens last 7 days | Credentials > the Google credential > Reconnect. To stop it recurring, publish the OAuth app in Google Cloud (or accept the weekly reconnect). |
| Run finished but Master and Review are empty | Strict filter: pages did not prove the place or the decision maker | Read the `reason` column in Quarantine. If reasons are `BASED_ELSEWHERE` or `score below 60`, the search returned the wrong companies: change the city or wording. This is not a fault. |
| A Quarantine row for a company that is also in Review | The same prompt was run twice; the second run could not load the page | Delete the stale Review row by hand. |
| A lead looks wrong (wrong company, wrong person) | Page misread | Open the source page. Set `human_approval` to REJECTED (or delete the row). Add the domain to `Suppression_List` if it must never be contacted. Tell the maintainer, with the `master_lead_id`. |
| A draft email contains a claim you cannot find on the company's site | Model flattery that passed the checks | Do not approve it. Edit or delete `outreach_draft`, set `outreach_status` to NOT_SENT so it is drafted again. |
| An email was sent to someone who should not get one | Approval set by mistake, or TEST_MODE turned off | Set `TEST_MODE = true` in `Select Approved To Send`. Add the address and domain to `Suppression_List` now. Reply to the person, apologise, confirm removal. Note it in `docs/decisions.md`. |
| Someone replies UNSUBSCRIBE | Automatic reply handling is not built | Add their email and domain to `Suppression_List` the same day. |
| `outreach_status` is FAILED | Gmail error for that address | Read `send_notes`. Fix the cause, then set the status back to DRAFTED by hand. FAILED rows are never retried automatically. |
| No Telegram alert although a run failed | Error workflow not linked or not active, or the failure was on a continue-on-fail node | Check `openlead-error-handler` is Active and each workflow's Settings > Error Workflow points to it. Failures on HTTP, Gmail and Sheets nodes are recorded in the sheet, not alerted. |
| Telegram alert shows `SET_TELEGRAM_CHAT_ID` | Placeholder never replaced | Put your chat id in `Build Alert`. |
| n8n will not start or credentials will not open | `N8N_ENCRYPTION_KEY` changed | Restore the original key in `.env`; credentials cannot be read with a different key. |
| Everything lost after a restart | Volume deleted (`docker compose down -v`) | Restore from your exports: workflows from `handover/workflows/`, credentials re-created, data lives in the Google Sheet and is unaffected. |

## Backups
- Google Sheet: File > Version history is on by default. Download a CSV of each tab before a big change.
- Workflows: the repository holds them. Export from n8n before editing and commit.
- Never put API keys, the encryption key or the Telegram token in the repository. `node tests/qa/qa-matrix.js` (case X-10) and `node tests/unit/sanitize.test.js` scan for them.

## Escalation
Maintainer: the person who owns the repository (see `docs/handover.md`). Send: workflow name, execution id, the error text from Telegram, and what you did.

# Day 17: Telemetry and Telegram alerts (FR-18, TC-14)

## What it is
`workflows/openlead-error-handler.json` is a global error workflow: `Error Trigger -> Build Alert -> Telegram Alert`.
When a workflow that has it set as its Error Workflow fails with an uncaught error, a Telegram message is sent with the workflow name, failed node, execution ID, mode, time (IST) and error text.

## Setup (once)
1. Create a bot with `@BotFather` (`/newbot`) and copy the token. Never commit it.
2. Press Start on your bot, then get your chat ID from `@userinfobot`.
3. In n8n: Credentials > new > **Telegram API** > paste the token.
4. Import `openlead-error-handler.json`, open `Build Alert`, replace `REPLACE_WITH_TELEGRAM_CHAT_ID` with your chat ID, attach the Telegram credential to `Telegram Alert`, save and **Activate** it.
5. In each workflow (discovery, outreach, dispatch): **... > Settings > Error Workflow** > pick `openlead-error-handler`.

The committed file keeps the placeholder chat ID. The code node refuses to run while it is a placeholder (`SET_TELEGRAM_CHAT_ID`), so a half-configured handler fails loudly rather than silently.

## Safety
- Alert text is HTML-escaped, because Telegram rejects unescaped `<` and `&`.
- API keys, bearer tokens and bot tokens that appear in an error message are redacted before sending.
- Messages are truncated, so they stay under Telegram's 4096-character limit.

## TC-14 test (uncaught exception recovery)
Error workflows only fire for production (active, non-manual) runs. To prove it:
1. New workflow `tc14-test`: Schedule Trigger (every minute) -> Code node containing `throw new Error('TC-14 simulated failure');`.
2. Settings > Error Workflow = `openlead-error-handler`. Save and Activate.
3. Within about a minute the alert arrives in Telegram. Then **deactivate and delete** `tc14-test`.

## Known gaps
- Nodes set to "continue on fail" (all HTTP nodes, Gmail Send, Sheets writes) do not raise an error, so they do not alert. Dispatch failures are recorded as `FAILED` in the sheet instead.
- Handler uses a fixed chat ID in the code node, not `$env`, because n8n can block environment access in nodes.

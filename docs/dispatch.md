# Day 15: Approval gate and Gmail dispatch (FR-15, FR-16, FR-17, NFR-07)

Workflow: `workflows/openlead-dispatch.json` (separate, manual trigger).

Flow: Manual Trigger -> Read Master -> Read Suppression -> Select Approved To Send -> Gate Router
- SEND -> Build Message -> Gmail Send -> Record Result -> Write Result
- SUPPRESS -> Mark Suppressed -> Write Result
- REPORT -> Gate Report (counts, and every skipped lead with its reason)

## Sheet changes
Master tab, 3 new headers right of `draft_notes`: `sent_at`, `gmail_message_id`, `send_notes`.
New tab `Suppression_List` with headers: `email`, `domain`, `reason`, `added_at`.

## The gate (all must be true to send)
human_approval is APPROVED (trimmed, any case, exact word) | outreach_status is DRAFTED | not already SENT, no sent_at | valid email | subject and draft present | draft contains UNSUBSCRIBE | score >= 80 | email and domain not on Suppression_List. Max 5 per run.
Build Message re-checks approval and footer and throws DISPATCH_HALTED if either fails (defence in depth).
Suppressed leads are marked SUPPRESSED and never sent. Unapproved leads are skipped and listed in the REPORT item.

## TEST_MODE (default true)
Every email goes to `TEST_INBOX` (set it in the Select node), subject starts with [TEST], and the body names who it would have gone to. A test send never marks the lead SENT (status stays DRAFTED, `send_notes` says TEST_SENT). To go live, set `TEST_MODE = false` in the Select node; then success writes SENT + `sent_at`, failure writes FAILED.

## Decisions
- n8n's Gmail node (OAuth2, gmail.send scope) builds the RFC 822 message; we do not hand-build base64. The Gmail message id is logged in `gmail_message_id`.
- Gmail Send continues on error so one failed address cannot stop the batch; Sheets nodes stay loud.
- FAILED rows are not auto-retried; reset the status to DRAFTED by hand after checking.
- Re-running in test mode re-sends test emails to the test inbox (nothing marks the lead sent).
- Not yet built: automatic UNSUBSCRIBE-reply handling (the 24 h rule). Until then, add the address or domain to Suppression_List by hand.

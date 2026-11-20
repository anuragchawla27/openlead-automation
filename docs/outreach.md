# Day 14: Outreach drafter (FR-14, NFR-07)

Workflow: `workflows/openlead-outreach.json` (separate from the discovery workflow; manual trigger; **drafts only, nothing is sent**).

Flow: Manual Trigger -> Read Master -> Select Leads To Draft -> Build Draft Request -> Groq Draft -> Verify & Assemble Draft -> Write Draft

## Master tab: 4 new columns (add these headers to the right of `created_at`)
`outreach_subject`, `outreach_draft`, `drafted_at`, `draft_notes`

## What gets drafted
Master rows with `outreach_status` NOT_SENT or blank, no existing draft, valid email (not DISPOSABLE/INVALID), a contact name, evidence, and score >= 80. Max 10 per run. Rows already DRAFTED/SENT/FAILED are never re-drafted.

## Rules enforced in code (Verify & Assemble Draft)
- JSON parses, finish_reason is stop, all three fields present
- Body 35-90 words; greeting + body + sign-off under 120 words (footer excluded)
- `evidence_used` is a verbatim substring of the lead's stored evidence
- No number in the body that is not in the evidence/lead facts; no unsupported claims (award, certified, ranked...)
- No links, email addresses, phone numbers, emojis, exclamation marks, spam words, fake familiarity ("following up")
- Subject: max 10 words, contains the company name, no Re:/Fwd:
- A failed draft leaves `outreach_status` NOT_SENT and writes the reason to `draft_notes`; the next run retries it.

## Compliance footer (NFR-07)
Appended by code, not by the model: company, physical address, one-time-enquiry notice, "reply with UNSUBSCRIBE". Set the full postal address in `SENDER_ADDRESS` (top of the Verify node) before any real send.

## Decisions
- The stored `outreach_draft` is the complete email text (greeting, body, sign-off, footer), so the reviewer approves exactly what Day 15 will send. The handbook sample builds greeting/footer at send time; we build them at draft time.
- `human_approval` is never written by this workflow. The approval gate stays in Day 15.
- Groq `gpt-oss-120b`, `reasoning_effort: low`, temperature 0.2 (replaces Gemini).
- n8n's built-in retry waits a fixed 5 s (3 tries); it does not multiply the delay.

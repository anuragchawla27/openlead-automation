# Decisions

## Stack
- LLM: Groq `openai/gpt-oss-120b` instead of Gemini 1.5 Flash (strict json_schema supported; 20b failed null-handling in test C). Fallback model: `openai/gpt-oss-20b`. Temperature 0.
- SerpAPI free plan: 250 searches. Dev ~100, QA ~60, reserve ~90. Responses are pinned in n8n and saved as fixtures.

## Intake
- Intake uses a Groq parse step plus a code normalizer. Defaults: 20 leads, B2B size 11-50.
- Track B roles must be the role sought (prompt rule plus code persona filter).
- Campaign ID hashes a lowercased, sorted config, so the same normalized config always gives the same ID. Different prompt wording gives a different ID.

## Discovery
- Discovery uses pinned SerpAPI data in dev. Result filter = domain blocklist + list-page title heuristic, because ~60% of raw Google hits for the PDF dork are directories or listicles.
- The PDF's B2B dork returned mostly large firms and directories, and an over-constrained version returned zero results. Queries now use the geography plus founder and "our team" cues and exclude linkedin, naukri and clutch, e.g. `"web development agency" Pune founder -site:linkedin.com -site:naukri.com -site:clutch.co`. Checked in the browser before spending credits.
- Reddit's public JSON endpoint blocks scripts, so Track B uses SerpAPI with site:reddit.com. Candidate level is decided at extraction, not from SERP snippets, which are sometimes comment text.
- Avoid `new URL()` in n8n Code nodes (not available in the sandbox); use regex parsing.

## Scraping
- Scraper keeps 8,000 head + 3,993 tail chars (contact details sit in footers).
- Track B uses SERP title and snippet as text, since Reddit blocks scripts.
- 403 sites are logged as SCRAPE_FAILED and not bypassed. Cloudflare-obfuscated emails are flagged, not decoded.
- About-page second fetch: founders are usually named on /about, not on service pages. Skipped when the first page was not SCRAPED or is already an about/team/contact page, so blocked sites are never retried. Nav, header and footer text and lines already seen are stripped before merging.

## Extraction
- official_website comes from the scraped URL, not the LLM.
- Context budget (NFR-04, 2,000 input tokens): hard cap 4,500 characters, built as separate blocks (signal lines, page start, about page, page footer) so emails and roles are never truncated. Lines are selected, never edited. "Name - Title" lines are dropped as client testimonials. Measured prompt_tokens on Day 13: 1,051 to 1,463.
- Prompt examples must be fictional. A real test company's email and founder were once used as examples, which leaks the answer into the test. Removed on Day 13; Gigante re-ran with identical results, so earlier results were not leaked.
- Verbatim check compares folded text: typographic and non-breaking hyphens, curly quotes, odd spaces and zero-width characters are normalised on both sides (gpt-oss emits U+2011 hyphens). A matching snippet is then replaced with the page's own characters, so stored evidence is truly verbatim. Dropped snippets are kept in `dropped_snippets` for debugging.
- Emails must appear verbatim in the page text or are set to null. Webmail addresses are labelled FREE_WEBMAIL, not DISPOSABLE.
- Evidence quotes must be verbatim, 5+ word sentences, and not boilerplate (copyright, privacy policy, cookies).
- HQ is only set when the text labels it as headquarters. Office lists do not count.
- Generic inboxes (info@, contact@, sales@, a brand-name inbox) go in `company_contact_email`, never in the decision-maker email. If the model puts one there anyway, the validator re-labels it COMPANY_INBOX, adds DM_EMAIL_WAS_COMPANY_INBOX and lowers HIGH confidence to MEDIUM.
- Decision maker comes from a sentence naming a founder, CEO, MD, owner or director of the company. It counts as supported only if the name appears verbatim in the page next to a matching role word (Founder matches founded or founding) and not as a "Name - Title" testimonial line. Supported = role score 100, otherwise 0.
- Confidence: the model's rating is only capped by verified facts (LOW below 2 verified facts, HIGH capped to MEDIUM below 3). It is not a score input and can vary between runs.
- Network drops are marked `retryable`.
- Parked or error pages under 400 characters are tagged PAGE_UNUSABLE before the LLM step. Retryable extraction failures fall back to gpt-oss-20b, tagged model_used and capped at LOW confidence.

## Validation and scoring
- Email domain is compared by brand label (awrange.co.in matches awrange.com), not full hostname.
- Scoring follows the PDF table (0 points for missing or unsupported decision maker). Unknown HQ scores 50. A different Indian city than the target scores 50. Vetoed leads route to Quarantine with score 0.
- Routing: 80 and above Master, 60-79 Review, below 60 Quarantine. `reason_text` is derived from the route.
- Dedup key is a hash of the normalized domain (www and common subdomains stripped). crypto is blocked in the sandbox, so a deterministic 64-bit hash is used instead of SHA-256. In-run dedupe uses a Set; cross-run currently uses workflow static data (the Sheets-based lookup is still open).

## Persistence
- Four-tab Google Sheet. Every write is Append or Update Row, matching on a stable key (result_id, review_id, rejection_id, master_lead_id derived from the normalized domain), so reruns never duplicate rows.
- Stage A is an append-only discovery log written from a side branch after Extract Hits.
- human_approval defaults to PENDING and is only changed by hand.

## Deviations from the handbook
- Gemini replaced by Groq (above).
- master_lead_id is `MLD-` plus 10 characters from the domain hash, not the handbook's `MLD-<13 digits>-<4 chars>`. Deterministic IDs are required for idempotency (NFR-08).
- email_status also uses GENERIC_INBOX, FREE_WEBMAIL, DOMAIN_MISMATCH and UNAVAILABLE. outreach_status starts as NOT_SENT. Evidence is stored as pipe-joined text.
- 64-bit hash instead of SHA-256 (above).

## Known gaps
- Update Row on a re-run may overwrite human_approval, outreach_status and created_at. To be tested and fixed before any outreach is enabled.
- The fallback extraction path (Verify Extraction (fallback)) still uses the older whitespace-only comparison. Align it with the main path.
- Geography scores 50 when HQ is not labelled, even if the description says "in Pune".
- ICP scores a neutral 50 for every lead until employee counts are extracted.

## Day 13 result
- Campaign CMP-2026-8QF3 (Pune web agencies): Gigante 90, MagicWorks 83 and Awrange 83 reached Master; Sanpurple 68 went to Review.
- All scores were recomputed by hand from the sub-scores and matched. Evidence quotes were checked against the page text.
Decisions
- Master is append-only: Read Master Domains → Drop Existing Master → Write Master. Existing rows are never touched, so human_approval, outreach_status and created_at cannot reset.
- Sheet timestamps are IST text (YYYY-MM-DD HH:mm:ss IST); now_utc is kept inside n8n.
- Groq 429s are retried and fall back to gpt-oss-20b; failed extractions are not remembered by Dedup.
- Verification quotes are checked against page text only.
- Extract Hits enforces max_leads_limit across all queries; at most 2 SERP pages per query.
- Geography: if the HQ is unlabelled, score 75 when the target place is on the page, else 25.

Known gaps
- Track B (Reddit) is not connected beyond Reddit Text From SERP.
- Dedup memory is saved only when the workflow is active, not in manual runs (to confirm on Day 16). Master lookup is the real duplicate guard.
- Review sheet has no approval column; stale Review/Quarantine rows remain after a lead is promoted to Master.
- "Founders and CEOs only" is parsed but not enforced as a filter.
- Compiled queries do not change with the target industry.
- Same domain scored 71 then 86 across runs (AB Web Solutions); role evidence under review.
- NFR-04 (≤2,000 input tokens) is unmeasured; needs a live usage.prompt_tokens.
- Google OAuth in Testing mode expires every 7 days; reconnect before the demo.
## Known gaps and deviations (after the Jaipur and Kochi runs)
Known gaps
- Intuisyz (Kochi) is still quarantined as BASED_ELSEWHERE in the live v12 run; the v11 page replays at 70 (Review). Cause is the fetched About page text. It fails safe: a good lead is held back.
- Cloudflare-obfuscated emails are not decoded.
- "Headquarters in <other city>" scores 50 geography, not 10 (ClienZon).
- Run-to-run extraction variance (AB Web Solutions 71 vs 86).
- Track B (Reddit) is not wired past Reddit Text From SERP.
- The Review sheet has no approval column. "Founders and CEOs only" is not a filter.
- Groq free-tier 429s on the 120b model; the 20b fallback recovers.

Deliberate deviations from the handbook
- 64-bit pure-JS hash instead of SHA-256, because crypto is blocked in the n8n Code sandbox.
- Master is append-only after a domain lookup, not UPDATE, so re-runs cannot reset human_approval or created_at.
- Continue-on-fail is removed on the Sheets write nodes so write failures are loud, not silent.
- Groq gpt-oss-120b with a gpt-oss-20b fallback replaces Gemini 1.5 Flash.
- master_lead_id is MLD-<hash>; the handbook pattern is MLD-<13 digits>-<4>. To be aligned on Day 15.

## Day 14: Outreach drafter (FR-14, NFR-07)
Decisions
- Separate workflow openlead-outreach.json (manual trigger, drafts only, no Gmail node), so drafting cannot break discovery.
- Only Master rows with outreach_status NOT_SENT or blank, no existing draft, valid email, contact name, evidence and score >= 80 are drafted; max 10 per run. DRAFTED, SENT and FAILED rows are never re-drafted.
- Groq gpt-oss-120b (reasoning_effort low, temperature 0.2, strict JSON schema: subject, body, evidence_used) writes only the body. Greeting, sign-off and the compliance footer (address + UNSUBSCRIBE) are added by code.
- Deterministic verifier rejects: bad JSON or truncation, body outside 35-90 words, email over 120 words (footer excluded), evidence_used not verbatim in the stored evidence, numbers not in the lead facts, unsupported claims (award, ranked, certified), links/emails/phones/emojis/exclamation marks, spam or fake-familiarity phrases, subject without the company name. A failed draft stays NOT_SENT with the reason in draft_notes and is retried on the next run.
- Master gained 4 columns: outreach_subject, outreach_draft, drafted_at, draft_notes. outreach_draft stores the full email text, so the reviewer approves exactly what Day 15 will send (the handbook builds greeting and footer at send time).
- human_approval is never written by this workflow; the approval gate stays in Day 15.
- Live run: 3 of 3 real Pune leads drafted; 555-601 prompt tokens per lead.
Known gaps
- The verifier cannot catch subjective praise (the Gigante draft says "positions you well for scaling client projects"); add a praise-word guard in hardening.
- SENDER_ADDRESS is the placeholder "Maharashtra, India"; replace it with the full postal address before any real send.
- The first live run exposed three over-strict checks (digits in "n8n", "free up", a bullet dash in evidence_used); fixed and kept as regression tests.
- n8n retry waits a fixed 5 s for 3 tries; it is not exponential.

## Day 15: Approval gate, suppression check, Gmail dispatch (FR-15, FR-16, FR-17, NFR-07)

- Dispatch is a separate workflow (`openlead-dispatch.json`), run manually. It never runs inside discovery or drafting, so sending is always a deliberate act.
- Used the n8n Gmail node rather than a hand-built base64 RFC 822 message. It is less code and less to break.
- `TEST_MODE` defaults to `true`. In test mode the recipient is a test inbox, the subject gets `[TEST] `, the body names the real recipient, and the row is never marked `SENT`. It stays `DRAFTED` with a `TEST_SENT` note.
- Gate (all must hold): `human_approval` equals `APPROVED` (trimmed, case-insensitive), status `DRAFTED`, no `sent_at`, valid email, subject and draft present, draft contains `UNSUBSCRIBE`, score >= 80, and email and domain not on the suppression list. Build Message re-checks approval and footer and halts with `DISPATCH_HALTED` if either fails.
- Suppression is a `Suppression_List` tab (`email, domain, reason, added_at`). A match on email or domain writes `SUPPRESSED` and sends nothing (TC-13).
- The workflow never writes `human_approval`. Only a human sets it (TC-12).
- Max 5 sends per run. Header-injection characters are stripped from recipient and subject.
- `FAILED` rows are not auto-retried. A person must reset them.
- Test fix: `outreach.test.js` normalises CRLF when reading the prompt file, because Git on Windows checks files out with CRLF.
- Verified live: unapproved leads skipped, an approved lead produced a `[TEST]` email in the test inbox, and a suppressed approved lead produced no email and was marked `SUPPRESSED`.

Known gaps:
- Gmail sends from the authenticated user's address, not `engineering@pranavxlabs.com`. A real PranavX sender needs Workspace or a verified send-as alias.
- Automatic handling of UNSUBSCRIBE replies (24 h rule) is not built. Suppression rows are added by hand.
- `SENDER_ADDRESS` is still a placeholder and must be replaced before any live send.
- Google OAuth is in Testing mode, so tokens expire every 7 days. Reconnect before the demo.

## Day 16: Scheduling and rate limits

- Added a `Daily Schedule` trigger (09:00, workflow timezone Asia/Kolkata) and a `Scheduled Campaign` node that holds a fixed prompt. The manual form and the cron both enter through `Prompt Not Empty`.
- `Parameter Normalizer` reads the prompt from `Prompt Not Empty` instead of the form node, so cron runs do not crash.
- The committed workflow stays `active: false`. The cron fires only while the workflow is Active, so it is switched on only for the demo or production.
- Rate limits use n8n HTTP batching as a token bucket: SerpAPI 1 request per 1.5 s, page scrapes 3 per second, Groq 1 per 6 s (fallback 1 per 8 s). At most 4 SerpAPI credits per scheduled run.
- Daily re-runs are idempotent because Master domain dedup blocks repeat companies (NFR-08).
- Dispatch is not scheduled. Sending stays manual and human-gated.
- Verified live: a run started from the schedule node produced a valid config and routed leads to Master, Review and Quarantine.

Known gaps:
- n8n retry delay is a fixed 5 s, not exponential (NFR-01 asks for 5 s with multiplier 2).
- The scheduled prompt is fixed. Rotating campaigns is not built.

## Day 17: Telemetry and Telegram alerts (FR-18, TC-14)

- Added a global error workflow (`openlead-error-handler.json`): Error Trigger, Build Alert code node, Telegram node. Each pipeline workflow points to it through Settings > Error Workflow, which is set by hand because workflow IDs differ per machine.
- Alert text is HTML-escaped, API keys and tokens are redacted, and messages are truncated. The alert shows workflow, failed node, execution ID, mode, IST time and error.
- The bot token lives only in an n8n Telegram credential. The chat ID is a constant in the code node instead of `$env.TELEGRAM_ADMIN_CHAT_ID` (the handbook sample), because n8n can block env access in nodes. The committed file keeps a placeholder, and the node throws `SET_TELEGRAM_CHAT_ID` until it is set.
- Verified live: a sample alert from a manual test, and a real alert from a scheduled workflow that threw an uncaught error (TC-14).

Known gaps:
- Nodes set to continue on fail (HTTP, Gmail Send, Sheets writes) do not raise errors, so they do not alert. Dispatch failures are recorded as FAILED in the sheet.
- Error workflows fire only for production runs, not manual executions.

## Day 18: Track B talent sourcing (Reddit)

- Extended the Reddit branch past `Reddit Text From SERP`: post fetch, Groq extraction (strict schema), code verification, scoring and routing, then write to a `Talent_Leads` tab (qualified/review) or `Stage_B_Quarantine` (rejected). Rows upsert on `post_id`.
- Same anti-hallucination rules as Track B2B: a skill, link, quote, location or role is kept only if it appears in the post text. Experience level is set by code, never by the model.
- Track B score (my own weights, the handbook defines only the B2B formula): role 30, skills 25, portfolio 20, level 15, quote 10. Routing: >= 80 qualified, 60-79 review, < 60 rejected.
- Reddit returns HTTP 403 "Blocked" to the post fetch even with a browser User-Agent, and new API access needs approval. `Scrape Reddit Post` is therefore disabled in the repo, and leads are judged on the Google title and snippet.
- Snippets can mix text from other threads (seen live: a quote from another post attached to the wrong lead), so a snippet-only lead can never be auto-qualified. It is capped at REVIEW and a person confirms it. A snippet lead with a verified quote and AI role fit goes to REVIEW from a score of 50 (floor applies to snippets only).
- Freshness: older than 180 days is capped at REVIEW, older than 365 days is rejected.
- Discovery queries use short subreddit-scoped searches. The first long `intitle:` query made Google drop `site:` and return job boards.
- Verified live: 17 hits ran through every node, 1 REVIEW row and 16 quarantined, no unverifiable claim passed.

Known gaps:
- Fewer than 20 talent leads from Reddit snippets alone. Planned: open-web portfolio search, where pages can be fetched.
- Personalised talent invitations are not generated.
- A temporary API failure writes a quarantine row that a later success does not remove.

## Day 19: Track B open-web portfolio path

- Reddit snippets cannot show skills or links, so the talent track now also searches the open web: `site:github.io` portfolios and a general portfolio query that excludes job boards. The pages are fetched, cleaned to text, and listed with their real profile links before extraction.
- A fetched page is real text, so it is not capped like a snippet and can reach `TALENT_QUALIFIED`. The same verification applies: every skill, link, name and quote must appear in the page text. Experience level is set by code.
- The model returns `person_name`, kept only if it appears in the page. `Talent_Leads` gained `source_platform` and `candidate_name`.
- Verified live: 22 items through the merge, 5 web leads qualified, 10 rejected (a freelancer page, a page with no job-seeking statement, an old internship write-up), no unverifiable claim passed.

Known gaps:
- One Google snippet was stitched into 4 different Reddit threads (same quote, different titles). They sit in REVIEW and need a person to check them. Planned: reject a quote shared by 2 or more posts.
- Web scores all reach 100, so the score does not separate strong from weak leads.
- A page linking a different GitHub handle than its own URL needs a human check.
- Fewer than 20 talent leads so far. Planned: wider web queries and a higher hit limit.

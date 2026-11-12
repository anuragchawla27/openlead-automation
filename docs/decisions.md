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
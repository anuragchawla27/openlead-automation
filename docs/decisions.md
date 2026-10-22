# Decisions

## Stack
- LLM: Groq `openai/gpt-oss-120b` instead of Gemini 1.5 Flash (strict json_schema supported; 20b failed null-handling in test C). Fallback model: `openai/gpt-oss-20b`.
- SerpAPI free plan: 250 searches. Dev ~100, QA ~60, reserve ~90. Responses are pinned in n8n and saved as fixtures.

## Intake
- Intake uses a Groq parse step plus a code normalizer. Defaults: 20 leads, B2B size 11-50.
- Track B roles must be the role sought (prompt rule plus code persona filter).
- Campaign ID hashes a lowercased, sorted config, so the same normalized config always gives the same ID.

## Discovery
- Discovery uses pinned SerpAPI data in dev. Result filter = domain blocklist + list-page title heuristic, because ~60% of raw Google hits for the PDF dork are directories or listicles.
- Reddit's public JSON endpoint blocks scripts, so Track B uses SerpAPI with site:reddit.com. Candidate level is decided at extraction, not from SERP snippets, which are sometimes comment text.
- Avoid `new URL()` in n8n Code nodes (not available in the sandbox); use regex parsing.

## Scraping
- Scraper keeps 8,000 head + 3,993 tail chars (contact details sit in footers).
- Track B uses SERP title and snippet as text, since Reddit blocks scripts.
- 403 sites are logged as SCRAPE_FAILED and not bypassed. Cloudflare-obfuscated emails are flagged, not decoded.

## Extraction
- official_website comes from the scraped URL, not the LLM.
- Extraction context = SERP title/snippet + page head + footer + signal lines (under 4,500 chars, NFR-04).
- Emails must appear verbatim in the page text or are set to null. Webmail addresses are labelled FREE_WEBMAIL, not DISPOSABLE.
- Evidence quotes must be verbatim, 5+ word sentences, and not boilerplate (copyright, privacy policy, cookies).
- HQ is only set when the text labels it as headquarters. Office lists do not count.
- Generic inboxes (info@, business@) go in `company_contact_email`, never in the decision-maker email.
- Confidence is derived in code from verified facts (decision maker, email, size, 2+ quotes), not from the model's self-rating.
- Network drops are marked `retryable`.
Parked or error pages under 400 characters are tagged PAGE_UNUSABLE before the LLM step. Retryable extraction failures fall back to gpt-oss-20b, tagged model_used and capped at LOW confidence
Scoring follows the PDF table (0 points for missing or unsupported decision maker). Unknown HQ scores 50. A different Indian city than the target scores 50. Vetoed leads route to Quarantine with score 0
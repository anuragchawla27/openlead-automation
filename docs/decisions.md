# Decisions
- LLM: Groq `openai/gpt-oss-120b` instead of Gemini 1.5 Flash (strict json_schema supported; 20b failed null-handling in test C). Fallback model: `openai/gpt-oss-20b`.
- official_website comes from the scraped URL, not the LLM.
- Webmail addresses are labelled FREE_WEBMAIL, not DISPOSABLE.
- Emails must appear verbatim in the page text or are set to null.
- SerpAPI free plan: 250 searches. Dev ~100, QA ~60, reserve ~90. Cache all responses.
Intake uses a Groq parse step plus a code normalizer. Defaults: 20 leads, B2B size 11-50. Track B roles must be the role sought (prompt rule plus code persona filter). Campaign ID hashes a lowercased, sorted config, so the same normalized config always gives the same ID
Discovery uses pinned SerpAPI data in dev (1 credit spent, 249 left). Result filter = domain blocklist + list-page title heuristic, because ~60% of raw Google hits for the PDF dork are directories or listicles
Reddit’s public JSON endpoint blocks scripts, so Track B uses SerpAPI with site:reddit.com. Candidate level is decided at extraction, not from SERP snippets, which are sometimes comment text.
Scraper keeps 8,000 head + 3,993 tail chars (contact details sit in footers). Track B uses SERP title and snippet, since Reddit blocks scripts. 403 sites are logged as SCRAPE_FAILED and not bypassed. Cloudflare-obfuscated emails are flagged, not decoded. A pre-LLM trim step (Day 7) keeps input under 2,000 tokens (NFR-04)
Extraction context = SERP title/snippet + page head + footer + signal lines (under 4,500 chars, NFR-04). Quotes must be 5+ word sentences and verbatim. HQ only when labelled. Network drops are marked retryable
# Decisions
- LLM: Groq `openai/gpt-oss-120b` instead of Gemini 1.5 Flash (strict json_schema supported; 20b failed null-handling in test C). Fallback model: `openai/gpt-oss-20b`.
- official_website comes from the scraped URL, not the LLM.
- Webmail addresses are labelled FREE_WEBMAIL, not DISPOSABLE.
- Emails must appear verbatim in the page text or are set to null.
- SerpAPI free plan: 250 searches. Dev ~100, QA ~60, reserve ~90. Cache all responses.
Intake uses a Groq parse step plus a code normalizer. Defaults: 20 leads, B2B size 11-50. Track B roles must be the role sought (prompt rule plus code persona filter). Campaign ID hashes a lowercased, sorted config, so the same normalized config always gives the same ID
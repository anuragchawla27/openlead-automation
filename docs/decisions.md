# Decisions
- LLM: Groq `openai/gpt-oss-120b` instead of Gemini 1.5 Flash (strict json_schema supported; 20b failed null-handling in test C). Fallback model: `openai/gpt-oss-20b`.
- official_website comes from the scraped URL, not the LLM.
- Webmail addresses are labelled FREE_WEBMAIL, not DISPOSABLE.
- Emails must appear verbatim in the page text or are set to null.
- SerpAPI free plan: 250 searches. Dev ~100, QA ~60, reserve ~90. Cache all responses.
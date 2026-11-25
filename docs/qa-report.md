# QA execution report (Day 18)

Run with `node tests/qa/qa-matrix.js`. Every case runs the real code nodes from the workflow JSON files offline. Nothing is sent and no API is called. Live evidence column points to the day the same behaviour was seen in n8n.

TC-01 to TC-14 are the 14 cases the handbook defines. The handbook asks for 24 cases but lists only 14, so X-01 to X-10 are extra cases covering the anti-hallucination checks, retry classification, geography scoring, the send gate and secret hygiene.

**Result: 24 cases, 23 PASS, 1 PARTIAL, 0 FAIL**

| ID | Case | Result | Live evidence | Note |
|---|---|---|---|---|
| TC-01 | Valid B2B intake (30 IT companies in Pune) -> valid config, Pune queries | PASS | offline only |  |
| TC-02 | max_leads_limit 500 is clamped to 100 | PASS | offline only |  |
| TC-03 | SerpAPI 429 -> retried up to 3 times; run continues | PARTIAL | offline only | retries 3 times and the run survives a 429, but the wait is a fixed 5000 ms, not exponential (n8n core has no backoff setting) |
| TC-04 | Landing page 404/503 -> logged as SCRAPE_FAILED, pipeline continues | PASS | offline only |  |
| TC-05 | Scraper timeout over 10 s is aborted cleanly | PASS | Day 18 live (a page timed out after 10 s, was quarantined as ERR_NO_PAGE_CONTENT, the run continued) |  |
| TC-06 | Page with no emails -> verified_email null, role penalised | PASS | offline only |  |
| TC-07 | Exclusion term "staffing" -> veto, score 0, quarantined | PASS | offline only |  |
| TC-08 | Invalid email contact@@apex..com -> INVALID_SYNTAX | PASS | offline only |  |
| TC-09 | High-quality lead scores 80 or more -> MASTER | PASS | Day 16 live (Master rows) |  |
| TC-10 | Marginal lead scores 60-79 -> REVIEW | PASS | Day 16 live (Review rows) |  |
| TC-11 | Domain dedup blocks a re-processed domain (same run and later run) | PASS | Day 18 live (Jaipur was run twice; Master still holds 8 unique domains) |  |
| TC-12 | PENDING approval -> dispatch halted, nothing sent | PASS | Day 15 live (Gmail test mode) |  |
| TC-13 | Suppression match -> aborted, status SUPPRESSED | PASS | Day 15 live |  |
| TC-14 | Syntax error in a JS node -> Error Trigger alert to Telegram | PASS | Day 17 live (Telegram message received) |  |
| X-01 | Invented evidence quote is dropped | PASS | offline only |  |
| X-02 | Email not on the page is dropped (no hallucinated contact) | PASS | offline only |  |
| X-03 | Person name not on the page is dropped | PASS | offline only |  |
| X-04 | Groq 429 is retryable, 401 is not | PASS | offline only |  |
| X-05 | Malformed model JSON -> EXTRACTION_FAILED, nothing invented | PASS | offline only |  |
| X-06 | A lead whose city is only mentioned (not evidenced) cannot reach Master | PASS | offline only |  |
| X-07 | Lead based in another city ("no office in Mumbai") is quarantined | PASS | offline only |  |
| X-08 | Draft without the UNSUBSCRIBE footer is never sent | PASS | offline only |  |
| X-09 | Already-SENT lead is never sent twice | PASS | offline only |  |
| X-10 | No secrets or personal ids in any workflow JSON | PASS | offline only |  |

## Known gaps (honest list)

- TC-03 is PARTIAL: the retry count (3) and the survive-a-429 behaviour are met, the wait between tries is a fixed 5 s, not exponential. n8n has no backoff option on the HTTP node; a loop with a Wait node would be needed.
- Offline cases prove the code logic. Live evidence is only claimed where the behaviour was seen in n8n on the day shown.
- Mean lead time was not measured from n8n executions; the figure below is an estimate from the configured pacing.
- The Review tab has no approval column, so a Review record cannot be approved in place.

## Benchmark metrics

Measured on the live sheets of 2026-11-25. Full detail and the record-by-record table are in `docs/precision-audit.md`.

| Metric | Target | Measured | Status |
|---|---|---|---|
| Accepted-lead precision | >= 85% (min 80%) | 8 of 8 correct company, person and city on a manual site check by the intern (text-only floor was 4 of 8); company size not checked | MET (manual check) |
| Duplicate leakage | 0% | 0 of 8 Master domains repeated | MET |
| Evidence citation coverage | 100% | 8 of 8 B2B, 11 of 11 talent records carry a verbatim quote | MET |
| Mean lead time | <= 45 s (min 90 s) | not measured; about 30 s by configuration (25 s Groq spacing plus scraping) | NOT MEASURED |
| API retry recovery | >= 95% (min 90%) | before the fix 10 of 20 Groq calls failed; after it the same 20 results gave no ERR_NOT_EXTRACTED rows | MET after fix, one re-run |
| 20+ verified B2B leads | 20 | 8 Master, 7 Review | NOT MET |
| 20+ talent leads | 20 | 11 (9 qualified, 2 review) | NOT MET |

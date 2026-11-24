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
| TC-05 | Scraper timeout over 10 s is aborted cleanly | PASS | offline only |  |
| TC-06 | Page with no emails -> verified_email null, role penalised | PASS | offline only |  |
| TC-07 | Exclusion term "staffing" -> veto, score 0, quarantined | PASS | offline only |  |
| TC-08 | Invalid email contact@@apex..com -> INVALID_SYNTAX | PASS | offline only |  |
| TC-09 | High-quality lead scores 80 or more -> MASTER | PASS | Day 16 live (Master rows) |  |
| TC-10 | Marginal lead scores 60-79 -> REVIEW | PASS | Day 16 live (Review rows) |  |
| TC-11 | Domain dedup blocks a re-processed domain (same run and later run) | PASS | offline only |  |
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
- API retry recovery (>= 95%) and mean lead time (<= 45 s) are measured from real n8n executions, see the metrics section once filled in.

## Benchmark metrics (fill from live data)

| Metric | Target | Measured | Source |
|---|---|---|---|
| Accepted-lead precision | >= 85% (min 80%) | TBD | manual audit of Master rows |
| Duplicate leakage | 0% | TBD | Master domain column |
| Evidence citation coverage | 100% | TBD | Master evidence column |
| Mean lead time | <= 45 s | TBD | n8n execution time / leads |
| API retry recovery | >= 95% | TBD | n8n execution log |

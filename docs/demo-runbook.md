# Live demo runbook (Day 19)

Length: about 25 minutes, of which about 17 are the B2B run. Do the **before** list the day before.

## Before (day before)
1. Docker running, n8n open, `node tests/unit/run-all.js` and `node tests/qa/qa-matrix.js` both clean.
2. Google credentials reconnected (the Testing-mode token lasts 7 days). Open a Sheets node and press "Fetch" to confirm.
3. SerpAPI: at least 12 searches left (one B2B run uses 2 to 4, one talent run 8). Groq: it is a new day for the daily limit.
4. All workflows set to timezone Asia/Kolkata; error handler Active; Error Workflow linked on master, outreach, dispatch.
5. `Select Approved To Send`: `TEST_MODE = true`, test inbox set to your own address.
6. Use a **city that is not in Master yet**, otherwise dedup removes the companies and the demo looks empty. Save a spare city for the demo (for example Surat or Chandigarh).
7. Keep one finished Master row with a draft ready, in case the live run is slow.

## Part 1: B2B campaign (run it live, talk while it works)
Prompt: `Find 40 web development agencies in <demo city> with 11-50 employees. Target founders or CEOs. Exclude staffing and recruitment firms.`
1. Show the Intake Form and submit the prompt.
2. Open `Parameter Normalizer` output: valid config, limit, city in the queries, a campaign id. Say: the model parses, the code checks (a limit of 500 would be clamped to 100).
3. While it runs, open `docs/architecture.md` and walk the picture: search, scrape, extract, verify, validate, score, route.
4. Show the sheets filling: Stage_A, then Stage_B_Quarantine (point at reasons: `BASED_ELSEWHERE`, `ERR_NO_PAGE_CONTENT` timeout, junk pages rejected), Review (score 60-79) and Master (80+).
5. Open one Master row: every quote in `evidence` is word for word from the page; the person's name and title are on the page.
6. Show a rejected invention: a Review row with `DROPPED_UNVERIFIED_SNIPPET` in `verification_flags` (the model made up a quote; the code removed it).

Fallback if the run is slow: stop talking about waiting, show the last real run's rows and say so.

## Part 2: Talent campaign
Prompt: `Find students and freshers looking for AI automation or AI engineer internships. Check Reddit and personal portfolio sites. Maximum 30 candidates.`
1. `Parameter Normalizer`: task category `TALENT_RECRUITMENT`, 8 queries (3 Reddit, 5 portfolio sites).
2. Talent_Leads: show a `TALENT_QUALIFIED` row (portfolio page, verified seeking quote, skills only from the page) and the Quarantine reasons `NOT_A_JOB_SEEKER`, `NO_SEEKING_INTENT`, `SHARED_QUOTE`.
3. Say plainly: Reddit snippet-only leads can never be QUALIFIED, and a person confirms each lead.

## Part 3: Draft, approve, gate, send (test mode)
1. Run `openlead-outreach`: show a draft (35-90 words, one verbatim fact, UNSUBSCRIBE footer).
2. Run `openlead-dispatch` **with `human_approval` = PENDING**: the report says nothing was sent (TC-12).
3. Set one lead to APPROVED. Run dispatch again: one email arrives in **your own inbox** with `[TEST]` in the subject.
4. Add that lead's domain to `Suppression_List`, run dispatch: status becomes SUPPRESSED (TC-13).

## Part 4: Safety and alerts
1. Show `docs/qa-report.md`: 24 cases, 23 PASS, 1 PARTIAL (TC-03, fixed 5 s retry), 0 FAIL.
2. Telegram alert (TC-14): run the `tc14-test` workflow from `docs/telemetry.md` (a Code node that throws, on a one-minute schedule, error workflow linked) and show the message, then delete it.
3. State the open gaps from `docs/handover.md` before anyone else finds them: 8 Master and 11 talent leads against a 20 target, precision not confirmed by a site check, unsubscribe replies handled by hand.

## After
Deactivate the cron, set TEST_MODE back to true if you changed it, delete `tc14-test`, delete demo rows from the sheet only if the client asks.

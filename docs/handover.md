# Handover (Day 20)

Project: OpenLead Automation, PranavX Labs AI Automation internship (handbook PX-ENG-2026-OL-01).
Built to run locally in n8n (Docker). The language model is **Groq `openai/gpt-oss-120b`** with `gpt-oss-20b` as fallback, instead of Gemini.

## Deliverables against the handbook checklist

| Deliverable | Status | Where |
|---|---|---|
| Master workflow JSON | Done | `workflows/openlead-master.json` (B2B and talent) |
| Incident workflow JSON | Done | `workflows/openlead-error-handler.json` |
| Outreach and dispatch workflows | Done | `workflows/openlead-outreach.json`, `openlead-dispatch.json` |
| Clean import copies (no credentials, no sheet id) | Done | `handover/workflows/`, rebuilt by `node tools/sanitize-workflows.js` |
| JSON schemas and prompts | Done | `schemas/`, `prompts/` |
| Deterministic validator and scoring code | Done | `code-nodes/` and the code nodes in the workflows |
| Three-stage Google Sheet | Done | `docs/sheet-schema.md`, `docs/docker-setup.md` |
| Gmail dispatch with approval gate | Done (test mode default) | `docs/dispatch.md` |
| Telegram alerts | Done | `docs/telemetry.md` |
| QA execution report (24 cases) | Done: 23 PASS, 1 PARTIAL, 0 FAIL | `docs/qa-report.md`, run `node tests/qa/qa-matrix.js` |
| Precision audit | Done on all existing records: text audit plus a manual site check of all 8 | `docs/precision-audit.md` |
| 20+ verified B2B leads | **Not met**: 8 Master, 7 Review | live sheet |
| 20+ talent leads | **Not met**: 11 (9 qualified, 2 review) | live sheet |
| Architecture diagrams (SVG) | Done | `docs/architecture.md`, `docs/architecture/*.svg` |
| Docker setup guide | Done | `docs/docker-setup.md` |
| Incident runbook | Done | `docs/incident-runbook.md` |
| Live demo (both campaigns) | Script ready | `docs/demo-runbook.md` |
| Clean git repository | Done: no secrets (scanned by tests), work on feature branches, merged by pull request | GitHub history |

## Benchmarks (details in `docs/precision-audit.md`)

| Benchmark | Target | Result |
|---|---|---|
| Accepted-lead precision | 85% (min 80%) | Met: 8 of 8 correct company, person and city on a manual site check by the intern (text-only floor was 4 of 8). Company size was not checked. |
| Duplicate leakage | 0% | 0 of 8 |
| Evidence citation coverage | 100% | 100% |
| Mean lead time | 45 s (min 90 s) | Not measured; about 30 s by configuration |
| API retry recovery | 95% (min 90%) | Met after the Day 18b fix on one re-run |

## Known gaps and honest limits

1. **Lead volume.** 8 Master and 11 talent leads, not 20. Reaching 20 needs more cities or searches, which cost SerpAPI and Groq credits.
2. **Evidence stored is thin.** Four Master records (Qrologic, Dribble, Groot, Arthonsys) are not fully proven by their stored quotes, although a manual site check found all four correct. Possible fix, not built: cap a lead at Review unless the stored quotes name the decision maker.
3. **Company size.** The 11-50 range is scored but not enforced; Arthonsys (reported 51-200) reached Master.
4. **Retry delay is fixed 5 s, not exponential** (TC-03 PARTIAL). n8n has no backoff option on the HTTP node.
5. **Role fit for talent is generous** (a full-stack internship seeker scored 100 for an AI search), so a person confirms each talent lead. Reddit snippet-only leads are REVIEW at most.
6. **No approval column on the Review tab.** Copy a genuine Review lead to Master by hand.
7. **Re-running the same prompt** can leave a stale Review row beside a new Quarantine row for the same domain. Delete the stale row.
8. **UNSUBSCRIBE replies are not read automatically.** Add the sender to `Suppression_List` by hand the same day.
9. **Continue-on-fail nodes do not alert Telegram.** Their failures appear in the sheet.
10. **Cloudflare-hidden emails are not decoded**, so those leads show email UNAVAILABLE.
11. **`SENDER_ADDRESS` is a placeholder.** Set a real postal address in `Verify & Assemble Draft` before any real send.
12. **`master_lead_id` format** differs from the handbook's `MLD-<13 digits>-<4>`.
13. **Google OAuth in Testing mode expires every 7 days.**
14. The handbook lists 24 test cases but defines only 14; TC-01 to TC-14 follow the handbook and X-01 to X-10 were added.
15. Personal data: `Talent_Leads` holds names and public portfolio links of private individuals. Do not commit sheet exports to the repository, and use the data only for the stated recruitment purpose.

## Handover sign-off

| Item | Owner | Date | Signature |
|---|---|---|---|
| Code, tests and docs reviewed | | | |
| Demo run and accepted | | | |
| Known gaps above accepted | | | |
| Credentials (Groq, SerpAPI, Google, Telegram) transferred or revoked | | | |
| `N8N_ENCRYPTION_KEY` handed over safely (not by email, not in the repo) | | | |

## Commands to verify the handover
```
node tests/unit/run-all.js      # 10 suites, 0 failed
node tests/qa/qa-matrix.js      # 24 cases, 23 PASS, 1 PARTIAL, 0 FAIL
node tools/sanitize-workflows.js && git status --short   # prints nothing if handover/workflows is current
```

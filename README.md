# OpenLead Automation

An instruction-driven lead pipeline built in n8n for the PranavX Labs AI Automation internship. A plain-language request ("Find 40 web development agencies in Jaipur with 11-50 employees...") becomes searches, page reads, extracted facts, code-checked scores and three sheet tiers. A second track finds students and freshers looking for AI internships. Outreach drafts are written for review and are **never sent without a human typing APPROVED**.

Runs locally in Docker. The language model is Groq `gpt-oss-120b` (fallback `gpt-oss-20b`).

## The idea in one line
The model suggests, the code decides: a name, email, quote, skill or link is kept only if the same text is on the page, and the score and route are computed by code.

## Where things are
| Folder or file | What it holds |
|---|---|
| `workflows/` | the four n8n workflows (discovery, outreach, dispatch, error handler) |
| `handover/workflows/` | clean copies to import on a new n8n (no credentials, no sheet id) |
| `code-nodes/`, `prompts/`, `schemas/` | node code, model prompts, JSON schemas |
| `tests/unit/` | offline tests that run the real node code (`node tests/unit/run-all.js`) |
| `tests/qa/` | the 24-case QA matrix (`node tests/qa/qa-matrix.js`) |
| `tools/` | `sanitize-workflows.js` rebuilds the clean copies |
| `docs/` | setup, runbooks, architecture, QA report, audit, decisions |

## Start here
1. `docs/docker-setup.md`: run n8n, create the sheet and credentials, import the workflows.
2. `docs/demo-runbook.md`: the demo script.
3. `docs/architecture.md`: pictures of both flows.
4. `docs/incident-runbook.md`: what to do when something breaks.
5. `docs/qa-report.md` and `docs/precision-audit.md`: what was tested and what the data shows.
6. `docs/handover.md`: status against the handbook, known gaps, sign-off.
7. `docs/decisions.md`: why it was built this way, day by day.

## Safety defaults
- Dispatch is manual and starts in TEST_MODE: every email goes to your own inbox.
- Gate: APPROVED word, drafted, not sent before, valid email, UNSUBSCRIBE footer, score 80+, not on the suppression list.
- No keys in the repository. Tests scan for secrets.

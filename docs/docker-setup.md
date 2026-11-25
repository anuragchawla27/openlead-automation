# Setup guide: n8n in Docker, from zero

Tested layout: Docker Desktop on Windows, n8n in one container, data in a Docker volume. Nothing is deployed to the internet.

## 1. Start n8n
1. Install Docker Desktop and start it.
2. In the repo folder, copy `.env.example` to `.env` and fill it:
   - `N8N_ENCRYPTION_KEY`: a long random string. **Write it down.** n8n encrypts saved credentials with it; if you lose it, the credentials cannot be read.
   - `GROQ_API_KEY`, `SERPAPI_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`: kept for reference. The workflows read their keys from **n8n credentials** (step 3), not from these variables.
3. `docker compose up -d`
4. Open http://localhost:5678 and create the owner account.
5. If port 5678 is already in use, change the left number in `docker-compose.yml` (for example `"5679:5678"`) and open that port instead.
6. Pin the image so a surprise upgrade cannot break the workflows: run `docker exec openlead-n8n n8n --version`, then replace `n8nio/n8n:latest` in `docker-compose.yml` with that exact version.

The compose file sets the timezone to Asia/Kolkata and keeps data in the `n8n_data` volume. `docker compose down` keeps your data; `docker compose down -v` **deletes** it.

## 2. Create the Google Sheet
Create a spreadsheet named `OpenLead` with these tabs and header rows (row 1). Column names are exact.

- `Stage_A_Raw_Research`: result_id, campaign_id, source_url, normalized_domain, source_platform, title, discovery_time, scrape_status, http_status
- `Stage_B_Review_Queue`: review_id, result_id, campaign_id, company_name, normalized_domain, lead_score, sub_scores, email_status, verification_flags, validated_at
- `Stage_B_Quarantine`: rejection_id, result_id, campaign_id, normalized_domain, lead_score, reason, quarantined_at
- `Stage_C_Master_Approved`: master_lead_id, normalized_domain, company_name, contact_name, designation, verified_email, email_status, lead_score, evidence, headquarters_location, human_approval, outreach_status, campaign_id, created_at, outreach_subject, outreach_draft, drafted_at, draft_notes, sent_at, gmail_message_id, send_notes
- `Suppression_List`: email, domain, reason, added_at
- `Talent_Leads`: talent_id, post_id, post_url, author_handle, subreddit, title, seeking_role, skills, portfolio_links, experience_level, location, evidence, lead_score, route, reasons, campaign_id, post_fetch_status, discovered_at, text_source, posted_at, source_platform, candidate_name

## 3. Create the credentials in n8n (Credentials > New)
| Credential | Type | Value |
|---|---|---|
| Groq API | Header Auth | name `Authorization`, value `Bearer <your Groq key>` |
| SerpAPI | Query Auth | name `api_key`, value your SerpAPI key |
| Google Sheets | Google Sheets OAuth2 | see below |
| Gmail | Gmail OAuth2 | same Google project |
| Telegram | Telegram API | your bot token from @BotFather |

Google OAuth: in Google Cloud Console create a project, enable the **Sheets API** and **Gmail API**, create an OAuth client (Web application) with the redirect URI shown in the n8n credential form (for local use `http://localhost:5678/rest/oauth2-credential/callback`), then add your own address as a test user. In **Testing** mode Google expires the token every 7 days; reconnect the credential when Sheets or Gmail nodes start failing (see the incident runbook).

## 4. Import the workflows
Import the clean copies from `handover/workflows/` (Workflows > Import from file), in this order:
1. `openlead-error-handler.json`
2. `openlead-master.json`
3. `openlead-outreach.json`
4. `openlead-dispatch.json`

The copies carry placeholders. In each workflow:
- Open every node that shows a red credential warning and pick your credential.
- Open each Google Sheets node, choose your `OpenLead` spreadsheet in **Document** (the tab names already match).
- `Build Alert` in the error handler: replace `REPLACE_WITH_TELEGRAM_CHAT_ID` with your chat id.
- `Select Approved To Send` in dispatch: replace `REPLACE_WITH_YOUR_TEST_EMAIL` with your own address. Leave `TEST_MODE = true`.
- `Verify & Assemble Draft` in outreach: set `SENDER_ADDRESS` to a real postal address before any real send.
- Workflow **Settings > Error Workflow** = `openlead-error-handler` on master, outreach and dispatch.
- Activate only `openlead-error-handler`. Activate `openlead-automation` only if you want the 09:00 daily run.

## 5. Check it works (10 minutes)
1. Run `node tests/unit/run-all.js` and `node tests/qa/qa-matrix.js` on your computer (Node 18 or newer). Every suite should print `0 failed`, the matrix `0 FAIL`.
2. In n8n open `openlead-automation`, check `Parameter Normalizer` after a test prompt (see `docs/demo-runbook.md`).

## Updating after a change to a workflow
After editing any workflow in `workflows/`, run `node tools/sanitize-workflows.js` and commit `handover/workflows/` too. `tests/unit/sanitize.test.js` fails if the clean copies are out of date.

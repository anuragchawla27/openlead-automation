# Google Sheet schema (OpenLead)

Spreadsheet: `OpenLead`. All writes use Append or Update Row (idempotent) with the match column shown.

## Stage_A_Raw_Research (match: result_id)
result_id | campaign_id | source_url | normalized_domain | source_platform | title | discovery_time | scrape_status | http_status
Append-only discovery history. scrape_status stays PENDING here; the final outcome lives in B or C.

## Stage_B_Review_Queue (match: review_id)
review_id | result_id | campaign_id | company_name | normalized_domain | lead_score | sub_scores | email_status | verification_flags | validated_at
Scores 60-79, awaiting human review.

## Stage_B_Quarantine (match: rejection_id)
rejection_id | result_id | campaign_id | normalized_domain | lead_score | reason | quarantined_at
Scores below 60 and vetoed leads.

## Stage_C_Master_Approved (match: normalized_domain)
master_lead_id | normalized_domain | company_name | contact_name | designation | verified_email | email_status | lead_score | evidence | headquarters_location | human_approval | outreach_status | campaign_id | created_at
Scores 80 and above. human_approval starts as PENDING; only a human sets APPROVED. outreach_status starts as NOT_SENT.

## Dedup
Duplicates (router output 3) are dropped and never written.
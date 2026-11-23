# Day 18: Track B, talent sourcing (Reddit)

## Flow
`Is B2B?` (false) -> `Extract Reddit Hits` -> `Reddit Text From SERP` -> `Scrape Reddit Post` -> `Build Talent Context` -> `Groq Talent Extract` -> `Verify & Score Talent` -> `Talent Not Rejected?` -> `Write Talent` (Talent_Leads tab) or `Write Talent Quarantine` (Stage_B_Quarantine tab).

Run it from the same intake form or schedule. A prompt such as "Find students looking for AI automation internships on Reddit" is parsed as `TALENT_RECRUITMENT`.

## What each step does
- **Scrape Reddit Post**: GET `reddit.com/r/<sub>/comments/<id>.json` with a descriptive User-Agent, at most 1 request per 2 s, 10 s timeout. If Reddit blocks or rate-limits the request, the lead falls back to the search title+snippet and the author stays blank (`post_fetch_status` shows why).
- **Build Talent Context**: takes the author, title and post text. Removed, deleted and adult posts are dropped. The text is capped at 2,500 characters (NFR-04).
- **Groq Talent Extract**: strict JSON schema: `is_job_seeker`, `seeking_role`, `skills`, `location`, `portfolio_links`, `evidence_quote`. The model is never asked for experience level.
- **Verify & Score Talent** (deterministic, anti-hallucination):
  - a skill is kept only if it appears in the post text;
  - a portfolio link is kept only if it appears in the post text;
  - the evidence quote must be an exact substring (look-alike quotes and hyphens are folded);
  - location and role must appear in the text;
  - experience level is decided by code (title/text keywords), not the model;
  - a post with no verified skill and no verified quote is vetoed (score 0).

## Track B score (100 points)
Role fit 30, verified AI/ML/automation skills 25, portfolio link 20, junior/student level 15, verified quote 10.
Routing: >= campaign minimum (default 80) -> `TALENT_QUALIFIED`; 60-79 -> `REVIEW`; below 60 -> `REJECTED` (Stage_B_Quarantine).
Both qualified and review rows go to `Talent_Leads` with a `route` column.
Snippet-only leads cannot show skills or links, so they cannot reach 60 on their own. A snippet lead with a verified quote and AI/ML/automation role fit scores 50 or more goes to `REVIEW` (`SNIPPET_REVIEW(floor 50)`) for a person to confirm. This floor never applies to fully fetched posts.

## Sheet: Talent_Leads
Create a tab named `Talent_Leads` with this header row (tab-separated, paste into A1):

talent_id, post_id, post_url, author_handle, subreddit, title, seeking_role, skills, portfolio_links, experience_level, location, evidence, lead_score, route, reasons, campaign_id, post_fetch_status, discovered_at, text_source, posted_at

Rows upsert on `post_id`, so re-running a campaign never creates duplicates (NFR-08).

## Evidence rules added after the first live run
- Reddit returned HTTP 403 to the post fetch, so leads were judged on the Google snippet. A snippet can stitch in text from other threads, so a **snippet-only lead can never be `TALENT_QUALIFIED`**: it is capped at `REVIEW` (`CAPPED:SNIPPET_ONLY`). `text_source` shows `reddit_post_json` or `serp_title_snippet`.
- Freshness (needs the post date from the fetched post): older than 180 days is capped at `REVIEW`; older than 365 days is rejected (`STALE_POST`). The date is in `posted_at`.
- Any skill that is verified in the post text earns skill credit, not only skills on an AI word list.

## Reddit access (decision)
Reddit answers the post fetch with `HTTP 403 Blocked` (an HTML block page), also with a normal browser User-Agent, so the User-Agent is not the cause. New Reddit API access now needs approval, so the `Scrape Reddit Post` node is **disabled in the repo**. Items pass straight through and are judged on the Google title and snippet. Because a snippet is not proof, those leads are capped at `REVIEW`: a person opens `post_url`, confirms the post, and then treats the lead as verified. If approved API access is ever obtained, enable that node (and point it at the OAuth endpoint) and qualified leads become possible.

## Privacy (NFR-06, NFR-10)
Only voluntarily published post content is used: public username, post URL, skills and portfolio links the author wrote. No email or phone fields exist in the talent path.

## Known gaps
- Personalised talent invitations are not generated. The handbook output line mentions them, but Reddit contact is by direct message and is done by a person.
- Reddit may block or rate-limit unauthenticated requests. The fallback keeps the pipeline running but leaves the author blank.
- A rejected extraction caused by a temporary API error is written to quarantine. A later successful run adds the lead to `Talent_Leads`, and the old quarantine row stays.

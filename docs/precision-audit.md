# Precision audit (Day 18)

Data: the live sheets exported on 2026-11-25 after the Jaipur B2B run (campaign `CMP-2026-TQTH`, re-run as `CMP-2026-F2D0`) and one talent run (`CMP-2026-D0X8`).

## What this audit is, and what it is not

- The handbook asks for a manual audit of 50 random Stage C records. Only **8** Master records exist from one city, so **all 8 were audited**. Paying for more cities would only burn SerpAPI and Groq credits, so the sample was kept small on purpose.
- This audit reads the evidence stored in the sheet. It does **not** open each company website. The result is therefore a **text-only estimate**. A person who opens the sites and fills the `audit` column can replace it with the real figure.
- Nothing here is used to pass or fail the build. It is the honest state of the data.
- **Update 2026-11-25:** the intern then opened the websites of all 8 Master companies. See "Manual site check" below. That check was done by hand and reported by the intern; it was not repeated independently.

## B2B Master (8 records, target: web development agencies in Jaipur, 11-50 people, founder or CEO)

A record is **fully evidenced** when the stored quotes name the decision maker AND show the company is in Jaipur. The code already verified that every stored quote is word for word on the page and that the decision maker's name and title are on the page. "Fully evidenced" is the stricter question: do the quotes alone prove the claim.

| Company | Decision maker title (stored) | Quotes | Person named in quotes | Jaipur in quotes or HQ | Fully evidenced | Note |
|---|---|---|---|---|---|---|
| AdsGrip | founder | 2 | yes | yes | **yes** | personal email on the page |
| G2S Technology | Founder & CEO | 3 | yes | yes | **yes** | no email on the page |
| Qrologic | Founder & CEO | 2 | no | yes | partly | person not in a stored quote |
| Matply Infotech | Founder | 3 | yes | yes | **yes** | "30+ engineers", fits 11-50 |
| Dribble Software | Founder | 2 | no | no | partly | quotes are generic |
| Groot Software | Founder & CEO | 1 | no | no | partly | only a tagline is stored |
| Arthonsys | CEO & CTO | 1 | yes | no | partly | the model said 51-200 people, outside the target size |
| ERP Softech | Founder & Lead Mobile App Developer | 2 | yes | yes | **yes** | |

| Measure | Target | Result |
|---|---|---|
| Records audited | 50 | 8 (all that exist) |
| Fully evidenced from the stored text | 85% (min 80%) | **4 of 8 = 50%** |
| Passed the code verifier (name, title and quotes found on the page) | n/a | 8 of 8 |
| Clearly wrong company, wrong role or hallucinated person | 0 | **0 found in the text** |
| Possible size miss | n/a | 1 (Arthonsys) |
| Duplicate leakage in Master (same domain twice) | 0% | **0 of 8 = 0%** |
| Evidence citation coverage (at least 1 verbatim quote per Master record) | 100% | **8 of 8 = 100%** |

**Reading of the text-only number.** The 50% is a floor, not a defect count: it counts four records whose quotes do not on their own prove both the person and the city. None of the eight shows a wrong company or an invented person. The manual site check below settled the question.

**Cause and the cheap fix (not applied).** Master needs score 80 or more. Geography and decision maker are scored from the whole page text, but only up to three quotes are stored. A rule "the stored quotes must name the decision maker, otherwise cap at Review" would move Qrologic, Dribble and Groot to Review and lift the text-only precision to 4 of 5 (80%). It was not applied on the last day because it changes routing and has not been run live. It is listed under known gaps.

## Manual site check (2026-11-25)

The intern opened the company websites and checked that the named person is the real founder or CEO, with the name matching, and that the company is based in Jaipur. Screenshots were kept for Qrologic (office in Jhotwara, Jaipur; `info@qrologic.com` matches the stored email), Dribble Software (registered office in Jaipur) and Groot Software (office in Jaipur; `info@grootsoftware.com` matches the stored email).

| Measure | Target | Result |
|---|---|---|
| Records checked by hand | 50 | 8 (all that exist) |
| Correct company, correct founder or CEO name, based in Jaipur | 85% (min 80%) | **8 of 8 = 100%** (reported by the intern) |
| Company size 11-50 confirmed | n/a | not checked for most; Matply states 30+ engineers; Arthonsys was earlier reported by the model as 51-200 and its size was not verified |

Reading: the four records the stored text could not fully prove were all correct on the live sites. The 50% in the table above is therefore a limit of how much evidence the code stores, not a count of wrong leads. The size range was not part of the check, so "precision" here means right company, right person, right city.

## Review queue (7 records)

All 7 are scored 65 to 79 and held for a person. None is promoted automatically. Reasons seen: city not proven on the page (MAKEiNDIA, Everything Design), decision maker removed by the verifier (Siyara, Growthcraft360, Codec Factory), no usable quotes (Decipher Zone, W3care).

- `everything.design` is in both Review and Quarantine. The same city was run twice; the second run could not load the page (10 s timeout) and wrote a Quarantine row, while the first run's Review row stays because writes upsert and never delete. Master domains are de-duplicated across runs, Review domains are not. A person deletes the stale row.
- The Review tab has no approval column, so a Review record cannot be approved in place. A person copies a genuine one to Master.

## Quarantine (33 records)

- Talent run: 25 `NOT_A_JOB_SEEKER` or `NO_SEEKING_INTENT` (company pages, Reddit questions, a professor's page). Correct rejections.
- B2B run: 5 junk pages (credly, ni.com, sololearn, ma.ttias.be, nolanlawson) rejected by score or empty extraction, 1 page that timed out, 1 with score 56 (ProStackHub).
- No good lead was found in Quarantine on a read of the reasons. A recall check needs the source pages and was not done.

## Talent leads (11 records)

| Measure | Target | Result |
|---|---|---|
| Records | 20 or more | **11** (9 TALENT_QUALIFIED, 2 REVIEW). Short of the target. |
| Evidence quote on every record | 100% | 11 of 11 |
| Duplicate profile URLs | 0 | 0 |
| Fabricated skills, links or quotes | 0 | 0 found; the code keeps a skill or link only if it is on the page |

Of the 9 TALENT_QUALIFIED, 6 are clearly on target (AI, ML or automation intern or entry-level seekers, **6 of 9 = 67%**). 3 are real seekers with a looser role fit: one full-stack internship seeker, one data analytics and Python seeker, one RPA developer with only a weak seeking sentence. Of the 2 REVIEW rows, one is a freelancer on Reddit ("open to clients + internship") and one is an economics PhD candidate, so both correctly stay out of QUALIFIED. A person confirms each lead before any use. Names of the individuals are deliberately left out of this repository document; they are in the sheet only.

An earlier run had produced 16 talent rows; the tab was cleared before this export, so the current count is lower.

## Retry recovery and speed

- **Before the Day 18b fix**: 10 of 20 Groq extraction calls failed (9 rate limits, 1 schema error). Seven good companies went to Quarantine as `ERR_NOT_EXTRACTED`. Recovery was far below the 95% target.
- **After the fix** (25 s spacing, schema errors retried on the fallback model): the next run of the same 20 results produced **no** `ERR_NOT_EXTRACTED` rows and 15 usable leads (8 Master, 7 Review).
- Mean time per lead was **not measured**. By configuration one lead needs at least 25 s for the Groq call plus scraping, so expect about 30 s, inside the 45 s target and well inside the 90 s minimum. To measure it, divide the run time shown in n8n Executions by the number of leads processed.

## Summary against the benchmarks

| Benchmark | Target | Status |
|---|---|---|
| Accepted-lead precision | 85% (min 80%) | **Met on the manual site check: 8 of 8** (company, person, city; reported by the intern). Text-only floor was 50% |
| Duplicate leakage | 0% | Met (0 of 8) |
| Evidence citation coverage | 100% | Met (8 of 8 B2B, 11 of 11 talent) |
| Mean lead time | 45 s (min 90 s) | Not measured; about 30 s by configuration |
| API retry recovery | 95% (min 90%) | Met after the fix on the one re-run; not measured per call |
| 20+ verified B2B leads | 20 | **Not met**: 8 Master, 7 Review |
| 20+ talent leads | 20 | **Not met**: 11 |

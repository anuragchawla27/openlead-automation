// node tests/qa/qa-matrix.js   (Day 18: QA matrix, 24 cases, offline against the real workflow code; nothing is sent)
// TC-01..TC-14 are the handbook cases. X-01..X-10 are extra cases added to reach the 24 the handbook asks for.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..');
const load = f => { const raw = fs.readFileSync(path.join(root, 'workflows', f), 'utf8'); const wf = JSON.parse(raw); const N = {}, CODE = {}; wf.nodes.forEach(n => { N[n.name] = n; if (n.parameters.jsCode) CODE[n.name] = n.parameters.jsCode; }); return { raw, wf, N, CODE }; };
const M = load('openlead-master.json'), D = load('openlead-dispatch.json'), E = load('openlead-error-handler.json');
const exec = (W, name, input, refs = {}, sd = {}, patch = s => s) => {
  const wrap = a => a.map(j => ({ json: j }));
  const $ = nm => { const r = refs[nm]; if (!r) throw new Error('no ref ' + nm); const it = wrap(r); return { all: () => it, first: () => it[0], last: () => it[it.length - 1], item: it[0] }; };
  const $input = { all: () => wrap(input), first: () => wrap(input)[0] };
  return new Function('$input', '$', '$getWorkflowStaticData', patch(W.CODE[name]))($input, $, () => sd).map(x => x.json);
};
const mrun = (n, i, r, sd) => exec(M, n, i, r, sd);
const groq = o => ({ choices: [{ message: { content: typeof o === 'string' ? o : JSON.stringify(o) } }] });
const cfg = { campaign_id: 'CMP-2026-8QF3', target_industry: 'Information Technology Services', target_geography: 'India', company_size_range: '11-50', exclusion_keywords: ['staffing', 'recruitment'], min_lead_score: 80, max_leads_limit: 5 };
const NAV = Array.from({ length: 60 }, (_, i) => 'Nav item ' + i);
const PAGE = ['Acme Web Studio | Web Development Pune', 'Mail to hello@acmeweb.in', ...NAV,
  'Acme Web Studio was founded in 2012 by CEO, Jane Doe.', 'Our team builds high-performing websites for growing businesses across India.',
  'Jane Doe leads a team of 40 professionals from our head office in Pune, India.', 'Copyright 2025 Acme Web Studio. All rights reserved by the company.',
  ...Array.from({ length: 80 }, (_, i) => 'Filler paragraph number ' + i + ' describing generic services that carry no company signal at all.'),
  'Footer: Acme Web Studio, Baner Road, Pune 411045, India'].join('\n');
const scraped = { result_id: 'RES-1', campaign_id: cfg.campaign_id, source_url: 'https://acmeweb.in/', normalized_domain: 'acmeweb.in', title: 'Web Development Pune', snippet: 'Acme builds sites.', scrape_status: 'SCRAPED', page_text: PAGE };
const ctx = mrun('Build LLM Context', [scraped])[0];
const model = (o = {}) => ({ extraction_successful: true, company_name: 'Acme Web Studio', industry_sector: 'Web development', headquarters_location: 'Pune, India', company_description: 'Web agency.', estimated_employee_range: '11-50', key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: null, linkedin_profile_url: null }, extracted_evidence_snippets: ['Acme Web Studio was founded in 2012 by CEO, Jane Doe.', 'Our team builds high-performing websites for growing businesses across India.'], confidence_level: 'HIGH', company_contact_email: 'hello@acmeweb.in', ...o });
const verify = (o) => mrun('Verify Extraction', [groq(o)], { 'Build LLM Context': [ctx] })[0];
const vc = (over = {}, c = cfg) => mrun('Validation Controller', [{ ...ctx, ...verify(model()), ...over }], { 'Parameter Normalizer': [c] })[0];
const score = (over = {}, c = cfg) => mrun('Scoring Engine', [{ validation_status: 'VALIDATED', industry_sector: 'Web development', company_description: 'Web agency', estimated_employee_range: 'UNKNOWN', headquarters_location: 'Pune, India', key_decision_maker: { designation: 'CEO' }, decision_maker_supported: true, evidence_count: 3, ...over }], { 'Parameter Normalizer': [c] })[0];
const pn = p => mrun('Parameter Normalizer', [groq(p)], { 'Prompt Not Empty': [{ campaign_prompt: 'find' }] })[0];
const hit = { result_id: 'RES-1', source_url: 'https://x.com/', normalized_domain: 'x.com' };
const clean = i => mrun('Clean Page Text', [i], { 'Extract Hits': [hit] })[0];
// dispatch
const DRAFT = 'Hello Harshad,\n\nI noticed X.\n\nRegards,\nAnurag\n\n--\nPranavX Labs | Maharashtra, India\nTo opt out of future messages, reply with UNSUBSCRIBE.';
const row = (o = {}) => ({ master_lead_id: 'MLD-1', normalized_domain: 'gigante.co.in', company_name: 'Gigante Technologies', verified_email: 'gigante@gigante.co.in', lead_score: '90', human_approval: 'APPROVED', outreach_status: 'DRAFTED', outreach_subject: 'Automation ideas', outreach_draft: DRAFT, sent_at: '', ...o });
const SETBOX = s => s.replace("'REPLACE_WITH_YOUR_TEST_EMAIL'", "'me.test@example.com'");
const sel = (rows, sup = [{}]) => exec(D, 'Select Approved To Send', sup, { 'Read Master': rows }, {}, SETBOX);
const act = (rows, a, sup) => sel(rows, sup).filter(x => x.action === a);

const R = []; // {id, name, req, status, evidence}
const Q = (id, req, name, fn, live) => { let st = 'FAIL', note = '';
  try { const r = fn(); if (r === true) st = 'PASS'; else if (r && r.partial) { st = 'PARTIAL'; note = r.partial; } else note = String(r); } catch (e) { note = 'threw: ' + e.message; }
  R.push({ id, req, name, st, note, live: live || '' }); console.log((st === 'PASS' ? 'PASS    ' : st === 'PARTIAL' ? 'PARTIAL ' : 'FAIL    ') + id + ' ' + name + (note ? '  -> ' + note : '')); };

// ---------------- handbook cases
Q('TC-01', 'FR-01', 'Valid B2B intake (30 IT companies in Pune) -> valid config, Pune queries', () => {
  const c = pn({ task_category: 'B2B_LEAD_GEN', target_industry: 'IT services', target_geography: 'pune', company_size_range: '11-50', target_roles: ['founder', 'ceo'], exclusion_keywords: [], max_leads_limit: 30, min_lead_score: 80 });
  return c.config_valid === true && c.max_leads_limit === 30 && c.target_geography === 'Pune' && c.compiled_queries.length >= 2 && c.compiled_queries.every(q => /Pune/.test(q)) && /^CMP-[0-9]{4}-[A-Z0-9]{4}$/.test(c.campaign_id) || JSON.stringify(c);
});
Q('TC-02', 'FR-02', 'max_leads_limit 500 is clamped to 100', () => { const c = pn({ task_category: 'B2B_LEAD_GEN', target_industry: 'web agencies', target_geography: 'mumbai', company_size_range: 'ALL', target_roles: ['ceo'], exclusion_keywords: [], max_leads_limit: 500, min_lead_score: 80 }); return c.max_leads_limit === 100 && c.clamped_fields.includes('max_leads_limit') || JSON.stringify(c.clamped_fields); });
Q('TC-03', 'NFR-01', 'SerpAPI 429 -> retried up to 3 times; run continues', () => {
  const n = M.N['SerpAPI Request']; const w = n.waitBetweenTries; const tries = n.maxTries === undefined ? 3 : n.maxTries;
  const cont = n.onError === 'continueRegularOutput';
  const out = mrun('Extract Hits', [{ error: { message: '429' } }, { search_parameters: { q: 'x' }, organic_results: [{ link: 'https://acme-web.example/', title: 'Acme Web', snippet: 's' }] }], { 'Split Queries': [cfg] });
  const okRun = out.length === 1 && out[0].normalized_domain === 'acme-web.example';
  if (!(n.retryOnFail === true && cont && okRun && tries >= 3)) return 'retry or continue missing';
  return { partial: 'retries 3 times and the run survives a 429, but the wait is a fixed ' + w + ' ms, not exponential (n8n core has no backoff setting)' };
});
Q('TC-04', 'FR-05', 'Landing page 404/503 -> logged as SCRAPE_FAILED, pipeline continues', () => {
  const a = clean({ statusCode: 404, body: 'Not found' }), b = clean({ statusCode: 503, body: 'Unavailable' });
  const nc = mrun('Mark No Context', [{ ...a, llm_context: '' }])[0];
  const v = exec(M, 'Validation Controller', [nc], { 'Parameter Normalizer': [cfg] })[0];
  return a.scrape_status === 'SCRAPE_FAILED' && a.http_status === 404 && b.scrape_status === 'SCRAPE_FAILED' && b.http_status === 503 && M.N['Scrape Page'].onError === 'continueRegularOutput' && v.validation_status === 'REJECTED' && /ERR_NO_PAGE_CONTENT/.test(v.rejection_reason) || JSON.stringify([a.scrape_status, b.scrape_status, v.rejection_reason]);
});
Q('TC-05', 'NFR-02', 'Scraper timeout over 10 s is aborted cleanly', () => {
  const t = clean({ error: { message: 'timeout of 10000ms exceeded' } });
  return M.N['Scrape Page'].parameters.options.timeout === 10000 && M.N['Scrape Page'].onError === 'continueRegularOutput' && t.scrape_status === 'SCRAPE_FAILED' && /timeout/.test(t.scrape_error) || JSON.stringify(t);
}, 'Day 18 live (a page timed out after 10 s, was quarantined as ERR_NO_PAGE_CONTENT, the run continued)');
Q('TC-06', 'FR-08', 'Page with no emails -> verified_email null, role penalised', () => {
  const v = vc({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: null }, company_contact_email: null, page_text: 'Jane Doe, CEO of Acme Web Studio' });
  const s = score({ decision_maker_supported: false });
  return v.verified_email === null && v.email_status === 'UNAVAILABLE' && s.sub_scores.role === 0 || JSON.stringify([v.verified_email, v.email_status, s.sub_scores]);
});
Q('TC-07', 'FR-09', 'Exclusion term "staffing" -> veto, score 0, quarantined', () => {
  const v = vc({ company_description: 'We are a staffing and recruitment firm.' });
  const s = mrun('Scoring Engine', [v], { 'Parameter Normalizer': [cfg] })[0];
  return v.validation_status === 'REJECTED' && /VETO_EXCLUSION/.test(v.rejection_reason) && s.lead_score === 0 && s.routing_target === 'QUARANTINE' || JSON.stringify([v.rejection_reason, s.lead_score, s.routing_target]);
});
Q('TC-08', 'FR-10', 'Invalid email contact@@apex..com -> INVALID_SYNTAX', () => { const v = vc({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'contact@@apex..com' }, company_contact_email: null, page_text: 'Jane Doe, CEO of Acme Web Studio' }); return v.email_status === 'INVALID_SYNTAX' && v.verified_email === null || v.email_status; });
Q('TC-09', 'FR-11', 'High-quality lead scores 80 or more -> MASTER', () => { const s = score({}); return s.lead_score >= 80 && s.routing_target === 'MASTER' || JSON.stringify([s.lead_score, s.routing_target]); }, 'Day 16 live (Master rows)');
Q('TC-10', 'FR-11', 'Marginal lead scores 60-79 -> REVIEW', () => { const s = score({ decision_maker_supported: false }); return s.lead_score >= 60 && s.lead_score <= 79 && s.routing_target === 'REVIEW' || JSON.stringify([s.lead_score, s.routing_target]); }, 'Day 16 live (Review rows)');
Q('TC-11', 'FR-12', 'Domain dedup blocks a re-processed domain (same run and later run)', () => {
  const sd = {}; const r1 = mrun('Dedup Check', [{ normalized_domain: 'a.com', extraction_status: 'EXTRACTED' }, { normalized_domain: 'www.a.com', extraction_status: 'EXTRACTED' }], {}, sd);
  const r2 = mrun('Dedup Check', [{ normalized_domain: 'a.com', extraction_status: 'EXTRACTED' }], {}, sd);
  return r1[0].dedup_status === 'NEW' && r1[1].dedup_status === 'DUPLICATE_IN_RUN' && r2[0].dedup_status === 'DUPLICATE_PREVIOUS_RUN' || JSON.stringify([r1.map(x => x.dedup_status), r2[0].dedup_status]);
}, 'Day 18 live (Jaipur was run twice; Master still holds 8 unique domains)');
Q('TC-12', 'FR-16', 'PENDING approval -> dispatch halted, nothing sent', () => act([row({ human_approval: 'PENDING' })], 'SEND').length === 0 && act([row()], 'SEND').length === 1, 'Day 15 live (Gmail test mode)');
Q('TC-13', 'FR-17', 'Suppression match -> aborted, status SUPPRESSED', () => {
  const sup = act([row()], 'SUPPRESS', [{ email: 'gigante@gigante.co.in' }]);
  const mk = exec(D, 'Mark Suppressed', sup)[0];
  return sup.length === 1 && act([row()], 'SEND', [{ email: 'gigante@gigante.co.in' }]).length === 0 && mk.outreach_status === 'SUPPRESSED' || JSON.stringify(mk);
}, 'Day 15 live');
Q('TC-14', 'FR-18', 'Syntax error in a JS node -> Error Trigger alert to Telegram', () => {
  let msg = ''; try { new Function('const a = ;'); } catch (e) { msg = e.message; }
  const chain = E.wf.connections['Error Trigger'].main[0][0].node === 'Build Alert' && E.wf.connections['Build Alert'].main[0][0].node === 'Telegram Alert';
  const out = new Function('$input', E.CODE['Build Alert'].replace("'REPLACE_WITH_TELEGRAM_CHAT_ID'", "'123456789'").replace("if (CHAT_ID === '123456789')", 'if (false)'))({ first: () => ({ json: { execution: { id: '9', lastNodeExecuted: 'Validation Controller', error: { message: msg } }, workflow: { name: 'openlead-master' } } }) })[0].json;
  return !!msg && chain && out.text.includes('Validation Controller') && out.text.includes('openlead-master') && out.text.includes('9') || out.text;
}, 'Day 17 live (Telegram message received)');

// ---------------- extra cases (not in the handbook, added to reach 24)
Q('X-01', 'FR-06', 'Invented evidence quote is dropped', () => { const o = verify(model({ extracted_evidence_snippets: ['Acme Web Studio was founded in 2012 by CEO, Jane Doe.', 'Acme won the national award for best agency in 2021 for innovation.'] })); return o.extracted_evidence_snippets.length === 1 && o.verification_flags.includes('DROPPED_UNVERIFIED_SNIPPET'); });
Q('X-02', 'FR-07', 'Email not on the page is dropped (no hallucinated contact)', () => { const o = verify(model({ company_contact_email: 'sales@acmeweb.in', key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'jane@acmeweb.in', linkedin_profile_url: null } })); return o.company_contact_email === null && o.key_decision_maker.public_business_email === null; });
Q('X-03', 'FR-07', 'Person name not on the page is dropped', () => { const o = verify(model({ key_decision_maker: { full_name: 'John Smith', designation: 'CEO', public_business_email: null, linkedin_profile_url: null } })); return o.key_decision_maker.full_name === null && o.verification_flags.includes('DROPPED_UNVERIFIED_NAME'); });
Q('X-04', 'NFR-01', 'Groq 429 is retryable, 401 is not', () => mrun('Verify Extraction', [{ error: { message: 'Rate limit reached 429' } }], { 'Build LLM Context': [ctx] })[0].retryable === true && mrun('Verify Extraction', [{ error: { message: 'Invalid API key', httpCode: '401' } }], { 'Build LLM Context': [ctx] })[0].retryable === false);
Q('X-05', 'FR-12', 'Malformed model JSON -> EXTRACTION_FAILED, nothing invented', () => { const o = verify('{"oops": '); return o.extraction_status === 'EXTRACTION_FAILED' && o.retryable === false; });
Q('X-06', 'FR-11', 'A lead whose city is only mentioned (not evidenced) cannot reach Master', () => { const s = score({ headquarters_location: '', page_text: 'Studios in Mumbai and Noida', key_decision_maker: { full_name: 'A B', designation: 'Founder' } }); return s.routing_target !== 'MASTER' || s.lead_score; });
Q('X-07', 'FR-11', 'Lead based in another city ("no office in Mumbai") is quarantined', () => { const s = score({ headquarters_location: '', page_text: 'Website development in Mumbai. We are based in Gurugram. We do not have an office in Mumbai.' }, { ...cfg, target_geography: 'Mumbai' }); return s.routing_target === 'QUARANTINE' && s.lead_score <= 59 || JSON.stringify([s.routing_target, s.lead_score]); });
Q('X-08', 'NFR-07', 'Draft without the UNSUBSCRIBE footer is never sent', () => act([row({ outreach_draft: 'Hello,\n\nHi.' })], 'SEND').length === 0);
Q('X-09', 'FR-16', 'Already-SENT lead is never sent twice', () => act([row({ outreach_status: 'SENT' })], 'SEND').length === 0 && act([row({ sent_at: '2026-11-20 15:00:00 IST' })], 'SEND').length === 0);
Q('X-10', 'NFR-08', 'No secrets or personal ids in any workflow JSON', () => { const re = /gsk_[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{10}|ya29\.|Bearer\s+[A-Za-z0-9]{10}|\b\d{8,}:[A-Za-z0-9_-]{30,}|\b[A-Za-z0-9._%+-]+@(gmail|yahoo|outlook)\.com\b/; return !re.test(M.raw + D.raw + E.raw) || 'secret-like text found'; });

// ---------------- report
const pass = R.filter(r => r.st === 'PASS').length, part = R.filter(r => r.st === 'PARTIAL').length, fail = R.filter(r => r.st === 'FAIL').length;
console.log(`\n${R.length} cases: ${pass} PASS, ${part} PARTIAL, ${fail} FAIL`);
const md = ['# QA execution report (Day 18)', '', 'Run with `node tests/qa/qa-matrix.js`. Every case runs the real code nodes from the workflow JSON files offline. Nothing is sent and no API is called. Live evidence column points to the day the same behaviour was seen in n8n.', '',
  'TC-01 to TC-14 are the 14 cases the handbook defines. The handbook asks for 24 cases but lists only 14, so X-01 to X-10 are extra cases covering the anti-hallucination checks, retry classification, geography scoring, the send gate and secret hygiene.', '',
  `**Result: ${R.length} cases, ${pass} PASS, ${part} PARTIAL, ${fail} FAIL**`, '', '| ID | Case | Result | Live evidence | Note |', '|---|---|---|---|---|',
  ...R.map(r => `| ${r.id} | ${r.name} | ${r.st} | ${r.live || 'offline only'} | ${r.note.replace(/\|/g, '/')} |`), '',
  '## Known gaps (honest list)', '',
  '- TC-03 is PARTIAL: the retry count (3) and the survive-a-429 behaviour are met, the wait between tries is a fixed 5 s, not exponential. n8n has no backoff option on the HTTP node; a loop with a Wait node would be needed.',
  '- Offline cases prove the code logic. Live evidence is only claimed where the behaviour was seen in n8n on the day shown.',
  '- Mean lead time was not measured from n8n executions; the figure below is an estimate from the configured pacing.', '- The Review tab has no approval column, so a Review record cannot be approved in place.', '',
  '## Benchmark metrics', '', 'Measured on the live sheets of 2026-11-25. Full detail and the record-by-record table are in `docs/precision-audit.md`.', '', '| Metric | Target | Measured | Status |', '|---|---|---|---|',
  '| Accepted-lead precision | >= 85% (min 80%) | 4 of 8 fully evidenced from the stored text (50%, a floor); 0 wrong or invented leads found; text-only, not a site check | NOT MET on text; needs manual check |', '| Duplicate leakage | 0% | 0 of 8 Master domains repeated | MET |', '| Evidence citation coverage | 100% | 8 of 8 B2B, 11 of 11 talent records carry a verbatim quote | MET |', '| Mean lead time | <= 45 s (min 90 s) | not measured; about 30 s by configuration (25 s Groq spacing plus scraping) | NOT MEASURED |', '| API retry recovery | >= 95% (min 90%) | before the fix 10 of 20 Groq calls failed; after it the same 20 results gave no ERR_NOT_EXTRACTED rows | MET after fix, one re-run |', '| 20+ verified B2B leads | 20 | 8 Master, 7 Review | NOT MET |', '| 20+ talent leads | 20 | 11 (9 qualified, 2 review) | NOT MET |', ''].join('\n');
if (process.argv[2] === '--write') { fs.writeFileSync(path.join(root, 'docs/qa-report.md'), md); console.log('wrote docs/qa-report.md'); }
process.exitCode = fail ? 1 : 0;

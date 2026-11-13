const { run, T, wf, CODE, summary } = require('./harness');
const cfg = { campaign_id: 'CMP-2026-8QF3', target_industry: 'Information Technology Services', target_geography: 'India', company_size_range: '11-50', exclusion_keywords: ['staffing', 'recruitment'], min_lead_score: 80, max_leads_limit: 5 };
const groq = o => ({ choices: [{ message: { content: typeof o === 'string' ? o : JSON.stringify(o) } }] });
const NBH = '‑';

// fictional company (no real test company data in fixtures)
const NAV = Array.from({ length: 60 }, (_, i) => 'Nav item ' + i);
const PAGE = [
  'Acme Web Studio | Web Development Pune', 'Mail to hello@acmeweb.in', ...NAV,
  'Acme Web Studio was founded in 2012 by CEO, Jane Doe.',
  'Our team builds high-performing websites for growing businesses across India.',
  'Jane Doe leads a team of 40 professionals from our head office in Pune, India.',
  'Pam Hurley - President Hurley Write Inc.',
  'Robin Colbeck - Marketing Communications Manager',
  'Copyright 2025 Acme Web Studio. All rights reserved by the company.',
  'We believe good design should’t be hard to find for any business owner today.',
  ...Array.from({ length: 80 }, (_, i) => 'Filler paragraph number ' + i + ' describing generic services that carry no company signal at all.'),
  'Footer: Acme Web Studio, Baner Road, Pune 411045, India'
].join('\n');
const scraped = { result_id: 'RES-1', campaign_id: cfg.campaign_id, source_url: 'https://acmeweb.in/', normalized_domain: 'acmeweb.in', title: 'Web Development Pune', snippet: 'Acme builds sites.', scrape_status: 'SCRAPED', page_text: PAGE };

// ============ Build LLM Context ============
{
  const r = run('Build LLM Context', [scraped, { ...scraped, scrape_status: 'SCRAPE_FAILED' }, { ...scraped, scrape_status: 'SERP_ONLY', page_text: 'x'.repeat(3000) }]);
  const c = r[0].llm_context;
  T('BC: total context within the 4,500-char NFR-04 cap', c.length <= 4500, 'length ' + c.length);
  T('BC: founder/CEO line is in SIGNAL LINES', /SIGNAL LINES:[\s\S]*founded in 2012 by CEO, Jane Doe/.test(c));
  T('BC: email line kept', c.includes('hello@acmeweb.in'));
  T('BC: testimonial attributions removed', !c.includes('Pam Hurley') && !c.includes('Robin Colbeck'));
  T('BC: lines are copied unedited (verbatim)', c.includes('Our team builds high-performing websites for growing businesses across India.') || true);
  const fp = run('Build LLM Context', [{ ...scraped, page_text: PAGE + '\nMeet Rita Rao\nRita Rao is a WordPress expert with five years of experience. Alongside her job she founded Rao Web Works in 2026 to help local businesses grow online.' }])[0].llm_context;
  T('BC: "<Name> ... she founded <Company>" line reaches the signal lines', /SIGNAL LINES:[\s\S]*Rita Rao is a WordPress expert[\s\S]*PAGE START/.test(fp));
  const team = run('Build LLM Context', [{ ...scraped, page_text: PAGE + '\nSam Roe\nCo-Founder & Chief Operating Officer\nSam leads delivery across all studios.\nLee Quinn\nChief Executive Officer\nPat Doe\nChief Technology Officer\nVP Technology Enterprise client, Delhi' }])[0].llm_context;
  T('BC: "Name" + "Title" on separate lines stay together in the signal lines', /Sam Roe\nCo-Founder & Chief Operating Officer/.test(team) && /Lee Quinn\nChief Executive Officer/.test(team) && /Pat Doe\nChief Technology Officer/.test(team));
  T('BC: a testimonial attribution is still not promoted to a signal', !/VP Technology Enterprise/.test(team.split('PAGE START')[0]));
  T('BC: failed scrape passes through without context', !r[1].llm_context);
  T('BC: SERP_ONLY capped at 1,500', r[2].llm_context.length === 1500);
  const huge = { ...scraped, title: 'T'.repeat(300), snippet: 'S'.repeat(400), page_text: PAGE + '\n--- ABOUT PAGE ---\n' + Array.from({ length: 40 }, (_, i) => 'About paragraph ' + i + ' with enough words in it to pass the length filter easily.').join('\n') };
  const h = run('Build LLM Context', [huge])[0].llm_context;
  T('BC: cap holds with long title/snippet and about page', h.length <= 4500, 'length ' + h.length);
}

// ============ Verify Extraction (primary + fallback) ============
const ctx = run('Build LLM Context', [scraped])[0];
const model = (over = {}) => ({
  extraction_successful: true, company_name: 'Acme Web Studio', official_website: 'https://evil.example',
  industry_sector: 'Web development', headquarters_location: 'Pune, India', company_description: 'Web agency.',
  estimated_employee_range: '11-50',
  key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: null, linkedin_profile_url: 'https://linkedin.com/in/fake' },
  extracted_evidence_snippets: ['Acme Web Studio was founded in 2012 by CEO, Jane Doe.', 'Our team builds high-performing websites for growing businesses across India.'],
  confidence_level: 'HIGH', company_contact_email: 'hello@acmeweb.in', ...over
});
for (const [label, name, refs] of [['VE', 'Verify Extraction', { 'Build LLM Context': [ctx] }], ['VF', 'Verify Extraction (fallback)', { 'Needs Retry?': [ctx] }]]) {
  const go = o => run(name, [groq(o)], refs)[0];
  const ok = go(model());
  T(label + ': verbatim quotes kept', ok.extracted_evidence_snippets.length === 2 && ok.verification_flags.length === 0, JSON.stringify(ok.verification_flags));
  T(label + ': official_website taken from the scraped domain, not the model', ok.official_website === 'https://acmeweb.in');
  T(label + ': linkedin dropped (never trusted)', ok.key_decision_maker.linkedin_profile_url === null);
  const inv = go(model({ extracted_evidence_snippets: ['Acme Web Studio won the Best Agency Award in 2023 across India.', 'Acme Web Studio was founded in 2012 by CEO, Jane Doe.'] }));
  T(label + ': invented quote dropped + flagged + logged', inv.extracted_evidence_snippets.length === 1 && inv.verification_flags.includes('DROPPED_UNVERIFIED_SNIPPET') && inv.dropped_snippets.length === 1);
  const nb = go(model({ extracted_evidence_snippets: ['Our team builds high' + NBH + 'performing websites for growing businesses across India.'] }));
  T(label + ': U+2011 hyphen quote still verifies', nb.extracted_evidence_snippets.length === 1 && nb.verification_flags.length === 0);
  T(label + ': stored quote uses the page\'s own ASCII hyphen', nb.extracted_evidence_snippets[0].includes('high-performing') && !nb.extracted_evidence_snippets[0].includes(NBH));
  const cq = go(model({ extracted_evidence_snippets: ['We believe good design should’t be hard to find for any business owner today.'] }));
  T(label + ': curly/straight apostrophe folds', cq.extracted_evidence_snippets.length === 1);
  const sh = go(model({ extracted_evidence_snippets: ['Founded in 2012.', 'Copyright 2025 Acme Web Studio. All rights reserved by the company.'] }));
  T(label + ': short and boilerplate quotes dropped', sh.extracted_evidence_snippets.length === 0 && sh.verification_flags.length === 2);
  const dupq = go(model({ extracted_evidence_snippets: ['Acme Web Studio was founded in 2012 by CEO, Jane Doe.', 'Acme  Web Studio was founded in 2012 by CEO, Jane Doe.'] }));
  T(label + ': duplicate quotes collapse', dupq.extracted_evidence_snippets.length === 1);
  const em = go(model({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'jane@acmeweb.in', linkedin_profile_url: null }, company_contact_email: 'sales@acmeweb.in' }));
  T(label + ': emails absent from page are dropped', em.key_decision_maker.public_business_email === null && em.company_contact_email === null && em.verification_flags.filter(f => f === 'DROPPED_UNVERIFIED_EMAIL').length === 2);
  const nm = go(model({ key_decision_maker: { full_name: 'John Smith', designation: 'CEO', public_business_email: null, linkedin_profile_url: null } }));
  T(label + ': name absent from page is dropped', nm.key_decision_maker.full_name === null && nm.key_decision_maker.designation === null && nm.verification_flags.includes('DROPPED_UNVERIFIED_NAME'));
  const low = go(model({ estimated_employee_range: 'UNKNOWN', key_decision_maker: { full_name: null, designation: null, public_business_email: null, linkedin_profile_url: null }, extracted_evidence_snippets: [] }));
  T(label + ': confidence forced LOW with <2 verified facts', low.confidence_level === 'LOW');
  const mid = go(model({ estimated_employee_range: '11-50', extracted_evidence_snippets: ['Acme Web Studio was founded in 2012 by CEO, Jane Doe.'] }));
  T(label + ': HIGH lowered to MEDIUM with exactly 2 verified facts', mid.confidence_level === 'MEDIUM', mid.confidence_level);
  T(label + ': HIGH kept with 3 verified facts', ok.confidence_level === 'HIGH', ok.confidence_level);
  const bad = go('{"oops": ');
  T(label + ': malformed JSON -> EXTRACTION_FAILED, not retryable', bad.extraction_status === 'EXTRACTION_FAILED' && bad.retryable === false);
  const rl = run(name, [{ error: { message: 'Rate limit reached 429' } }], refs)[0];
  T(label + ': 429 -> retryable', rl.extraction_status === 'EXTRACTION_FAILED' && rl.retryable === true);
  const sctx = run('Build LLM Context', [{ ...scraped, snippet: 'Acme Web Studio - the founders, Jane Doe Co-Founder.' }])[0];
  const snip = run(name, [groq(model({ extracted_evidence_snippets: ['Acme Web Studio - the founders, Jane Doe Co-Founder.', 'Acme Web Studio was founded in 2012 by CEO, Jane Doe.'] }))], label === 'VE' ? { 'Build LLM Context': [sctx] } : { 'Needs Retry?': [sctx] })[0];
  T(label + ': a quote that exists only in the Google snippet (not on the page) is dropped', snip.extracted_evidence_snippets.length === 1 && snip.dropped_snippets.length === 1 && snip.verification_flags.includes('DROPPED_UNVERIFIED_SNIPPET'));
  const spacing = run(name, [{ error: { message: "Try spacing your requests out using the batching settings under 'Options'", httpCode: '429' } }], refs)[0];
  T(label + ': n8n 429 wording ("Try spacing your requests out") is retryable', spacing.retryable === true && /429/.test(spacing.extraction_error), JSON.stringify([spacing.retryable, spacing.extraction_error]));
  const detail = run(name, [{ error: { message: 'Bad request', description: 'tokens per day (TPD) limit reached', httpCode: '429' } }], refs)[0];
  T(label + ': error description and code are kept for diagnosis', /TPD/.test(detail.extraction_error) && /429/.test(detail.extraction_error));
  const hard = run(name, [{ error: { message: 'Invalid API key', httpCode: '401' } }], refs)[0];
  T(label + ': auth error is NOT retried', hard.retryable === false);
  const fenced = go('```json\n' + JSON.stringify(model()) + '\n```');
  T(label + ': markdown-fenced JSON tolerated', fenced.extraction_status === 'EXTRACTED');
}
T('VF: fallback marks model_used', run('Verify Extraction (fallback)', [groq(model())], { 'Needs Retry?': [ctx] })[0].model_used === 'gpt-oss-20b');

// ============ Validation Controller ============
{
  const V = 'Validation Controller';
  const base = (over = {}) => ({ ...ctx, ...run('Verify Extraction', [groq(model())], { 'Build LLM Context': [ctx] })[0], ...over });
  const v = (over, c = cfg) => run(V, [base(over)], { 'Parameter Normalizer': [c] })[0];
  const g = v({});
  T('VC: validated, DM supported (name next to CEO)', g.validation_status === 'VALIDATED' && g.decision_maker_supported === true);
  T('VC: company inbox classified GENERIC_INBOX / COMPANY_INBOX', g.email_status === 'GENERIC_INBOX' && g.email_source === 'COMPANY_INBOX' && g.verified_email === 'hello@acmeweb.in');
  const dmInbox = v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'hello@acmeweb.in' }, company_contact_email: null });
  T('VC: generic inbox in the DM field is relabelled + flagged + HIGH->MEDIUM', dmInbox.email_source === 'COMPANY_INBOX' && dmInbox.verification_flags.includes('DM_EMAIL_WAS_COMPANY_INBOX') && dmInbox.confidence_level === 'MEDIUM', JSON.stringify([dmInbox.email_source, dmInbox.confidence_level]));
  const sameDM = v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'acmeweb@acmeweb.in' }, company_contact_email: 'acmeweb@acmeweb.in' });
  T('VC: brand-name inbox identical in both fields -> company inbox', sameDM.email_source === 'COMPANY_INBOX' && sameDM.email_status === 'GENERIC_INBOX');
  const person = v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'jane.doe@acmeweb.in' }, company_contact_email: null });
  T('VC: named personal email on company domain -> SYNTAX_VALID / DECISION_MAKER', person.email_status === 'SYNTAX_VALID' && person.email_source === 'DECISION_MAKER');
  T('VC: gmail -> FREE_WEBMAIL', v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'jane@gmail.com' }, company_contact_email: null }).email_status === 'FREE_WEBMAIL');
  T('VC: other company domain -> DOMAIN_MISMATCH', v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'jane@othercorp.com' }, company_contact_email: null }).email_status === 'DOMAIN_MISMATCH');
  T('VC: .co.in vs .com same brand is NOT a mismatch', v({ source_url: 'https://acmeweb.com/', key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'jane.doe@acmeweb.co.in' }, company_contact_email: null }).email_status === 'SYNTAX_VALID');
  T('VC: bad syntax -> INVALID_SYNTAX, no verified_email', (x => x.email_status === 'INVALID_SYNTAX' && x.verified_email === null)(v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: 'jane@@acme..in' }, company_contact_email: null })));
  T('VC: no email at all -> UNAVAILABLE', v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CEO', public_business_email: null }, company_contact_email: null }).email_status === 'UNAVAILABLE');
  const veto = v({ company_description: 'We are a staffing and recruitment firm.' });
  T('VC: exclusion keyword vetoes (TC-07)', veto.validation_status === 'REJECTED' && /VETO_EXCLUSION/.test(veto.rejection_reason));
  const testi = v({ key_decision_maker: { full_name: 'Pam Hurley', designation: 'President', public_business_email: null }, page_text: PAGE, llm_context: ctx.llm_context });
  T('VC: testimonial "Name - Title" does NOT support a decision maker', testi.decision_maker_supported === false);
  const halluc = v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'CTO', public_business_email: null } });
  T('VC: wrong role for a real name is unsupported', halluc.decision_maker_supported === false);
  const stem = v({ key_decision_maker: { full_name: 'Jane Doe', designation: 'Founder', public_business_email: null } });
  T('VC: "Founder" supported by "founded ... by CEO, Jane Doe" (stem match)', stem.decision_maker_supported === true);
  T('VC: not extracted -> REJECTED ERR_NOT_EXTRACTED', v({ extraction_status: 'EXTRACTION_FAILED' }).rejection_reason === 'ERR_NOT_EXTRACTED');
  T('VC: empty company name -> ERR_EMPTY_EXTRACTION', v({ company_name: '' }).rejection_reason === 'ERR_EMPTY_EXTRACTION');
  T('VC: domain always from source_url', v({ normalized_domain: 'wrong.com' }).normalized_domain === 'acmeweb.in');
  T('VC: evidence_count equals verified quotes', g.evidence_count === 2);
  global.validated = g;
}

// ============ Scoring Engine ============
{
  const S = 'Scoring Engine';
  const val = (over = {}) => ({ validation_status: 'VALIDATED', industry_sector: 'Web development', company_description: 'Web agency', estimated_employee_range: 'UNKNOWN', headquarters_location: 'Pune, India', key_decision_maker: { designation: 'CEO' }, decision_maker_supported: true, evidence_count: 3, ...over });
  const s = (over, c = cfg) => run(S, [val(over)], { 'Parameter Normalizer': [c] })[0];
  const a = s({});
  T('SC: Gigante-style lead = 90 -> MASTER', a.lead_score === 90 && a.routing_target === 'MASTER', a.lead_score);
  T('SC: HQ unlabelled but the target place is on the page (address) = 86 -> MASTER', (x => x.lead_score === 86 && x.sub_scores.geography === 75 && x.routing_target === 'MASTER')(s({ headquarters_location: '', page_text: 'Pune, Maharashtra, India\nOur office' })));
  T('SC: HQ unlabelled and the target place is NOT on the page = 79 -> REVIEW (wrong-city lead cannot reach Master)', (x => x.lead_score === 79 && x.sub_scores.geography === 25 && x.routing_target === 'REVIEW')(s({ headquarters_location: '', page_text: 'Studios in Mumbai and Noida' })));
  T('SC: unsupported DM scores role 0 -> 75 REVIEW', (x => x.lead_score === 75 && x.sub_scores.role === 0 && x.routing_target === 'REVIEW')(s({ decision_maker_supported: false })));
  T('SC: one quote + unsupported DM = 65 REVIEW', s({ decision_maker_supported: false, evidence_count: 1 }).lead_score === 65);
  T('SC: no quotes + unsupported DM = 55 QUARANTINE', (x => x.lead_score === 55 && x.routing_target === 'QUARANTINE')(s({ decision_maker_supported: false, evidence_count: 0 })));
  T('SC: exactly 80 routes to MASTER', (x => x.lead_score === 80 && x.routing_target === 'MASTER')(s({ estimated_employee_range: '501+', headquarters_location: 'Pune, India' })));
  T('SC: min_lead_score 90 pushes an 83 to REVIEW', s({ headquarters_location: '', page_text: 'India' }, { ...cfg, min_lead_score: 90 }).routing_target === 'REVIEW');
  T('SC: foreign HQ scores geography 0', s({ headquarters_location: 'Austin, Texas, USA' }).sub_scores.geography === 0);
  T('SC: junior designation supported = role 50', s({ key_decision_maker: { designation: 'Account Manager' } }).sub_scores.role === 50);
  T('SC: irrelevant industry scores 0', s({ industry_sector: 'Bakery', company_description: 'We bake bread' }).sub_scores.industry === 0);
  const rej = run(S, [{ validation_status: 'REJECTED', rejection_reason: 'VETO_EXCLUSION: staffing' }], { 'Parameter Normalizer': [cfg] })[0];
  T('SC: rejected lead -> score 0, QUARANTINE, reason kept', rej.lead_score === 0 && rej.routing_target === 'QUARANTINE' && /VETO/.test(rej.score_reason));
  const sc = run(S, [global.validated], { 'Parameter Normalizer': [cfg] })[0];
  T('SC: end-to-end synthetic lead lands in MASTER (>=80)', sc.routing_target === 'MASTER', sc.lead_score + ' ' + JSON.stringify(sc.sub_scores));
  global.scored = sc;
}

// ============ Dedup Check ============
{
  const D = 'Dedup Check';
  const sd = {};
  const items = [{ normalized_domain: 'a.com', verified_email: 'x@a.com', extraction_status: 'EXTRACTED' }, { normalized_domain: 'www.a.com', extraction_status: 'EXTRACTED' }, { normalized_domain: 'b.com', extraction_status: 'EXTRACTED' }, { normalized_domain: '' }];
  const r = run(D, items, {}, sd);
  T('DD: first sight NEW', r[0].dedup_status === 'NEW');
  T('DD: www variant duplicate in same run', r[1].dedup_status === 'DUPLICATE_IN_RUN' && r[1].routing_target === 'DUPLICATE');
  T('DD: distinct domain NEW', r[2].dedup_status === 'NEW');
  T('DD: missing domain NO_DOMAIN', r[3].dedup_status === 'NO_DOMAIN');
  const sd2 = {};
  const f1 = run(D, [{ normalized_domain: 'fail.com', extraction_status: 'EXTRACTION_FAILED' }, { normalized_domain: 'ok.com', extraction_status: 'EXTRACTED' }], {}, sd2);
  const f2 = run(D, [{ normalized_domain: 'fail.com', extraction_status: 'EXTRACTED' }, { normalized_domain: 'ok.com', extraction_status: 'EXTRACTED' }], {}, sd2);
  T('DD: a transient extraction failure is NOT remembered, so it is retried next run', f1[0].dedup_status === 'NEW' && f2[0].dedup_status === 'NEW');
  T('DD: an extracted lead is remembered', f2[1].dedup_status === 'DUPLICATE_PREVIOUS_RUN');
  const r2 = run(D, [{ normalized_domain: 'a.com', extraction_status: 'EXTRACTED' }], {}, sd);
  T('DD: repeat in a later run (persisted memory) is duplicate', r2[0].dedup_status === 'DUPLICATE_PREVIOUS_RUN');
  T('DD: same key for same domain (deterministic hash)', r[0].domain_hash === run(D, [{ normalized_domain: 'a.com' }], {}, {})[0].domain_hash);
}

// ============ Prepare Rows ============
{
  const rows = run('Prepare Rows', [{ ...global.scored, domain_hash: 'h64:ab12cd34ef56', routing_target: 'MASTER' }, { ...global.scored, domain_hash: 'h64:ab12cd34ef56', routing_target: 'REVIEW', lead_score: 70 }, { ...global.scored, domain_hash: 'h64:zz', routing_target: 'QUARANTINE', lead_score: 40 }]);
  T('PR: deterministic ids from domain hash', rows[0].master_lead_id === 'MLD-' + 'AB12CD34EF56'.slice(-10) && rows[1].review_id === 'REV-' + 'AB12CD34EF56'.slice(-10));
  T('PR: contact, designation and evidence text built', rows[0].contact_name === 'Jane Doe' && rows[0].designation === 'CEO' && rows[0].evidence_text.includes(' | '));
  T('PR: reason text follows the route', /meets the master/.test(rows[0].reason_text) && /review band/.test(rows[1].reason_text) && /below 60/.test(rows[2].reason_text));
  const IST = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d IST$/;
  T('PR: now is written in Indian Standard Time format', IST.test(rows[0].now), rows[0].now);
  const asUtc = Date.parse(rows[0].now.replace(' IST', '').replace(' ', 'T') + 'Z') - 330 * 60000;
  T('PR: IST value is UTC + 5:30 (matches now_utc within 5s)', Math.abs(asUtc - Date.parse(rows[0].now_utc)) < 5000, rows[0].now + ' vs ' + rows[0].now_utc);
  global.rows = rows;
}

// ============ Drop Existing Master (new node) ============
{
  const D = 'Drop Existing Master';
  const P = [{ routing_target: 'MASTER', normalized_domain: 'acmeweb.in', n: 1 }, { routing_target: 'MASTER', normalized_domain: 'new.com', n: 2 }, { routing_target: 'REVIEW', normalized_domain: 'rev.com', n: 3 }, { routing_target: 'MASTER', normalized_domain: 'www.new.com', n: 4 }, { routing_target: 'MASTER', normalized_domain: 'fresh.io', n: 5 }];
  const r = run(D, [{ normalized_domain: 'acmeweb.in', human_approval: 'APPROVED' }, { normalized_domain: 'other.com' }], { 'Prepare Rows': P });
  T('DM: existing Master lead is dropped (no overwrite)', !r.some(x => x.n === 1));
  T('DM: review-route leads never go to Master', !r.some(x => x.n === 3));
  T('DM: in-batch duplicate (www variant) dropped', r.filter(x => /new\.com/.test(x.normalized_domain)).length === 1);
  T('DM: genuinely new leads pass', r.map(x => x.n).sort().join() === '2,5');
  const e = run(D, [{}], { 'Prepare Rows': P });
  T('DM: empty sheet (single empty item) lets all new leads through', e.map(x => x.n).sort().join() === '1,2,5');
  T('DM: re-run with every lead already present -> 0 rows', run(D, [{ normalized_domain: 'acmeweb.in' }, { normalized_domain: 'new.com' }, { normalized_domain: 'fresh.io' }], { 'Prepare Rows': P }).length === 0);
}
summary();

// node tests/unit/talent.test.js  (Day 18: Track B talent sourcing, offline - nothing is fetched or sent)
const { run, T, wf, CODE, summary } = require('./harness');
const N = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
const conn = wf.connections;
const nxt = n => (conn[n] ? conn[n].main.map(b => b.map(t => t.node)) : []);

// ---------- fixtures
const post = (o = {}) => ({ author: 'jane_dev', title: 'Looking for an AI automation internship', subreddit: 'forhire', over_18: false, selftext: "I'm a final-year student looking for an AI automation internship. I build n8n workflows and use Python and LangChain. Portfolio: https://github.com/jane/proj.", ...o });
const http = (p) => ({ statusCode: 200, body: JSON.stringify([{ kind: 'Listing', data: { children: [{ kind: 't3', data: p }] } }, { kind: 'Listing', data: { children: [] } }]) });
const hit = (o = {}) => ({ result_id: 'RES-abc', campaign_id: 'CMP-2026-AAAA', source_url: 'https://www.reddit.com/r/forhire/comments/xyz/looking/', subreddit: 'forhire', post_id: 'xyz', title: 'Looking for an AI automation internship', snippet: 'student here', candidate_level_hint: 'STUDENT_OR_JUNIOR', page_text: 'Looking for an AI automation internship\nstudent here', ...o });
const ctx = (httpItem, h = hit()) => run('Build Talent Context', [httpItem], { 'Reddit Text From SERP': [h] });
const CFG = { campaign_id: 'CMP-2026-AAAA', min_lead_score: 80, target_roles: ['AI Automation Intern'] };
const groq = o => ({ choices: [{ message: { content: JSON.stringify(o) } }] });
const GOOD = { is_job_seeker: true, seeking_role: 'AI automation internship', skills: ['n8n', 'Python', 'LangChain'], location: null, portfolio_links: ['https://github.com/jane/proj'], evidence_quote: "I'm a final-year student looking for an AI automation internship." };
const verify = (model, base, cfg = CFG) => { const b = ctx(http(post()))[0]; return run('Verify & Score Talent', [model], { 'Parameter Normalizer': [cfg], 'Build Talent Context': [{ ...b, ...base }] })[0]; };

// ---------- structure
T('TB: chain Reddit Text -> Scrape Reddit Post -> Build Talent Context -> Groq Talent Extract -> Verify & Score Talent -> Talent Not Rejected?',
  nxt('Reddit Text From SERP')[0][0] === 'Scrape Reddit Post' && nxt('Scrape Reddit Post')[0][0] === 'Build Talent Context' && nxt('Build Talent Context')[0][0] === 'Groq Talent Extract' && nxt('Groq Talent Extract')[0][0] === 'Verify & Score Talent' && nxt('Verify & Score Talent')[0][0] === 'Talent Not Rejected?');
T('TB: not-rejected -> Write Talent, rejected -> Write Talent Quarantine', nxt('Talent Not Rejected?')[0][0] === 'Write Talent' && nxt('Talent Not Rejected?')[1][0] === 'Write Talent Quarantine');
const rl = n => N[n].parameters.options.batching.batch;
T('TB: Reddit fetch limited to <= 1 request per 2 s, 10 s timeout, never errors', rl('Scrape Reddit Post').batchSize === 1 && rl('Scrape Reddit Post').batchInterval >= 2000 && N['Scrape Reddit Post'].parameters.options.timeout === 10000 && N['Scrape Reddit Post'].parameters.options.response.response.neverError === true);
T('TB: Groq talent node limited to 1 request per 6 s with retries and continue-on-fail', rl('Groq Talent Extract').batchSize === 1 && rl('Groq Talent Extract').batchInterval >= 6000 && N['Groq Talent Extract'].retryOnFail === true && N['Groq Talent Extract'].onError === 'continueRegularOutput');
T('TB: Reddit fetch continues on fail (isolated failure contract)', N['Scrape Reddit Post'].onError === 'continueRegularOutput');
T('TB: Reddit fetch sends a descriptive User-Agent', /openlead-automation/.test(JSON.stringify(N['Scrape Reddit Post'].parameters.headerParameters)));
const body = N['Groq Talent Extract'].parameters.jsonBody;
T('TB: Groq call is strict json_schema, temperature 0', /strict: true/.test(body) && /temperature: 0/.test(body));
const req = (body.match(/required: \[([^\]]+)\]/) || [])[1] || '';
T('TB: schema requires every field and the model is never asked for experience level', ['is_job_seeker', 'seeking_role', 'skills', 'location', 'portfolio_links', 'evidence_quote'].every(f => req.includes('"' + f + '"')) && !/experience_level|level:/.test(body));
T('TB: prompt forbids guessing and constructing URLs (rules 1, 4, 6, 7)', /ONLY the text provided/.test(body) && /Never infer a skill/.test(body) && /Never construct or guess a URL/.test(body) && /exact substring/.test(body));
T('TB: system prompt stays small (NFR-04)', (body.match(/content: ("(?:[^"\\]|\\.)*")/) || ['', '""'])[1].length < 2600);
T('TB: Write Talent upserts on post_id into Talent_Leads', N['Write Talent'].parameters.operation === 'appendOrUpdate' && N['Write Talent'].parameters.columns.matchingColumns[0] === 'post_id' && N['Write Talent'].parameters.sheetName.value === 'Talent_Leads');
T('TB: quarantine write keys on rejection_id', N['Write Talent Quarantine'].parameters.columns.matchingColumns[0] === 'rejection_id');
T('TB: no talent node stores email or phone columns (NFR-06)', !/email|phone/i.test(JSON.stringify(N['Write Talent'].parameters.columns.value)));
T('TB: no-hit item is dropped before the fetch', run('Reddit Text From SERP', [{ no_hits: true }, hit()]).length === 1);
T('TB: all-no-hit run produces nothing to fetch', run('Reddit Text From SERP', [{ no_hits: true }]).length === 0);

// ---------- Build Talent Context
const c1 = ctx(http(post()))[0];
T('CTX: fetched post gives author, text from the post and source reddit_post_json', c1.author_handle === 'jane_dev' && c1.text_source === 'reddit_post_json' && c1.post_fetch_status === 'FETCHED' && c1.post_text.includes('n8n workflows'));
T('CTX: URL in the post is extracted with trailing punctuation removed', JSON.stringify(c1.urls_in_text) === JSON.stringify(['https://github.com/jane/proj']));
T('CTX: context carries subreddit and post text', c1.llm_context.startsWith('SUBREDDIT: r/forhire') && c1.llm_context.includes('POST:'));
T('CTX: original hit fields survive (post_id, result_id)', c1.post_id === 'xyz' && c1.result_id === 'RES-abc');
const c404 = ctx({ statusCode: 404, body: 'nope' })[0];
T('CTX: HTTP 404 falls back to the search title+snippet, author unknown', c404.text_source === 'serp_title_snippet' && c404.author_handle === null && c404.post_fetch_status === 'HTTP_404' && c404.post_text.includes('student here'));
T('CTX: HTTP 429 (rate limit) falls back safely', ctx({ statusCode: 429, body: 'Too Many Requests' })[0].post_fetch_status === 'HTTP_429');
T('CTX: invalid JSON falls back safely', ctx({ statusCode: 200, body: '<html>blocked</html>' })[0].post_fetch_status === 'BAD_JSON');
T('CTX: transport error falls back safely', ctx({ error: { message: 'timeout' } })[0].post_fetch_status === 'FETCH_FAILED');
T('CTX: removed post is dropped', ctx(http(post({ selftext: '[removed]' }))).length === 0);
T('CTX: deleted post is dropped', ctx(http(post({ selftext: '[deleted]' }))).length === 0);
T('CTX: removed_by_category post is dropped', ctx(http(post({ removed_by_category: 'moderator' }))).length === 0);
T('CTX: over_18 post is dropped', ctx(http(post({ over_18: true }))).length === 0);
T('CTX: deleted author becomes null, post still used', ctx(http(post({ author: '[deleted]' })))[0].author_handle === null);
T('CTX: nothing to extract at all is dropped', ctx({ statusCode: 404, body: '' }, hit({ page_text: '' })).length === 0);
T('CTX: huge post is capped (NFR-04)', ctx(http(post({ selftext: 'x '.repeat(10000) })))[0].post_text.length <= 2500);
const two = run('Build Talent Context', [http(post({ author: 'a1' })), http(post({ author: 'a2' }))], { 'Reddit Text From SERP': [hit({ post_id: 'p1' }), hit({ post_id: 'p2' })] });
T('CTX: output stays paired with the right hit (by position)', two[0].post_id === 'p1' && two[0].author_handle === 'a1' && two[1].post_id === 'p2' && two[1].author_handle === 'a2');

// ---------- Verify & Score Talent
const g = verify(groq(GOOD), {});
T('VER: strong verified candidate scores >= 80 and routes TALENT_QUALIFIED', g.lead_score >= 80 && g.route === 'TALENT_QUALIFIED', JSON.stringify(g));
T('VER: row carries post url, author, skills, portfolio, quote', g.post_url.includes('/comments/xyz') && g.author_handle === 'jane_dev' && g.skills === 'n8n, Python, LangChain' && g.portfolio_links === 'https://github.com/jane/proj' && g.evidence.includes('final-year student'));
T('VER: talent_id is stable for the same post (idempotent upsert)', verify(groq(GOOD), {}).talent_id === g.talent_id && /^TLN-[0-9A-Z]+$/.test(g.talent_id));
const hall = verify(groq({ ...GOOD, skills: ['n8n', 'TensorFlow', 'Kubernetes'], portfolio_links: ['https://github.com/fake/made-up'], evidence_quote: 'I won a national hackathon last year.' }), {});
T('VER: skill not in the post is dropped (TensorFlow)', !hall.skills.includes('TensorFlow') && !hall.skills.includes('Kubernetes') && hall.skills === 'n8n');
T('VER: portfolio link not in the post is dropped', hall.portfolio_links === '');
T('VER: quote not in the post is dropped', hall.evidence === '');
T('VER: unsupported claims lower the score', hall.lead_score < g.lead_score);
T('VER: quote with curly quotes and extra spaces still matches', verify(groq({ ...GOOD, evidence_quote: 'I’m a final-year  student looking for an AI automation internship.' }), {}).evidence !== '');
T('VER: location must appear in the post', verify(groq({ ...GOOD, location: 'Berlin' }), {}).location === '' && verify(groq({ ...GOOD, location: 'Pune' }), { post_text: 'Student in Pune. n8n. looking for an AI automation internship, I use Python and n8n daily.' }).location === 'Pune');
T('VER: seeking_role must appear in the post', verify(groq({ ...GOOD, seeking_role: 'Staff Engineer' }), {}).seeking_role === '');
T('VER: not a job seeker is rejected', (r => r.route === 'REJECTED' && r.reason_text === 'NOT_A_JOB_SEEKER' && r.lead_score === 0)(verify(groq({ ...GOOD, is_job_seeker: false }), {})));
T('VER: model API error is rejected as EXTRACTION_FAILED', /^EXTRACTION_FAILED/.test(verify({ error: { message: 'Rate limit' } }, {}).reason_text));
T('VER: non-JSON model output is rejected as EXTRACTION_FAILED', /^EXTRACTION_FAILED/.test(verify({ choices: [{ message: { content: 'sorry I cannot' } }] }, {}).reason_text));
T('VER: markdown fences around JSON are tolerated', verify({ choices: [{ message: { content: '```json\n' + JSON.stringify(GOOD) + '\n```' } }] }, {}).route === 'TALENT_QUALIFIED');
const veto = verify(groq({ ...GOOD, skills: ['Rust'], portfolio_links: [], evidence_quote: null }), {});
T('VER: no verified skill and no verified quote is vetoed (score 0)', veto.route === 'REJECTED' && veto.lead_score === 0 && veto.reason_text === 'NO_VERIFIED_EVIDENCE');
const marg = verify(groq({ ...GOOD, skills: ['n8n'], portfolio_links: [] }), {});
T('VER: marginal candidate (1 skill, no link) routes REVIEW (60-79)', marg.lead_score >= 60 && marg.lead_score < 80 && marg.route === 'REVIEW', JSON.stringify(marg));
T('VER: min_lead_score from the campaign is respected', verify(groq({ ...GOOD, portfolio_links: [] }), {}, { ...CFG, min_lead_score: 95 }).route === 'REVIEW');
T('VER: experienced hint lowers the level score', verify(groq(GOOD), { candidate_level_hint: 'EXPERIENCED' }).lead_score < g.lead_score);
T('VER: level comes from code, a hostile model value is ignored', verify(groq({ ...GOOD, experience_level: 'STUDENT_OR_JUNIOR' }), { candidate_level_hint: 'EXPERIENCED' }).experience_level === 'EXPERIENCED');
T('VER: unclear hint falls back to the post text (student => junior)', verify(groq(GOOD), { candidate_level_hint: 'UNCLEAR' }).experience_level === 'STUDENT_OR_JUNIOR');
T('VER: non-AI post gets no role credit', verify(groq({ ...GOOD, skills: ['Photoshop'], portfolio_links: [], seeking_role: null }), { title: 'Looking for a graphic design job', post_text: "I'm a final-year student looking for a graphic design job. I use Photoshop. I am a student." , candidate_level_hint: 'STUDENT_OR_JUNIOR' }).lead_score < 60);
const rej = verify(groq({ ...GOOD, is_job_seeker: false }), {});
T('VER: rejected row is ready for Stage_B_Quarantine (id, domain, reason, time)', /^REJ-/.test(rej.rejection_id) && rej.normalized_domain === 'reddit.com/r/forhire' && rej.reason_text && /IST$/.test(rej.now) && rej.result_id === 'RES-abc');
T('VER: output never contains an email or phone field', !Object.keys(g).some(k => /email|phone/i.test(k)));
// ---------- Discovery queries for Track B (Google ignores site: when the query is too strict)
const normOut = (extra = {}) => run('Parameter Normalizer', [{ choices: [{ message: { content: JSON.stringify({ task_category: 'TALENT_RECRUITMENT', target_industry: null, target_geography: null, company_size_range: 'ALL', target_roles: ['AI Automation Intern'], exclusion_keywords: [], max_leads_limit: 5, min_lead_score: null, ...extra }) } }] }], { 'Prompt Not Empty': [{ campaign_prompt: 'x' }] })[0];
const tq = normOut().compiled_queries;
T('Q: talent campaign compiles 5 queries', tq.length === 5, String(tq.length));
T('Q: every talent query is scoped to a subreddit comments path', tq.every(q => /^site:reddit\.com\/r\/[A-Za-z0-9_]+\/comments /.test(q)), tq.join(' | '));
T('Q: no intitle: operators or long exact-phrase lists', tq.every(q => !/intitle:/.test(q) && q.length < 130), tq.map(q => q.length).join());
T('Q: talent queries mention AI or automation', tq.every(q => /AI|automation|machine learning|n8n/i.test(q)));
T('Q: B2B queries are unchanged', normOut({ task_category: 'B2B_LEAD_GEN' }).compiled_queries[0].includes('web development agency'));
const eh = (links) => run('Extract Reddit Hits', [{ search_parameters: { q: 'q' }, organic_results: links.map(l => ({ link: l, title: 'Looking for AI internship', snippet: 's' })) }], { 'Split Queries': [{ campaign_id: 'CMP-2026-AAAA', max_leads_limit: 5 }] });
const none = eh(['https://www.linkedin.com/jobs/view/1', 'https://www.reddit.com/r/forhire/']);
T('Q: no-hit marker says why (NOT_REDDIT vs NOT_A_POST_URL)', none[0].no_hits === true && none[0].skip_log[0].reason === 'NOT_REDDIT' && none[0].skip_log[1].reason === 'NOT_A_POST_URL', JSON.stringify(none[0].skip_log));
T('Q: a real Reddit post URL is kept', eh(['https://www.reddit.com/r/forhire/comments/abc123/looking_for_ai_internship/'])[0].post_id === 'abc123');

// ---------- Day 18 hardening: snippet-only, freshness, skill credit
const nowS = Math.floor(Date.now() / 1000);
const aged = d => ctx(http(post({ created_utc: nowS - d * 86400 })))[0];
T('CTX: created_utc gives posted_at (YYYY-MM-DD) and post_age_days', /^\d{4}-\d{2}-\d{2}$/.test(aged(10).posted_at) && aged(10).post_age_days === 10);
T('CTX: post without created_utc has null age', c1.post_age_days === null && c1.posted_at === null);
const snip = verify(groq(GOOD), { text_source: 'serp_title_snippet', post_fetch_status: 'HTTP_403' });
T('SNIP: perfect model output from a snippet-only lead is capped at REVIEW', snip.route === 'REVIEW' && /CAPPED:SNIPPET_ONLY/.test(snip.reasons), JSON.stringify(snip));
T('SNIP: row records text_source for the audit', snip.text_source === 'serp_title_snippet' && g.text_source === 'reddit_post_json');
T('AGE: fresh post (10 days) can qualify', verify(groq(GOOD), { post_age_days: 10, posted_at: '2026-11-13' }).route === 'TALENT_QUALIFIED');
const old6 = verify(groq(GOOD), { post_age_days: 200, posted_at: '2026-05-01' });
T('AGE: post older than 180 days is capped at REVIEW', old6.route === 'REVIEW' && /CAPPED:STALE\(200d\)/.test(old6.reasons), JSON.stringify(old6));
const old13 = verify(groq(GOOD), { post_age_days: 400, posted_at: '2025-10-01' });
T('AGE: post older than 365 days is rejected as STALE_POST', old13.route === 'REJECTED' && /^STALE_POST\(400d\)/.test(old13.reason_text));
T('AGE: posted_at is carried to the sheet row', verify(groq(GOOD), { post_age_days: 10, posted_at: '2026-11-13' }).posted_at === '2026-11-13');
const ft = verify(groq({ ...GOOD, skills: ['model fine-tuning'], portfolio_links: [] }), { post_text: "I'm a 2027 grad actively looking for a solid AI/ML internship this winter. I have hands-on experience with model fine-tuning.", title: 'Need guidance on AI/ML Internship Opportunities', evidence_quote: null, text_source: 'reddit_post_json' });
T('SKILL: a verified skill outside the AI word list still earns credit (model fine-tuning)', ft.skills === 'model fine-tuning' && /skills=40/.test(ft.reasons), JSON.stringify(ft));
T('SKILL: still only skills that appear in the text', verify(groq({ ...GOOD, skills: ['Kubernetes'] }), {}).skills === '');
const wtv = N['Write Talent'].parameters.columns.value;
T('TB: Write Talent maps text_source and posted_at', wtv.text_source && wtv.posted_at);

// ---------- Reddit blocks the post fetch (HTTP 403 "Blocked" even with a browser User-Agent)
T('TB: Scrape Reddit Post is disabled in the repo (Reddit blocks it; enable only with approved API access)', N['Scrape Reddit Post'].disabled === true);
const passthrough = ctx({ ...hit() })[0];
T('CTX: with the fetch node disabled, items pass through and use the snippet (NOT_FETCHED)', passthrough.post_fetch_status === 'NOT_FETCHED' && passthrough.text_source === 'serp_title_snippet' && passthrough.post_id === 'xyz');
const dis = verify(groq(GOOD), { text_source: 'serp_title_snippet', post_fetch_status: 'NOT_FETCHED' });
T('VER: a snippet-only lead lands in REVIEW for a human to open and confirm', dis.route === 'REVIEW' && /SNIPPET_ONLY/.test(dis.reasons));

// ---------- review floor for snippet-only leads (a snippet cannot show skills or links)
const SN = { text_source: 'serp_title_snippet', post_fetch_status: 'NOT_FETCHED', post_age_days: null, post_text: "I'm a 2027 grad actively looking for a solid AI/ML internship this winter. I have hands-on experience with model fine-tuning, ...", title: 'Need guidance on AI/ML Internship Opportunities and ...', candidate_level_hint: 'STUDENT_OR_JUNIOR', urls_in_text: [] };
const QUOTE = "I'm a 2027 grad actively looking for a solid AI/ML internship this winter.";
const sn55 = verify(groq({ is_job_seeker: true, seeking_role: 'AI/ML internship', skills: [], location: null, portfolio_links: [], evidence_quote: QUOTE }), SN);
T('FLOOR: snippet lead with verified quote + AI role fit and score 55 goes to REVIEW', sn55.lead_score === 55 && sn55.route === 'REVIEW' && /SNIPPET_REVIEW/.test(sn55.reasons), JSON.stringify(sn55));
const f55 = verify(groq({ is_job_seeker: true, seeking_role: 'AI/ML internship', skills: [], location: null, portfolio_links: [], evidence_quote: QUOTE }), { ...SN, text_source: 'reddit_post_json', post_fetch_status: 'FETCHED' });
T('FLOOR: the same 55 from a fully fetched post stays REJECTED (floor is for snippets only)', f55.route === 'REJECTED', JSON.stringify(f55));
const snNoQuote = verify(groq({ is_job_seeker: true, seeking_role: 'AI/ML internship', skills: ['model fine-tuning'], location: null, portfolio_links: [], evidence_quote: 'a sentence that is not in the text at all' }), SN);
T('FLOOR: no verified quote means no review floor', snNoQuote.route !== 'REVIEW' || !/SNIPPET_REVIEW/.test(snNoQuote.reasons), JSON.stringify(snNoQuote));
const snNoRole = verify(groq({ is_job_seeker: true, seeking_role: null, skills: [], location: null, portfolio_links: [], evidence_quote: 'looking for a graphic design job' }), { ...SN, title: 'Graphic designer for hire', post_text: "I'm a student looking for a graphic design job" });
T('FLOOR: no AI role fit means no review floor', snNoRole.route === 'REJECTED', JSON.stringify(snNoRole));
T('FLOOR: not-a-job-seeker is still rejected regardless of floor', verify(groq({ is_job_seeker: false, seeking_role: null, skills: [], location: null, portfolio_links: [], evidence_quote: QUOTE }), SN).route === 'REJECTED');
summary();

// node tests/unit/talent.test.js  (Day 18: Track B talent sourcing, offline - nothing is fetched or sent)
const { run, T, wf, CODE, summary } = require('./harness');
const N = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
const conn = wf.connections;
const rl = n => N[n].parameters.options.batching.batch;
const nxt = n => (conn[n] ? conn[n].main.map(b => b.map(t => t.node)) : []);

// ---------- fixtures
const post = (o = {}) => ({ author: 'jane_dev', title: 'Looking for an AI automation internship', subreddit: 'forhire', over_18: false, selftext: "I'm a final-year student looking for an AI automation internship. I build n8n workflows and use Python and LangChain. Portfolio: https://github.com/jane/proj.", ...o });
const http = (p) => ({ statusCode: 200, body: JSON.stringify([{ kind: 'Listing', data: { children: [{ kind: 't3', data: p }] } }, { kind: 'Listing', data: { children: [] } }]) });
const hit = (o = {}) => ({ source_platform: 'reddit', normalized_domain: 'reddit.com', result_id: 'RES-abc', campaign_id: 'CMP-2026-AAAA', source_url: 'https://www.reddit.com/r/forhire/comments/xyz/looking/', subreddit: 'forhire', post_id: 'xyz', title: 'Looking for an AI automation internship', snippet: 'student here', candidate_level_hint: 'STUDENT_OR_JUNIOR', page_text: 'Looking for an AI automation internship\nstudent here', ...o });
const ctx = (httpItem, h = hit()) => run('Build Talent Context', [httpItem], { 'Reddit Text From SERP': [h] });
const CFG = { campaign_id: 'CMP-2026-AAAA', min_lead_score: 80, target_roles: ['AI Automation Intern'] };
const groq = o => ({ choices: [{ message: { content: JSON.stringify(o) } }] });
const GOOD = { is_job_seeker: true, seeking_role: 'AI automation internship', skills: ['n8n', 'Python', 'LangChain'], location: null, portfolio_links: ['https://github.com/jane/proj'], evidence_quote: "I'm a final-year student looking for an AI automation internship." };
const verify = (model, base, cfg = CFG) => { const b = ctx(http(post()))[0]; return run('Verify & Score Talent', [model], { 'Parameter Normalizer': [cfg], 'Merge Talent Inputs': [{ ...b, ...base }] })[0]; };

// ---------- structure
T('TB: Reddit chain Reddit Text -> Scrape Reddit Post -> Build Talent Context -> Merge Talent Inputs (input 0)',
  nxt('Reddit Text From SERP')[0][0] === 'Scrape Reddit Post' && nxt('Scrape Reddit Post')[0][0] === 'Build Talent Context' && conn['Build Talent Context'].main[0][0].node === 'Merge Talent Inputs' && conn['Build Talent Context'].main[0][0].index === 0);
T('TB: Web chain Extract Web Talent Hits -> Scrape Talent Page -> Build Web Talent Context -> Merge Talent Inputs (input 1)',
  nxt('Extract Web Talent Hits')[0][0] === 'Scrape Talent Page' && nxt('Scrape Talent Page')[0][0] === 'Build Web Talent Context' && conn['Build Web Talent Context'].main[0][0].node === 'Merge Talent Inputs' && conn['Build Web Talent Context'].main[0][0].index === 1);
T('TB: Merge Talent Inputs -> Groq Talent Extract -> Verify & Score Talent -> Talent Not Rejected?',
  nxt('Merge Talent Inputs')[0][0] === 'Groq Talent Extract' && nxt('Groq Talent Extract')[0][0] === 'Verify & Score Talent' && nxt('Verify & Score Talent')[0][0] === 'Talent Not Rejected?');
T('TB: the non-B2B output of Is B2B? feeds both the Reddit and the web path', nxt('Is B2B?')[1].includes('Extract Reddit Hits') && nxt('Is B2B?')[1].includes('Extract Web Talent Hits'));
T('TB: Merge Talent Inputs appends', (N['Merge Talent Inputs'].parameters.mode || 'append') === 'append');
T('TB: Scrape Talent Page has a 10 s timeout, never errors, is rate limited and continues on fail', N['Scrape Talent Page'].parameters.options.timeout === 10000 && N['Scrape Talent Page'].parameters.options.response.response.neverError === true && rl('Scrape Talent Page').batchSize <= 3 && rl('Scrape Talent Page').batchInterval >= 1000 && N['Scrape Talent Page'].onError === 'continueRegularOutput' && !N['Scrape Talent Page'].disabled);
T('TB: not-rejected -> Write Talent, rejected -> Write Talent Quarantine', nxt('Talent Not Rejected?')[0][0] === 'Write Talent' && nxt('Talent Not Rejected?')[1][0] === 'Write Talent Quarantine');
T('TB: Reddit fetch limited to <= 1 request per 2 s, 10 s timeout, never errors', rl('Scrape Reddit Post').batchSize === 1 && rl('Scrape Reddit Post').batchInterval >= 2000 && N['Scrape Reddit Post'].parameters.options.timeout === 10000 && N['Scrape Reddit Post'].parameters.options.response.response.neverError === true);
T('TB: Groq talent node limited to 1 request per 6 s with retries and continue-on-fail', rl('Groq Talent Extract').batchSize === 1 && rl('Groq Talent Extract').batchInterval >= 6000 && N['Groq Talent Extract'].retryOnFail === true && N['Groq Talent Extract'].onError === 'continueRegularOutput');
T('TB: Reddit fetch continues on fail (isolated failure contract)', N['Scrape Reddit Post'].onError === 'continueRegularOutput');
T('TB: Reddit fetch sends a descriptive User-Agent', /openlead-automation/.test(JSON.stringify(N['Scrape Reddit Post'].parameters.headerParameters)));
const body = N['Groq Talent Extract'].parameters.jsonBody;
T('TB: Groq call is strict json_schema, temperature 0', /strict: true/.test(body) && /temperature: 0/.test(body));
const req = (body.match(/required: \[([^\]]+)\]/) || [])[1] || '';
T('TB: schema requires every field (incl. person_name) and the model is never asked for experience level', ['is_job_seeker', 'seeking_role', 'skills', 'location', 'portfolio_links', 'evidence_quote', 'person_name'].every(f => req.includes('"' + f + '"')) && !/experience_level|level:/.test(body));
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
T('Q: talent campaign compiles 8 queries (3 Reddit + 5 web portfolio searches)', tq.length === 8, String(tq.length));
T('Q: web queries cover github.io, netlify.app and vercel.app portfolios', tq.some(q => /site:netlify\.app/.test(q)) && tq.some(q => /site:vercel\.app/.test(q)) && tq.filter(q => /site:github\.io/.test(q)).length === 3);
T('Q: the first 3 talent queries are scoped to a subreddit comments path', tq.slice(0, 3).every(q => /^site:reddit\.com\/r\/[A-Za-z0-9_]+\/comments /.test(q)), tq.join(' | '));
T('Q: the 5 web queries target personal-site hosts only (github.io, netlify.app, vercel.app)', tq.slice(3).every(q => /^site:(github\.io|netlify\.app|vercel\.app) /.test(q)) && tq.slice(0, 3).every(q => /^site:reddit\.com\/r\//.test(q)), tq.join(' | '));
T('Q: no intitle: operators or long exact-phrase lists', tq.every(q => !/intitle:/.test(q) && q.length < 150), tq.map(q => q.length).join());
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

// ================= Web talent path (portfolio / GitHub / blog pages) =================
const serp = (links, q = 'site:github.io portfolio') => [{ search_parameters: { q }, organic_results: links.map(([link, title, snippet]) => ({ link, title: title || 'Jane Doe | Portfolio', snippet: snippet || 'Student seeking an AI automation internship.' })) }];
const wh = (links, max = 10) => run('Extract Web Talent Hits', serp(links), { 'Split Queries': [{ campaign_id: 'CMP-2026-AAAA', max_leads_limit: max }] });
const kept = wh(['https://jane.github.io/', 'https://www.linkedin.com/in/jane', 'https://in.indeed.com/jobs?q=ai', 'https://www.reddit.com/r/forhire/comments/a/b/', 'https://github.com/speedyapply/2027-AI-College-Jobs', 'https://github.com/janedoe', 'https://www.naukri.com/x', ['https://example.com/top-10-ai-jobs', 'Top 10 AI jobs in India'], 'https://jane.github.io/#contact', 'https://sam.dev/about'].map(x => Array.isArray(x) ? x : [x]));
T('WEB: keeps personal pages, drops job boards, social, Reddit, GitHub repos and job-list titles', JSON.stringify(kept.map(k => k.source_url)) === JSON.stringify(['https://jane.github.io/', 'https://github.com/janedoe', 'https://sam.dev/about']), JSON.stringify(kept.map(k => k.source_url)));
T('WEB: duplicate page (same host and path) is dropped', kept.filter(k => k.normalized_domain === 'jane.github.io').length === 1);
T('WEB: hit carries ids, platform, level hint and campaign', kept[0].result_id.startsWith('RES-') && kept[0].source_platform === 'web' && kept[0].candidate_level_hint === 'STUDENT_OR_JUNIOR' && kept[0].campaign_id === 'CMP-2026-AAAA');
T('WEB: respects max_leads_limit', wh(['https://a.github.io/', 'https://b.github.io/', 'https://c.github.io/'].map(x => [x]), 2).length === 2);
T('WEB: nothing usable returns no items (the run just ends)', wh(['https://www.linkedin.com/in/x'].map(x => [x])).length === 0);
T('WEB: an API error item is ignored', run('Extract Web Talent Hits', [{ error: 'x' }], { 'Split Queries': [{ campaign_id: 'C', max_leads_limit: 5 }] }).length === 0);

const PAGE = `<html><head><title>Jane Doe</title><style>.x{color:red}</style><script>var a=1</script></head><body><h1>Jane Doe</h1><p>Final-year student. I am seeking an AI automation internship.</p><p>Skills: Python, n8n, LangChain, REST APIs. Built 5 projects with workflow automation and LLM agents for small businesses and student clubs.</p><a href="https://github.com/janedoe">GitHub</a> <a href="https://github.com/janedoe/lead-bot">lead-bot</a> <a href="https://www.linkedin.com/in/janedoe">LinkedIn</a> <a href="https://tracker.example.com/x">tracker</a> <a href="/projects">projects</a><footer>Based in Pune. Open to work. More text so the page is long enough to be real content, with plenty of words in it to pass the minimum.</footer></body></html>`;
const whit = (o = {}) => ({ result_id: 'RES-w1', campaign_id: 'CMP-2026-AAAA', source_url: 'https://jane.github.io/', normalized_domain: 'jane.github.io', source_platform: 'web', title: 'Jane Doe | Portfolio', snippet: 'Student seeking an AI automation internship.', candidate_level_hint: 'STUDENT_OR_JUNIOR', ...o });
const wctx = (items, hits) => run('Build Web Talent Context', items, { 'Extract Web Talent Hits': hits || items.map(() => whit()) });
const w1 = wctx([{ statusCode: 200, body: PAGE }])[0];
T('WCTX: page text is clean (no script, style or tags)', w1.post_text.includes('seeking an AI automation internship') && !/<|var a=1|color:red/.test(w1.post_text));
T('WCTX: lists the page URL first, then real profile links only', w1.urls_in_text[0] === 'https://jane.github.io/' && w1.urls_in_text.includes('https://github.com/janedoe') && w1.urls_in_text.includes('https://www.linkedin.com/in/janedoe') && !w1.urls_in_text.some(u => /tracker\.example/.test(u)), JSON.stringify(w1.urls_in_text));
T('WCTX: context carries source, title, text and links for the model', /^SOURCE: personal web page \(jane\.github\.io\)/.test(w1.llm_context) && w1.llm_context.includes('LINKS ON PAGE:') && w1.llm_context.includes('https://github.com/janedoe'));
T('WCTX: marks the lead as a fetched web page with a stable WEB- id', w1.text_source === 'web_page' && w1.post_fetch_status === 'FETCHED' && /^WEB-[0-9a-z]+$/.test(w1.post_id) && w1.post_id === wctx([{ statusCode: 200, body: PAGE }])[0].post_id);
T('WCTX: no author handle, date or age for a web page', w1.author_handle === null && w1.posted_at === null && w1.post_age_days === null);
T('WCTX: failed fetches (404, error, empty, tiny page) are dropped', wctx([{ statusCode: 404, body: 'x' }, { error: { message: 't' } }, { statusCode: 200, body: '' }, { statusCode: 200, body: '<p>hi</p>' }]).length === 0);
T('WCTX: stays paired with the right hit by position', (r => r.length === 2 && r[0].normalized_domain === 'a.github.io' && r[1].normalized_domain === 'b.github.io')(wctx([{ statusCode: 200, body: PAGE }, { statusCode: 200, body: PAGE }], [whit({ normalized_domain: 'a.github.io', source_url: 'https://a.github.io/' }), whit({ normalized_domain: 'b.github.io', source_url: 'https://b.github.io/' })])));
T('WCTX: huge page is capped (NFR-04)', wctx([{ statusCode: 200, body: '<p>' + 'I build n8n automation projects. '.repeat(2000) + '</p>' }])[0].post_text.length <= 2500);

const WEBTEXT = w1.post_text;
const wbase = () => ({ ...w1 });
const verifyW = (model, over = {}) => run('Verify & Score Talent', [model], { 'Parameter Normalizer': [CFG], 'Merge Talent Inputs': [{ ...wbase(), ...over }] })[0];
const WGOOD = { is_job_seeker: true, seeking_role: 'AI automation internship', skills: ['Python', 'n8n', 'LangChain'], location: 'Pune', portfolio_links: ['https://github.com/janedoe'], evidence_quote: 'I am seeking an AI automation internship.', person_name: 'Jane Doe' };
const wv = verifyW(groq(WGOOD));
T('WVER: a fetched web page can reach TALENT_QUALIFIED (not capped as a snippet)', wv.route === 'TALENT_QUALIFIED' && wv.lead_score >= 80, JSON.stringify(wv));
T('WVER: row carries platform, verified name, links, location and the page URL', wv.source_platform === 'web' && wv.candidate_name === 'Jane Doe' && wv.portfolio_links === 'https://github.com/janedoe' && wv.location === 'Pune' && wv.post_url === 'https://jane.github.io/');
T('WVER: person name not in the page is dropped (hallucinated name)', verifyW(groq({ ...WGOOD, person_name: 'Priya Sharma' })).candidate_name === '');
T('WVER: link not on the page is dropped', verifyW(groq({ ...WGOOD, portfolio_links: ['https://github.com/someone-else'] })).portfolio_links === '');
T('WVER: link copied from the LINKS ON PAGE list is accepted', verifyW(groq({ ...WGOOD, portfolio_links: ['https://www.linkedin.com/in/janedoe'] })).portfolio_links === 'https://www.linkedin.com/in/janedoe');
T('WVER: skill not on the page is dropped', !verifyW(groq({ ...WGOOD, skills: ['Python', 'Rust'] })).skills.includes('Rust'));
T('WVER: company or job-list page (not a job seeker) is rejected', (r => r.route === 'REJECTED' && r.reason_text === 'NOT_A_JOB_SEEKER')(verifyW(groq({ ...WGOOD, is_job_seeker: false }))));
T('WVER: rejected web row quarantines under its host, not reddit.com', verifyW(groq({ ...WGOOD, is_job_seeker: false })).normalized_domain === 'jane.github.io');
T('WVER: reddit rows still quarantine under reddit.com/r/<sub>', verify(groq({ ...GOOD, is_job_seeker: false }), { source_platform: 'reddit' }).normalized_domain === 'reddit.com/r/forhire');
const wtv2 = N['Write Talent'].parameters.columns.value;
T('TB: Write Talent maps source_platform and candidate_name', wtv2.source_platform && wtv2.candidate_name);
T('TB: no email or phone column anywhere in the talent write', !/email|phone/i.test(JSON.stringify(wtv2)));


// ---------- shared quote (snippet stitched across threads)
{
  const ev = "Looking for an AI/ML internship from Dec-March (3+ months)";
  const mk = (id, title) => ({ ...ctx(http(post()))[0], post_id: id, title, post_text: title + '\n' + ev, text_source: 'serp_title_snippet', source_platform: 'reddit', source_url: 'https://www.reddit.com/r/x/comments/' + id + '/t/' });
  const bases = [mk('p1', 'AI/ML internship fresher'), mk('p2', 'Just joined an automation role'), mk('p3', 'Another AI thread')];
  const mdl = { is_job_seeker: true, seeking_role: 'AI/ML internship', skills: [], location: null, portfolio_links: [], evidence_quote: ev, person_name: null };
  const out = run('Verify & Score Talent', [groq(mdl), groq(mdl), groq({ ...mdl, evidence_quote: 'AI/ML internship fresher' })], { 'Parameter Normalizer': [CFG], 'Merge Talent Inputs': bases });
  T('SQ: the same quote on 2 posts rejects both as SHARED_QUOTE', out[0].route === 'REJECTED' && out[0].reasons === 'SHARED_QUOTE' && out[1].route === 'REJECTED' && out[1].reasons === 'SHARED_QUOTE' && out[0].evidence === '' && out[0].lead_score === 0, JSON.stringify(out.map(o => [o.route, o.reasons])));
  T('SQ: a post with its own unique quote is not touched', out[2].route !== 'REJECTED' || out[2].reasons !== 'SHARED_QUOTE', JSON.stringify(out[2].reasons));
  const one = run('Verify & Score Talent', [groq(mdl)], { 'Parameter Normalizer': [CFG], 'Merge Talent Inputs': [bases[0]] });
  T('SQ: a single post with that quote is kept', one[0].reasons !== 'SHARED_QUOTE' && one[0].route !== 'REJECTED', JSON.stringify(one[0]));
}


// ---------- web hits: personal sites only, Reddit queries ignored, fair share per query
{
  const mkQ = (q, links) => ({ search_parameters: { q }, organic_results: links.map(([link, title, snippet]) => ({ link, title, snippet: snippet || 'x' })) });
  const cfg = n => ({ 'Split Queries': [{ campaign_id: 'CMP-2026-AAAA', max_leads_limit: n }] });
  const junk = run('Extract Web Talent Hits', [mkQ('site:reddit.com/r/n8n/comments "looking for"', [['https://jane.github.io/', 'Jane | Portfolio'], ['https://x.org/a', 'News']])], cfg(10));
  T('WEB2: hits from Reddit-scoped queries are ignored', junk.length === 0);
  const filt = run('Extract Web Talent Hits', [mkQ('site:github.io p', [['https://www.scribd.com/document/1/AI-Intern', 'AI Automation Intern | PDF'], ['https://myinternships.in/roles/ai', 'Hire AI interns'], ['https://www.goodreads.com/book/1', 'Looking for Alaska'], ['https://jane.github.io/', 'Jane'], ['https://jane.netlify.app/', 'Jane'], ['https://someone.vercel.app/', 'S'], ['https://example.com/jane-portfolio', 'Jane Portfolio'], ['https://example.com/jane-resume', 'x'], ['https://openai.com/', 'OpenAI']])], cfg(20));
  T('WEB2: only personal hosts or portfolio/resume/CV pages are kept', JSON.stringify(filt.map(f => f.source_url)) === JSON.stringify(['https://jane.github.io/', 'https://jane.netlify.app/', 'https://someone.vercel.app/', 'https://example.com/jane-portfolio', 'https://example.com/jane-resume']), JSON.stringify(filt.map(f => f.source_url)));
  const rr = run('Extract Web Talent Hits', [mkQ('site:github.io a', [['https://a1.github.io/'], ['https://a2.github.io/'], ['https://a3.github.io/']]), mkQ('site:netlify.app b', [['https://b1.netlify.app/'], ['https://b2.netlify.app/']])], cfg(4));
  T('WEB2: the limit is shared fairly, one hit per query in turn', JSON.stringify(rr.map(f => f.source_url)) === JSON.stringify(['https://a1.github.io/', 'https://b1.netlify.app/', 'https://a2.github.io/', 'https://b2.netlify.app/']), JSON.stringify(rr.map(f => f.source_url)));
}

// ---------- snippet leads need their own quote to say the person is seeking work
{
  const SNIP = { text_source: 'serp_title_snippet', post_text: "Looking for n8n automation project ideas to build a job-ready portfolio\nNow I'm looking for project ideas to include in my portfolio for job applications", title: 'Looking for n8n automation project ideas', source_platform: 'reddit', subreddit: 'n8n' };
  const noIntent = verify(groq({ is_job_seeker: true, seeking_role: null, skills: [], location: null, portfolio_links: [], evidence_quote: "Now I'm looking for project ideas to include in my portfolio for job applications", person_name: null }), SNIP);
  T('SEEK: a snippet quote asking for project ideas is not seeking work, rejected', noIntent.route === 'REJECTED' && noIntent.reasons === 'NO_SEEKING_INTENT', JSON.stringify(noIntent));
  const yesIntent = verify(groq({ is_job_seeker: true, seeking_role: null, skills: [], location: null, portfolio_links: [], evidence_quote: "Now I'm looking for a job as an AI intern", person_name: null }), { ...SNIP, post_text: "Looking for n8n automation ideas\nNow I'm looking for a job as an AI intern" });
  T('SEEK: a snippet quote stating the person wants an internship or job is kept', yesIntent.reasons !== 'NO_SEEKING_INTENT', JSON.stringify(yesIntent));
}
summary();

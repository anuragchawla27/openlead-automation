const { run, T, wf, CODE, summary } = require('./harness');
const fs = require('fs');
const cfg = { campaign_id: 'CMP-2026-8QF3', target_industry: 'Information Technology Services', target_geography: 'India', company_size_range: '11-50', exclusion_keywords: ['staffing', 'recruitment'], min_lead_score: 80, max_leads_limit: 5 };
const groq = o => ({ choices: [{ message: { content: typeof o === 'string' ? o : JSON.stringify(o) } }] });

// ============ Parameter Normalizer ============
{
  const N = 'Parameter Normalizer';
  const mk = p => run(N, [groq(p)], { 'Intake Form': [{ campaign_prompt: 'find agencies' }] })[0];
  const base = { task_category: 'B2B_LEAD_GEN', target_industry: 'web agencies', target_geography: 'mumbai', company_size_range: 'ALL', target_roles: ['founder', 'ceo'], exclusion_keywords: ['Staffing'], max_leads_limit: 500, min_lead_score: 80 };
  const a = mk(base);
  T('PN: valid config', a.config_valid === true && a.config_errors.length === 0, JSON.stringify(a.config_errors));
  T('PN: TC-02 clamp 500 -> 100', a.max_leads_limit === 100 && a.clamped_fields.includes('max_leads_limit'));
  T('PN: B2B size ALL -> 11-50', a.company_size_range === '11-50');
  T('PN: title-cased geography', a.target_geography === 'Mumbai');
  T('PN: 2 compiled B2B queries', a.compiled_queries.length === 2 && a.compiled_queries[0].includes('Mumbai'));
  T('PN: campaign id format', /^CMP-[0-9]{4}-[A-Z0-9]{4}$/.test(a.campaign_id), a.campaign_id);
  const b = mk({ ...base, target_roles: ['CEO', 'Founder'], target_industry: 'WEB AGENCIES' });
  T('PN: campaign id stable across role order and case', a.campaign_id === b.campaign_id, a.campaign_id + ' vs ' + b.campaign_id);
  const c = mk({ ...base, target_geography: 'pune' });
  T('PN: different geography -> different campaign id', a.campaign_id !== c.campaign_id);
  const d = mk({ ...base, exclusion_keywords: ['web'] });
  T('PN: contradiction detected', d.config_valid === false && d.config_errors.some(e => e.startsWith('ERR_CONTRADICTION')));
  const e = mk({ ...base, task_category: 'NONSENSE' });
  T('PN: bad category rejected', e.config_valid === false && e.config_errors.includes('ERR_BAD_CATEGORY'));
  const f = run(N, [groq('not json at all')], { 'Intake Form': [{ campaign_prompt: 'x' }] })[0];
  T('PN: unparseable model output -> ERR_PARSE_FAILED', f.config_valid === false && /ERR_PARSE_FAILED/.test(f.config_errors[0]));
  const g = run(N, [groq(base)], { 'Intake Form': [{ campaign_prompt: '   ' }] })[0];
  T('PN: empty prompt -> ERR_EMPTY_PROMPT', g.config_valid === false && g.config_errors[0] === 'ERR_EMPTY_PROMPT');
  const h = mk({ ...base, max_leads_limit: 0, min_lead_score: 150 });
  T('PN: low/high bounds clamped (0->1, 150->100)', h.max_leads_limit === 1 && h.min_lead_score === 100);
  const i = mk({ ...base, task_category: 'TALENT_RECRUITMENT', target_roles: ['student', 'freshers'], exclusion_keywords: [] });
  T('PN: Track B persona roles replaced by defaults', i.target_roles.includes('AI Automation Intern') && i.compiled_queries.length === 1);
}

// ============ Extract Hits (SERP fixture) ============
{
  const fixture = JSON.parse(fs.readFileSync(require('path').join(__dirname,'../fixtures/serp_b2b_pune_v2.json'), 'utf8'));
  const refs = { 'Split Queries': [cfg] };
  const out = run('Extract Hits', fixture, refs);
  const doms = out.map(o => o.normalized_domain);
  T('EH: keeps the 4 real companies', JSON.stringify(doms.sort()) === JSON.stringify(['awrange.com', 'gigante.co.in', 'magicworksitsolutions.com', 'sanpurple.com']), doms.join(','));
  T('EH: blocks directories and list pages', !doms.some(d => /goodfirms|designrush|quora|startupintros|revenuebase|itorix/.test(d)));
  T('EH: discovery_time is in IST format', /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d IST$/.test(out[0].discovery_time), out[0].discovery_time);
  T('EH: result ids are deterministic', run('Extract Hits', fixture, refs)[0].result_id === out[0].result_id);
  const mkItem = (q, links) => ({ search_parameters: { q }, organic_results: links.map(l => ({ link: 'https://' + l + '/', title: 'About ' + l, snippet: 's' })) });
  const two = [mkItem('q1', ['a1.com', 'a2.com', 'a3.com']), mkItem('q2', ['b1.com', 'b2.com', 'b3.com'])];
  const lim = run('Extract Hits', two, { 'Split Queries': [{ ...cfg, max_leads_limit: 3 }] });
  T('EH: max_leads_limit honoured across several queries (patched)', lim.length === 3, 'got ' + lim.length);
  const dup = run('Extract Hits', [mkItem('q1', ['same.com', 'www.same.com'])], refs);
  T('EH: same domain with and without www collapses', dup.length === 1);
  const noise = run('Extract Hits', [mkItem('q', ['google.com', 'www.coursera.org', 'dev.to', 'about.fb.com', 'watchout.iitr.ac.in', 'someuni.edu', 'agency.in'])], refs);
  T('EH: noise domains (google, coursera, dev.to, fb, edu, ac.in) are skipped, real agency kept', noise.length === 1 && noise[0].normalized_domain === 'agency.in', noise.map(x => x.normalized_domain).join());
  const mk2 = (l, title) => ({ search_parameters: { q: 'q' }, organic_results: [{ link: 'https://' + l + '/', title, snippet: 's' }] });
  T('EH: freelancer marketplaces and classifieds titles are skipped', run('Extract Hits', [mk2('x1.com', 'Hire Web Development Freelancers in Indore'), mk2('x2.com', 'Web Design Company - Classifieds')], refs)[0].no_hits === true);
  T('EH: click.in / tracxn.com / rockerstop.com are blocked', run('Extract Hits', [{ search_parameters: { q: 'q' }, organic_results: ['click.in', 'tracxn.com', 'www.rockerstop.com'].map(d => ({ link: 'https://' + d + '/x', title: 'About Co', snippet: 's' })) }], refs)[0].no_hits === true);
  T('EH: a normal agency title is NOT skipped', run('Extract Hits', [mk2('goodagency.in', 'Website Development Company in Nagpur - Good Agency')], refs).length === 1);
  const none = run('Extract Hits', [{ error: 'boom' }], refs);
  T('EH: serp error -> no_hits marker', none.length === 1 && none[0].no_hits === true);
}

// ============ Clean Page Text ============
{
  const hit = { result_id: 'RES-1', source_url: 'https://x.com/', normalized_domain: 'x.com' };
  const html = '<html><head><style>.a{}</style><script>var x=1</script></head><body><h1>Acme Web Studio</h1><p>We build websites &amp; apps for growing companies across India since 2012.</p><p>Contact: hello@acmeweb.in or call +91 99999 99999 any weekday between nine and five please.</p><p>' + 'More about our process and the services we offer to customers. '.repeat(5) + '</p></body></html>';
  const r = run('Clean Page Text', [{ statusCode: 200, body: html }], { 'Extract Hits': [hit] })[0];
  T('CP: SCRAPED, scripts stripped, entities decoded', r.scrape_status === 'SCRAPED' && !/var x|\.a\{/.test(r.page_text) && r.page_text.includes('websites & apps'));
  T('CP: email kept in text', r.page_text.includes('hello@acmeweb.in'));
  const short = run('Clean Page Text', [{ statusCode: 200, body: '<p>hi</p>' }], { 'Extract Hits': [hit] })[0];
  T('CP: tiny page -> SCRAPE_EMPTY', short.scrape_status === 'SCRAPE_EMPTY');
  const f403 = run('Clean Page Text', [{ statusCode: 403, body: 'Forbidden' }], { 'Extract Hits': [hit] })[0];
  T('CP: 403 -> SCRAPE_FAILED (no bypass)', f403.scrape_status === 'SCRAPE_FAILED' && f403.http_status === 403);
  const big = '<p>' + Array.from({ length: 900 }, (_, i) => 'Line number ' + i + ' about services and products offered here.').join('</p><p>') + '</p>';
  const rb = run('Clean Page Text', [{ statusCode: 200, body: big }], { 'Extract Hits': [hit] })[0];
  T('CP: long page capped at exactly 12,000 chars', rb.page_text.length === 12000, String(rb.page_text.length));
  const ob = run('Clean Page Text', [{ statusCode: 200, body: html + '<a href="/cdn-cgi/l/email-protection">[email protected]</a>' }], { 'Extract Hits': [hit] })[0];
  T('CP: email-protection flagged', ob.email_obfuscated === true);
}

// ============ Add About URL / Mark Unusable / Merge About ============
{
  const mk = (url, st) => ({ source_url: url, scrape_status: st, page_text: 'x' });
  const r = run('Add About URL', [mk('https://acme.com/services/web', 'SCRAPED'), mk('https://acme.com/about-us', 'SCRAPED'), mk('https://acme.com/', 'SCRAPE_FAILED'), mk('https://acme.com/contact', 'SCRAPED'), mk('https://acme.com/?q=1', 'SCRAPED')]);
  T('AU: /about added for a normal page', r[0].about_url === 'https://acme.com/about');
  T('AU: skipped when page is already about-like', r[1].about_url === '' && r[3].about_url === '');
  T('AU: never re-hit a failed/blocked site', r[2].about_url === '');
  T('AU: query-string URL handled', r[4].about_url === 'https://acme.com/about');
  const mu = run('Mark Unusable Pages', [{ scrape_status: 'SCRAPED', page_text: 'Domain parked. Buy this domain today' }, { scrape_status: 'SCRAPED', page_text: 'x'.repeat(500) + ' coming soon' }]);
  T('MU: short parked page flagged', mu[0].scrape_status === 'PAGE_UNUSABLE');
  T('MU: long page with the phrase is NOT flagged', mu[1].scrape_status === 'SCRAPED');
  const base = [{ source_url: 'https://acme.com/', about_url: 'https://acme.com/about', page_text: 'Home line\nAnother nav line' }, { source_url: 'https://b.com/', about_url: '', page_text: 'p' }, { source_url: 'https://c.com/', about_url: 'https://c.com/about', page_text: 'p' }];
  const aboutHtml = '<html><body><nav>Menu</nav><p>Home line</p><p>Acme Web Studio was founded in 2012 by CEO Jane Doe and has built hundreds of websites.</p><p>We are based in Pune, Maharashtra, India with a team of 40 professionals.</p><footer>f</footer></body></html>';
  const m = run('Merge About', [{ statusCode: 200, body: aboutHtml }, {}, { statusCode: 404, body: 'nope' }], { 'Add About URL': base });
  T('MA: about text appended after marker, duplicate line removed', m[0].about_status === 'ABOUT_ADDED' && m[0].page_text.includes('--- ABOUT PAGE ---') && m[0].page_text.split('Home line').length === 2 && m[0].page_text.includes('founded in 2012'));
  T('MA: no about_url -> ABOUT_SKIPPED', m[1].about_status === 'ABOUT_SKIPPED');
  T('MA: 404 about -> ABOUT_SKIPPED, main page kept', m[2].about_status === 'ABOUT_SKIPPED' && m[2].page_text === 'p');
}
// ============ Split Queries ============
{
  const q = ['"a"', '"b"'];
  const s30 = run('Split Queries', [{ ...cfg, compiled_queries: q, task_category: 'B2B_LEAD_GEN', max_leads_limit: 30 }]);
  T('SQ: 30 leads -> 2 queries x 2 pages = 4 requests (starts 0 and 10)', s30.length === 4 && s30.map(x => x.start).join() === '0,10,0,10');
  const s5 = run('Split Queries', [{ ...cfg, compiled_queries: q, task_category: 'B2B_LEAD_GEN', max_leads_limit: 5 }]);
  T('SQ: 5 leads -> 1 page per query (2 requests)', s5.length === 2);
}
summary();

// v10 regression tests (fictional companies only): testimonial attribution, e-mail recovery,
// client-voice quotes, "based in X" clauses, wrong-city routing.
const { run, T, summary } = require('./harness');
const cfg = (city) => ({ campaign_id: 'CMP-T', target_industry: 'Information Technology Services', target_geography: city, company_size_range: '11-50', exclusion_keywords: ['staffing'], min_lead_score: 80, max_leads_limit: 5 });
const vc = (o, c = cfg('Mumbai')) => run('Validation Controller', [{ extraction_status: 'EXTRACTED', extraction_successful: true, company_name: 'Acme Web Studio', source_url: 'https://acmeweb.in/', normalized_domain: 'acmeweb.in', company_contact_email: null, verification_flags: [], extracted_evidence_snippets: [], key_decision_maker: { full_name: 'Jane Doe', designation: 'Founder', public_business_email: null, linkedin_profile_url: null }, llm_context: '', page_text: '', ...o }], { 'Parameter Normalizer': [c] })[0];
const sc = (o, c = cfg('Mumbai')) => run('Scoring Engine', [{ validation_status: 'VALIDATED', normalized_domain: 'acmeweb.in', company_name: 'Acme Web Studio', industry_sector: 'Web development', company_description: 'Web agency', estimated_employee_range: 'UNKNOWN', headquarters_location: '', key_decision_maker: { designation: 'Founder' }, decision_maker_supported: true, evidence_count: 2, page_text: '', ...o }], { 'Parameter Normalizer': [c] })[0];

// ---- testimonial attribution (role given for another organisation)
const dm = (name, desig) => ({ key_decision_maker: { full_name: name, designation: desig, public_business_email: null, linkedin_profile_url: null } });
const T1 = 'Great work by the Acme Web Studio team.\nJohn Roe\nFounder / Managing Partner ,\nBeta Interiors\nContact us';
T('V10: role line ending in "," followed by ANOTHER organisation = client testimonial, not supported', vc({ ...dm('John Roe', 'Founder'), page_text: T1 }).decision_maker_supported === false);
T('V10: "Founder at Other Co" = client, not supported', vc({ ...dm('John Roe', 'Founder'), page_text: 'We loved it.\nJohn Roe, Founder at Beta Interiors\nAcme Web Studio is great' }).decision_maker_supported === false);
T('V10: "Founder, Other Co" on one line = client, not supported', vc({ ...dm('John Roe', 'Founder'), page_text: 'John Roe\nFounder, Beta Interiors' }).decision_maker_supported === false);
T('V10: own team page entry is still supported', vc({ ...dm('John Roe', 'Founder'), page_text: 'Our team\nJohn Roe\nFounder & CEO\nAmy Poe\nHead of Design' }).decision_maker_supported === true);
T('V10: "Founder, <own company>" is supported', vc({ ...dm('John Roe', 'Founder'), page_text: 'John Roe\nFounder, Acme Web Studio' }).decision_maker_supported === true);
T('V10: a later own-company mention rescues a name that first appears as a client', vc({ ...dm('John Roe', 'Founder'), page_text: T1 + '\nAbout us: John Roe is the founder of Acme Web Studio and leads the team.' }).decision_maker_supported === true);
T('V10: name only in the search-result title/snippet is not supported', vc({ ...dm('John Roe', 'Founder'), llm_context: 'SEARCH RESULT SNIPPET: John Roe is the Founder of Acme Web Studio\n---\nPAGE START:\nHome', page_text: 'Home\nServices' }).decision_maker_supported === false);

// ---- e-mail recovery (only addresses literally on the page, same domain)
const P2 = 'Contact\nEmail jane@acmeweb.in\nEmail ops@acmeweb.in\nJane Doe, founder of Acme Web Studio';
const r1 = vc({ page_text: P2, company_contact_email: 'ops@acmeweb.in', key_decision_maker: { full_name: 'Jane Doe', designation: 'Founder', public_business_email: 'ops@acmeweb.in', linkedin_profile_url: null } });
T('V10: named address on the page replaces the general inbox for a supported decision maker', r1.verified_email === 'jane@acmeweb.in' && r1.email_status === 'SYNTAX_VALID' && r1.email_source === 'DECISION_MAKER' && r1.verification_flags.includes('DM_EMAIL_RECOVERED_FROM_PAGE'), JSON.stringify([r1.verified_email, r1.email_status, r1.email_source]));
const r2 = vc({ page_text: 'Write to info@acmeweb.in\nJane Doe, founder of Acme Web Studio', company_contact_email: null });
T('V10: model missed the only inbox on the page -> recovered as GENERIC_INBOX', r2.verified_email === 'info@acmeweb.in' && r2.email_status === 'GENERIC_INBOX' && r2.email_source === 'COMPANY_INBOX' && r2.verification_flags.includes('EMAIL_RECOVERED_FROM_PAGE'), JSON.stringify([r2.verified_email, r2.email_status]));
const r3 = vc({ page_text: 'Mail jane@othercorp.com or info@othercorp.com\nJane Doe, founder of Acme Web Studio', company_contact_email: null });
T('V10: other-domain addresses are never recovered', r3.verified_email === null && r3.email_status === 'UNAVAILABLE', JSON.stringify([r3.verified_email, r3.email_status]));
const r4 = vc({ page_text: 'Mail jane@acmeweb.in\nJohn Roe\nFounder, Beta Interiors', ...dm('John Roe', 'Founder'), company_contact_email: null });
T('V10: a named address is not attached to an UNSUPPORTED decision maker', r4.verified_email === null || !r4.verification_flags.includes('DM_EMAIL_RECOVERED_FROM_PAGE'), JSON.stringify(r4.verification_flags));
T('V10: nothing is constructed when the page has no address', vc({ page_text: 'Jane Doe, founder of Acme Web Studio' }).verified_email === null);

// ---- client-voice / question quotes are not evidence
const q = vc({ page_text: 'Do you need a web design company based in Mumbai? Not necessarily.\nTo us, Acme Web Studio is more than just a web partner.\nAcme Web Studio builds fast websites for growing businesses every day.', extracted_evidence_snippets: ['Do you need a web design company based in Mumbai? Not necessarily.', 'To us, Acme Web Studio is more than just a web partner.', 'Acme Web Studio builds fast websites for growing businesses every day.'] });
T('V10: question and client-voice quotes dropped, own sentence kept', q.extracted_evidence_snippets.length === 1 && /builds fast websites/.test(q.extracted_evidence_snippets[0]) && q.verification_flags.includes('DROPPED_CLIENT_VOICE_SNIPPET'), JSON.stringify(q.extracted_evidence_snippets));

// ---- geography clauses
const g1 = sc({ page_text: 'Do you need a web design company based in Mumbai? Not necessarily.\nAcme Web Studio is a digital agency based in New Delhi, India.\nWebsites for Mumbai businesses.' });
T('V10: FAQ question "company based in Mumbai?" does not evidence Mumbai; own "based in New Delhi" wins', g1.sub_scores.geography === 10 && g1.routing_target === 'QUARANTINE', JSON.stringify([g1.sub_scores.geography, g1.routing_target]));
const g2 = sc({ page_text: 'We help businesses based in Mumbai grow.\nWe are a web studio.' });
T('V10: "businesses based in Mumbai" (clients) is not the company location', g2.sub_scores.geography < 100, g2.sub_scores.geography);
const g3 = sc({ page_text: 'Acme Web Studio is a web agency based in Mumbai, Maharashtra.' });
T('V10: own "based in Mumbai" still scores 100 (positive control)', g3.sub_scores.geography === 100 && g3.routing_target === 'MASTER', JSON.stringify([g3.sub_scores.geography, g3.routing_target, g3.lead_score]));
const g4 = sc({ page_text: 'Acme Web Studio is based in Kannur, Kerala. Landing page for Kochi.' }, cfg('Kochi'));
T('V10: based elsewhere -> capped at 59 and sent to Quarantine with a reason', g4.routing_target === 'QUARANTINE' && g4.lead_score <= 59 && g4.score_cap === 'BASED_ELSEWHERE' && /BASED_ELSEWHERE/.test(g4.score_reason) && g4.lead_score_uncapped >= 60, JSON.stringify([g4.lead_score, g4.routing_target, g4.score_cap]));
const g5 = sc({ page_text: 'Acme Web Studio is based in Kannur, Kerala.' }, cfg('India'));
T('V10: country target is never "based elsewhere"', g5.routing_target !== 'QUARANTINE' && g5.score_cap !== 'BASED_ELSEWHERE', JSON.stringify([g5.routing_target, g5.score_cap, g5.sub_scores]));
// ---- Extract Hits: google.com/goto redirects are resolved from displayed_link, never guessed
const eh = (res, lim = 5) => run('Extract Hits', [{ search_parameters: { q: 'q' }, organic_results: res }], { 'Split Queries': [{ campaign_id: 'CMP-T', max_leads_limit: lim }] });
const GOTO = 'https://www.google.com/goto?url=CAESabc';
const e1 = eh([{ position: 1, link: GOTO, displayed_link: 'https://acme-web.example › services › web-design', title: 'Acme Web Studio', snippet: 's' }]);
T('V11: goto redirect resolved to the site origin from displayed_link', e1.length === 1 && e1[0].normalized_domain === 'acme-web.example' && e1[0].source_url === 'https://acme-web.example/' && e1[0].url_resolved === true, JSON.stringify(e1[0]));
const e2 = eh([{ position: 1, link: GOTO, displayed_link: 'Google Maps', title: 'X' }]);
T('V11: unresolvable redirect is skipped and logged, not scraped', e2[0].no_hits === true && e2[0].skip_log[0].reason === 'GOOGLE_REDIRECT_UNRESOLVED');
const e3 = eh([{ position: 1, link: GOTO, displayed_link: 'https://www.google.com › maps', title: 'Map' }]);
T('V11: a redirect that resolves to google.com itself is still blocked', e3[0].no_hits === true && e3[0].skip_log[0].reason === 'BLOCKED_DOMAIN');
const e4 = eh([{ position: 1, link: GOTO, displayed_link: 'https://in.jooble.org › jobs', title: 'Developer jobs' }, { position: 2, link: 'https://direct-agency.example/about', displayed_link: 'https://direct-agency.example › about', title: 'Direct Agency', snippet: 's' }]);
T('V11: job boards blocked; direct links keep their full URL and are not flagged', e4.length === 1 && e4[0].source_url === 'https://direct-agency.example/about' && !e4[0].url_resolved, JSON.stringify(e4.map(x => x.source_url)));
const e5 = eh([{ position: 1, link: GOTO, displayed_link: 'https://acme-web.example › a', title: 'A' }, { position: 2, link: GOTO, displayed_link: 'https://acme-web.example › b', title: 'B' }]);
T('V11: two redirects to the same site give one lead', e5.length === 1);
// ---- v11: About-page link discovery, name+title pairs, multi-line addresses, body excerpt
const cpt = (body, src = 'https://acme-web.example/blog/post') => run('Clean Page Text', [{ statusCode: 200, body }], { 'Extract Hits': [{ source_url: src, campaign_id: 'C' }] })[0];
const LOREM = '<p>' + 'Acme builds websites for growing businesses every single day with care. '.repeat(6) + '</p>';
const link = (h, t = 'x') => '<a href="' + h + '">' + t + '</a>';
T('V11: About link found in the HTML (/about-us), relative href resolved', cpt('<html><body>' + link('/about-us') + link('/blog') + LOREM + '</body></html>').about_candidate === 'https://acme-web.example/about-us');
T('V11: leadership/team page is preferred over about', cpt('<html><body>' + link('/about-us') + link('https://www.acme-web.example/leadership/') + LOREM + '</body></html>').about_candidate === 'https://www.acme-web.example/leadership/');
T('V11: external and mailto links are ignored', cpt('<html><body>' + link('https://other.example/about') + link('mailto:a@b.co') + LOREM + '</body></html>').about_candidate === '');
const au = (o) => run('Add About URL', [{ source_url: 'https://acme-web.example/blog/post', scrape_status: 'SCRAPED', ...o }])[0];
T('V11: discovered link is used for the About fetch', au({ about_candidate: 'https://acme-web.example/about-us' }).about_url === 'https://acme-web.example/about-us');
T('V11: no link found -> /about fallback as before', au({}).about_url === 'https://acme-web.example/about');
T('V11: a link back to the page itself is not fetched twice', au({ source_url: 'https://acme-web.example/about-us', about_candidate: 'https://acme-web.example/about-us' }).about_url === '' || au({ source_url: 'https://acme-web.example/about-us', about_candidate: 'https://acme-web.example/about-us' }).about_url === 'https://acme-web.example/about');
const html = '<html><body><h2>Our people</h2><div>Sijin Stephen</div><div>CEO &amp; Founder</div><div>Amy Poe</div><div>Head of Design</div><p>We are a small studio that builds fast websites for local businesses and global brands.</p></body></html>';
const ma = run('Merge About', [{ statusCode: 200, body: html }], { 'Add About URL': [{ source_url: 'https://acme-web.example/', about_url: 'https://acme-web.example/team', page_text: 'Home' }] })[0];
T('V11: About merge keeps the name line above a role line', /Sijin Stephen\nCEO & Founder/.test(ma.page_text) && ma.about_status === 'ABOUT_ADDED', ma.page_text.slice(-200));

const SK = (page, c = cfg('Kochi')) => sc({ page_text: page }, c);
const ml = SK('Reach us\nAcme Technologies Pvt. Ltd\nInnerspace, Changampuzha Park,\nEdappally, Kochi,\nKerala-682026\nQuick links');
T('V11: address split over lines (Kochi / Kerala-682026) is the target place, not "elsewhere"', ml.sub_scores.geography === 100, JSON.stringify(ml.sub_scores));
const mo = SK('Reach us\nInnerspace, Changampuzha Park,\nEdappally, Pune,\nMaharashtra-411028\nQuick links');
T('V11: the same layout for another city is still based elsewhere', mo.sub_scores.geography === 10, JSON.stringify(mo.sub_scores));
T('V11: house-number address line with the target place is evidenced', SK('Contact\nAcme Web,47/1403A,Ivees,MRERA-69,Chalikkavattom,Vennala Kochi,Kerala\n© Acme').sub_scores.geography === 100);
T('V11: a marketing line with a year/number and the place is NOT an address', SK('Best Web Design Company in Kochi (2026) - 500+ projects delivered, Kerala, India').sub_scores.geography === 75);

const bc = (page, extra = {}) => run('Build LLM Context', [{ scrape_status: 'SCRAPED', title: 'T', snippet: 'S', page_text: page, ...extra }])[0];
const PROSE = Array.from({ length: 40 }, (_, i) => 'We build fast and reliable websites for growing businesses number ' + i + ' every single year.').join('\n');
const sh = bc(PROSE);
T('V11: short context gets a BODY EXCERPT of verbatim company-voice sentences', /BODY EXCERPT:\nWe build fast and reliable websites/.test(sh.llm_context) && sh.llm_context.split('BODY EXCERPT:')[1].split('\n---')[0].length <= 1000);
const lg = bc(PROSE + '\n' + Array.from({ length: 30 }, (_, i) => 'Rita Roe is the founder number ' + i + ' of Acme Web Studio and leads all of our design work.').join('\n'));
T('V11: a context already full of signals gets no excerpt', !/BODY EXCERPT/.test(lg.llm_context), String(lg.llm_context_chars));
T('V11: total context never exceeds 3,500 chars', lg.llm_context_chars <= 3500 && sh.llm_context_chars <= 3500);
T('V11: excerpt sentences are verbatim substrings of the page', sh.llm_context.split('BODY EXCERPT:')[1].split('\n---')[0].split('\n').every(x => PROSE.includes(x)));
summary();

// node tests/unit/outreach.test.js  (Day 14: outreach drafter, offline, no network)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..');
const wf = JSON.parse(fs.readFileSync(path.join(root, 'workflows/openlead-outreach.json'), 'utf8'));
const rawWf = fs.readFileSync(path.join(root, 'workflows/openlead-outreach.json'), 'utf8');
const PROMPT = fs.readFileSync(path.join(root, 'prompts/outreach.system.md'), 'utf8').trim();
const SCHEMA = JSON.parse(fs.readFileSync(path.join(root, 'schemas/outreach.schema.json'), 'utf8'));
const CODE = {}, N = {}; wf.nodes.forEach(n => { N[n.name] = n; if (n.parameters.jsCode) CODE[n.name] = n.parameters.jsCode; });
let pass = 0, fail = 0; const failures = [];
const T = (name, cond, detail) => { if (cond) pass++; else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && detail ? '  -> ' + detail : '')); };
function run(name, input, refs = {}) {
  const wrap = a => a.map(j => ({ json: j }));
  const $ = nm => { const r = refs[nm]; if (!r) throw new Error('no ref ' + nm); const items = wrap(r); return { all: () => items, first: () => items[0] }; };
  const $input = { all: () => wrap(input), first: () => wrap(input)[0] };
  return new Function('$input', '$', CODE[name])($input, $).map(x => x.json);
}

// ---------- fixtures
const row = (o = {}) => ({ master_lead_id: 'MLD-1', normalized_domain: 'gigante.co.in', company_name: 'Gigante Technologies', contact_name: 'Harshad Mane', designation: 'CEO', verified_email: 'info@gigante.co.in', email_status: 'GENERIC_INBOX', lead_score: '90', evidence: 'Gigante Technologies was founded in 2010 by visionary CEO, Harshad Mane. | Gigante Technologies Pvt. Ltd. is a digital marketing and website development company based in Pune, India.', headquarters_location: 'Pune, India', human_approval: 'PENDING', outreach_status: 'NOT_SENT', ...o });
const GOOD_BODY = 'I read that Gigante Technologies was founded in 2010 and builds websites and digital marketing for clients from Pune.\n\nTeams like yours often spend hours each week on manual lead research and client reporting. Workflow automation can take most of that off your plate, so would you like a short note on how that could work for you?';
const good = (o = {}) => ({ subject: 'Automation ideas for Gigante Technologies', body: GOOD_BODY, evidence_used: 'Gigante Technologies was founded in 2010 by visionary CEO, Harshad Mane.', ...o });
const groq = (obj, finish = 'stop') => ({ choices: [{ finish_reason: finish, message: { role: 'assistant', content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] });
const lead = () => run('Select Leads To Draft', [row()])[0];
const ver = (resp, l = lead()) => run('Verify & Assemble Draft', [resp], { 'Build Draft Request': [l] })[0];

// ---------- Select Leads To Draft
const sel = (rows) => run('Select Leads To Draft', rows);
T('SEL: an eligible Master row is selected', sel([row()]).length === 1);
T('SEL: blank outreach_status is eligible', sel([row({ outreach_status: '' })]).length === 1);
T('SEL: DRAFTED, SENT and FAILED rows are never re-drafted', sel([row({ outreach_status: 'DRAFTED' }), row({ outreach_status: 'SENT' }), row({ outreach_status: 'FAILED' })]).length === 0);
T('SEL: a row that already has a draft is skipped', sel([row({ outreach_draft: 'Hello x' })]).length === 0);
T('SEL: invalid email skipped', sel([row({ verified_email: 'contact@@apex..com' })]).length === 0);
T('SEL: empty email skipped', sel([row({ verified_email: '' })]).length === 0);
T('SEL: DISPOSABLE_WARNING email skipped', sel([row({ email_status: 'DISPOSABLE_WARNING' })]).length === 0);
T('SEL: no contact name skipped (needs a greeting)', sel([row({ contact_name: '' })]).length === 0);
T('SEL: no evidence skipped (nothing to ground on)', sel([row({ evidence: '' })]).length === 0);
T('SEL: score below 80 skipped', sel([row({ lead_score: '79' })]).length === 0);
T('SEL: row with no master_lead_id skipped', sel([row({ master_lead_id: '' })]).length === 0);
T('SEL: capped at 10 per run', sel(Array.from({ length: 14 }, (_, i) => row({ master_lead_id: 'MLD-' + i }))).length === 10);
T('SEL: sheet numbers as text are parsed', sel([row({ lead_score: 83 })]).length === 1);
T('SEL: evidence is split into lines and kept whole', (x => x.evidence_lines.length === 2 && x.evidence_text.includes(' | '))(lead()));
T('SEL: human_approval is not carried to the next node', !('human_approval' in lead()));

// ---------- Build Draft Request
const built = run('Build Draft Request', [lead()])[0];
const rb = built.request_body;
T('BLD: system prompt equals prompts/outreach.system.md', rb.messages[0].content === PROMPT);
T('BLD: strict JSON schema equals schemas/outreach.schema.json', rb.response_format.json_schema.strict === true && JSON.stringify(rb.response_format.json_schema.schema) === JSON.stringify({ type: 'object', additionalProperties: false, required: SCHEMA.required, properties: SCHEMA.properties }));
T('BLD: low temperature and low reasoning effort', rb.temperature <= 0.3 && rb.reasoning_effort === 'low');
T('BLD: completion cap leaves room to finish', rb.max_completion_tokens >= 800);
T('BLD: user message carries company, contact, location and every evidence line', ['Gigante Technologies', 'Harshad Mane, CEO', 'Pune, India', 'founded in 2010'].every(s => rb.messages[1].content.includes(s)));
T('BLD: no email address or phone number is sent to the model', !/@|\+?\d{10}/.test(rb.messages[1].content.replace(/founded in 2010/, '')));
T('BLD: input stays far below the 2,000-token budget (NFR-04)', (rb.messages[0].content.length + rb.messages[1].content.length) / 4 < 1000, String((rb.messages[0].content.length + rb.messages[1].content.length) / 4));
T('BLD: a very long evidence line is truncated', run('Build Draft Request', [{ ...lead(), evidence_lines: ['x'.repeat(900)] }])[0].request_body.messages[1].content.length < 1500 + PROMPT.length);

// ---------- Verify & Assemble Draft
const ok = ver(groq(good()));
T('VER: a clean draft passes -> DRAFTED', ok.outreach_status === 'DRAFTED' && /^OK words=\d+$/.test(ok.draft_notes), ok.draft_notes);
T('VER: greeting uses the contact first name', ok.outreach_draft.startsWith('Hello Harshad,'));
T('VER: statutory footer has the address and UNSUBSCRIBE (NFR-07)', /--\nPranavX Labs \| .+\n.*reply with UNSUBSCRIBE\.$/.test(ok.outreach_draft));
T('VER: email copy (greeting + body + sign-off) is under 120 words', Number(ok.draft_notes.split('=')[1]) < 120);
T('VER: drafted_at is IST text', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} IST$/.test(ok.drafted_at));
T('VER: subject kept, master_lead_id carried', ok.outreach_subject === 'Automation ideas for Gigante Technologies' && ok.master_lead_id === 'MLD-1');
T('VER: output never contains human_approval', !('human_approval' in ok));
T('VER: markdown-fenced JSON is accepted', ver(groq('```json\n' + JSON.stringify(good()) + '\n```')).outreach_status === 'DRAFTED');
T('VER: "Dr." prefix is dropped from the greeting', ver(groq(good()), { ...lead(), contact_name: 'Dr. Asha Rao' }).outreach_draft.startsWith('Hello Asha,'));
const rej = (resp, code) => { const r = ver(resp); return r.outreach_status === 'NOT_SENT' && r.outreach_draft === '' && r.outreach_subject === '' && r.drafted_at === '' && r.draft_notes.includes(code); };
T('VER: invalid JSON rejected', rej(groq('not json'), 'BAD_JSON'));
T('VER: truncated output (finish_reason length) rejected', rej(groq(good(), 'length'), 'INCOMPLETE_LENGTH'));
T('VER: missing field rejected', rej(groq({ subject: 'x', body: 'y' }), 'MISSING_FIELD'));
T('VER: evidence_used that is not on the page is rejected', rej(groq(good({ evidence_used: 'Gigante Technologies won the best agency award in 2019.' })), 'EVIDENCE_NOT_VERBATIM'));
T('VER: very short evidence_used rejected', rej(groq(good({ evidence_used: 'Gigante' })), 'EVIDENCE_NOT_VERBATIM'));
T('VER: body over 90 words rejected', rej(groq(good({ body: GOOD_BODY + ' ' + 'word '.repeat(60) })), 'BODY_TOO_LONG'));
T('VER: body under 35 words rejected', rej(groq(good({ body: 'Hi, we do automation.' })), 'BODY_TOO_SHORT'));
T('VER: link in body rejected', rej(groq(good({ body: GOOD_BODY + ' See https://pranavxlabs.com' })), 'CONTAINS_LINK_EMAIL_OR_PHONE'));
T('VER: email address in body rejected', rej(groq(good({ body: GOOD_BODY + ' Write to me at a@b.com' })), 'CONTAINS_LINK_EMAIL_OR_PHONE'));
T('VER: phone number in body rejected', rej(groq(good({ body: GOOD_BODY + ' Call +91 98765 43210' })), 'CONTAINS_LINK_EMAIL_OR_PHONE'));
T('VER: exclamation mark rejected', rej(groq(good({ body: GOOD_BODY + ' Let us talk!' })), 'CONTAINS_EXCLAMATION_OR_EMOJI'));
T('VER: spammy word "free" rejected', rej(groq(good({ body: GOOD_BODY + ' We offer a free audit.' })), 'BANNED_PHRASE'));
T('VER: fake familiarity "following up" rejected', rej(groq(good({ body: GOOD_BODY + ' I am following up on my last note.' })), 'BANNED_PHRASE'));
T('VER: number that is not in the evidence rejected (e.g. invented 15 years)', rej(groq(good({ body: GOOD_BODY.replace('2010', '2010 and has 15 years of experience') })), 'UNSUPPORTED_NUMBER'));
T('VER: unsupported claim "award" rejected', rej(groq(good({ body: GOOD_BODY + ' Your award wins are impressive.' })), 'UNSUPPORTED_CLAIM'));
T('VER: subject without the company name rejected', rej(groq(good({ subject: 'Quick idea for you' })), 'SUBJECT_MISSING_COMPANY'));
T('VER: "Re:" subject rejected', rej(groq(good({ subject: 'Re: Gigante Technologies' })), 'BANNED_PHRASE'));
T('VER: overlong subject rejected', rej(groq(good({ subject: 'Gigante Technologies ' + 'automation '.repeat(10) })), 'SUBJECT_TOO_LONG'));
T('VER: HTTP error item rejected, with the reason kept', rej({ error: { message: 'Request failed with status code 429' } }, 'GROQ_ERROR'));
T('VER: empty response rejected', rej({}, 'NO_COMPLETION'));
{
  const l2 = { ...lead(), master_lead_id: 'MLD-2' };
  const r = run('Verify & Assemble Draft', [{ error: { message: 'x' } }, groq(good())], { 'Build Draft Request': [lead(), l2] });
  T('VER: pairing by position - first fails, second passes, ids stay correct', r[0].master_lead_id === 'MLD-1' && r[0].outreach_status === 'NOT_SENT' && r[1].master_lead_id === 'MLD-2' && r[1].outreach_status === 'DRAFTED');
}
T('VER: a lead with more responses missing than expected still returns one row per lead', run('Verify & Assemble Draft', [], { 'Build Draft Request': [lead()] }).length === 1);


// ---------- Regression: the three real Groq outputs from the first live run (all were wrongly rejected)
{
  const L = {
    gig: { ...lead(), master_lead_id: 'MLD-G' },
    mw: { ...lead(), master_lead_id: 'MLD-M', company_name: 'MagicWorks IT Solutions Pvt. Ltd.', contact_name: 'Swapnil Ughade', designation: 'Founder', headquarters_location: '', evidence_text: 'MagicWorks IT Solutions Pvt. Ltd. is an AI-first digital marketing agency in Pune, India, founded in 2009 and incorporated in 2012 by Swapnil Ughade. | MagicWorks is an AI-first digital marketing agency.' },
    aw: { ...lead(), master_lead_id: 'MLD-A', company_name: 'Awrange', contact_name: 'Rahul Kabra', designation: 'CEO', headquarters_location: '', evidence_text: 'If you are looking for a web development company in Pune that builds sites to perform and not just to look good, get in touch with the Awrange team for a free consultation and a scoped project quote. | Rahul Kabra CEO, Awrange Helping businesses grow online through SEO powered website development, data-driven AI SEO and engaging social media strategies that rank, engage and convert.' }
  };
  const real = [
    groq({ subject: 'Automation ideas for Gigante Technologies', body: 'I noticed Gigante Technologies Pvt. Ltd. is a digital marketing and website development company based in Pune, India.\nAutomating lead research, reporting and follow‑ups with n8n could free up many hours each week, specifically for your team, and I can share a brief note on how. Would you like me to send it?', evidence_used: '- Gigante Technologies Pvt. Ltd. is a digital marketing and website development company based in Pune, India.' }),
    groq({ subject: 'Automation ideas for MagicWorks IT', evidence_used: 'MagicWorks IT Solutions Pvt. Ltd. is an AI-first digital marketing agency in Pune, India, founded in 2009 and incorporated in 2012 by Swapnil Ughade.', body: 'I noticed that MagicWorks IT Solutions Pvt. Ltd. is an AI-first digital marketing agency in Pune, India, founded in 2009 and incorporated in 2012 by Swapnil Ughade.\nImplementing n8n workflow automations could streamline lead research, reporting and follow‑ups, freeing up valuable time for your team. Would you like a brief note on how this could work for you?' }),
    groq({ subject: 'Awrange and PranavX Labs Automation', body: 'I noticed that Awrange emphasizes SEO‑powered website development, data‑driven AI SEO and engaging social media strategies that rank, engage and convert.\nA workflow automation built in n8n could streamline your lead research and reporting, saving your team hours each week. Would you like a short note outlining how this could work for Awrange?', evidence_used: 'Rahul Kabra CEO, Awrange Helping businesses grow online through SEO powered website development, data-driven AI SEO and engaging social media strategies that rank, engage and convert.' })
  ];
  const out = run('Verify & Assemble Draft', real, { 'Build Draft Request': [L.gig, L.mw, L.aw] });
  T('REAL: Gigante output (bullet dash, "free up", n8n, U+2011) now passes', out[0].outreach_status === 'DRAFTED', out[0].draft_notes);
  T('REAL: MagicWorks output (n8n in body) now passes', out[1].outreach_status === 'DRAFTED', out[1].draft_notes);
  T('REAL: Awrange output now passes', out[2].outreach_status === 'DRAFTED', out[2].draft_notes);
  T('REAL: non-breaking hyphens are normalised in the final email', out.every(o => !/[‐-―‑]/.test(o.outreach_draft)));
  T('REAL: paragraphs are separated by a blank line', out.every(o => o.outreach_draft.split('\n\n').length >= 5));
  T('REAL: every drafted email is under 120 words and carries UNSUBSCRIBE', out.every(o => Number(o.draft_notes.split('=')[1]) < 120 && /UNSUBSCRIBE\.$/.test(o.outreach_draft)));
  T('REAL: "free up" is allowed but "free audit" is still blocked', ver(groq(good({ body: GOOD_BODY + ' We can free up time.' }))).outreach_status === 'DRAFTED' && ver(groq(good({ body: GOOD_BODY + ' We offer a free audit.' }))).draft_notes.includes('BANNED_PHRASE'));
  T('REAL: n8n is not an invented number, but 15 years still is', ver(groq(good({ body: GOOD_BODY + ' We use n8n.' }))).outreach_status === 'DRAFTED' && ver(groq(good({ body: GOOD_BODY.replace('2010', '2010 and 15 years' ) }))).draft_notes.includes('UNSUPPORTED_NUMBER'));
}

// ---------- Workflow integrity
const names = new Set(Object.keys(N));
const badConn = []; for (const [s, v] of Object.entries(wf.connections)) { if (!names.has(s)) badConn.push(s); for (const br of v.main) for (const t of br) if (!names.has(t.node)) badConn.push(s + '->' + t.node); }
T('WF: connections valid and nodes unique', badConn.length === 0 && names.size === wf.nodes.length, badConn.join());
T('WF: only a manual trigger - nothing runs on its own', wf.nodes.filter(n => /trigger|cron|webhook|schedule/i.test(n.type)).map(n => n.type).join() === 'n8n-nodes-base.manualTrigger');
T('WF: NO email-sending node in Day 14 (drafts only)', !wf.nodes.some(n => /gmail|sendEmail|emailSend|smtp/i.test(n.type)));
T('WF: not active, no pinned data', wf.active === false && Object.keys(wf.pinData || {}).length === 0);
T('WF: Write Draft updates by master_lead_id (never appends a duplicate)', N['Write Draft'].parameters.operation === 'update' && N['Write Draft'].parameters.columns.matchingColumns.join() === 'master_lead_id');
const written = Object.keys(N['Write Draft'].parameters.columns.value);
T('WF: Write Draft cannot touch human_approval, email or score columns', written.join() === 'master_lead_id,outreach_subject,outreach_draft,outreach_status,drafted_at,draft_notes');
T('WF: Groq Draft retries 3 times, 5 s apart, and does not crash the run (NFR-01)', N['Groq Draft'].retryOnFail === true && N['Groq Draft'].maxTries === 3 && N['Groq Draft'].waitBetweenTries === 5000 && N['Groq Draft'].onError === 'continueRegularOutput');
T('WF: Groq Draft spaces its requests (rate limit)', N['Groq Draft'].parameters.options.batching.batch.batchInterval >= 6000);
T('WF: Sheets write node is loud on failure (no continue-on-fail)', !N['Write Draft'].onError && !N['Read Master'].onError);
T('WF: no plaintext secrets', !/gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|ya29\.|Bearer [A-Za-z0-9]{10,}|api_key=[0-9a-f]{20,}/.test(rawWf));
T('WF: credentials referenced by id only', wf.nodes.every(n => !n.credentials || Object.values(n.credentials).every(c => Object.keys(c).sort().join() === 'id,name')));
T('WF: Verify node references an existing node', /\$\('Build Draft Request'\)/.test(CODE['Verify & Assemble Draft']) && names.has('Build Draft Request'));
T('WF: the prompt file has no real company names', !/Gigante|Zehn|Witsow|Intuisyz|Doomshell|Awrange|Maiden|AdsGrip|WakeUp/i.test(PROMPT));

console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(failures.join('\n')); process.exitCode = 1; }

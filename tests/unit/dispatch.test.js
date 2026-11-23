// node tests/unit/dispatch.test.js  (Day 15: approval gate, suppression, Gmail dispatch, offline - nothing is sent)
const fs = require('fs'), path = require('path');
const wfPath = path.join(__dirname, '../../workflows/openlead-dispatch.json');
const rawWf = fs.readFileSync(wfPath, 'utf8');
const wf = JSON.parse(rawWf);
const CODE = {}, N = {}; wf.nodes.forEach(n => { N[n.name] = n; if (n.parameters.jsCode) CODE[n.name] = n.parameters.jsCode; });
let pass = 0, fail = 0; const failures = [];
const T = (name, cond, detail) => { if (cond) pass++; else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && detail ? '  -> ' + detail : '')); };
function run(name, input, refs = {}, patch = s => s) {
  const wrap = a => a.map(j => ({ json: j }));
  const $ = nm => { const r = refs[nm]; if (!r) throw new Error('no ref ' + nm); const items = wrap(r); return { all: () => items, first: () => items[0] }; };
  const $input = { all: () => wrap(input), first: () => wrap(input)[0] };
  return new Function('$input', '$', patch(CODE[name]))($input, $).map(x => x.json);
}
const SET_INBOX = s => s.replace("'REPLACE_WITH_YOUR_TEST_EMAIL'", "'me.test@example.com'");
const LIVE = s => SET_INBOX(s).replace('const TEST_MODE = true;', 'const TEST_MODE = false;');
const DRAFT = 'Hello Harshad,\n\nI noticed X.\n\nRegards,\nAnurag\n\n--\nPranavX Labs | Maharashtra, India\nTo opt out of future messages, reply with UNSUBSCRIBE.';
const row = (o = {}) => ({ master_lead_id: 'MLD-1', normalized_domain: 'gigante.co.in', company_name: 'Gigante Technologies', verified_email: 'gigante@gigante.co.in', lead_score: '90', human_approval: 'APPROVED', outreach_status: 'DRAFTED', outreach_subject: 'Automation ideas for Gigante Technologies', outreach_draft: DRAFT, sent_at: '', ...o });
const sel = (rows, sup = [{}], patch = SET_INBOX) => run('Select Approved To Send', sup, { 'Read Master': rows }, patch);
const act = (rows, a, sup, patch) => sel(rows, sup, patch).filter(x => x.action === a);
const report = (rows, sup, patch) => sel(rows, sup, patch).find(x => x.action === 'REPORT');

// ---------- Approval gate (FR-16, TC-12)
T('GATE: APPROVED + DRAFTED lead is sent', act([row()], 'SEND').length === 1);
T('GATE: PENDING lead is skipped, nothing sent (TC-12)', act([row({ human_approval: 'PENDING' })], 'SEND').length === 0 && report([row({ human_approval: 'PENDING' })]).skipped[0].reason === 'NOT_APPROVED(PENDING)');
T('GATE: blank approval is skipped', act([row({ human_approval: '' })], 'SEND').length === 0);
T('GATE: typo "APPROVE" is skipped (exact word required)', act([row({ human_approval: 'APPROVE' })], 'SEND').length === 0);
T('GATE: "  approved " (spaces, lower case) is accepted', act([row({ human_approval: '  approved ' })], 'SEND').length === 1);
T('GATE: a lead already SENT is never sent again', act([row({ outreach_status: 'SENT' })], 'SEND').length === 0);
T('GATE: a lead with sent_at filled is never sent again', act([row({ sent_at: '2026-11-20 15:00:00 IST' })], 'SEND').length === 0);
T('GATE: NOT_SENT (no draft yet) is skipped', act([row({ outreach_status: 'NOT_SENT' })], 'SEND').length === 0);
T('GATE: FAILED rows are not auto-retried', act([row({ outreach_status: 'FAILED' })], 'SEND').length === 0);
T('GATE: invalid email is skipped', act([row({ verified_email: 'contact@@apex..com' })], 'SEND').length === 0);
T('GATE: missing subject or draft is skipped', act([row({ outreach_subject: '' }), row({ master_lead_id: 'M2', outreach_draft: '' })], 'SEND').length === 0);
T('GATE: a draft without the UNSUBSCRIBE footer is skipped (NFR-07)', act([row({ outreach_draft: 'Hello,\n\nHi.' })], 'SEND').length === 0);
T('GATE: score below 80 is skipped', act([row({ lead_score: '79' })], 'SEND').length === 0);
T('GATE: capped at 5 sends per run', act(Array.from({ length: 8 }, (_, i) => row({ master_lead_id: 'M' + i, verified_email: 'a' + i + '@x.com', normalized_domain: 'x' + i + '.com' })), 'SEND').length === 5);
T('GATE: SEND items carry the approval word for the second safety check', act([row()], 'SEND')[0].human_approval === 'APPROVED');

// ---------- Suppression (FR-15, TC-13)
T('SUP: email on the suppression list -> SUPPRESS, not SEND (TC-13)', (r => r.length === 1 && act([row()], 'SEND', [{ email: 'gigante@gigante.co.in' }]).length === 0)(act([row()], 'SUPPRESS', [{ email: 'gigante@gigante.co.in' }])));
T('SUP: matching is case-insensitive', act([row()], 'SUPPRESS', [{ email: 'GIGANTE@Gigante.co.in ' }]).length === 1);
T('SUP: a suppressed domain blocks every address on it', act([row()], 'SUPPRESS', [{ domain: 'gigante.co.in' }]).length === 1);
T('SUP: a www. prefix in the list still matches the domain', act([row()], 'SUPPRESS', [{ domain: 'www.gigante.co.in' }]).length === 1);
T('SUP: an unrelated suppression row does not block', act([row()], 'SEND', [{ email: 'other@x.com', domain: 'x.com' }]).length === 1);
T('SUP: an empty suppression tab (one empty item) works', act([row()], 'SEND', [{}]).length === 1);
T('SUP: Mark Suppressed writes SUPPRESSED and clears sent fields', (x => x.outreach_status === 'SUPPRESSED' && x.sent_at === '' && /^SUPPRESSED: /.test(x.send_notes))(run('Mark Suppressed', act([row()], 'SUPPRESS', [{ domain: 'gigante.co.in' }]))[0]));

// ---------- Test mode
T('TEST: placeholder TEST_INBOX stops the run with a clear error', (() => { try { sel([row()], [{}], s => s); return false; } catch (e) { return /SET_TEST_INBOX/.test(e.message); } })());
T('TEST: the committed file ships TEST_MODE = true and the placeholder inbox', /const TEST_MODE = true;/.test(CODE['Select Approved To Send']) && /REPLACE_WITH_YOUR_TEST_EMAIL/.test(CODE['Select Approved To Send']));
const sendItem = act([row()], 'SEND')[0];
const msg = run('Build Message', [sendItem])[0];
T('TEST: the recipient is the test inbox, never the lead', msg.to === 'me.test@example.com' && msg.original_to === 'gigante@gigante.co.in' && msg.test_mode === true);
T('TEST: subject is marked [TEST] and the body names the original recipient', msg.subject.startsWith('[TEST] Automation ideas') && msg.message.startsWith('[TEST MODE] This would have been sent to: gigante@gigante.co.in'));
T('TEST: the full draft, with footer, is in the message', msg.message.includes('reply with UNSUBSCRIBE.') && msg.message.includes('Hello Harshad,'));
const liveItem = act([row()], 'SEND', [{}], LIVE)[0];
const liveMsg = run('Build Message', [liveItem])[0];
T('LIVE: with TEST_MODE false the lead is the recipient, no [TEST] marks', liveMsg.to === 'gigante@gigante.co.in' && liveMsg.subject === 'Automation ideas for Gigante Technologies' && !liveMsg.message.includes('[TEST MODE]'));
T('LIVE: report says test_mode false', report([row()], [{}], LIVE).test_mode === false);

// ---------- Build Message safety assertion
T('BUILD: throws DISPATCH_HALTED for a non-approved lead', (() => { try { run('Build Message', [{ ...sendItem, human_approval: 'PENDING' }]); return false; } catch (e) { return /DISPATCH_HALTED/.test(e.message); } })());
T('BUILD: throws when the footer is missing', (() => { try { run('Build Message', [{ ...sendItem, outreach_draft: 'Hello' }]); return false; } catch (e) { return /UNSUBSCRIBE/.test(e.message); } })());
T('BUILD: line breaks in subject or address cannot inject headers', (m => !/[\r\n]/.test(m.subject) && !/[\r\n]/.test(m.to))(run('Build Message', [{ ...sendItem, outreach_subject: 'Hi\r\nBcc: evil@x.com', test_inbox: 'a@b.com\nBcc: x@y.com' }])[0]));

// ---------- Report
const rep = report([row(), row({ master_lead_id: 'M2', human_approval: 'PENDING' }), row({ master_lead_id: 'M3', outreach_status: 'SENT' })]);
T('REPORT: counts sends and lists every skip with its reason', rep.to_send === 1 && rep.skipped_count === 2 && rep.skipped.map(s => s.reason).join() === 'NOT_APPROVED(PENDING),ALREADY_SENT');
T('REPORT: an empty Master still returns one report item', sel([]).length === 1 && sel([])[0].action === 'REPORT');

// ---------- Record Result
const rec = (resp, patch) => run('Record Result', resp, { 'Build Message': [msg] })[0];
T('RES(test): success keeps status DRAFTED, stores the message id, no sent_at', (x => x.outreach_status === 'DRAFTED' && x.sent_at === '' && x.gmail_message_id === 'abc123' && /^TEST_SENT to me.test@example.com \(would go to gigante@gigante.co.in\)/.test(x.send_notes))(rec([{ id: 'abc123', threadId: 't' }])));
T('RES(test): Gmail error is logged and status stays DRAFTED', (x => x.outreach_status === 'DRAFTED' && /^TEST_SEND_FAILED: .*invalid_grant/.test(x.send_notes))(rec([{ error: { message: 'invalid_grant' } }])));
const lrec = resp => run('Record Result', resp, { 'Build Message': [liveMsg] })[0];
T('RES(live): success -> SENT with IST time and Gmail id', (x => x.outreach_status === 'SENT' && /IST$/.test(x.sent_at) && x.gmail_message_id === 'abc123')(lrec([{ id: 'abc123' }])));
T('RES(live): failure -> FAILED, no sent_at', (x => x.outreach_status === 'FAILED' && x.sent_at === '' && /^SEND_FAILED/.test(x.send_notes))(lrec([{ error: 'quota' }])));
T('RES: an empty response counts as a failure, never a success', lrec([{}]).outreach_status === 'FAILED');
T('RES: pairing by position keeps ids right', (r => r[0].master_lead_id === 'A' && r[0].outreach_status === 'FAILED' && r[1].master_lead_id === 'B' && r[1].outreach_status === 'SENT')(run('Record Result', [{ error: 'x' }, { id: 'ok' }], { 'Build Message': [{ ...liveMsg, master_lead_id: 'A' }, { ...liveMsg, master_lead_id: 'B' }] })));

// ---------- Workflow integrity
const names = new Set(Object.keys(N));
const badConn = []; for (const [s, v] of Object.entries(wf.connections)) { if (!names.has(s)) badConn.push(s); for (const br of v.main) for (const t of br) if (!names.has(t.node)) badConn.push(s + '->' + t.node); }
T('WF: connections valid, unique names', badConn.length === 0 && names.size === wf.nodes.length, badConn.join());
T('WF: manual trigger only', wf.nodes.filter(n => /trigger|cron|webhook|schedule/i.test(n.type)).map(n => n.type).join() === 'n8n-nodes-base.manualTrigger');
T('WF: exactly one Gmail send node and it is fed only by Build Message', wf.nodes.filter(n => /gmail/i.test(n.type)).length === 1 && Object.entries(wf.connections).filter(([, v]) => v.main.some(b => b.some(t => t.node === 'Gmail Send'))).map(([k]) => k).join() === 'Build Message');
T('WF: Build Message is fed only by the SEND output of the gate', JSON.stringify(wf.connections['Gate Router'].main[0].map(t => t.node)) === '["Build Message"]' && Object.entries(wf.connections).filter(([, v]) => v.main.some(b => b.some(t => t.node === 'Build Message'))).map(([k]) => k).join() === 'Gate Router');
T('WF: Gmail recipient comes from Build Message output, never straight from the sheet', N['Gmail Send'].parameters.sendTo === '={{ $json.to }}' && N['Gmail Send'].parameters.emailType === 'text');
T('WF: Gmail failures do not crash the run; Sheets nodes stay loud', N['Gmail Send'].onError === 'continueRegularOutput' && !N['Write Result'].onError && !N['Read Master'].onError);
T('WF: empty suppression tab still lets the run continue', N['Read Suppression'].alwaysOutputData === true);
T('WF: Write Result updates by master_lead_id and cannot touch approval, email or draft', N['Write Result'].parameters.operation === 'update' && N['Write Result'].parameters.columns.matchingColumns.join() === 'master_lead_id' && Object.keys(N['Write Result'].parameters.columns.value).join() === 'master_lead_id,outreach_status,sent_at,gmail_message_id,send_notes');
T('WF: not active, no pinned data', wf.active === false && Object.keys(wf.pinData || {}).length === 0);
T('WF: no plaintext secrets and no real test email committed', !/gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|ya29\.|Bearer [A-Za-z0-9]{10,}|[A-Za-z0-9._%+-]+@gmail\.com/.test(rawWf));
T('WF: credentials referenced by id and name only', wf.nodes.every(n => !n.credentials || Object.values(n.credentials).every(c => Object.keys(c).sort().join() === 'id,name')));
T('WF: Record Result and Select reference existing nodes', ['Build Message', 'Read Master'].every(x => names.has(x)));

console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(failures.join('\n')); process.exitCode = 1; }

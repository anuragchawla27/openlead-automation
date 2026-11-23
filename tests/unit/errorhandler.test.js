// node tests/unit/errorhandler.test.js  (Day 17: Telegram incident alerting, FR-18 / TC-14, offline - nothing is sent)
const fs = require('fs'), path = require('path');
const rawWf = fs.readFileSync(path.join(__dirname, '../../workflows/openlead-error-handler.json'), 'utf8');
const wf = JSON.parse(rawWf);
const N = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
let pass = 0, fail = 0; const failures = [];
const T = (name, cond, detail) => { if (cond) pass++; else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && detail ? '  -> ' + detail : '')); };
const SET = s => s.replace("'REPLACE_WITH_TELEGRAM_CHAT_ID'", "'123456789'").replace("if (CHAT_ID === '123456789')", "if (false)");
const build = (payload, patch = SET) => new Function('$input', patch(N['Build Alert'].parameters.jsCode))({ first: () => ({ json: payload }) })[0].json;
const SAMPLE = { execution: { id: '231', url: 'http://localhost:5678/workflow/1/executions/231', error: { message: 'Example error message', stack: 'x' }, lastNodeExecuted: 'Gate Router', mode: 'trigger' }, workflow: { id: '1', name: 'openlead-dispatch' } };

// ---- structure
T('ERR: Error Trigger -> Build Alert -> Telegram Alert', wf.connections['Error Trigger'].main[0][0].node === 'Build Alert' && wf.connections['Build Alert'].main[0][0].node === 'Telegram Alert');
T('ERR: first node is an errorTrigger', N['Error Trigger'].type === 'n8n-nodes-base.errorTrigger');
T('ERR: Telegram node sends HTML and reads chat id/text from the code node', N['Telegram Alert'].parameters.additionalFields.parse_mode === 'HTML' && N['Telegram Alert'].parameters.chatId === '={{ $json.chat_id }}' && N['Telegram Alert'].parameters.text === '={{ $json.text }}');
T('ERR: workflow inactive in the repo (must be active to receive errors)', wf.active === false);
T('ERR: no code node uses new URL or require', !/new URL\(|require\(/.test(N['Build Alert'].parameters.jsCode));
T('ERR: no secrets or numeric chat id committed', !/gsk_[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{10}|ya29\.|Bearer\s+[A-Za-z0-9]{10}|\b\d{8,}:[A-Za-z0-9_-]{30,}/.test(rawWf) && /'REPLACE_WITH_TELEGRAM_CHAT_ID'/.test(rawWf));
T('ERR: no inline bot token (credential only)', !('botToken' in N['Telegram Alert'].parameters));

// ---- chat id guard
let threw = ''; try { build(SAMPLE, s => s); } catch (e) { threw = e.message; }
T('ERR: placeholder chat id is refused (SET_TELEGRAM_CHAT_ID)', threw === 'SET_TELEGRAM_CHAT_ID', threw);

// ---- message content (FR-18)
const o = build(SAMPLE);
T('MSG: carries chat id, HTML mode', o.chat_id === '123456789' && o.parse_mode === 'HTML');
T('MSG: names workflow, failed node, execution id, error, time', ['openlead-dispatch', 'Gate Router', '231', 'Example error message', 'IST'].every(s => o.text.includes(s)));
T('MSG: stays well under the Telegram 4096-char limit', o.text.length < 1500, String(o.text.length));
const evil = build({ execution: { id: '1', lastNodeExecuted: 'A<b>', error: { message: 'bad <script>alert(1)</script> & more' } }, workflow: { name: 'W' } });
T('MSG: HTML in the error message is escaped (Telegram would reject it otherwise)', !evil.text.includes('<script>') && evil.text.includes('&lt;script&gt;') && evil.text.includes('&amp;') && evil.text.includes('A&lt;b&gt;'));
const secret = build({ execution: { id: '1', error: { message: 'HTTP 401 key gsk_ABCDEF1234567890abcd Bearer abc.def-123 AIzaSyA1234567890abcdef bot 1234567890:AAEhBP0av28ABCDEFGHIJKLMNOPQRSTUVWXYZ' } }, workflow: { name: 'W' } });
T('MSG: API keys and tokens in the error text are redacted', !/gsk_ABCDEF|abc\.def|AIzaSyA1234|AAEhBP0av28/.test(secret.text) && (secret.text.match(/\[redacted\]/g) || []).length >= 4);
const big = build({ execution: { id: '1', error: { message: 'x'.repeat(5000) } }, workflow: { name: 'W' } });
T('MSG: a huge error message is truncated', big.text.length < 1500 && big.text.includes('...'));
const empty = build({});
T('MSG: an empty payload still produces a message (shows unknown)', empty.text.includes('unknown') && empty.text.includes('PIPELINE FAULT'));
T('MSG: no raw HTML injection from the workflow name', !build({ workflow: { name: '<i>x' }, execution: {} }).text.includes('<i>x'));
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(failures.join('\n')); process.exitCode = 1; }

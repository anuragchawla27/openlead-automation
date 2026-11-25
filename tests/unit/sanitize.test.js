// node tests/unit/sanitize.test.js  (Day 20: the import-ready copies in handover/workflows are clean and identical in logic to workflows/)
const fs = require('fs'), path = require('path');
const { clean, FILES } = require('../../tools/sanitize-workflows');
let pass = 0, fail = 0; const failures = [];
const T = (name, cond, detail) => { if (cond) pass++; else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && detail ? '  -> ' + detail : '')); };
const root = path.join(__dirname, '../..');
for (const f of FILES) {
  const srcRaw = fs.readFileSync(path.join(root, 'workflows', f), 'utf8');
  const outRaw = fs.readFileSync(path.join(root, 'handover/workflows', f), 'utf8');
  const src = JSON.parse(srcRaw), out = JSON.parse(outRaw);
  // Git on Windows may check files out with CRLF line endings; the content is what must match
  T(f + ': committed copy is up to date (run node tools/sanitize-workflows.js after any workflow change)', outRaw.replace(/\r\n/g, '\n') === clean(srcRaw));
  T(f + ': same nodes, same connections', out.nodes.length === src.nodes.length && JSON.stringify(out.connections) === JSON.stringify(src.connections));
  T(f + ': every code node is byte-identical to the working workflow', src.nodes.every((n, i) => (n.parameters.jsCode || '') === (out.nodes[i].parameters.jsCode || '')));
  T(f + ': credentials replaced by placeholders', out.nodes.every(n => Object.values(n.credentials || {}).every(c => c.id === 'REPLACE_CREDENTIAL_ID' && c.name === 'REPLACE_WITH_YOUR_CREDENTIAL')));
  T(f + ': no Google Sheet id or url left', !/spreadsheets\/d\/|\b1_[A-Za-z0-9_-]{30,}\b/.test(outRaw));
  T(f + ': inactive, timezone Asia/Kolkata', out.active === false && out.settings.timezone === 'Asia/Kolkata');
  T(f + ': no secrets', !/gsk_[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{10}|ya29\.|Bearer\s+[A-Za-z0-9]{10}|\b\d{8,}:[A-Za-z0-9_-]{30,}/.test(outRaw));
}
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(failures.join('\n')); process.exitCode = 1; }

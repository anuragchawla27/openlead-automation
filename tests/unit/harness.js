const fs = require('fs');
const wf = JSON.parse(fs.readFileSync(process.argv[2] || require('path').join(__dirname,'../../workflows/openlead-master.json'), 'utf8'));
const CODE = {}; wf.nodes.forEach(n => { if (n.parameters.jsCode) CODE[n.name] = n.parameters.jsCode; });
let pass = 0, fail = 0; const failures = [];
const T = (name, cond, detail) => { if (cond) pass++; else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && detail ? '  -> ' + detail : '')); };
function run(name, input, refs = {}, staticData = {}) {
  const wrap = a => a.map(j => ({ json: j }));
  const $ = nm => { const r = refs[nm]; if (!r) throw new Error('no ref ' + nm); const items = wrap(r);
    return { all: () => items, first: () => items[0], last: () => items[items.length - 1], item: items[0] }; };
  const $input = { all: () => wrap(input), first: () => wrap(input)[0] };
  const fn = new Function('$input', '$', '$getWorkflowStaticData', CODE[name]);
  return fn($input, $, () => staticData).map(x => x.json);
}
module.exports = { run, T, wf, CODE, summary: () => { console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(failures.join('\n')); process.exitCode = 1; } } };

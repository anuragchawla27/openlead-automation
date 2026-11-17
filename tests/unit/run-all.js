// node tests/unit/run-all.js
const { spawnSync } = require('child_process');
let bad = 0;
for (const f of ['code-nodes-1.test.js', 'code-nodes-2.test.js', 'workflow-integrity.test.js']) {
  const r = spawnSync(process.execPath, [require('path').join(__dirname, f)], { encoding: 'utf8' });
  const last = r.stdout.trim().split('\n').filter(l => /passed|FAIL|WARN/.test(l) && !/^PASS/.test(l));
  console.log('== ' + f + '\n' + last.join('\n')); if (r.status) bad++;
}
process.exitCode = bad ? 1 : 0;

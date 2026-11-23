// node tests/unit/run-all.js  (runs every suite that exists)
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
let bad = 0;
for (const f of ['code-nodes-1.test.js', 'code-nodes-2.test.js', 'code-nodes-3.test.js', 'code-nodes-4.test.js', 'workflow-integrity.test.js', 'outreach.test.js', 'dispatch.test.js', 'schedule.test.js']) {
  if (!fs.existsSync(path.join(__dirname, f))) continue;
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const last = r.stdout.trim().split('\n').filter(l => /passed|FAIL|WARN/.test(l) && !/^PASS/.test(l));
  console.log('== ' + f + '\n' + last.join('\n')); if (r.status) bad++;
}
process.exitCode = bad ? 1 : 0;

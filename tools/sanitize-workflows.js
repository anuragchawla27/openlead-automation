// node tools/sanitize-workflows.js
// Writes import-ready copies of the four workflows to handover/workflows/ with nothing that belongs to one person or one n8n install:
//  - credential ids and names are replaced, so n8n asks you to pick your own credential
//  - the Google Sheet document id, name and url are replaced with a placeholder
//  - every workflow gets the Asia/Kolkata timezone and stays inactive
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const FILES = ['openlead-master.json', 'openlead-outreach.json', 'openlead-dispatch.json', 'openlead-error-handler.json'];
const SHEET_PLACEHOLDER = 'REPLACE_WITH_YOUR_GOOGLE_SHEET_ID';
// documentId -> placeholder id; sheetName picked from a list (a numeric gid of one spreadsheet) -> the tab name, which works on any copy
const walk = o => {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object' && v.__rl) {
      if (k === 'documentId') o[k] = { __rl: true, value: SHEET_PLACEHOLDER, mode: 'id' };
      else if (k === 'sheetName' && v.cachedResultName) o[k] = { __rl: true, value: v.cachedResultName, mode: 'name' };
    } else walk(v);
  }
};
const clean = raw => {
  const wf = JSON.parse(raw);
  wf.active = false;
  wf.settings = { ...(wf.settings || {}), timezone: 'Asia/Kolkata' };
  delete wf.id; delete wf.versionId; delete wf.pinData;
  for (const n of wf.nodes) {
    if (n.credentials) for (const k of Object.keys(n.credentials)) n.credentials[k] = { id: 'REPLACE_CREDENTIAL_ID', name: 'REPLACE_WITH_YOUR_CREDENTIAL' };
    walk(n.parameters);
  }
  return JSON.stringify(wf, null, 2) + '\n';
};
module.exports = { clean, FILES };
if (require.main === module) {
  fs.mkdirSync(path.join(root, 'handover/workflows'), { recursive: true });
  for (const f of FILES) { fs.writeFileSync(path.join(root, 'handover/workflows', f), clean(fs.readFileSync(path.join(root, 'workflows', f), 'utf8'))); console.log('wrote handover/workflows/' + f); }
}

const { T, wf, CODE, summary } = require('./harness');
const fs = require('fs');
const raw = fs.readFileSync(process.argv[2] || require('path').join(__dirname,'../../workflows/openlead-master.json'), 'utf8');
const N = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
const names = new Set(Object.keys(N));

// ---- structure
const conn = wf.connections;
const badConn = []; for (const [s, v] of Object.entries(conn)) { if (!names.has(s)) badConn.push(s); for (const br of v.main) for (const t of br) if (!names.has(t.node)) badConn.push(s + '->' + t.node); }
T('WF: every connection points to an existing node', badConn.length === 0, badConn.join());
T('WF: unique node names and ids', names.size === wf.nodes.length && new Set(wf.nodes.map(n => n.id)).size === wf.nodes.length);
T('WF: no pinned data (nothing stale replays)', Object.keys(wf.pinData || {}).length === 0);
T('WF: workflow not active (manual/dev)', wf.active === false);
const orphan = wf.nodes.filter(n => n.type !== 'n8n-nodes-base.formTrigger' && !Object.values(conn).some(v => v.main.some(br => br.some(t => t.node === n.name)))).map(n => n.name);
T('WF: no orphan nodes except the trigger', orphan.length === 0, orphan.join());
const dead = wf.nodes.filter(n => !conn[n.name] || conn[n.name].main.every(b => b.length === 0)).map(n => n.name);
console.log('INFO terminal nodes: ' + dead.join(', '));

// ---- every $('Node') reference resolves
const refRe = /\$\(\s*['"]([^'"]+)['"]\s*\)/g; const missing = new Set();
for (const n of wf.nodes) { const s = JSON.stringify(n.parameters); let m; while ((m = refRe.exec(s.replace(/\\"/g, '"').replace(/\\'/g, "'")))) if (!names.has(m[1])) missing.add(n.name + ' -> ' + m[1]); }
T('WF: every $(\'Node\') reference in code and expressions exists', missing.size === 0, [...missing].join('; '));

// ---- all code nodes compile
let compileErr = [];
for (const [k, js] of Object.entries(CODE)) { try { new Function('$input', '$', '$getWorkflowStaticData', js); } catch (e) { compileErr.push(k + ': ' + e.message); } }
T('WF: all ' + Object.keys(CODE).length + ' code nodes compile', compileErr.length === 0, compileErr.join('; '));
const forbidden = Object.entries(CODE).filter(([k, js]) => /new URL\(|require\(\s*['"](?!crypto)/.test(js)).map(([k]) => k);
T('WF: no code node uses new URL() or other disallowed requires', forbidden.length === 0, forbidden.join());

// ---- secrets
T('WF: no gsk_/Bearer/api_key/AIza/sk- secrets', !/gsk_[A-Za-z0-9]|Bearer\s+[A-Za-z0-9]|api_key\s*[=:]\s*["']?[A-Za-z0-9]{8}|AIza[0-9A-Za-z_-]{10}|\bsk-[A-Za-z0-9]{10}/.test(raw));
const hex = (raw.match(/[A-Fa-f0-9]{40,}/g) || []).filter(h => !wf.meta || h !== wf.meta.instanceId);
T('WF: no long hex tokens other than the n8n instanceId', hex.length === 0, hex.join());
const authNodes = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest').map(n => [n.name, n.parameters.authentication, n.credentials && Object.keys(n.credentials)[0]]);
T('WF: every HTTP node authenticates through a credential, not inline', authNodes.every(a => a[1] === 'genericCredentialType' || a[0].startsWith('Scrape')), JSON.stringify(authNodes.filter(a => a[1] !== 'genericCredentialType' && !a[0].startsWith('Scrape'))));

// ---- Master write path
T('WF: Score Router MASTER output -> Read Master Domains', conn['Score Router'].main[0][0].node === 'Read Master Domains');
T('WF: chain Read Master Domains -> Drop Existing Master -> Write Master', conn['Read Master Domains'].main[0][0].node === 'Drop Existing Master' && conn['Drop Existing Master'].main[0][0].node === 'Write Master');
const wm = N['Write Master'].parameters;
T('WF: Write Master is APPEND (cannot overwrite an existing row)', wm.operation === 'append' && wm.columns.matchingColumns.length === 0);
T('WF: Write Master maps human_approval=PENDING and the 14 handbook columns', wm.columns.value.human_approval === 'PENDING' && Object.keys(wm.columns.value).length === 14 && wm.columns.schema.some(s => s.id === 'human_approval'));
T('WF: Write Master uses no stale $json-vs-reference mix (all $json)', Object.values(wm.columns.value).filter(v => String(v).startsWith('=')).every(v => /\$json\./.test(v) && !/\$\('Prepare Rows'\)/.test(v)));
T('WF: Read Master Domains runs once and always outputs', N['Read Master Domains'].executeOnce === true && N['Read Master Domains'].alwaysOutputData === true);
T('WF: Master/Review/Quarantine writes fail loudly (no continue-on-fail)', ['Write Master', 'Write Review', 'Write Quarantine'].every(k => !N[k].onError));
T('WF: Review and Quarantine still match on deterministic ids', N['Write Review'].parameters.columns.matchingColumns[0] === 'review_id' && N['Write Quarantine'].parameters.columns.matchingColumns[0] === 'rejection_id');
T('WF: SerpAPI runs every query (Execute Once off)', !N['SerpAPI Request'].executeOnce);
T('WF: Write Master columns line up with Prepare Rows output fields', (() => { const fields = ['master_lead_id', 'normalized_domain', 'company_name', 'contact_name', 'designation', 'verified_email', 'email_status', 'lead_score', 'evidence_text', 'headquarters_location', 'campaign_id', 'now']; const used = Object.values(wm.columns.value).map(v => (String(v).match(/\$json\.(\w+)/) || [])[1]).filter(Boolean); return used.every(u => fields.includes(u)); })());

// ---- Groq request bodies: evaluate the expressions
const body = n => { const s = N[n].parameters.jsonBody.replace(/^=\{\{/, '').replace(/\}\}\s*$/, ''); return new Function('$json', 'return (' + s + ');')({ llm_context: 'CTX' }); };
const P = body('Groq Extract'), F = body('Groq Extract (fallback)');
T('GQ: primary model and temperature 0', P.model === 'openai/gpt-oss-120b' && P.temperature === 0);
T('GQ: fallback model gpt-oss-20b', F.model === 'openai/gpt-oss-20b');
const strip = o => JSON.stringify({ ...o, model: '' });
T('GQ: primary and fallback are identical apart from the model', strip(P) === strip(F));
const sys = P.messages[0].content;
T('GQ: system prompt has all 10 numbered rules', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(i => sys.includes(i + '. ')), '');
T('GQ: user message is the llm_context', P.messages[1].content === 'CTX');
const schema = P.response_format && P.response_format.json_schema;
T('GQ: strict json_schema', P.response_format.type === 'json_schema' && schema.strict === true);
const req = schema.schema.required;
T('GQ: schema requires all 11 fields incl. company_contact_email', ['extraction_successful', 'company_name', 'official_website', 'industry_sector', 'headquarters_location', 'company_description', 'estimated_employee_range', 'key_decision_maker', 'extracted_evidence_snippets', 'confidence_level', 'company_contact_email'].every(r => req.includes(r)), req.join());
T('GQ: no real company names/emails leaked into the prompt', !/gigante|magicworks|awrange|sanpurple|harshad|swapnil|rahul/i.test(sys));
const tokEst = Math.ceil((sys.length + JSON.stringify(schema).length + 4500) / 3.6);
console.log('INFO NFR-04 estimate at a full 4,500-char context: ~' + tokEst + ' input tokens (limit 2,000; measured earlier 1,051-1,463)');
console.log('WARN NFR-04 cannot be proven offline: confirm usage.prompt_tokens <= 2000 on the largest live context (Groq response usage field)');
const pn = N['Parse Prompt (Groq)'].parameters.jsonBody; T('GQ: Parse Prompt body present', !!pn);
summary();

// Day 16: scheduling + rate limits (FR / Day 16 deliverable)
const { T, wf, CODE, summary } = require('./harness');
const N = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
const conn = wf.connections;
const into = name => Object.entries(conn).filter(([, v]) => v.main.some(b => b.some(t => t.node === name))).map(([k]) => k);

// ---- triggers
const sched = N['Daily Schedule'];
T('SCH: Daily Schedule node exists and is a scheduleTrigger', !!sched && sched.type === 'n8n-nodes-base.scheduleTrigger');
T('SCH: fires once a day at 09:00', JSON.stringify(sched.parameters.rule.interval) === JSON.stringify([{ triggerAtHour: 9 }]));
T('SCH: workflow timezone is Asia/Kolkata', wf.settings.timezone === 'Asia/Kolkata');
T('SCH: workflow stays inactive in the repo (activate only for the demo)', wf.active === false);
T('SCH: Scheduled Campaign sets a non-empty campaign_prompt', (N['Scheduled Campaign'].parameters.assignments.assignments.find(a => a.name === 'campaign_prompt') || {}).value.trim().length > 10);
T('SCH: Daily Schedule -> Scheduled Campaign -> Prompt Not Empty', conn['Daily Schedule'].main[0][0].node === 'Scheduled Campaign' && conn['Scheduled Campaign'].main[0][0].node === 'Prompt Not Empty');
T('SCH: manual form and schedule both enter through Prompt Not Empty', JSON.stringify(into('Prompt Not Empty').sort()) === JSON.stringify(['Intake Form', 'Scheduled Campaign']));
T('SCH: no code node reads the Intake Form directly (a cron run would crash)', !Object.values(CODE).some(js => /\$\(\s*['"]Intake Form['"]\s*\)/.test(js)));
T('SCH: normalizer reads the prompt from Prompt Not Empty', /\$\("Prompt Not Empty"\)\.first\(\)\.json\.campaign_prompt/.test(CODE['Parameter Normalizer']));

// ---- rate limits (batch size per interval = token bucket)
const rate = n => { const b = (N[n].parameters.options || {}).batching; return b && b.batch; };
const perSec = n => { const b = rate(n); return b ? b.batchSize / (b.batchInterval / 1000) : Infinity; };
T('RL: SerpAPI is limited to <= 1 request per second', rate('SerpAPI Request') && perSec('SerpAPI Request') <= 1, JSON.stringify(rate('SerpAPI Request')));
T('RL: Groq extract keeps <= 1 request per 6 s (free-tier tokens)', rate('Groq Extract').batchSize === 1 && rate('Groq Extract').batchInterval >= 6000);
T('RL: Groq fallback keeps <= 1 request per 8 s', rate('Groq Extract (fallback)').batchSize === 1 && rate('Groq Extract (fallback)').batchInterval >= 8000);
T('RL: page scrapes are limited to <= 3 per second', perSec('Scrape Page') <= 3 && perSec('Scrape About') <= 3);
T('RL: scrape keeps its 10 s timeout and neverError after the change', N['Scrape Page'].parameters.options.timeout === 10000 && N['Scrape Page'].parameters.options.response.response.neverError === true);
const http = wf.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
T('RL: every HTTP node continues on fail (isolated failure contract)', http.every(n => n.onError === 'continueRegularOutput'), http.filter(n => n.onError !== 'continueRegularOutput').map(n => n.name).join());
T('RL: SerpAPI and Groq nodes retry with a wait', ['SerpAPI Request', 'Parse Prompt (Groq)', 'Groq Extract', 'Groq Extract (fallback)'].every(n => N[n].retryOnFail === true && N[n].waitBetweenTries >= 5000 && (N[n].maxTries || 3) >= 3));
summary();

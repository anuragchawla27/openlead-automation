const BLOCK = ['linkedin.com','facebook.com','twitter.com','x.com','instagram.com','youtube.com','wikipedia.org','glassdoor.com','indeed.com','naukri.com','justdial.com','ambitionbox.com','crunchbase.com','scribd.com','goodfirms.co','builtinpune.in','clutch.co','sulekha.com','indiamart.com','quora.com','medium.com','reddit.com','trustpilot.com','g2.com','topdevelopers.co','designrush.com','softwaresuggest.com','techbehemoths.com'];
const LIST_TITLE = /\b(list of|reviews?|directory)\b|\bcompanies\b|\b(top|best)\s+\d+/i;
const cfg = $('Split Queries').first().json;
const hash = s => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };
const seen = new Set(), out = [], skipLog = [];
let errors = 0;

for (const item of $input.all()) {
  if (item.json.error || !Array.isArray(item.json.organic_results)) { errors++; continue; }
  const query = item.json.search_parameters?.q || '';
  for (const r of item.json.organic_results) {
    const m = String(r.link || '').match(/^(https?):\/\/([^\/?#:]+)/i);
    if (!m) { skipLog.push({ link: r.link, reason: 'BAD_URL' }); continue; }
    const host = m[2].toLowerCase().replace(/^www\./, '');
    if (BLOCK.some(b => host === b || host.endsWith('.' + b))) { skipLog.push({ link: r.link, reason: 'BLOCKED_DOMAIN' }); continue; }
    if (LIST_TITLE.test(r.title || '')) { skipLog.push({ link: r.link, reason: 'LIST_TITLE' }); continue; }
    if (seen.has(host)) { skipLog.push({ link: r.link, reason: 'DUPLICATE_DOMAIN' }); continue; }
    seen.add(host);
    out.push({ json: {
      result_id: 'RES-' + hash(host),
      campaign_id: cfg.campaign_id,
      source_url: r.link,
      normalized_domain: host,
      source_platform: 'google_serp',
      title: r.title || null,
      snippet: r.snippet || null,
      query,
      discovery_time: new Date().toISOString(),
      scrape_status: 'PENDING'
    } });
    if (out.length >= cfg.max_leads_limit) break;
  }
}
if (out.length === 0) return [{ json: { no_hits: true, errors, skipped: skipLog.length, skip_log: skipLog, campaign_id: cfg.campaign_id } }];
return out;
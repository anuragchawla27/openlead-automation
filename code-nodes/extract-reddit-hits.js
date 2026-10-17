const cfg = $('Split Queries').first().json;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hash = s => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };
const POST_URL = /^https?:\/\/(?:www\.|old\.)?reddit\.com\/r\/([^\/?#]+)\/comments\/([a-z0-9]+)/i;
const EMPLOYER = /^\W*(we('|\u2019)re |we are )?(hiring|looking for (an?|the|our) )/i;
const JUNIOR = /\b(student|intern|internship|fresher|entry[- ]level|junior|beginner|learning|my portfolio)\b/i;
const SENIOR = /for hire|\$\s?\d+[^\s]*\s?\/\s?hr|\b\d+\+?\s*years\b|\bsenior\b|\bspecialist\b/i;

const seen = new Set(), out = [], skipLog = [];
let errors = 0;

for (const item of $input.all()) {
  if (item.json.error || !Array.isArray(item.json.organic_results)) { errors++; continue; }
  const query = item.json.search_parameters?.q || '';
  for (const r of item.json.organic_results) {
    const m = String(r.link || '').match(POST_URL);
    if (!m) { skipLog.push({ link: r.link, reason: 'NOT_A_POST_URL' }); continue; }
    const title = r.title || '';
    if (EMPLOYER.test(title)) { skipLog.push({ link: r.link, reason: 'EMPLOYER_POST' }); continue; }
    const key = norm(title);
    if (!key || seen.has(key)) { skipLog.push({ link: r.link, reason: 'DUPLICATE_TITLE' }); continue; }
    seen.add(key);
    // Title-only hint: Google snippets can be comment text, so they are not used here
    const text = title;
    const level = JUNIOR.test(text) ? 'STUDENT_OR_JUNIOR' : (SENIOR.test(text) ? 'EXPERIENCED' : 'UNCLEAR');
    out.push({ json: {
      result_id: 'RES-' + hash(key),
      campaign_id: cfg.campaign_id,
      source_url: r.link,
      normalized_domain: 'reddit.com',
      source_platform: 'reddit',
      subreddit: m[1],
      post_id: m[2],
      title: title || null,
      snippet: r.snippet || null,
      candidate_level_hint: level,
      query,
      discovery_time: new Date().toISOString(),
      scrape_status: 'PENDING'
    } });
    if (out.length >= cfg.max_leads_limit) break;
  }
}
if (out.length === 0) return [{ json: { no_hits: true, errors, skipped: skipLog.length, skip_log: skipLog, campaign_id: cfg.campaign_id } }];
return out;

const hits = $('Extract Hits').all();
const out = [];
const NAMED = { nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", times:'x', copy:'(c)', reg:'(R)', ndash:'-', mdash:'-', hellip:'...', rsquo:"'", lsquo:"'", ldquo:'"', rdquo:'"' };
const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
  .replace(/&([a-z]+);/gi, (m, n) => (NAMED[n.toLowerCase()] !== undefined ? NAMED[n.toLowerCase()] : m))
  .replace(/\u00a0/g, ' ');

$input.all().forEach((item, i) => {
  const hit = hits[i] ? hits[i].json : {};
  const status = item.json.statusCode || item.json.status || null;
  const body = typeof item.json.body === 'string' ? item.json.body : (typeof item.json.data === 'string' ? item.json.data : '');
  const base = { ...hit, http_status: status };

  if (item.json.error || !body || (status && status >= 400)) {
    out.push({ json: { ...base, scrape_status: 'SCRAPE_FAILED', scrape_error: String(item.json.error?.message || item.json.error || ('HTTP ' + status)), page_text: '' } });
    return;
  }

  const emailObfuscated = /cdn-cgi\/l\/email-protection|\[email(?:&#160;|&nbsp;|\s)protected\]/i.test(body);

  let t = body
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  t = decode(t).replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();

  if (t.length < 200) {
    out.push({ json: { ...base, scrape_status: 'SCRAPE_EMPTY', scrape_error: 'Too little text (client-side rendered?)', page_text: t, email_obfuscated: emailObfuscated } });
    return;
  }
  // Exactly 12,000 chars: 8,000 head + 7-char marker + 3,993 tail (contact details are usually in the footer)
  const capped = t.length > 12000 ? t.slice(0, 8000) + '\n[...]\n' + t.slice(-3993) : t;
  out.push({ json: { ...base, scrape_status: 'SCRAPED', page_text: capped, page_text_chars: capped.length, text_source: 'page', email_obfuscated: emailObfuscated } });
});
return out;
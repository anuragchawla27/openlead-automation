const base = $('Add About URL').all();
const NAMED = { nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'" };
const decode = s => s.replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCharCode(parseInt(h,16))).replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(+d)).replace(/&([a-z]+);/gi,(m,n)=>NAMED[n.toLowerCase()]??m);
const ROLE = /\b(founder|co-founder|ceo|cto|coo|director|managing|owner|partner|president|head of)\b/i;

return $input.all().map((item, i) => {
  const j = base[i] ? base[i].json : {};
  if (!j.about_url) return { json: { ...j, about_status: 'ABOUT_SKIPPED' } };
  const status = item.json.statusCode || item.json.status || null;
  const body = typeof item.json.body === 'string' ? item.json.body : (typeof item.json.data === 'string' ? item.json.data : '');
  if (!body || (status && status >= 400)) return { json: { ...j, about_status: 'ABOUT_SKIPPED' } };

  let t = body.replace(/<(script|style|noscript|svg|iframe|nav|header|footer)[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ');
  t = decode(t).replace(/[ \t\r\f\v]+/g,' ').replace(/\s*\n\s*/g,'\n').replace(/\n{2,}/g,'\n').trim();

  // keep only lines not already on the main page, and only substantive ones
  const seen = new Set(String(j.page_text || '').split('\n').map(s => s.trim()));
  const fresh = t.split('\n').map(s => s.trim())
    .filter(l => l && !seen.has(l) && (l.length >= 40 || l.includes('@') || ROLE.test(l)))
    .join('\n');

  if (fresh.length < 100) return { json: { ...j, about_status: 'ABOUT_DUPLICATE_OR_EMPTY' } };
  return { json: { ...j, page_text: String(j.page_text || '') + '\n--- ABOUT PAGE ---\n' + fresh.slice(0, 3000), about_status: 'ABOUT_ADDED' } };
});
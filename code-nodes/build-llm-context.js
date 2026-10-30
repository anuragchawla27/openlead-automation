const ROLE = /\b(founder|co-founder|cofounder|ceo|cto|coo|managing director|director|owner|proprietor|president|chairman|founded (?:in \d{4} )?by|led by|headed by)\b/i;
const FACT = /(@|headquarter|head office|\bhq\b|employees|team of|\d+\+?\s*(?:employees|professionals|engineers|people)|incorporated|registered office)/i;
// "Name - Job title" attribution lines are client testimonials, not company leadership
const TESTIMONIAL = /^[^.!?]{2,40}\s[-–—]\s[A-Z][^!?]{2,70}$/;
const MARK = '--- ABOUT PAGE ---';
const MAX_CHARS = 4500; // NFR-04 budget (about 2,000 input tokens with prompt and schema)

const uniq = arr => [...new Set(arr)];
const clean = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
const take = (lines, maxChars) => {
  const out = []; let n = 0;
  for (const l of lines) { if (n + l.length + 1 > maxChars) break; out.push(l); n += l.length + 1; }
  return out.join('\n');
};
const pri = l => (/@/.test(l) ? 2 : 0) + (ROLE.test(l) ? 2 : 0) + (/headquarter|head office|\bhq\b/i.test(l) ? 1 : 0);

return $input.all().map(i => {
  const j = i.json;
  if (j.scrape_status !== 'SCRAPED' && j.scrape_status !== 'SERP_ONLY') return i;

  let ctx;
  if (j.scrape_status === 'SERP_ONLY') {
    ctx = String(j.page_text || '').slice(0, 1500);
  } else {
    const full = String(j.page_text || '');
    const idx = full.indexOf(MARK);
    const mainLines = clean(idx >= 0 ? full.slice(0, idx) : full);
    const aboutLines = clean(idx >= 0 ? full.slice(idx + MARK.length) : '');
    const seen = new Set();
    const fresh = arr => arr.filter(l => !seen.has(l) && seen.add(l));

    // 1) signals first, so the budget can never cut them off
    const candidates = uniq([...mainLines, ...aboutLines]).filter(l =>
      l.length <= 600 && (ROLE.test(l) || FACT.test(l)) && !TESTIMONIAL.test(l) && !(l.length < 25 && !/@/.test(l))
    );
    const signal = take(fresh(candidates.sort((a, b) => pri(b) - pri(a)).slice(0, 25)), 1800);
    // 2) start of the main page
    const head = take(fresh(uniq(mainLines.slice(0, 15))), 500);
    // 3) About page: substantive lines only
    const about = take(fresh(aboutLines.filter(l => l.length >= 40 && !TESTIMONIAL.test(l))), 900);
    // 4) real footer of the main page (addresses, HQ labels)
    const footer = take(fresh(uniq(mainLines.slice(-15))), 500);

    const body = ['SIGNAL LINES:\n' + signal, 'PAGE START:\n' + head, 'ABOUT PAGE:\n' + about, 'PAGE FOOTER:\n' + footer].join('\n---\n');
    ctx = `SEARCH RESULT TITLE: ${j.title || ''}\nSEARCH RESULT SNIPPET: ${j.snippet || ''}\n---\n` + body.slice(0, MAX_CHARS);
  }
  return { json: { ...j, llm_context: ctx, llm_context_chars: ctx.length } };
});
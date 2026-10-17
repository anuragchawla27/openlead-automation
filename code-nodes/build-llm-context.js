const KEY = /(founder|co-founder|ceo|cto|chief|director|managing|president|head of|owner|contact|email|e-mail|@|employees|team of|headquarter|head office|located|address|hq\b|india)/i;
return $input.all().map(i => {
  const j = i.json;
  if (j.scrape_status !== 'SCRAPED' && j.scrape_status !== 'SERP_ONLY') return i;
  const lines = String(j.page_text || '').split('\n').map(s => s.trim()).filter(Boolean);
  let ctx;
  if (j.scrape_status === 'SERP_ONLY') {
    ctx = String(j.page_text || '').slice(0, 1500);
  } else {
    const head = [...new Set(lines.slice(0, 25))].join('\n');
    const tail = [...new Set(lines.slice(-30))].join('\n');
    const signal = [...new Set(lines.slice(25).filter(l => KEY.test(l) && l.length < 300))].slice(0, 30).join('\n');
    const body = (head + '\n---\n' + tail + '\n---\n' + signal).slice(0, 4000);
    ctx = `SEARCH RESULT TITLE: ${j.title || ''}\nSEARCH RESULT SNIPPET: ${j.snippet || ''}\n---\n` + body;
  }
  return { json: { ...j, llm_context: ctx, llm_context_chars: ctx.length } };
});
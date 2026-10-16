return $input.all().map(i => {
  const j = i.json;
  if (j.no_hits) return i;
  const text = `${j.title || ''}\n${j.snippet || ''}`.trim();
  return { json: { ...j, scrape_status: 'SERP_ONLY', page_text: text, page_text_chars: text.length, text_source: 'serp_title_snippet' } };
});
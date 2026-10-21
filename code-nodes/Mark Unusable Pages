const PARKED = /(this domain (is|may be) for sale|domain (is )?parked|buy this domain|account suspended|coming soon|under construction|page not found|access denied|just a moment|enable javascript|404 not found)/i;
return $input.all().map(i => {
  const j = i.json;
  if (j.scrape_status !== 'SCRAPED') return i;
  const t = String(j.page_text || '');
  if (t.length < 400 && PARKED.test(t)) {
    return { json: { ...j, scrape_status: 'PAGE_UNUSABLE', scrape_error: 'PARKED_OR_ERROR_PAGE' } };
  }
  return i;
});
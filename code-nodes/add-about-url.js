return $input.all().map(i => {
  const j = i.json;
  const m = String(j.source_url || '').match(/^(https?:\/\/[^\/?#]+)(\/[^?#]*)?/i);
  const origin = m ? m[1] : '';
  const path = m && m[2] ? m[2].toLowerCase() : '';
  const isAboutLike = /about|team|founder|leadership|contact/.test(path);
  // Respect blocks: never re-hit a site that already failed or was blocked.
  // Already an about/contact page: no second fetch needed.
  const eligible = origin && j.scrape_status === 'SCRAPED' && !isAboutLike;
  const about_url = eligible ? origin + '/about' : '';
  return { json: { ...j, about_url } };
});
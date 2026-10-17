const src = $('Build LLM Context').all().filter(i => i.json.llm_context);
const out = [];
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
// A quote must read like a sentence: at least 5 words and end in punctuation (menu fragments and bare titles fail)
const isSentence = q => /[.!?]$/.test(norm(q)) && norm(q).split(' ').length >= 5;

$input.all().forEach((item, idx) => {
  const s = src[idx] ? src[idx].json : {};
  let o;
  try {
    const txt = item.json.choices[0].message.content.replace(/```json|```/g, '').trim();
    o = JSON.parse(txt);
  } catch (e) {
    const msg = String(item.json.error?.message || e.message);
    out.push({ json: { ...s, extraction_status: 'EXTRACTION_FAILED', extraction_error: msg, retryable: /socket|TLS|ECONN|ETIMEDOUT|429|50\d/i.test(msg) } });
    return;
  }
  // Check against everything the model was shown (SERP header + page text)
  const hay = String(s.llm_context || '') + ' ' + String(s.page_text || '');
  const text = norm(hay);
  const flags = [];

  const snippets = (o.extracted_evidence_snippets || []).filter(q => {
    const ok = isSentence(q) && text.includes(norm(q));
    if (!ok) flags.push('DROPPED_UNVERIFIED_SNIPPET');
    return ok;
  });

  const dm = o.key_decision_maker || {};
  let email = dm.public_business_email || null;
  if (email && !hay.toLowerCase().includes(email.toLowerCase())) { flags.push('DROPPED_UNVERIFIED_EMAIL'); email = null; }

  let name = dm.full_name || null;
  if (name && !text.toLowerCase().includes(norm(name).toLowerCase())) { flags.push('DROPPED_UNVERIFIED_NAME'); name = null; }

  out.push({ json: {
    ...s,
    extraction_status: 'EXTRACTED',
    extraction_successful: !!o.extraction_successful,
    company_name: o.company_name,
    official_website: 'https://' + (s.normalized_domain || ''),
    industry_sector: o.industry_sector,
    headquarters_location: o.headquarters_location,
    company_description: o.company_description,
    estimated_employee_range: o.estimated_employee_range,
    key_decision_maker: { full_name: name, designation: name ? dm.designation : null, public_business_email: email, linkedin_profile_url: null },
    extracted_evidence_snippets: snippets,
    confidence_level: o.confidence_level,
    verification_flags: flags
  } });
});
return out;
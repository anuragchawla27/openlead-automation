const src = $('Build LLM Context').all().filter(i => i.json.llm_context);
const out = [];
const BOILERPLATE = /all rights reserved|privacy policy|cookie|terms (&|and) conditions|copyright/i;

// Fold look-alike characters so model output and page text compare equal:
// non-breaking/typographic hyphens, curly quotes, odd spaces, zero-width characters.
const fold = ch => {
  if (/[\u2010-\u2015\u2212]/.test(ch)) return '-';
  if (/[\u2018\u2019\u201B\u2032]/.test(ch)) return "'";
  if (/[\u201C\u201D\u201F\u2033]/.test(ch)) return '"';
  if (/[\u200B-\u200D\u2060\uFEFF]/.test(ch)) return '';
  if (/\s/.test(ch)) return ' ';
  return ch;
};
// folded, whitespace-collapsed text plus a map from each folded index back to the original index
const index = raw => {
  const s = String(raw || '');
  let t = ''; const map = []; let prevSpace = true;
  for (let i = 0; i < s.length; i++) {
    const f = fold(s[i]);
    if (f === '') continue;
    if (f === ' ') { if (prevSpace) continue; t += ' '; map.push(i); prevSpace = true; }
    else { t += f; map.push(i); prevSpace = false; }
  }
  return { t, map };
};
const foldText = raw => index(raw).t.trim();
const isSentence = n => /[.!?]$/.test(n) && n.split(' ').length >= 5;

$input.all().forEach((item, idx) => {
  const s = src[idx] ? src[idx].json : {};
  let o;
  try {
    const content = item.json?.choices?.[0]?.message?.content;
    if (!content) throw new Error(item.json?.error?.message || 'NO_GROQ_RESPONSE');
    const txt = content.replace(/```json|```/g, '').trim();
    o = JSON.parse(txt);
  } catch (e) {
    const msg = String(item.json?.error?.message || e.message);
    out.push({ json: { ...s, extraction_status: 'EXTRACTION_FAILED', extraction_error: msg, retryable: /socket|TLS|ECONN|ETIMEDOUT|429|50\d/i.test(msg) } });
    return;
  }

  const hay = String(s.llm_context || '') + ' ' + String(s.page_text || '');
  const srcIdx = index(hay);
  const flags = [];

  // Evidence: compare folded text, then store the PAGE's own characters (truly verbatim)
  const snippets = [];
  const dropped = [];
  for (const q of (o.extracted_evidence_snippets || [])) {
    const qn = foldText(q);
    const p = qn ? srcIdx.t.indexOf(qn) : -1;
    const ok = isSentence(qn) && !BOILERPLATE.test(qn) && p >= 0;
    if (ok) {
      const original = hay.slice(srcIdx.map[p], srcIdx.map[p + qn.length - 1] + 1).replace(/\s+/g, ' ').trim();
      if (!snippets.includes(original)) snippets.push(original);
    } else {
      flags.push('DROPPED_UNVERIFIED_SNIPPET');
      dropped.push(String(q).slice(0, 200));
    }
  }

  const dm = o.key_decision_maker || {};
  let email = dm.public_business_email || null;
  if (email && !hay.toLowerCase().includes(email.toLowerCase())) { flags.push('DROPPED_UNVERIFIED_EMAIL'); email = null; }

  let name = dm.full_name || null;
  if (name && !srcIdx.t.toLowerCase().includes(foldText(name).toLowerCase())) { flags.push('DROPPED_UNVERIFIED_NAME'); name = null; }

  let cemail = o.company_contact_email || null;
  if (cemail && !hay.toLowerCase().includes(cemail.toLowerCase())) { flags.push('DROPPED_UNVERIFIED_EMAIL'); cemail = null; }

  // Never trust model self-rated confidence: derive a cap from what was actually verified
  let conf = o.confidence_level;
  const verifiedFacts = [!!name, !!email, o.estimated_employee_range !== 'UNKNOWN', snippets.length >= 2].filter(Boolean).length;
  if (verifiedFacts < 2) conf = 'LOW';
  else if (verifiedFacts < 3 && conf === 'HIGH') conf = 'MEDIUM';

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
    company_contact_email: cemail,
    extracted_evidence_snippets: snippets,
    dropped_snippets: dropped,
    confidence_level: conf,
    verification_flags: flags
  } });
});
return out;
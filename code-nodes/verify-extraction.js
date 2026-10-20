const src = $('Build LLM Context').all().filter(i => i.json.llm_context);
const out = [];
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const isSentence = q => /[.!?]$/.test(norm(q)) && norm(q).split(' ').length >= 5;
const BOILERPLATE = /all rights reserved|privacy policy|cookie|terms (&|and) conditions|copyright/i;

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
  const text = norm(hay);
  const flags = [];

  const snippets = (o.extracted_evidence_snippets || []).filter(q => {
    const ok = isSentence(q) && !BOILERPLATE.test(q) && text.includes(norm(q));
    if (!ok) flags.push('DROPPED_UNVERIFIED_SNIPPET');
    return ok;
  });

  const dm = o.key_decision_maker || {};
  let email = dm.public_business_email || null;
  if (email && !hay.toLowerCase().includes(email.toLowerCase())) { flags.push('DROPPED_UNVERIFIED_EMAIL'); email = null; }

  let name = dm.full_name || null;
  if (name && !text.toLowerCase().includes(norm(name).toLowerCase())) { flags.push('DROPPED_UNVERIFIED_NAME'); name = null; }

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
    confidence_level: conf,
    verification_flags: flags
  } });
});
return out;
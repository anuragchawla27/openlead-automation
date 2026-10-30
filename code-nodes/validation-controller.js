const cfg = $('Parameter Normalizer').first().json;
const FREE = ['gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','proton.me','protonmail.com','icloud.com','rediffmail.com'];
const GENERIC = /^(info|contact|contacts|business|sales|support|hello|hi|admin|office|enquiry|enquiries|inquiry|inquiries|finance|hr|careers|jobs|whistleblower|marketing|accounts|billing|help|team|mail|webmaster)([._+-]|@)/i;
const RFC = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const hostOf = u => { const m = String(u || '').match(/^(?:https?:\/\/)?([^\/?#:]+)/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; };

// brand label: awrange.com and awrange.co.in both -> "awrange"
const SLD = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);
const brandOf = d => {
  const p = String(d || '').toLowerCase().split('.');
  if (p.length > 1) p.pop();
  if (p.length > 1 && SLD.has(p[p.length - 1])) p.pop();
  return p[p.length - 1] || '';
};

// role word variants, so "Founder" is supported by "founded ... by"
const ROLE_PATTERNS = [
  [/found/i, /found(?:er|ed|ing)/i],
  [/ceo|chief executive/i, /\bceo\b|chief executive/i],
  [/cto|chief technology/i, /\bcto\b|chief technology/i],
  [/coo|chief operating/i, /\bcoo\b|chief operating/i],
  [/managing director|\bmd\b/i, /managing director|\bmd\b/i],
  [/director/i, /director/i],
  [/owner|proprietor/i, /owner|proprietor/i],
  [/president/i, /president/i],
  [/partner/i, /partner/i]
];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const roleRegexFor = desig => {
  const hit = ROLE_PATTERNS.find(([k]) => k.test(desig));
  if (hit) return hit[1];
  return desig ? new RegExp(esc(desig), 'i') : null;
};
const normText = s => String(s || '').replace(/[ \t\r\f\v]+/g, ' ');

// name must appear verbatim in the page, with the role within 150 chars,
// and not as a "Name - Title" testimonial attribution line
const supportedBy = (name, desig, text) => {
  const hay = normText(text), lower = hay.toLowerCase();
  const n = normText(name).trim().toLowerCase();
  const re = roleRegexFor(String(desig || '').toLowerCase());
  if (!n || !re) return false;
  const testimonial = new RegExp('^\\s*' + esc(n) + '\\s*[-–—]\\s*', 'i');
  let from = 0;
  for (;;) {
    const idx = lower.indexOf(n, from);
    if (idx === -1) return false;
    const ls = hay.lastIndexOf('\n', idx) + 1;
    let le = hay.indexOf('\n', idx); if (le === -1) le = hay.length;
    const line = hay.slice(ls, le);
    const win = hay.slice(Math.max(0, idx - 150), idx + n.length + 150);
    if (!testimonial.test(line) && re.test(win)) return true;
    from = idx + n.length;
  }
};

return $input.all().map(item => {
  const e = item.json;
  const errors = [];
  const out = { ...e };
  const flags = [...(e.verification_flags || [])];
  let confidence = e.confidence_level;

  // 1. Structural gate (fallback-model items are gated on company_name)
  const usable = e.extraction_status === 'EXTRACTED' && !!e.company_name && (e.extraction_successful || e.model_used);
  if (!usable) {
    return { json: { ...out, validation_status: 'REJECTED', rejection_reason: e.extraction_status === 'EXTRACTED' ? 'ERR_EMPTY_EXTRACTION' : 'ERR_NOT_EXTRACTED', rejection_veto: true } };
  }

  // 2. Domain from the scraped URL (never from the model)
  const domain = hostOf(e.source_url) || e.normalized_domain || '';
  if (!domain || !/\.[a-z]{2,}$/i.test(domain)) {
    return { json: { ...out, validation_status: 'REJECTED', rejection_reason: 'ERR_MALFORMED_URL', rejection_veto: true } };
  }
  out.normalized_domain = domain;

  // 3. Exclusion veto
  const hay = ((e.company_name || '') + ' ' + (e.company_description || '') + ' ' + (e.industry_sector || '')).toLowerCase();
  const hit = (cfg.exclusion_keywords || []).find(x => x && hay.includes(String(x).toLowerCase()));
  if (hit) {
    return { json: { ...out, validation_status: 'REJECTED', rejection_reason: 'VETO_EXCLUSION: ' + hit, rejection_veto: true } };
  }

  // 4. Email classification (decision maker first, then company inbox)
  const dm = e.key_decision_maker || {};
  const dmEmail = (dm.public_business_email || '').trim();
  const coEmail = (e.company_contact_email || '').trim();
  const rawEmail = dmEmail || coEmail;
  let fromCompany = !dmEmail && !!coEmail;
  let verified_email = null, email_status = 'UNAVAILABLE';
  if (rawEmail) {
    if (!RFC.test(rawEmail) || /\.\./.test(rawEmail)) { email_status = 'INVALID_SYNTAX'; }
    else {
      verified_email = rawEmail;
      const edomain = rawEmail.split('@')[1].toLowerCase();
      if (FREE.includes(edomain)) email_status = 'FREE_WEBMAIL';
      else if (GENERIC.test(rawEmail)) email_status = 'GENERIC_INBOX';
      else email_status = 'SYNTAX_VALID';
      if (email_status === 'SYNTAX_VALID' && brandOf(edomain) !== brandOf(domain)) email_status = 'DOMAIN_MISMATCH';

      // a general inbox the model put in the decision-maker field is still a company inbox
      const sameAsCompany = !!dmEmail && !!coEmail && dmEmail.toLowerCase() === coEmail.toLowerCase();
      if (dmEmail && (email_status === 'GENERIC_INBOX' || sameAsCompany)) {
        fromCompany = true;
        flags.push('DM_EMAIL_WAS_COMPANY_INBOX');
        if (confidence === 'HIGH') confidence = 'MEDIUM';
      }
      // an address reported as the company's general inbox is not a personal email
      if (email_status === 'SYNTAX_VALID' && fromCompany) email_status = 'GENERIC_INBOX';
    }
  }

  // 5. Decision maker counts only when the name appears verbatim next to the role in the page text
  const evidenceText = [e.llm_context, e.page_text, (e.extracted_evidence_snippets || []).join('\n')].join('\n');
  const dm_supported = !!(dm.full_name && dm.designation && supportedBy(dm.full_name, dm.designation, evidenceText));

  return { json: {
    ...out,
    validation_status: 'VALIDATED',
    verified_email, email_status,
    email_source: rawEmail ? (fromCompany ? 'COMPANY_INBOX' : 'DECISION_MAKER') : null,
    decision_maker_supported: dm_supported,
    evidence_count: (e.extracted_evidence_snippets || []).length,
    verification_flags: flags,
    confidence_level: confidence,
    validation_errors: errors,
    validated_at: new Date().toISOString()
  } };
});
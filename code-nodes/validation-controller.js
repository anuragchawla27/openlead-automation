const cfg = $('Parameter Normalizer').first().json;
const FREE = ['gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','proton.me','protonmail.com','icloud.com','rediffmail.com'];
const GENERIC = /^(info|contact|business|sales|support|hello|admin|office|enquiry|inquiry|finance|hr|careers|jobs|whistleblower|marketing|accounts|billing|help|team|mail|webmaster)([._+-]|@)/i;
const RFC = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const hostOf = u => { const m = String(u || '').match(/^(?:https?:\/\/)?([^\/?#:]+)/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; };

return $input.all().map(item => {
  const e = item.json;
  const errors = [];
  const out = { ...e };

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
  const rawEmail = (dm.public_business_email || e.company_contact_email || '').trim();
  let verified_email = null, email_status = 'UNAVAILABLE';
  if (rawEmail) {
    if (!RFC.test(rawEmail) || /\.\./.test(rawEmail)) { email_status = 'INVALID_SYNTAX'; }
    else {
      verified_email = rawEmail;
      const edomain = rawEmail.split('@')[1].toLowerCase();
      if (FREE.includes(edomain)) email_status = 'FREE_WEBMAIL';
      else if (GENERIC.test(rawEmail)) email_status = 'GENERIC_INBOX';
      else email_status = 'SYNTAX_VALID';
      if (!/(^|\.)/.test(edomain) || (edomain !== domain && !edomain.endsWith('.' + domain) && !domain.endsWith('.' + edomain))) {
        if (email_status === 'SYNTAX_VALID') email_status = 'DOMAIN_MISMATCH';
      }
    }
  }

  // 5. Decision maker counts only when a verbatim quote supports the designation
  const quotes = (e.extracted_evidence_snippets || []).join(' ').toLowerCase();
  const desig = String(dm.designation || '').toLowerCase();
  const dm_supported = !!(dm.full_name && desig && quotes.includes(String(dm.full_name).toLowerCase()) && quotes.includes(desig));

  return { json: {
    ...out,
    validation_status: 'VALIDATED',
    verified_email, email_status,
    decision_maker_supported: dm_supported,
    evidence_count: (e.extracted_evidence_snippets || []).length,
    validation_errors: errors,
    validated_at: new Date().toISOString()
  } };
});
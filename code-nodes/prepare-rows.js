const now = new Date().toISOString();
const short = s => String(s || '').slice(0, 40);
return $input.all().map(i => {
  const e = i.json;
  const dm = e.key_decision_maker || {};
  const id = String(e.domain_hash || e.result_id || '').replace(/[^a-z0-9]/gi, '').slice(-10).toUpperCase();
  return { json: {
    ...e,
    review_id: 'REV-' + id, rejection_id: 'REJ-' + id,
    master_lead_id: 'MLD-' + id,
    contact_name: dm.full_name || '', designation: dm.designation || '',
    sub_scores_text: JSON.stringify(e.sub_scores || {}),
    evidence_text: (e.extracted_evidence_snippets || []).join(' | '),
    flags_text: (e.verification_flags || []).join(','),
    reason_text: e.score_reason || e.rejection_reason || ('score ' + (e.lead_score ?? 0) + ' below 60'),
    now
  } };
});
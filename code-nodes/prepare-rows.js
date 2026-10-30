const now = new Date().toISOString();
return $input.all().map(i => {
  const e = i.json;
  const dm = e.key_decision_maker || {};
  const id = String(e.domain_hash || e.result_id || '').replace(/[^a-z0-9]/gi, '').slice(-10).toUpperCase();
  const score = e.lead_score ?? 0;
  const route = e.routing_target || '';
  const routeReason =
    route === 'MASTER' ? 'score ' + score + ' meets the master threshold' :
    route === 'REVIEW' ? 'score ' + score + ' in review band (60-79): needs human check' :
    'score ' + score + ' below 60';
  return { json: {
    ...e,
    review_id: 'REV-' + id, rejection_id: 'REJ-' + id,
    master_lead_id: 'MLD-' + id,
    contact_name: dm.full_name || '', designation: dm.designation || '',
    sub_scores_text: JSON.stringify(e.sub_scores || {}),
    evidence_text: (e.extracted_evidence_snippets || []).join(' | '),
    flags_text: (e.verification_flags || []).join(','),
    reason_text: e.score_reason || e.rejection_reason || routeReason,
    now
  } };
});
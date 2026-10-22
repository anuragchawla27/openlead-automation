const cfg = $('Parameter Normalizer').first().json;
const lc = s => String(s || '').toLowerCase();
const SENIOR = /(founder|co-founder|ceo|cto|chief|managing director|president|owner|vp|vice president|director)/i;

return $input.all().map(item => {
  const e = item.json;

  if (e.validation_status !== 'VALIDATED') {
    return { json: { ...e, lead_score: 0, sub_scores: {}, routing_target: 'QUARANTINE', score_reason: e.rejection_reason || 'NOT_VALIDATED' } };
  }

  const dm = e.key_decision_maker || {};

  // Industry (30%): 100 direct match, 50 adjacent tech, 0 mismatch
  const ind = lc(e.industry_sector + ' ' + e.company_description);
  const target = lc(cfg.target_industry);
  const words = target.split(/\s+/).filter(w => w.length > 3);
  const direct = ind.includes(target) || (words.length && words.every(w => ind.includes(w))) || /\bit services\b|software|technology|digital|web development/.test(ind);
  const s_ind = direct ? 100 : (/(tech|data|cloud|ai|automation)/.test(ind) ? 50 : 0);

  // ICP size (20%): 100 matches target, 50 unknown, 0 enterprise or solo
  const size = e.estimated_employee_range;
  let s_icp;
  if (cfg.company_size_range !== 'ALL' && size === cfg.company_size_range) s_icp = 100;
  else if (size === 'UNKNOWN') s_icp = 50;
  else if (size === '501+' || size === '1-10') s_icp = 0;
  else s_icp = 50;

  // Geography (15%): 100 HQ in target, 50 regional office, 0 foreign
  const geo = lc(cfg.target_geography);
  const hq = lc(e.headquarters_location);
  const indiaWords = /india|gujarat|maharashtra|pune|mumbai|bengaluru|bangalore|delhi|hyderabad|chennai|ahmedabad|punjab/;
  let s_geo;
  if (!hq) s_geo = 50;
  else if (hq.includes(geo) || (geo === 'india' && indiaWords.test(hq))) s_geo = 100;
  else if (indiaWords.test(hq)) s_geo = 50;
  else s_geo = 0;

  // Decision maker (15%): 100 supported senior, 50 supported other, 0 none or unsupported
  let s_role = 0;
  if (e.decision_maker_supported) s_role = SENIOR.test(dm.designation || '') ? 100 : 50;

  // Evidence (20%): 100 for 2 or more verified quotes, 50 for one, 0 for none
  const n = e.evidence_count || 0;
  const s_evid = n >= 2 ? 100 : (n === 1 ? 50 : 0);

  const lead_score = Math.round(0.30 * s_ind + 0.20 * s_icp + 0.15 * s_geo + 0.15 * s_role + 0.20 * s_evid);
  const routing_target = lead_score >= cfg.min_lead_score ? 'MASTER' : (lead_score >= 60 ? 'REVIEW' : 'QUARANTINE');

  return { json: { ...e, lead_score, sub_scores: { industry: s_ind, icp: s_icp, geography: s_geo, role: s_role, evidence: s_evid }, routing_target } };
});
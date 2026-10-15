const ROLE_DEFAULTS = {
  B2B_LEAD_GEN: ["Founder", "CEO", "CTO", "Business Development Director"],
  TALENT_RECRUITMENT: ["AI Automation Intern", "AI Engineer Intern"],
  CUSTOM_RESEARCH: ["Founder"]
};
const SIZES = ["1-10", "11-50", "51-200", "201-500", "501+", "ALL"];
const titleCase = s => s.replace(/\s+/g, ' ').trim().split(' ').map(w => w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
const prompt = $('Intake Form').first().json.campaign_prompt;

// 0. Reject empty prompts (ERR_EMPTY_PROMPT)
if (!prompt || !String(prompt).trim()) {
  return [{ json: { config_valid: false, config_errors: ['ERR_EMPTY_PROMPT'], source_prompt: prompt || '' } }];
}

// 1. Parse the model output (safe even if the HTTP node failed)
let p;
try {
  const txt = $input.first().json.choices[0].message.content.replace(/```json|```/g, '').trim();
  p = JSON.parse(txt);
} catch (e) {
  return [{ json: { config_valid: false, config_errors: ['ERR_PARSE_FAILED: ' + e.message], source_prompt: prompt } }];
}

const errors = [], clamped = [];

// 2. Category
const category = p.task_category;
if (!ROLE_DEFAULTS[category]) errors.push('ERR_BAD_CATEGORY');

// 3. Bounds (FR-02)
let max = Number.isInteger(p.max_leads_limit) ? p.max_leads_limit : 20;
if (max > 100) { max = 100; clamped.push('max_leads_limit'); }
if (max < 1)   { max = 1;   clamped.push('max_leads_limit'); }
let minScore = Number.isInteger(p.min_lead_score) ? p.min_lead_score : 80;
if (minScore > 100) { minScore = 100; clamped.push('min_lead_score'); }
if (minScore < 1)   { minScore = 1;   clamped.push('min_lead_score'); }

// 4. Defaults + normalization
const industry  = titleCase(p.target_industry  || 'Information Technology Services');
const geography = titleCase(p.target_geography || 'India');
let size = SIZES.includes(p.company_size_range) ? p.company_size_range : 'ALL';
if (category === 'B2B_LEAD_GEN' && size === 'ALL') size = '11-50';
let roles = (p.target_roles || []).map(r => titleCase(String(r))).filter(Boolean);

// Track B: drop persona words (who the person is) so queries use the role sought
const PERSONA = new Set(['student','students','fresher','freshers','candidate','candidates','people','person','developer','developers','intern','interns']);
if (category === 'TALENT_RECRUITMENT') roles = roles.filter(r => !PERSONA.has(r.toLowerCase()));

if (roles.length === 0 && ROLE_DEFAULTS[category]) roles = ROLE_DEFAULTS[category];
const exclusions = [...new Set((p.exclusion_keywords || []).map(x => String(x).trim().toLowerCase()).filter(Boolean))];

// 5. Contradiction check (FR-02)
for (const x of exclusions) {
  if (industry.toLowerCase().includes(x) || roles.some(r => r.toLowerCase().includes(x))) {
    errors.push(`ERR_CONTRADICTION: exclusion "${x}" overlaps target industry/roles`);
  }
}

// 6. Query dorks (FR-03)
const role0 = roles[0] || '';
let compiled = [];
if (category === 'B2B_LEAD_GEN') {
  compiled = [
    `"${industry}" ("IT services" OR "software company") "${geography}" -site:linkedin.com/jobs`,
    `site:clutch.co/profile "${industry}" "${geography}"`
  ];
} else if (category === 'TALENT_RECRUITMENT') {
  compiled = [
    `site:reddit.com (intitle:"looking for" OR intitle:"seeking") "${role0}"`,
    `"seeking ${role0}" ("portfolio" OR "github") -site:linkedin.com/jobs`
  ];
} else {
  compiled = [`"${industry}" "${geography}"`];
}

// 7. Deterministic campaign ID (case- and order-insensitive)
const core = {
  category,
  industry: industry.toLowerCase(),
  geography: geography.toLowerCase(),
  size,
  roles: roles.map(r => r.toLowerCase()).sort(),
  exclusions: [...exclusions].sort(),
  max,
  minScore
};
let h = 5381;
for (const ch of JSON.stringify(core)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
const campaign_id = `CMP-${new Date().getFullYear()}-${h.toString(36).toUpperCase().padStart(4, '0').slice(-4)}`;
if (!/^CMP-[0-9]{4}-[A-Z0-9]{4}$/.test(campaign_id)) errors.push('ERR_BAD_CAMPAIGN_ID');

return [{ json: {
  campaign_id, task_category: category, target_industry: industry, target_geography: geography,
  company_size_range: size, target_roles: roles, exclusion_keywords: exclusions,
  max_leads_limit: max, min_lead_score: minScore, compiled_queries: compiled,
  clamped_fields: clamped, config_valid: errors.length === 0, config_errors: errors,
  source_prompt: prompt, created_at: new Date().toISOString()
} }];
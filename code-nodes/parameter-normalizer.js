const ROLE_DEFAULTS = {
  B2B_LEAD_GEN: ["Founder", "CEO", "CTO", "Business Development Director"],
  TALENT_RECRUITMENT: ["AI Automation Intern", "AI Engineer Intern"],
  CUSTOM_RESEARCH: ["Founder"]
};

const SIZES = ["1-10", "11-50", "51-200", "201-500", "501+", "ALL"];

const titleCase = (value) =>
  String(value)
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");

const prompt = $("Intake Form").first().json.campaign_prompt;

// 0. Reject empty prompts (ERR_EMPTY_PROMPT)
if (!prompt || !String(prompt).trim()) {
  return [
    {
      json: {
        config_valid: false,
        config_errors: ["ERR_EMPTY_PROMPT"],
        source_prompt: prompt || ""
      }
    }
  ];
}

// 1. Parse model output safely
let p;

try {
  const content = $input.first()?.json?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Missing or empty model response content");
  }

  const txt = content
    .replace(/```(?:json)?/gi, "")
    .trim();

  p = JSON.parse(txt);

  if (!p || typeof p !== "object" || Array.isArray(p)) {
    throw new Error("Model response must be a JSON object");
  }
} catch (e) {
  return [
    {
      json: {
        config_valid: false,
        config_errors: ["ERR_PARSE_FAILED: " + e.message],
        source_prompt: prompt
      }
    }
  ];
}

const errors = [];
const clamped = [];

// 2. Validate category
const category = p.task_category;

if (!Object.prototype.hasOwnProperty.call(ROLE_DEFAULTS, category)) {
  errors.push("ERR_BAD_CATEGORY");
}

// 3. Validate and clamp bounds (FR-02)
let max = Number.isInteger(p.max_leads_limit)
  ? p.max_leads_limit
  : 20;

if (max > 100) {
  max = 100;
  clamped.push("max_leads_limit");
}

if (max < 1) {
  max = 1;
  clamped.push("max_leads_limit");
}

let minScore = Number.isInteger(p.min_lead_score)
  ? p.min_lead_score
  : 80;

if (minScore > 100) {
  minScore = 100;
  clamped.push("min_lead_score");
}

if (minScore < 1) {
  minScore = 1;
  clamped.push("min_lead_score");
}

// 4. Apply defaults and normalize values
const industry = titleCase(
  p.target_industry || "Information Technology Services"
);

const geography = titleCase(
  p.target_geography || "India"
);

let size = SIZES.includes(p.company_size_range)
  ? p.company_size_range
  : "ALL";

if (category === "B2B_LEAD_GEN" && size === "ALL") {
  size = "11-50";
}

const rawRoles = Array.isArray(p.target_roles)
  ? p.target_roles
  : [];

let roles = rawRoles
  .map((role) => titleCase(role))
  .filter(Boolean);

// Track B: remove persona-only words for talent recruitment
const PERSONA = new Set([
  "student",
  "students",
  "fresher",
  "freshers",
  "candidate",
  "candidates",
  "people",
  "person",
  "developer",
  "developers",
  "intern",
  "interns"
]);

if (category === "TALENT_RECRUITMENT") {
  roles = roles.filter(
    (role) => !PERSONA.has(role.toLowerCase())
  );
}

// Use category defaults if no valid roles remain
if (roles.length === 0 && ROLE_DEFAULTS[category]) {
  roles = [...ROLE_DEFAULTS[category]];
}

// Normalize exclusion keywords
const rawExclusions = Array.isArray(p.exclusion_keywords)
  ? p.exclusion_keywords
  : [];

const exclusions = [
  ...new Set(
    rawExclusions
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean)
  )
];

// 5. Check contradictions (FR-02)
for (const exclusion of exclusions) {
  const industryConflict = industry
    .toLowerCase()
    .includes(exclusion);

  const roleConflict = roles.some((role) =>
    role.toLowerCase().includes(exclusion)
  );

  if (industryConflict || roleConflict) {
    errors.push(
      `ERR_CONTRADICTION: exclusion "${exclusion}" overlaps target industry/roles`
    );
  }
}

// 6. Compile search queries (FR-03)
let compiled = [];

if (category === "B2B_LEAD_GEN") {
  compiled = [
    `"web development agency" ${geography} founder -site:linkedin.com -site:naukri.com -site:clutch.co`,
    `"software development company" ${geography} "our team" founder -site:linkedin.com -site:clutch.co`
  ];
} else if (category === "TALENT_RECRUITMENT") {
  // Candidate-intent phrasing; role filtering occurs during extraction/scoring.
  compiled = [
    `site:reddit.com (intitle:"looking for internship" OR intitle:"seeking internship" OR intitle:"open to work" OR intitle:"for hire" OR intitle:"my portfolio") (AI OR automation OR n8n OR "machine learning")`
  ];
} else {
  compiled = [
    `"${industry}" "${geography}"`
  ];
}

// 7. Generate deterministic campaign ID
// Case- and role-order-insensitive
const core = {
  category,
  industry: industry.toLowerCase(),
  geography: geography.toLowerCase(),
  size,
  roles: roles.map((role) => role.toLowerCase()).sort(),
  exclusions: [...exclusions].sort(),
  max,
  minScore
};

let h = 5381;

for (const ch of JSON.stringify(core)) {
  h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
}

const campaign_id =
  `CMP-${new Date().getFullYear()}-${h
    .toString(36)
    .toUpperCase()
    .padStart(4, "0")
    .slice(-4)}`;

if (!/^CMP-[0-9]{4}-[A-Z0-9]{4}$/.test(campaign_id)) {
  errors.push("ERR_BAD_CAMPAIGN_ID");
}

// 8. Return normalized campaign configuration
return [
  {
    json: {
      campaign_id,
      task_category: category,
      target_industry: industry,
      target_geography: geography,
      company_size_range: size,
      target_roles: roles,
      exclusion_keywords: exclusions,
      max_leads_limit: max,
      min_lead_score: minScore,
      compiled_queries: compiled,
      clamped_fields: [...new Set(clamped)],
      config_valid: errors.length === 0,
      config_errors: errors,
      source_prompt: prompt,
      created_at: new Date().toISOString()
    }
  }
];
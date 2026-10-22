const staticData = $getWorkflowStaticData('global');
staticData.seen = staticData.seen || {};

// Hash: try SHA-256, fall back to a deterministic pure-JS hash
function hashOf(s) {
  try {
    const c = require('crypto');
    return 'sha256:' + c.createHash('sha256').update(s).digest('hex').slice(0, 32);
  } catch (e) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'h64:' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
}

// Normalize: lowercase, strip www, strip common subdomains and country-level duplicates
function canonicalDomain(d) {
  let x = String(d || '').toLowerCase().trim().replace(/^www\./, '');
  x = x.replace(/^(m|mobile|portal|app|web|en|in)\./, '');
  return x;
}

const batchSeen = new Set();
return $input.all().map(item => {
  const e = item.json;
  const domain = canonicalDomain(e.normalized_domain);
  if (!domain) return { json: { ...e, dedup_status: 'NO_DOMAIN' } };
  const key = hashOf(domain);
  const emailKey = e.verified_email ? hashOf(String(e.verified_email).toLowerCase()) : null;

  const dupInRun = batchSeen.has(key);
  const dupAcross = !!staticData.seen[key];
  batchSeen.add(key);

  if (dupInRun || dupAcross) {
    return { json: { ...e, domain_hash: key, dedup_status: dupAcross ? 'DUPLICATE_PREVIOUS_RUN' : 'DUPLICATE_IN_RUN', routing_target: 'DUPLICATE', first_seen_at: staticData.seen[key] || null } };
  }
  // Register only leads that will be stored (not quarantine vetoes with no value)
  staticData.seen[key] = new Date().toISOString();
  return { json: { ...e, domain_hash: key, email_hash: emailKey, normalized_domain: domain, dedup_status: 'NEW' } };
});
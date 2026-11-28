const RESERVED_HOSTNAMES = new Set([
  'epicglobal.app',
  'www.epicglobal.app',
  'api.epicglobal.app'
]);

function isValidProjectDomain(domain) {
  return typeof domain === 'string'
    && domain.length <= 253
    && domain.includes('.')
    && domain.split('.').every((label) =>
      label.length > 0
      && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
    );
}

function normalizeProjectDomainSettings(projectName, domainInput, aliasesInput, existingAliases = []) {
  if (typeof domainInput !== 'string') {
    return { error: 'Domain must be a hostname or an empty string to remove it.' };
  }

  const domain = domainInput.trim().toLowerCase();
  if (domain && !isValidProjectDomain(domain)) {
    return { error: 'Enter a valid hostname without https://, a port, or a path.' };
  }
  if (domain && (
    RESERVED_HOSTNAMES.has(domain)
    || domain === `${projectName}.epicglobal.app`
  )) {
    return { error: 'Use a custom hostname, not a reserved EpicGlobal hostname.' };
  }

  const aliases = aliasesInput === undefined
    ? (domain ? existingAliases : [])
    : aliasesInput;
  if (!Array.isArray(aliases)) {
    return { error: 'Additional hostnames must be provided as a list.' };
  }

  const normalizedAliases = [];
  const seenAliases = new Set(domain ? [domain] : []);
  for (const aliasInput of aliases) {
    if (typeof aliasInput !== 'string') {
      return { error: 'Each additional hostname must be a string.' };
    }

    const alias = aliasInput.trim().toLowerCase();
    if (!alias) continue;
    if (!isValidProjectDomain(alias)) {
      return { error: `Enter a valid hostname for "${alias}".` };
    }
    if (RESERVED_HOSTNAMES.has(alias) || alias === `${projectName}.epicglobal.app`) {
      return { error: `"${alias}" is a reserved EpicGlobal hostname.` };
    }
    if (!seenAliases.has(alias)) {
      seenAliases.add(alias);
      normalizedAliases.push(alias);
    }
  }

  return { domain: domain || null, aliases: normalizedAliases };
}

function hasProjectDomainConflict(projectName, domains, projects) {
  const requested = new Set(domains.map((domain) => domain.toLowerCase()));
  return Object.entries(projects).some(([name, project]) => {
    if (name === projectName) return false;
    const existing = [
      `${name}.epicglobal.app`,
      project.domain,
      ...(Array.isArray(project.domainAliases) ? project.domainAliases : [])
    ].filter((domain) => typeof domain === 'string');
    return existing.some((domain) => requested.has(domain.toLowerCase()));
  });
}

function getProjectHostnames(projectName, project) {
  const hosts = new Set([`${projectName}.epicglobal.app`]);
  if (typeof project.domain === 'string' && project.domain) hosts.add(project.domain);
  if (Array.isArray(project.domainAliases)) {
    project.domainAliases.forEach((alias) => {
      if (typeof alias === 'string' && alias) hosts.add(alias);
    });
  }
  return [...hosts];
}

module.exports = {
  getProjectHostnames,
  hasProjectDomainConflict,
  isValidProjectDomain,
  normalizeProjectDomainSettings
};

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getProjectHostnames,
  hasProjectDomainConflict,
  normalizeProjectDomainSettings
} = require('../project-domains');

test('normalizes and deduplicates custom hostnames while retaining the primary domain', () => {
  const result = normalizeProjectDomainSettings(
    'library',
    ' PJDL.NET ',
    [' www.pjdl.net ', 'PJDL.NET', 'www.pjdl.net']
  );

  assert.deepEqual(result, {
    domain: 'pjdl.net',
    aliases: ['www.pjdl.net']
  });
  assert.deepEqual(getProjectHostnames('library', {
    ...result,
    domainAliases: result.aliases
  }), ['library.epicglobal.app', 'pjdl.net', 'www.pjdl.net']);
});

test('preserves aliases for older primary-domain updates and clears them when removing the domain', () => {
  assert.deepEqual(
    normalizeProjectDomainSettings('library', 'new.example.com', undefined, ['www.example.com']),
    { domain: 'new.example.com', aliases: ['www.example.com'] }
  );
  assert.deepEqual(
    normalizeProjectDomainSettings('library', '', undefined, ['www.example.com']),
    { domain: null, aliases: [] }
  );
});

test('rejects invalid and reserved hostnames', () => {
  assert.equal(
    normalizeProjectDomainSettings('library', 'https://pjdl.net', [] ).error,
    'Enter a valid hostname without https://, a port, or a path.'
  );
  assert.match(
    normalizeProjectDomainSettings('library', 'pjdl.net', ['api.epicglobal.app']).error,
    /reserved EpicGlobal hostname/
  );
});

test('detects collisions with another project hostname, primary domain, or alias', () => {
  const projects = {
    library: { domain: 'pjdl.net', domainAliases: ['www.pjdl.net'] },
    shop: { domain: 'shop.example.com', domainAliases: ['store.example.com'] }
  };

  assert.equal(hasProjectDomainConflict('library', ['shop.epicglobal.app'], projects), true);
  assert.equal(hasProjectDomainConflict('library', ['shop.example.com'], projects), true);
  assert.equal(hasProjectDomainConflict('library', ['store.example.com'], projects), true);
  assert.equal(hasProjectDomainConflict('library', ['pjdl.net', 'www.pjdl.net'], projects), false);
});

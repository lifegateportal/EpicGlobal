const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { collectSiteAnalytics, getAnalyticsLogFilename } = require('../site-analytics');

const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'epicglobal-analytics-'));
after(() => fs.rmSync(logDirectory, { recursive: true, force: true }));

function logRecord({ timestamp, host, ip, uri = '/', method = 'GET', status = 200 }) {
  return JSON.stringify({
    ts: timestamp / 1000,
    status,
    request: { host, remote_ip: ip, uri, method }
  });
}

function writeLog(projectName, host, records) {
  const filename = getAnalyticsLogFilename(projectName, host);
  fs.writeFileSync(
    path.join(logDirectory, filename),
    `${records.join('\n')}\n`
  );
}

test('aggregates unique visitors and pageviews by project and date', async () => {
  const now = new Date('2026-11-28T12:00:00Z').getTime();
  const previousDay = now - 24 * 60 * 60 * 1000;
  writeLog('alpha', 'alpha.epicglobal.app', [
    logRecord({ timestamp: now, host: 'alpha.epicglobal.app', ip: '203.0.113.1' }),
    logRecord({ timestamp: now, host: 'alpha.epicglobal.app', ip: '203.0.113.1', uri: '/about.html' }),
    logRecord({ timestamp: now, host: 'alpha.epicglobal.app', ip: '203.0.113.2', uri: '/assets/app.js' }),
    logRecord({ timestamp: now, host: 'alpha.epicglobal.app', ip: '203.0.113.3', uri: '/api/status' }),
    logRecord({ timestamp: now, host: 'alpha.epicglobal.app', ip: '203.0.113.4', status: 404 }),
    logRecord({ timestamp: previousDay, host: 'alpha.epicglobal.app', ip: '203.0.113.5' })
  ]);
  writeLog('beta', 'shop.example.com', [
    logRecord({ timestamp: now, host: 'shop.example.com', ip: '203.0.113.1' }),
    logRecord({ timestamp: now, host: 'shop.example.com', ip: '203.0.113.6' })
  ]);

  const result = await collectSiteAnalytics(logDirectory, [
    { name: 'alpha', domain: 'alpha.epicglobal.app', hosts: ['alpha.epicglobal.app'] },
    { name: 'beta', domain: 'shop.example.com', hosts: ['beta.epicglobal.app', 'shop.example.com'] }
  ], 2, now);

  assert.deepEqual(result.totals, { visitors: 3, pageviews: 5 });
  assert.deepEqual(result.projects, [
    { name: 'alpha', domain: 'alpha.epicglobal.app', visitors: 2, pageviews: 3 },
    { name: 'beta', domain: 'shop.example.com', visitors: 2, pageviews: 2 }
  ]);
  assert.deepEqual(result.daily.map(({ visitors, pageviews }) => ({ visitors, pageviews })), [
    { visitors: 1, pageviews: 1 },
    { visitors: 2, pageviews: 4 }
  ]);
});

test('returns zero counts when access logs do not exist', async () => {
  const missingDirectory = path.join(logDirectory, 'not-created');
  const result = await collectSiteAnalytics(missingDirectory, [
    { name: 'new-site', hosts: ['new-site.epicglobal.app'] }
  ], 1, new Date('2026-11-28T12:00:00Z'));

  assert.deepEqual(result.totals, { visitors: 0, pageviews: 0 });
  assert.deepEqual(result.projects, [
    { name: 'new-site', domain: null, visitors: 0, pageviews: 0 }
  ]);
  assert.equal(result.daily[0].date, '2026-11-28');
});

test('generates safe, host-specific log names', () => {
  const expectedHash = crypto.createHash('sha256').update('shop.example.com').digest('hex').slice(0, 16);
  assert.equal(getAnalyticsLogFilename('../Shop', 'SHOP.EXAMPLE.COM'), `shop-${expectedHash}.jsonl`);
});

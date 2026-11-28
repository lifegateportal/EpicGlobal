const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function getAnalyticsLogFilename(projectName, host) {
  const safeProjectName = String(projectName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!safeProjectName) throw new Error('A valid project name is required for analytics logs.');

  const hostHash = crypto.createHash('sha256')
    .update(String(host || '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
  return `${safeProjectName}-${hostHash}.jsonl`;
}

function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
}

function isPageRequest(record) {
  const request = record.request || {};
  if (String(request.method || '').toUpperCase() !== 'GET') return false;
  if (!Number.isInteger(Number(record.status)) || Number(record.status) < 200 || Number(record.status) >= 400) return false;

  const pathname = String(request.uri || '').split('?')[0];
  if (!pathname.startsWith('/') || pathname === '/api' || pathname.startsWith('/api/')) return false;
  return !/\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|ttf|txt|wasm|webm|webp|woff2?)$/i
    .test(pathname.split('/').pop() || '');
}

function getLogFiles(logDirectory, baseFilename, directoryEntries) {
  return directoryEntries
    .filter((entry) => entry.isFile() && (
      entry.name === baseFilename
      || entry.name.startsWith(`${baseFilename}-`)
    ))
    .map((entry) => path.join(logDirectory, entry.name));
}

async function collectSiteAnalytics(logDirectory, projects, days = 30, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs) || !Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error('Invalid analytics range or timestamp.');
  }

  const today = new Date(nowMs);
  today.setUTCHours(0, 0, 0, 0);
  const firstDay = new Date(today);
  firstDay.setUTCDate(firstDay.getUTCDate() - days + 1);
  const startMs = firstDay.getTime();

  const daily = new Map();
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(firstDay);
    date.setUTCDate(date.getUTCDate() + offset);
    daily.set(date.toISOString().slice(0, 10), { visitors: new Set(), pageviews: 0 });
  }

  let directoryEntries = [];
  try {
    directoryEntries = await fs.promises.readdir(logDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const allVisitors = new Set();
  let totalPageviews = 0;
  const projectResults = [];

  for (const project of projects) {
    const projectVisitors = new Set();
    let projectPageviews = 0;
    const hosts = new Set((project.hosts || []).map(normalizeHost).filter(Boolean));
    const logFiles = new Set();

    for (const host of hosts) {
      const baseFilename = getAnalyticsLogFilename(project.name, host);
      const files = getLogFiles(logDirectory, baseFilename, directoryEntries);
      files.forEach((file) => logFiles.add(file));
    }

    for (const file of logFiles) {
      const lines = readline.createInterface({
        input: fs.createReadStream(file),
        crlfDelay: Infinity
      });

      for await (const line of lines) {
        if (!line.trim()) continue;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          throw new Error(`Invalid JSON in analytics log ${path.basename(file)}.`);
        }

        const timestamp = Number(record.ts) * 1000;
        if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > nowMs) continue;

        const request = record.request || {};
        if (!hosts.has(normalizeHost(request.host)) || !isPageRequest(record)) continue;

        const date = new Date(timestamp).toISOString().slice(0, 10);
        const day = daily.get(date);
        if (!day) continue;

        projectPageviews += 1;
        totalPageviews += 1;
        day.pageviews += 1;

        const remoteIp = String(request.remote_ip || '').trim();
        if (remoteIp) {
          projectVisitors.add(remoteIp);
          allVisitors.add(remoteIp);
          day.visitors.add(remoteIp);
        }
      }
    }

    projectResults.push({
      name: project.name,
      domain: project.domain || null,
      visitors: projectVisitors.size,
      pageviews: projectPageviews
    });
  }

  return {
    totals: { visitors: allVisitors.size, pageviews: totalPageviews },
    daily: [...daily.entries()].map(([date, counts]) => ({
      date,
      visitors: counts.visitors.size,
      pageviews: counts.pageviews
    })),
    projects: projectResults
  };
}

module.exports = { collectSiteAnalytics, getAnalyticsLogFilename };

// Load .env file if present (must be first).
// override:true ensures stale/empty PM2 env values do not block .env values.
try { require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true }); } catch (e) {}

const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const multer = require('multer');
const unzipper = require('unzipper');

const execPromise = util.promisify(exec);

// ---------------------------------------------------------
// CONFIG
// ---------------------------------------------------------
const DEPLOY_ROOT = '/var/www/epic-deployments';
const REGISTRY_PATH = path.join(process.cwd(), 'projects.json');
const HISTORY_PATH = path.join(process.cwd(), 'deploy-history.json');
const VAULT_PATH = path.join(process.cwd(), 'secrets-vault.json');
const BACKUP_ROOT = path.join(process.cwd(), 'orchestrator-backups');
const CADDYFILE_PATH = '/etc/caddy/Caddyfile';
const PORT = process.env.PORT || 4000;
// Blue-green: candidate port offset - each project's canary runs at port + this value
const CANDIDATE_PORT_OFFSET = 1000;
const DEFAULT_VAULT_MASTER_KEY = 'epicglobal-dev-master-key-change-me';
const GITHUB_CLIENT_ID = (process.env.GITHUB_CLIENT_ID || '').trim();
const GITHUB_CLIENT_SECRET = (process.env.GITHUB_CLIENT_SECRET || '').trim();
const GITHUB_OAUTH_SCOPES = (process.env.GITHUB_OAUTH_SCOPES || 'repo read:user').trim();
const GITHUB_OAUTH_REDIRECT_URI = (process.env.GITHUB_OAUTH_REDIRECT_URI || '').trim();
const GITHUB_TOKEN_COOKIE = 'eg_github_session';
const GITHUB_STATE_TTL_MS = 10 * 60 * 1000;
const GITHUB_SESSION_TTL_SECONDS = 8 * 60 * 60;

// Single-worker deploy queue to prevent overlapping deploys on one VPS.
const deployQueue = [];
let activeDeploy = null;
let latestTelemetry = {
  ram: 0,
  cpu: 0,
  timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false })
};
const githubAuthStates = new Map();

// Real-time deployment logging
const deploymentLogs = new Map(); // deploymentId -> { logs: string[], projectName: string }

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = [
        'http://localhost:5173',
        'https://epicglobal.app',
        'https://www.epicglobal.app',
        'https://api.epicglobal.app'
      ];
      const isGithubPreview = /https:\/\/.*\.app\.github\.dev$/.test(origin);
      const isCloudflarePreview = /https:\/\/.*\.pages\.dev$/.test(origin);
      const isAllowed = allowed.includes(origin) || isGithubPreview || isCloudflarePreview;
      callback(isAllowed ? null : new Error('Origin not allowed by CORS'), isAllowed);
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ---------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:5173',
      'https://epicglobal.app',
      'https://www.epicglobal.app',
      'https://api.epicglobal.app'
    ];
    const isGithubPreview = /https:\/\/.*\.app\.github\.dev$/.test(origin);
    const isCloudflarePreview = /https:\/\/.*\.pages\.dev$/.test(origin);
    const isAllowed = allowed.includes(origin) || isGithubPreview || isCloudflarePreview;
    callback(isAllowed ? null : new Error('Origin not allowed by CORS'), isAllowed);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------
// API KEY PROTECTION
// ---------------------------------------------------------
const ORCHESTRATOR_API_KEY = (process.env.ORCHESTRATOR_API_KEY || '').trim() || (() => {
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    const envPath = path.join(__dirname, '.env');
    fs.appendFileSync(envPath, `\nORCHESTRATOR_API_KEY=${generated}\n`);
    console.warn('⚠️  No ORCHESTRATOR_API_KEY set. Generated and persisted to .env:');
  } catch {
    console.warn('⚠️  No ORCHESTRATOR_API_KEY set. Generated one-time key (could not persist):');
  }
  console.warn('   ORCHESTRATOR_API_KEY=' + generated);
  return generated;
})();

function requireApiKey(req, res, next) {
  const header = req.headers['x-api-key'] || req.headers['authorization'];
  const provided = header ? header.replace(/^Bearer\s+/i, '') : null;
  if (!provided || provided !== ORCHESTRATOR_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: invalid or missing API key.' });
  }
  next();
}

// Protect all orchestrator API routes
app.use('/api/orchestrator', requireApiKey);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    terminalOutput: err.message
  });
});

// ---------------------------------------------------------
// HELPERS: Defense & Normalization
// ---------------------------------------------------------
function quoteForShell(val) {
  return "'" + String(val).replace(/'/g, "'\\''") + "'";
}

function parseCookies(cookieHeader) {
  const cookies = {};
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx <= 0) return;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!key) return;
      cookies[key] = decodeURIComponent(value);
    });
  return cookies;
}

function getGithubSessionSecret() {
  return String(process.env.GITHUB_SESSION_SECRET || process.env.VAULT_MASTER_KEY || DEFAULT_VAULT_MASTER_KEY);
}

function encryptGithubToken(token) {
  const key = crypto.createHash('sha256').update(getGithubSessionSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  })).toString('base64url');
}

function decryptGithubToken(blob) {
  const payload = JSON.parse(Buffer.from(String(blob || ''), 'base64url').toString('utf8'));
  const key = crypto.createHash('sha256').update(getGithubSessionSecret()).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function getGithubTokenFromRequest(req) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const enc = cookies[GITHUB_TOKEN_COOKIE];
    if (!enc) return '';
    return decryptGithubToken(enc);
  } catch {
    return '';
  }
}

function buildGithubSessionCookie(req, encryptedToken, maxAgeSeconds = GITHUB_SESSION_TTL_SECONDS) {
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').toString().toLowerCase();
  const secure = process.env.NODE_ENV === 'production' || forwardedProto === 'https';
  return [
    GITHUB_TOKEN_COOKIE + '=' + encodeURIComponent(encryptedToken),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSeconds,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function clearGithubSessionCookie(req) {
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').toString().toLowerCase();
  const secure = process.env.NODE_ENV === 'production' || forwardedProto === 'https';
  return [
    GITHUB_TOKEN_COOKIE + '=;',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function githubOAuthEnabled() {
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && GITHUB_OAUTH_REDIRECT_URI);
}

function sanitizeOAuthReturnTo(value) {
  const fallback = 'https://epicglobal.app';
  if (!value) return fallback;
  try {
    const candidate = new URL(String(value));
    const allowed = new Set([
      'https://epicglobal.app',
      'https://www.epicglobal.app',
      'http://localhost:5173'
    ]);
    if (/^https:\/\/.*\.app\.github\.dev$/i.test(candidate.origin)) return candidate.toString();
    if (/^https:\/\/.*\.pages\.dev$/i.test(candidate.origin)) return candidate.toString();
    if (allowed.has(candidate.origin)) return candidate.toString();
  } catch {
    return fallback;
  }
  return fallback;
}

function buildGitCloneCommand(repoUrl, targetPath, gitToken) {
  if (!gitToken) {
    return 'git clone --depth 1 ' + quoteForShell(repoUrl) + ' ' + quoteForShell(targetPath);
  }
  const authHeaderConfig = 'http.extraHeader=Authorization: Bearer ' + gitToken;
  return 'git -c ' + quoteForShell(authHeaderConfig) + ' clone --depth 1 ' + quoteForShell(repoUrl) + ' ' + quoteForShell(targetPath);
}

function normalizeProjectName(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeDomain(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function getRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { nextPort: 5100, projects: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (e) {
    console.error('Registry parse error:', e);
    return { nextPort: 5100, projects: {} };
  }
}

function saveRegistry(registry) {
  try {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch (e) {
    console.error('Registry save error:', e);
  }
}

function getHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function ensureBackupRoot() {
  if (!fs.existsSync(BACKUP_ROOT)) {
    fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  }
}

function getVaultMasterKey() {
  return String(process.env.VAULT_MASTER_KEY || DEFAULT_VAULT_MASTER_KEY);
}

function getVault() {
  if (!fs.existsSync(VAULT_PATH)) {
    return { projects: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
  } catch (e) {
    console.error('Vault parse error:', e);
    return { projects: {} };
  }
}

function saveVault(vault) {
  try {
    fs.writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2));
  } catch (e) {
    console.error('Vault write error:', e);
  }
}

function encryptSecret(value) {
  const key = crypto.createHash('sha256').update(getVaultMasterKey()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  };
}

function decryptSecret(enc) {
  const key = crypto.createHash('sha256').update(getVaultMasterKey()).digest();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(enc.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(enc.data, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function maskSecret(value) {
  const str = String(value || '');
  if (str.length <= 4) return '****';
  return str.slice(0, 2) + '****' + str.slice(-2);
}

function parseEnvText(envText) {
  const map = {};
  String(envText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .forEach((line) => {
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) map[key] = value;
    });
  return map;
}

function buildEnvText(envMap) {
  return Object.entries(envMap)
    .map(([k, v]) => k + '=' + JSON.stringify(String(v)))
    .join('\n') + '\n';
}

function appendHistory(projectName, status, details) {
  try {
    const history = getHistory();
    history.unshift({
      id: Date.now(),
      projectName: projectName,
      status: status,
      timestamp: new Date().toISOString(),
      details: details
    });
    // Keep last 100 entries
    if (history.length > 100) history.splice(100);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (e) {
    console.error('History write error:', e);
  }
}

function compactLog(logText, limit = 12000) {
  const text = String(logText || '').trim();
  if (!text) return '';
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '\n\n...[truncated]';
}

function buildCaddyConfig(registry) {
  // Static frontend — always present
  let config = 'epicglobal.app {\n' +
    '  root * /var/www/myapp/dist\n' +
    '  file_server\n' +
    '  try_files {path} /index.html\n' +
    '  encode gzip zstd\n' +
    '}\n\n';

  // Orchestrator API — CORS is handled by Express middleware in server.js
  config += 'api.epicglobal.app {\n' +
    '  reverse_proxy localhost:4000\n' +
    '}\n';
  
  Object.entries(registry.projects).forEach(([name, data]) => {
    const hostSet = new Set([name + '.epicglobal.app']);
    if (data.domain) hostSet.add(data.domain);
    const hosts = Array.from(hostSet);

    if (data.deployType === 'static') {
      // Serve static files directly via Caddy (no PM2 process needed)
      const serveDir = data.staticDir || path.join(DEPLOY_ROOT, name);
      hosts.forEach((host) => {
        // file_server natively serves index.html for directory requests
        config += '\n' + host + ' {\n  root * ' + serveDir + '\n  file_server\n}\n';
      });
    } else {
      hosts.forEach((host) => {
        config += '\n' + host + ' {\n  reverse_proxy localhost:' + data.port + '\n}\n';
      });
    }
  });
  
  return config;
}

function getQueueSnapshot() {
  return {
    running: activeDeploy,
    queued: deployQueue.map((item, index) => ({
      id: item.id,
      projectName: item.payload.projectName,
      enqueuedAt: item.enqueuedAt,
      position: index + 1
    })),
    totalQueued: deployQueue.length
  };
}

function emitQueueStatus() {
  io.emit('deploy_queue', getQueueSnapshot());
}

function isProjectBusy(projectName) {
  if (activeDeploy && activeDeploy.projectName === projectName) {
    return true;
  }
  return deployQueue.some((item) => item.payload.projectName === projectName);
}

// ---------------------------------------------------------
// DEPLOYMENT LOGGING: Real-time log capture and streaming
// ---------------------------------------------------------

function initDeploymentLog(deploymentId, projectName) {
  deploymentLogs.set(deploymentId, {
    projectName,
    logs: []
  });
}

function addDeploymentLog(deploymentId, message) {
  if (!deploymentLogs.has(deploymentId)) {
    console.warn('Deployment log buffer not found:', deploymentId);
    return;
  }
  
  const entry = deploymentLogs.get(deploymentId);
  entry.logs.push(message);
  
  // Emit to all connected clients
  if (io) {
    io.emit('deployment_log', {
      deploymentId,
      projectName: entry.projectName,
      message,
      timestamp: new Date().toISOString()
    });
  }
}

function getDeploymentLog(deploymentId) {
  const entry = deploymentLogs.get(deploymentId);
  return entry ? entry.logs.join('\n') : '';
}

function clearDeploymentLog(deploymentId) {
  deploymentLogs.delete(deploymentId);
}

function enqueueDeploy(payload) {
  const item = {
    id: Date.now().toString() + '-' + Math.random().toString(16).slice(2, 8),
    payload,
    enqueuedAt: new Date().toISOString(),
    resolve: null,
    reject: null
  };
  
  const promise = new Promise((resolve, reject) => {
    item.resolve = resolve;
    item.reject = reject;
  });
  
  deployQueue.push(item);
  emitQueueStatus();
  processDeployQueue();
  
  // Return immediately with deployment ID and a promise for the result
  return {
    deploymentId: item.id,
    promise
  };
}

async function processDeployQueue() {
  if (activeDeploy || deployQueue.length === 0) {
    return;
  }

  const next = deployQueue.shift();
  activeDeploy = {
    id: next.id,
    projectName: next.payload.projectName,
    startedAt: new Date().toISOString()
  };
  
  // Initialize deployment log buffer
  initDeploymentLog(next.id, next.payload.projectName);
  addDeploymentLog(next.id, `Starting deployment for: ${next.payload.projectName}`);
  
  emitQueueStatus();

  try {
    const result = await executeOrchestratorDeploy(next.payload, next.id);
    addDeploymentLog(next.id, '✓ Deployment completed successfully');
    next.resolve(result);
  } catch (error) {
    addDeploymentLog(next.id, `✗ Deployment failed: ${error.message || JSON.stringify(error)}`);
    next.reject(error);
  } finally {
    activeDeploy = null;
    emitQueueStatus();
    // Keep logs for 1 hour then clean up
    setTimeout(() => clearDeploymentLog(next.id), 60 * 60 * 1000);
    processDeployQueue();
  }
}

// ---------------------------------------------------------
// BLUE-GREEN HELPERS
// ---------------------------------------------------------

// Probe a local port until it responds 200 or retries exhausted.
// Returns true if healthy, false if not.
async function probeHealth(port, retries, delayMs) {
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:' + port + '/', (res) => {
          if (res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error('status ' + res.statusCode));
          }
          res.resume();
        });
        req.on('error', reject);
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch (e) {
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  return false;
}

// Build and start a candidate PM2 process for a project.
// Returns { stdout, stderr, candidateName, candidatePath }.
async function buildCandidate(projectName, repoUrl, candidatePort, gitToken, deploymentId) {
  const candidateName = projectName + '-candidate';
  const candidatePath = path.join(DEPLOY_ROOT, candidateName);

  if (deploymentId) addDeploymentLog(deploymentId, `  → npm install, build, and PM2 start...`);

  const cmd = 'mkdir -p ' + quoteForShell(DEPLOY_ROOT) +
    ' && rm -rf ' + quoteForShell(candidatePath) +
    ' && ' + buildGitCloneCommand(repoUrl, candidatePath, gitToken) +
    ' && cd ' + quoteForShell(candidatePath) +
    ' && npm install --no-audit --no-fund' +
    ' && npm run build --if-present' +
    ' && pm2 delete ' + quoteForShell(candidateName) + ' || true' +
    ' && if [ -d dist ]; then pm2 start ' + quoteForShell('npx serve -s dist -l ' + candidatePort) + ' --name ' + quoteForShell(candidateName) + ' --cwd ' + quoteForShell(candidatePath) +
    '; elif [ -d build ]; then pm2 start ' + quoteForShell('npx serve -s build -l ' + candidatePort) + ' --name ' + quoteForShell(candidateName) + ' --cwd ' + quoteForShell(candidatePath) +
    '; else pm2 start ' + quoteForShell('npx serve -s . -l ' + candidatePort) + ' --name ' + quoteForShell(candidateName) + ' --cwd ' + quoteForShell(candidatePath) + '; fi' +
    ' && chmod -R 755 ' + quoteForShell(DEPLOY_ROOT);

  try {
    const { stdout, stderr } = await execPromise(cmd);
    return { stdout, stderr, candidateName, candidatePath };
  } catch (error) {
    if (deploymentId && error.stderr) {
      addDeploymentLog(deploymentId, `Build error output:\n${error.stderr}`);
    }
    throw error;
  }
}

// Promote candidate: stop old PM2 app, move files, restart under stable name.
async function promoteCandidate(projectName, candidateName, candidatePath, stablePort) {
  const stablePath = path.join(DEPLOY_ROOT, projectName);

  // Stop old stable and delete its PM2 entry
  try { await execPromise('pm2 delete ' + quoteForShell(projectName)); } catch (e) {}
  try { await execPromise('rm -rf ' + quoteForShell(stablePath)); } catch (e) {}

  // Rename candidate path to stable
  await execPromise('mv ' + quoteForShell(candidatePath) + ' ' + quoteForShell(stablePath));

  // Stop candidate PM2 entry and start stable
  try { await execPromise('pm2 delete ' + quoteForShell(candidateName)); } catch (e) {}

  const cmd = 'if [ -d ' + quoteForShell(stablePath + '/dist') + ' ]; then pm2 start ' + quoteForShell('npx serve -s dist -l ' + stablePort) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(stablePath) +
    '; elif [ -d ' + quoteForShell(stablePath + '/build') + ' ]; then pm2 start ' + quoteForShell('npx serve -s build -l ' + stablePort) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(stablePath) +
    '; else pm2 start ' + quoteForShell('npx serve -s . -l ' + stablePort) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(stablePath) + '; fi';
  await execPromise(cmd);
  await execPromise('pm2 save');
}

// Tear down candidate after a failed health check.
async function rollbackCandidate(candidateName, candidatePath) {
  try { await execPromise('pm2 delete ' + quoteForShell(candidateName)); } catch (e) {}
  try { await execPromise('rm -rf ' + quoteForShell(candidatePath)); } catch (e) {}
}

// ---------------------------------------------------------
// DEPLOY LOGIC: First deploy (no existing project)
// ---------------------------------------------------------
async function executeFirstDeploy(projectName, repoUrl, domain, port, gitToken, deploymentId) {
  const deployPath = path.join(DEPLOY_ROOT, projectName);

  if (deploymentId) addDeploymentLog(deploymentId, `  → cloning git repository...`);

  const cmd = 'mkdir -p ' + quoteForShell(DEPLOY_ROOT) +
    ' && rm -rf ' + quoteForShell(deployPath) +
    ' && ' + buildGitCloneCommand(repoUrl, deployPath, gitToken) +
    ' && cd ' + quoteForShell(deployPath) +
    ' && npm install --no-audit --no-fund' +
    ' && npm run build --if-present' +
    ' && pm2 delete ' + quoteForShell(projectName) + ' || true' +
    ' && if [ -d dist ]; then pm2 start ' + quoteForShell('npx serve -s dist -l ' + port) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(deployPath) +
    '; elif [ -d build ]; then pm2 start ' + quoteForShell('npx serve -s build -l ' + port) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(deployPath) +
    '; else pm2 start ' + quoteForShell('npx serve -s . -l ' + port) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(deployPath) + '; fi' +
    ' && pm2 save' +
    ' && chmod -R 755 ' + quoteForShell(DEPLOY_ROOT);

  try {
    const { stdout, stderr } = await execPromise(cmd);
    const fullOutput = [stdout, stderr].filter(Boolean).join('\n').trim();
    if (deploymentId) addDeploymentLog(deploymentId, fullOutput);
    return fullOutput;
  } catch (error) {
    if (deploymentId && error.stderr) {
      addDeploymentLog(deploymentId, `First deploy error:\n${error.stderr}`);
    }
    throw error;
  }
}

async function executeOrchestratorDeploy(payload, deploymentId) {
  const repoUrl = payload.repoUrl;
  const projectName = payload.projectName;
  const domain = payload.domain;
  const gitToken = payload.gitToken || '';

  addDeploymentLog(deploymentId, `Project: ${projectName}`);
  addDeploymentLog(deploymentId, `Repository: ${repoUrl}`);
  addDeploymentLog(deploymentId, `Domain: ${domain || projectName + '.epicglobal.app'}`);

  const registry = getRegistry();
  const existingProject = registry.projects[projectName];
  const port = existingProject ? existingProject.port : registry.nextPort;

  if (!existingProject) {
    registry.nextPort += 1;
  }

  registry.projects[projectName] = {
    port: port,
    repoUrl: repoUrl,
    domain: domain || existingProject?.domain || undefined
  };
  saveRegistry(registry);

  const url = domain ? 'https://' + domain : 'https://' + projectName + '.epicglobal.app';

  try {
    let output = '';
    
    addDeploymentLog(deploymentId, `Target port: ${port}`);

    if (existingProject) {
      addDeploymentLog(deploymentId, '\n=== BLUE-GREEN UPDATE ===');
      // ---- BLUE-GREEN PATH (project already exists) ----
      const candidatePort = port + CANDIDATE_PORT_OFFSET;
      const logPrefix = '[blue-green] ' + projectName + ' candidate on port ' + candidatePort + ' -> ';

      addDeploymentLog(deploymentId, `Building candidate on port ${candidatePort}...`);

      let buildResult;
      try {
        buildResult = await buildCandidate(projectName, repoUrl, candidatePort, gitToken, deploymentId);
      } catch (buildError) {
        const errOut = [buildError.stdout, buildError.stderr, buildError.message].filter(Boolean).join('\n').trim();
        addDeploymentLog(deploymentId, `✗ Build failed: ${errOut}`);
        appendHistory(projectName, 'failed', {
          error: errOut,
          repoUrl: repoUrl,
          strategy: 'blue-green',
          log: compactLog(errOut)
        });
        throw {
          statusCode: 500,
          body: {
            success: false,
            port: port,
            error: 'Build failed: ' + errOut,
            terminalOutput: errOut
          }
        };
      }

      output = [buildResult.stdout, buildResult.stderr].filter(Boolean).join('\n').trim();
      addDeploymentLog(deploymentId, `Build output:\n${output}`);

      // Health probe — 5 attempts, 3s apart
      addDeploymentLog(deploymentId, `Checking health on port ${candidatePort}...`);
      const healthy = await probeHealth(candidatePort, 5, 3000);

      if (!healthy) {
        await rollbackCandidate(buildResult.candidateName, buildResult.candidatePath);
        const errMsg = logPrefix + 'health check FAILED. Old version kept. No downtime.';
        addDeploymentLog(deploymentId, `✗ ${errMsg}`);
        appendHistory(projectName, 'failed', {
          error: errMsg,
          repoUrl: repoUrl,
          strategy: 'blue-green',
          log: compactLog(output)
        });
        throw {
          statusCode: 502,
          body: {
            success: false,
            port: port,
            error: errMsg,
            terminalOutput: errMsg
          }
        };
      }

      // Promote candidate to stable
      addDeploymentLog(deploymentId, `Health check passed. Promoting to stable...`);
      await promoteCandidate(projectName, buildResult.candidateName, buildResult.candidatePath, port);
      output += '\n' + logPrefix + 'health OK. Promoted to stable.';
      addDeploymentLog(deploymentId, `✓ Promoted to stable on port ${port}`);

    } else {
      addDeploymentLog(deploymentId, '\n=== FIRST DEPLOYMENT ===');
      // ---- FIRST-DEPLOY PATH ----
      addDeploymentLog(deploymentId, `Cloning repository...`);
      output = await executeFirstDeploy(projectName, repoUrl, domain, port, gitToken, deploymentId);
      addDeploymentLog(deploymentId, `Clone and build complete`);

      // Health probe — give the serve process up to 15s to start responding.
      addDeploymentLog(deploymentId, `Checking health on port ${port}...`);
      const healthy = await probeHealth(port, 5, 3000);
      if (!healthy) {
        // PM2 started but serve isn't responding — tear down and fail cleanly.
        try { await execPromise('pm2 delete ' + quoteForShell(projectName)); } catch (_) {}
        try { await execPromise('rm -rf ' + quoteForShell(path.join(DEPLOY_ROOT, projectName))); } catch (_) {}
        const registry2 = getRegistry();
        delete registry2.projects[projectName];
        saveRegistry(registry2);
        const errMsg = 'Process started but did not respond on port ' + port + ' after 15 s.';
        addDeploymentLog(deploymentId, `✗ ${errMsg}`);
        addDeploymentLog(deploymentId, `Check that your project has a build step producing dist/ or build/ with index.html`);
        appendHistory(projectName, 'failed', {
          error: errMsg,
          repoUrl,
          strategy: 'first-deploy',
          log: compactLog(output)
        });
        throw {
          statusCode: 502,
          body: {
            success: false,
            port,
            error: 'The app started but did not respond within 15 s. Check that your project has a build step that produces a servable output (dist/ or build/ folder with index.html), or that the server process binds to the expected port.',
            terminalOutput: output
          }
        };
      }
      output += '\n[health] Service responding on port ' + port + '. Deployment confirmed live.';
      addDeploymentLog(deploymentId, `✓ Service responding on port ${port}`);
    }

    addDeploymentLog(deploymentId, `\nUpdating Caddy configuration...`);
    const finalRegistry = getRegistry();
    fs.writeFileSync(CADDYFILE_PATH, buildCaddyConfig(finalRegistry));
    await execPromise('systemctl reload caddy || sudo systemctl reload caddy');
    addDeploymentLog(deploymentId, `✓ Caddy reloaded`);

    const strategy = existingProject ? 'blue-green' : 'first-deploy';
    addDeploymentLog(deploymentId, `\n✓ Deployment successful!`);
    addDeploymentLog(deploymentId, `Live at: ${url}`);
    appendHistory(projectName, 'success', { port: port, url: url, repoUrl: repoUrl, strategy: strategy });
    sendAlert('deploy', projectName, 'Deployed successfully. Live at ' + url + ' (strategy: ' + strategy + ')', 'success').catch(() => {});

    return {
      success: true,
      port: port,
      url: url,
      terminalOutput: output || 'Deployment finished',
      log: output || 'Deployment finished'
    };
  } catch (error) {
    if (error.statusCode) throw error;
    const errOutput = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').trim();
    addDeploymentLog(deploymentId, `\n✗ Deployment error:\n${errOutput}`);
    appendHistory(projectName, 'failed', { error: errOutput, repoUrl: repoUrl, log: compactLog(errOutput) });
    sendAlert('deploy', projectName, 'Deploy FAILED: ' + (errOutput.slice(0, 200) || 'unknown error'), 'error').catch(() => {});

    throw {
      statusCode: 500,
      body: {
        success: false,
        port: port,
        error: errOutput || 'Deployment failed.',
        terminalOutput: errOutput || 'Deployment failed.'
      }
    };
  }
}

// ---------------------------------------------------------
// TELEMETRY: Real-time Metrics + Health Broadcast
// ---------------------------------------------------------
setInterval(() => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuLoad = os.loadavg()[0] / os.cpus().length;

    latestTelemetry = {
      ram: Math.round((usedMem / totalMem) * 100),
      cpu: Math.min(Math.round(cpuLoad * 100), 100),
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false })
    };

    io.emit('telemetry', latestTelemetry);
  } catch (e) {
    // Silently fail telemetry
  }
}, 2500);

// ---------------------------------------------------------
// API: Telemetry Snapshot (fallback for clients)
// ---------------------------------------------------------
app.get('/api/orchestrator/telemetry', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  res.json({ success: true, telemetry: latestTelemetry });
});

// Health check broadcast every 15s
setInterval(async () => {
  try {
    const { stdout } = await execPromise('pm2 jlist');
    const processes = JSON.parse(stdout || '[]');
    const registry = getRegistry();
    const health = {};
    Object.keys(registry.projects).forEach((name) => {
      const proc = processes.find((p) => p.name === name);
      health[name] = {
        status: proc ? proc.pm2_env.status : 'stopped',
        uptime: proc ? proc.pm2_env.pm_uptime : null,
        restarts: proc ? proc.pm2_env.restart_time : 0,
        memory: proc ? Math.round(proc.monit.memory / 1024 / 1024) : 0,
        cpu: proc ? proc.monit.cpu : 0
      };
    });
    io.emit('project_health', health);
  } catch (e) {
    // PM2 not running or no projects
  }
}, 15000);

// ---------------------------------------------------------
// API: Edge Deployer (Cloudflare Pages)
// ---------------------------------------------------------
app.post('/api/deploy', async (req, res) => {
  const { projectName, githubUser, githubRepo, targetBranch } = req.body;
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const CF_API_TOKEN = process.env.CF_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return res.status(500).json({
      success: false,
      error: 'Missing Cloudflare credentials.'
    });
  }

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/pages/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CF_API_TOKEN
      },
      body: JSON.stringify({
        name: projectName,
        source: {
          type: 'github',
          config: {
            owner: githubUser,
            repo_name: githubRepo,
            production_branch: targetBranch || 'main'
          }
        },
        build_config: {
          build_command: 'npm run build',
          destination_dir: 'dist',
          root_dir: '/'
        }
      })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors[0]?.message || 'Cloudflare API error');
    }

    // Trigger the first build/deployment so the URL isn't blank on first visit.
    let deploymentTriggered = false;
    try {
      const triggerRes = await fetch(
        'https://api.cloudflare.com/client/v4/accounts/' + CF_ACCOUNT_ID + '/pages/projects/' + encodeURIComponent(projectName) + '/deployments',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + CF_API_TOKEN
          }
        }
      );
      const triggerData = await triggerRes.json();
      deploymentTriggered = triggerData.success === true;
    } catch (_) {
      // Non-fatal — GitHub App may not be installed yet; webhook will trigger on next push.
    }

    res.json({
      success: true,
      projectUrl: 'https://' + projectName + '.pages.dev',
      deploymentTriggered,
      details: data.result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to provision Cloudflare deployment.',
      terminalOutput: error.message
    });
  }
});

// ---------------------------------------------------------
// API: Backend Orchestrator (PM2) - Sync-Locked Builds
// ---------------------------------------------------------
app.post('/api/orchestrator/deploy', async (req, res) => {
  const repoUrl = String(req.body?.repoUrl || '').trim();
  const projectName = normalizeProjectName(req.body?.projectName);
  const domain = normalizeDomain(req.body?.domain);
  const accessToken = String(req.body?.accessToken || '').trim();
  const sessionGithubToken = getGithubTokenFromRequest(req);
  const gitToken = accessToken || sessionGithubToken;

  if (!projectName) {
    return res.status(400).json({
      success: false,
      error: 'A valid project name is required.'
    });
  }

  if (!repoUrl) {
    return res.status(400).json({
      success: false,
      error: 'A repository URL is required.'
    });
  }

  if (!validateUrl(repoUrl)) {
    return res.status(400).json({
      success: false,
      error: 'The repository URL must be a valid HTTP(S) URL.'
    });
  }

  const isGithubRepo = /^https:\/\/github\.com\/.+/i.test(repoUrl);
  if (!isGithubRepo && gitToken) {
    return res.status(400).json({
      success: false,
      error: 'GitHub token auth can only be used with github.com repository URLs.'
    });
  }

  if (isProjectBusy(projectName)) {
    return res.status(409).json({
      success: false,
      error: 'This project already has a running or queued deployment.'
    });
  }

  try {
    const { deploymentId, promise } = await enqueueDeploy({ projectName, repoUrl, domain, gitToken });
    
    // Return immediately with deployment ID so frontend can track logs in real-time
    // The result will be available via the promise and can be polled or caught via events
    res.json({
      success: true,
      deploymentId,
      queued: true,
      message: 'Deployment queued. Monitor logs with deployment ID: ' + deploymentId
    });
    
    // Handle the result in the background
    try {
      const result = await promise;
      // Could emit this via Socket.IO if needed
    } catch (err) {
      // Promise rejected, but client already got deploymentId to track logs
    }
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const body = error?.body || {
      success: false,
      error: error?.message || 'Deployment failed.',
      terminalOutput: error?.message || 'Deployment failed.'
    };
    return res.status(statusCode).json(body);
  }
});

// ---------------------------------------------------------
// API: GitHub OAuth (for private repo deploy ergonomics)
// ---------------------------------------------------------
app.get('/api/auth/github/config', (req, res) => {
  res.json({
    success: true,
    enabled: githubOAuthEnabled(),
    scopes: GITHUB_OAUTH_SCOPES
  });
});

app.get('/api/auth/github/login', (req, res) => {
  if (!githubOAuthEnabled()) {
    return res.status(503).json({
      success: false,
      error: 'GitHub OAuth is not configured on this server.'
    });
  }

  const state = crypto.randomBytes(24).toString('hex');
  const returnTo = sanitizeOAuthReturnTo(String(req.query.returnTo || req.headers.origin || 'https://epicglobal.app'));
  githubAuthStates.set(state, { returnTo, expiresAt: Date.now() + GITHUB_STATE_TTL_MS });

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GITHUB_OAUTH_REDIRECT_URI);
  authUrl.searchParams.set('scope', GITHUB_OAUTH_SCOPES);
  authUrl.searchParams.set('state', state);

  return res.redirect(authUrl.toString());
});

app.get('/api/auth/github/callback', async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const stateData = githubAuthStates.get(state);
  githubAuthStates.delete(state);

  if (!stateData || stateData.expiresAt < Date.now()) {
    return res.status(400).send('Invalid or expired GitHub OAuth state.');
  }

  if (!code || !githubOAuthEnabled()) {
    return res.status(400).send('Missing OAuth code or GitHub OAuth is not configured.');
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: GITHUB_OAUTH_REDIRECT_URI,
        state: state
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(401).send('GitHub token exchange failed.');
    }

    const cookieValue = encryptGithubToken(tokenData.access_token);
    res.setHeader('Set-Cookie', buildGithubSessionCookie(req, cookieValue));
    return res.redirect(stateData.returnTo || 'https://epicglobal.app');
  } catch {
    return res.status(500).send('GitHub OAuth callback failed.');
  }
});

app.get('/api/auth/github/session', async (req, res) => {
  const token = getGithubTokenFromRequest(req);
  if (!token) {
    return res.json({ success: true, authenticated: false, enabled: githubOAuthEnabled() });
  }

  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'epicglobal-orchestrator'
      }
    });

    if (!userRes.ok) {
      res.setHeader('Set-Cookie', clearGithubSessionCookie(req));
      return res.json({ success: true, authenticated: false, enabled: githubOAuthEnabled() });
    }

    const user = await userRes.json();
    return res.json({
      success: true,
      authenticated: true,
      enabled: githubOAuthEnabled(),
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url
      }
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Could not verify GitHub session.' });
  }
});

app.post('/api/auth/github/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearGithubSessionCookie(req));
  return res.json({ success: true, authenticated: false });
});

setInterval(() => {
  const now = Date.now();
  for (const [state, data] of githubAuthStates.entries()) {
    if (data.expiresAt < now) githubAuthStates.delete(state);
  }
}, 60 * 1000);

// ---------------------------------------------------------
// API: Deploy Queue Snapshot
// ---------------------------------------------------------
app.get('/api/orchestrator/queue', (req, res) => {
  res.json({ success: true, queue: getQueueSnapshot() });
});

// ---------------------------------------------------------
// API: Blue-Green Candidate Status
// ---------------------------------------------------------
app.get('/api/orchestrator/candidates', async (req, res) => {
  try {
    let processes = [];
    try {
      const { stdout } = await execPromise('pm2 jlist');
      processes = JSON.parse(stdout || '[]');
    } catch {}

    const candidates = processes
      .filter((p) => p.name && p.name.endsWith('-candidate'))
      .map((p) => ({
        name: p.name,
        port: null,
        status: p.pm2_env.status,
        uptime: p.pm2_env.pm_uptime,
        memory: Math.round(p.monit.memory / 1024 / 1024)
      }));

    res.json({ success: true, candidates: candidates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------
// API: Connect Info (no auth — lets external apps verify endpoint)
// ---------------------------------------------------------
app.get('/api/orchestrator/connect-info', (req, res) => {
  res.json({
    success: true,
    platform: 'EpicGlobal Orchestrator',
    version: 'v3',
    deployEndpoint: '/api/orchestrator/deploy',
    authHeader: 'x-api-key',
    docsUrl: 'https://epicglobal.app'
  });
});

// ---------------------------------------------------------
// API: Project Status (Health + Registry)
// ---------------------------------------------------------
app.get('/api/orchestrator/status', async (req, res) => {
  try {
    const registry = getRegistry();
    let processes = [];

    try {
      const { stdout } = await execPromise('pm2 jlist');
      processes = JSON.parse(stdout || '[]');
    } catch {
      // PM2 not available
    }

    const projects = {};
    Object.entries(registry.projects).forEach(([name, data]) => {
      const proc = processes.find((p) => p.name === name);
      projects[name] = {
        ...data,
        health: {
          status: proc ? proc.pm2_env.status : 'stopped',
          uptime: proc ? proc.pm2_env.pm_uptime : null,
          restarts: proc ? proc.pm2_env.restart_time : 0,
          memory: proc ? Math.round(proc.monit.memory / 1024 / 1024) : 0,
          cpu: proc ? proc.monit.cpu : 0
        }
      };
    });

    res.json({ success: true, projects: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------
// API: Project Delete (Single Project)
// ---------------------------------------------------------
app.post('/api/orchestrator/delete', async (req, res) => {
  if (activeDeploy) {
    return res.status(409).json({
      success: false,
      error: 'Deployment currently running. Wait until queue is idle before deleting.'
    });
  }

  const projectName = normalizeProjectName(req.body?.projectName);

  if (!projectName) {
    return res.status(400).json({ success: false, error: 'Project name is required.' });
  }

  const registry = getRegistry();

  if (!registry.projects[projectName]) {
    return res.status(404).json({ success: false, error: 'Project not found in registry.' });
  }

  const deployPath = path.join(DEPLOY_ROOT, projectName);

  try {
    try { await execPromise('pm2 delete ' + quoteForShell(projectName)); } catch (e) {}
    try { await execPromise('rm -rf ' + quoteForShell(deployPath)); } catch (e) {}

    delete registry.projects[projectName];
    saveRegistry(registry);

    fs.writeFileSync(CADDYFILE_PATH, buildCaddyConfig(registry));
    await execPromise('systemctl reload caddy || sudo systemctl reload caddy');
    await execPromise('pm2 save');

    appendHistory(projectName, 'deleted', {});

    res.json({ success: true, terminalOutput: projectName + ' has been deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, terminalOutput: error.message });
  }
});

// ---------------------------------------------------------
// API: Static File Upload Deploy
// ---------------------------------------------------------
const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/api/orchestrator/upload', uploadMiddleware.single('file'), async (req, res) => {
  try {
    const projectName = normalizeProjectName(req.body?.projectName);
    const domain = normalizeDomain(req.body?.domain || '');

    if (!projectName) {
      return res.status(400).json({ success: false, error: 'projectName is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const projectDir = path.join(DEPLOY_ROOT, projectName);

    // Clear previous deployment
    if (fs.existsSync(projectDir)) {
      await execPromise('rm -rf ' + quoteForShell(projectDir));
    }
    fs.mkdirSync(projectDir, { recursive: true });

    const filename = req.file.originalname.toLowerCase();

    if (filename.endsWith('.zip')) {
      // Extract zip
      await new Promise((resolve, reject) => {
        const { Readable } = require('stream');
        Readable.from(req.file.buffer)
          .pipe(unzipper.Extract({ path: projectDir }))
          .on('close', resolve)
          .on('error', reject);
      });
    } else if (filename.endsWith('.html') || filename.endsWith('.htm')) {
      // Always save as index.html — Caddy needs index.html at root regardless of upload filename
      const writePath = path.join(projectDir, 'index.html');
      fs.writeFileSync(writePath, req.file.buffer);
      // Verify write succeeded and is non-empty
      const written = fs.statSync(writePath);
      if (written.size === 0) {
        return res.status(400).json({ success: false, error: 'File was written but is empty.' });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file type. Upload a .zip or index.html file.'
      });
    }

    // Ensure Caddy (which may run as non-root) can read all uploaded files
    await execPromise('chmod -R 755 ' + quoteForShell(projectDir));

    // If zip extracted a single root folder, serve from inside it
    const entries = fs.readdirSync(projectDir);
    let serveDir = projectDir;
    if (entries.length === 1) {
      const nested = path.join(projectDir, entries[0]);
      if (fs.statSync(nested).isDirectory()) {
        serveDir = nested;
      }
    }

    // Register as static project (no port, no PM2 process)
    const registry = getRegistry();
    registry.projects[projectName] = {
      name: projectName,
      repoUrl: null,
      deployType: 'static',
      domain: domain || null,
      port: null,
      staticDir: serveDir,
      health: { status: 'online', memory: 0, cpu: 0, restarts: 0 },
      deployedAt: new Date().toISOString()
    };
    saveRegistry(registry);

    // Rebuild Caddy config to serve static files directly
    fs.writeFileSync(CADDYFILE_PATH, buildCaddyConfig(registry));
    await execPromise('systemctl reload caddy || sudo systemctl reload caddy');

    const url = domain ? 'https://' + domain : 'https://' + projectName + '.epicglobal.app';
    appendHistory(projectName, 'success', { url, strategy: 'static-upload' });

    res.json({ success: true, url, projectName });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------------------------------------------------------
// API: List Files in Static Project
// ---------------------------------------------------------
app.get('/api/orchestrator/files/:name', (req, res) => {
  try {
    const name = normalizeProjectName(req.params.name);
    const dir = path.join(DEPLOY_ROOT, name);
    if (!fs.existsSync(dir)) return res.status(404).json({ success: false, error: 'Project dir not found.' });
    const files = fs.readdirSync(dir).filter(f => {
      try { return fs.statSync(path.join(dir, f)).isFile(); } catch { return false; }
    });
    res.json({ success: true, files });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------------------------------------------------------
// API: Rename File Inside Static Project
// ---------------------------------------------------------
app.post('/api/orchestrator/rename-file', (req, res) => {
  try {
    const name = normalizeProjectName(req.body?.projectName);
    const oldFile = req.body?.oldFile;
    const newFile = req.body?.newFile;
    if (!name || !oldFile || !newFile) {
      return res.status(400).json({ success: false, error: 'projectName, oldFile, and newFile are required.' });
    }
    // Prevent path traversal
    if (oldFile.includes('/') || oldFile.includes('..') || newFile.includes('/') || newFile.includes('..')) {
      return res.status(400).json({ success: false, error: 'Invalid file name.' });
    }
    const dir = path.join(DEPLOY_ROOT, name);
    const oldPath = path.join(dir, oldFile);
    const newPath = path.join(dir, newFile);
    if (!fs.existsSync(oldPath)) return res.status(404).json({ success: false, error: 'File not found.' });
    if (fs.existsSync(newPath)) return res.status(409).json({ success: false, error: 'A file named "' + newFile + '" already exists.' });
    fs.renameSync(oldPath, newPath);
    res.json({ success: true, newFile });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------------------------------------------------------
// API: Rename Static Project
// ---------------------------------------------------------
app.post('/api/orchestrator/rename', async (req, res) => {
  try {
    const oldName = normalizeProjectName(req.body?.oldName);
    const newName = normalizeProjectName(req.body?.newName);

    if (!oldName || !newName) {
      return res.status(400).json({ success: false, error: 'oldName and newName are required.' });
    }
    if (oldName === newName) {
      return res.status(400).json({ success: false, error: 'New name is the same as old name.' });
    }

    const registry = getRegistry();
    const project = registry.projects[oldName];
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }
    if (project.deployType !== 'static') {
      return res.status(400).json({ success: false, error: 'Rename is only supported for static projects.' });
    }
    if (registry.projects[newName]) {
      return res.status(409).json({ success: false, error: 'A project named "' + newName + '" already exists.' });
    }

    const oldDir = path.join(DEPLOY_ROOT, oldName);
    const newDir = path.join(DEPLOY_ROOT, newName);

    if (fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    }

    registry.projects[newName] = {
      ...project,
      name: newName,
      staticDir: project.staticDir ? project.staticDir.replace(oldDir, newDir) : newDir,
    };
    delete registry.projects[oldName];
    saveRegistry(registry);

    fs.writeFileSync(CADDYFILE_PATH, buildCaddyConfig(registry));
    await execPromise('systemctl reload caddy || sudo systemctl reload caddy');

    appendHistory(newName, 'success', { url: 'https://' + newName + '.epicglobal.app', strategy: 'rename' });

    res.json({ success: true, newName });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------------------------------------------------------
// API: Deployment History
// ---------------------------------------------------------
app.get('/api/orchestrator/history', (req, res) => {
  res.json({ success: true, history: getHistory() });
});

app.delete('/api/orchestrator/history/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'Invalid id.' });
  try {
    const history = getHistory();
    const next = history.filter(e => e.id !== id);
    if (next.length === history.length) {
      return res.status(404).json({ success: false, error: 'Entry not found.' });
    }
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(next, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Could not delete entry.' });
  }
});

// ---------------------------------------------------------
// API: Encrypted Secrets Vault
// ---------------------------------------------------------
app.get('/api/orchestrator/secrets/:projectName', (req, res) => {
  const projectName = normalizeProjectName(req.params.projectName);
  if (!projectName) {
    return res.status(400).json({ success: false, error: 'Valid project name is required.' });
  }

  const vault = getVault();
  const projectVault = vault.projects[projectName] || { updatedAt: null, entries: {} };
  const preview = {};

  Object.entries(projectVault.entries || {}).forEach(([key, encrypted]) => {
    try {
      preview[key] = maskSecret(decryptSecret(encrypted));
    } catch (e) {
      preview[key] = '****';
    }
  });

  res.json({
    success: true,
    projectName: projectName,
    updatedAt: projectVault.updatedAt,
    secrets: preview
  });
});

app.post('/api/orchestrator/secrets/:projectName', (req, res) => {
  const projectName = normalizeProjectName(req.params.projectName);
  const rotate = Boolean(req.body?.rotate);
  const envMap = req.body?.envMap && typeof req.body.envMap === 'object'
    ? req.body.envMap
    : parseEnvText(req.body?.envText);

  if (!projectName) {
    return res.status(400).json({ success: false, error: 'Valid project name is required.' });
  }

  if (!envMap || Object.keys(envMap).length === 0) {
    return res.status(400).json({ success: false, error: 'No secrets provided.' });
  }

  const registry = getRegistry();
  if (!registry.projects[projectName]) {
    return res.status(404).json({ success: false, error: 'Project not found in registry.' });
  }

  const vault = getVault();
  const current = rotate
    ? { updatedAt: null, entries: {} }
    : (vault.projects[projectName] || { updatedAt: null, entries: {} });

  Object.entries(envMap).forEach(([k, v]) => {
    if (!k) return;
    current.entries[k] = encryptSecret(String(v));
  });
  current.updatedAt = new Date().toISOString();

  vault.projects[projectName] = current;
  saveVault(vault);

  return res.json({
    success: true,
    message: rotate ? 'Secrets rotated.' : 'Secrets saved.',
    projectName: projectName,
    totalSecrets: Object.keys(current.entries).length,
    updatedAt: current.updatedAt
  });
});

app.post('/api/orchestrator/secrets/:projectName/apply', async (req, res) => {
  const projectName = normalizeProjectName(req.params.projectName);
  if (!projectName) {
    return res.status(400).json({ success: false, error: 'Valid project name is required.' });
  }

  const registry = getRegistry();
  if (!registry.projects[projectName]) {
    return res.status(404).json({ success: false, error: 'Project not found in registry.' });
  }

  const vault = getVault();
  const projectVault = vault.projects[projectName];

  if (!projectVault || !projectVault.entries || Object.keys(projectVault.entries).length === 0) {
    return res.status(404).json({ success: false, error: 'No stored secrets for this project.' });
  }

  const deployPath = path.join(DEPLOY_ROOT, projectName);
  if (!fs.existsSync(deployPath)) {
    return res.status(404).json({ success: false, error: 'Deployment path not found.' });
  }

  try {
    const envMap = {};
    Object.entries(projectVault.entries).forEach(([k, encrypted]) => {
      envMap[k] = decryptSecret(encrypted);
    });

    // Always write .env so Node.js apps that call dotenv.config() pick it up.
    fs.writeFileSync(path.join(deployPath, '.env'), buildEnvText(envMap));

    // Build a safe shell prefix that exports every var into the child environment.
    // `pm2 restart --update-env` promotes vars from the CALLING PROCESS env into
    // the stored PM2 process config — so we must export them before the call.
    const envExports = Object.entries(envMap)
      .map(([k, v]) => 'export ' + k + '=' + quoteForShell(v))
      .join(' && ');

    // Detect whether any vars are framework public vars that require a full rebuild
    // to be baked into the client bundle (Vite: VITE_*, CRA: REACT_APP_*, Next: NEXT_PUBLIC_*).
    const needsRebuild = Object.keys(envMap).some(
      (k) => k.startsWith('VITE_') || k.startsWith('REACT_APP_') || k.startsWith('NEXT_PUBLIC_')
    );

    const registryEntry = registry.projects[projectName];
    const port = registryEntry ? registryEntry.port : null;
    const hasDist  = fs.existsSync(path.join(deployPath, 'dist'));
    const hasBuild = fs.existsSync(path.join(deployPath, 'build'));
    const hasPackageJson = fs.existsSync(path.join(deployPath, 'package.json'));
    const isStaticFrontend = (hasDist || hasBuild) && hasPackageJson;
    const distDir = hasDist ? 'dist' : (hasBuild ? 'build' : null);

    let cmd;
    let rebuilt = false;

    if (isStaticFrontend && needsRebuild && distDir && port) {
      // Frontend app: must rebuild to bake VITE_/REACT_APP_/NEXT_PUBLIC_ vars into bundle.
      rebuilt = true;
      cmd = 'cd ' + quoteForShell(deployPath) +
        ' && ' + envExports +
        ' && npm run build --if-present' +
        ' && pm2 delete ' + quoteForShell(projectName) + ' || true' +
        ' && ' + envExports +
        ' && pm2 start ' + quoteForShell('npx serve -s ' + distDir + ' -l ' + port) +
        ' --name ' + quoteForShell(projectName) +
        ' --cwd ' + quoteForShell(deployPath) +
        ' && pm2 save';
    } else {
      // Node.js backend app, or static app with server-side-only vars:
      // export vars into shell → pm2 --update-env stores them in the PM2 process config.
      cmd = 'cd ' + quoteForShell(deployPath) +
        ' && ' + envExports +
        ' && pm2 restart ' + quoteForShell(projectName) + ' --update-env' +
        ' && pm2 save';
    }

    const { stdout, stderr } = await execPromise(cmd);
    const log = [stdout, stderr].filter(Boolean).join('\n').trim();

    return res.json({
      success: true,
      message: rebuilt
        ? 'Rebuilt and restarted with ' + Object.keys(envMap).length + ' variable(s) applied.'
        : 'Restarted — ' + Object.keys(envMap).length + ' variable(s) injected via PM2.',
      totalSecrets: Object.keys(envMap).length,
      rebuilt,
      log
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply secrets.',
      terminalOutput: error.message
    });
  }
});

// ---------------------------------------------------------
// API: Backup + Restore
// ---------------------------------------------------------
app.get('/api/orchestrator/backups', (req, res) => {
  try {
    ensureBackupRoot();
    const backupIds = fs.readdirSync(BACKUP_ROOT)
      .filter((name) => fs.statSync(path.join(BACKUP_ROOT, name)).isDirectory())
      .sort((a, b) => b.localeCompare(a));

    const backups = backupIds.map((backupId) => {
      const backupDir = path.join(BACKUP_ROOT, backupId);
      const manifestPath = path.join(backupDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch {}
      }
      return { backupId: backupId, createdAt: null, includeDeployments: false };
    });

    return res.json({ success: true, backups: backups });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to list backups.' });
  }
});

app.post('/api/orchestrator/backups/create', async (req, res) => {
  const includeDeployments = req.body?.includeDeployments !== false;

  if (activeDeploy || deployQueue.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'Cannot create backup while deployments are running or queued.'
    });
  }

  try {
    ensureBackupRoot();
    const backupId = 'backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(BACKUP_ROOT, backupId);
    fs.mkdirSync(backupDir, { recursive: true });

    if (fs.existsSync(REGISTRY_PATH)) fs.copyFileSync(REGISTRY_PATH, path.join(backupDir, 'projects.json'));
    if (fs.existsSync(HISTORY_PATH)) fs.copyFileSync(HISTORY_PATH, path.join(backupDir, 'deploy-history.json'));
    if (fs.existsSync(VAULT_PATH)) fs.copyFileSync(VAULT_PATH, path.join(backupDir, 'secrets-vault.json'));
    if (fs.existsSync(CADDYFILE_PATH)) fs.copyFileSync(CADDYFILE_PATH, path.join(backupDir, 'Caddyfile'));

    if (includeDeployments && fs.existsSync(DEPLOY_ROOT)) {
      await execPromise('cp -a ' + quoteForShell(DEPLOY_ROOT) + ' ' + quoteForShell(path.join(backupDir, 'epic-deployments')));
    }

    const manifest = {
      backupId: backupId,
      createdAt: new Date().toISOString(),
      includeDeployments: includeDeployments,
      files: {
        projects: fs.existsSync(path.join(backupDir, 'projects.json')),
        history: fs.existsSync(path.join(backupDir, 'deploy-history.json')),
        vault: fs.existsSync(path.join(backupDir, 'secrets-vault.json')),
        caddy: fs.existsSync(path.join(backupDir, 'Caddyfile')),
        deployments: fs.existsSync(path.join(backupDir, 'epic-deployments'))
      }
    };

    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    return res.json({ success: true, backup: manifest });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Backup failed.',
      terminalOutput: error.message
    });
  }
});

app.post('/api/orchestrator/backups/restore', async (req, res) => {
  const backupId = String(req.body?.backupId || '').trim();
  const includeDeployments = req.body?.includeDeployments !== false;

  if (!backupId) {
    return res.status(400).json({ success: false, error: 'backupId is required.' });
  }

  if (activeDeploy || deployQueue.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'Cannot restore while deployments are running or queued.'
    });
  }

  const backupDir = path.join(BACKUP_ROOT, backupId);
  if (!fs.existsSync(backupDir)) {
    return res.status(404).json({ success: false, error: 'Backup not found.' });
  }

  try {
    if (fs.existsSync(path.join(backupDir, 'projects.json'))) {
      fs.copyFileSync(path.join(backupDir, 'projects.json'), REGISTRY_PATH);
    }
    if (fs.existsSync(path.join(backupDir, 'deploy-history.json'))) {
      fs.copyFileSync(path.join(backupDir, 'deploy-history.json'), HISTORY_PATH);
    }
    if (fs.existsSync(path.join(backupDir, 'secrets-vault.json'))) {
      fs.copyFileSync(path.join(backupDir, 'secrets-vault.json'), VAULT_PATH);
    }
    if (fs.existsSync(path.join(backupDir, 'Caddyfile'))) {
      fs.copyFileSync(path.join(backupDir, 'Caddyfile'), CADDYFILE_PATH);
    }

    if (includeDeployments && fs.existsSync(path.join(backupDir, 'epic-deployments'))) {
      await execPromise('rm -rf ' + quoteForShell(DEPLOY_ROOT));
      await execPromise('cp -a ' + quoteForShell(path.join(backupDir, 'epic-deployments')) + ' ' + quoteForShell(DEPLOY_ROOT));
    }

    await execPromise('systemctl reload caddy || sudo systemctl reload caddy');
    await execPromise('pm2 save');

    return res.json({
      success: true,
      message: 'Restore completed from ' + backupId + '.',
      includeDeployments: includeDeployments
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Restore failed.',
      terminalOutput: error.message
    });
  }
});

// ---------------------------------------------------------
// API: Alternative Backend Deploy (Home Directory)
// ---------------------------------------------------------
app.post('/api/deploy-backend', async (req, res) => {
  const { projectName, githubUser, githubRepo, targetPort } = req.body;

  if (!projectName || !githubUser || !githubRepo || !targetPort) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: projectName, githubUser, githubRepo, targetPort'
    });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const authString = GITHUB_TOKEN ? GITHUB_TOKEN + '@' : '';
  const repoUrl = 'https://' + authString + 'github.com/' + githubUser + '/' + githubRepo + '.git';
  const deployPath = path.join(os.homedir(), 'deployments', projectName);

  try {
    const deploymentsDir = path.join(os.homedir(), 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    if (fs.existsSync(deployPath)) {
      await execPromise('rm -rf ' + quoteForShell(deployPath));
    }

    await execPromise('git clone --depth 1 ' + quoteForShell(repoUrl) + ' ' + quoteForShell(deployPath));
    await execPromise('cd ' + quoteForShell(deployPath) + ' && npm install --no-audit --no-fund');
    await execPromise('cd ' + quoteForShell(deployPath) + ' && PORT=' + targetPort + ' pm2 start server.js --name ' + quoteForShell(projectName) + ' --update-env');
    await execPromise('pm2 save');

    res.json({
      success: true,
      message: 'Backend successfully deployed.',
      port: targetPort
    });
  } catch (error) {
    console.error('Backend deployment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Backend deployment failed.',
      terminalOutput: error.message
    });
  }
});

// ---------------------------------------------------------
// API: Environment Variables Manager
// ---------------------------------------------------------
app.post('/api/env', async (req, res) => {
  const { projectName, envVars } = req.body;

  if (!projectName || !envVars || typeof envVars !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid projectName or envVars.'
    });
  }

  const deployPath = path.join(os.homedir(), 'deployments', projectName);

  try {
    if (!fs.existsSync(deployPath)) {
      return res.status(404).json({
        success: false,
        error: 'Backend deployment not found.'
      });
    }

    let envString = '';
    Object.entries(envVars).forEach(([key, value]) => {
      envString += key + '=' + JSON.stringify(String(value)) + '\n';
    });

    fs.writeFileSync(path.join(deployPath, '.env'), envString);

    await execPromise('cd ' + quoteForShell(deployPath) + ' && pm2 restart ' + quoteForShell(projectName) + ' --update-env');
    await execPromise('pm2 save');

    res.json({
      success: true,
      message: 'Environment variables injected and backend restarted.'
    });
  } catch (error) {
    console.error('Env update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update environment variables.',
      terminalOutput: error.message
    });
  }
});

// ---------------------------------------------------------
// API: Live Log Streamer
// ---------------------------------------------------------
app.get('/api/logs/:projectName', async (req, res) => {
  const projectName = req.params.projectName;

  if (!projectName || !/^[a-z0-9-]+$/.test(projectName)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid project name.'
    });
  }

  try {
    const { stdout } = await execPromise('pm2 logs ' + quoteForShell(projectName) + ' --nostream --raw --lines 100');
    res.json({
      success: true,
      logs: stdout
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch logs.',
      terminalOutput: error.message
    });
  }
});

// ---------------------------------------------------------
// API: Get deployment logs by deployment ID
// ---------------------------------------------------------
app.get('/api/deployment-logs/:deploymentId', (req, res) => {
  const deploymentId = req.params.deploymentId;
  
  if (!deploymentId) {
    return res.status(400).json({
      success: false,
      error: 'Deployment ID is required.'
    });
  }
  
  const logs = getDeploymentLog(deploymentId);
  res.json({
    success: true,
    deploymentId,
    logs
  });
});

// ---------------------------------------------------------
// HELPER: Reconcile PM2 <-> Registry <-> Caddyfile
// Reads live PM2 process list, finds each process's listening port,
// merges into registry, and rewrites Caddyfile so every project resolves.
// ---------------------------------------------------------
async function reconcileRegistryWithPM2() {
  let processes = [];
  try {
    const { stdout } = await execPromise('pm2 jlist');
    processes = JSON.parse(stdout || '[]');
  } catch (e) {
    return { synced: 0, errors: [e.message] };
  }

  const registry = getRegistry();
  const skipNames = new Set(['epicglobal-api']);
  let synced = 0;
  const errors = [];

  for (const proc of processes) {
    const name = String(proc.name || '').trim();
    if (!name || skipNames.has(name)) continue;

    // Derive port: prefer registry, then parse from PM2 exec args
    let port = registry.projects[name] ? registry.projects[name].port : null;

    if (!port) {
      const args = Array.isArray(proc.pm2_env?.args)
        ? proc.pm2_env.args.join(' ')
        : String(proc.pm2_env?.args || '');
      const m = args.match(/-l\s*(\d{4,5})|--port[=\s](\d{4,5})|(\d{4,5})\s*$/);
      if (m) port = parseInt(m[1] || m[2] || m[3]);
    }

    // Last resort: check ss output for this pid
    if (!port && proc.pid) {
      try {
        const { stdout: ssOut } = await execPromise('ss -tlnp | grep pid=' + proc.pid);
        const sm = ssOut.match(/:(\d{4,5})\s/);
        if (sm) port = parseInt(sm[1]);
      } catch (e) {}
    }

    if (!port) { errors.push(name + ': port not found'); continue; }

    if (!registry.projects[name]) {
      registry.projects[name] = { port, repoUrl: '', domain: '' };
      synced++;
    } else if (registry.projects[name].port !== port) {
      registry.projects[name].port = port;
      synced++;
    }
  }

  saveRegistry(registry);

  try {
    fs.writeFileSync(CADDYFILE_PATH, buildCaddyConfig(registry));
    await execPromise('systemctl reload caddy || sudo systemctl reload caddy');
  } catch (e) {
    errors.push('caddy reload: ' + e.message);
  }

  return { synced, total: Object.keys(registry.projects).length, errors };
}

// ---------------------------------------------------------
// API: Repair — reconcile PM2/registry/Caddy
// ---------------------------------------------------------
app.post('/api/orchestrator/repair', async (req, res) => {
  try {
    const result = await reconcileRegistryWithPM2();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orchestrator/repair', async (req, res) => {
  try {
    const result = await reconcileRegistryWithPM2();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------
// API: Nuclear Cleanup (Delete All Deployments)
// ---------------------------------------------------------
app.post('/api/orchestrator/cleanup', async (req, res) => {
  if (activeDeploy || deployQueue.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'Cannot run cleanup while deployments are running or queued.'
    });
  }

  try {
    const registry = getRegistry();
    const projects = Object.keys(registry.projects);

    for (const name of projects) {
      try {
        await execPromise('pm2 delete ' + quoteForShell(name));
      } catch (e) {
        // Silently continue if PM2 delete fails
      }
    }

    await execPromise('rm -rf ' + quoteForShell(DEPLOY_ROOT) + '/*');
    saveRegistry({ nextPort: 5100, projects: {} });

    fs.writeFileSync(CADDYFILE_PATH, 'api.epicglobal.app {\n  reverse_proxy localhost:4000\n}\n');
    await execPromise('systemctl reload caddy || sudo systemctl reload caddy');

    res.json({
      success: true,
      terminalOutput: 'CLEAN SLATE: All projects wiped.'
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed.',
      terminalOutput: error.message
    });
  }
});

// ---------------------------------------------------------
// PHASE 3: AUTO-HEAL WATCHDOG
// ---------------------------------------------------------
// Track consecutive HTTP failures per project: { [name]: count }
const watchdogFailCounts = {};
// Last known per-project watchdog events: { [name]: { status, checkedAt, healedAt, lastError } }
const watchdogState = {};

function getWatchdogSnapshot() {
  return Object.keys(watchdogState).length ? watchdogState : {};
}

function probeProjectUrl(url) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? require('https') : http;
    const req = proto.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

// Watchdog interval: check every 60 seconds
setInterval(async () => {
  try {
    const registry = getRegistry();
    const projectNames = Object.keys(registry.projects);

    for (const name of projectNames) {
      const project = registry.projects[name];
      const url = project.domain
        ? 'https://' + project.domain + '/'
        : 'https://' + name + '.epicglobal.app/';

      const alive = await probeProjectUrl(url);
      const now = new Date().toISOString();

      if (alive) {
        watchdogFailCounts[name] = 0;
        watchdogState[name] = Object.assign({}, watchdogState[name] || {}, {
          status: 'ok',
          url: url,
          checkedAt: now
        });
      } else {
        watchdogFailCounts[name] = (watchdogFailCounts[name] || 0) + 1;
        const failCount = watchdogFailCounts[name];
        watchdogState[name] = Object.assign({}, watchdogState[name] || {}, {
          status: 'failing',
          url: url,
          checkedAt: now,
          consecutiveFails: failCount
        });

        if (failCount >= 2) {
          // Attempt PM2 restart
          try {
            await execPromise('pm2 restart ' + quoteForShell(name) + ' --update-env');
            await execPromise('pm2 save');

            watchdogState[name] = Object.assign({}, watchdogState[name], {
              status: 'healed',
              healedAt: now,
              consecutiveFails: 0
            });
            watchdogFailCounts[name] = 0;

            const msg = 'Auto-heal: restarted ' + name + ' after ' + failCount + ' consecutive failures.';
            console.log('[watchdog]', msg);
            await sendAlert('watchdog', name, msg, 'warning');
            io.emit('watchdog_event', { name: name, status: 'healed', message: msg, timestamp: now });
          } catch (restartError) {
            const errMsg = 'Auto-heal FAILED for ' + name + ': ' + restartError.message;
            // If the PM2 process no longer exists, remove from registry to stop repeated heal attempts
            if (restartError.message && restartError.message.includes('not found')) {
              console.warn('[watchdog] Process "' + name + '" not found in PM2 — removing from registry.');
              try {
                const reg = getRegistry();
                delete reg.projects[name];
                saveRegistry(reg);
              } catch (regErr) {
                console.error('[watchdog] Failed to remove stale project from registry:', regErr.message);
              }
              delete watchdogState[name];
              delete watchdogFailCounts[name];
            } else {
              console.error('[watchdog]', errMsg);
              watchdogState[name] = Object.assign({}, watchdogState[name], {
                status: 'down',
                lastError: errMsg
              });
              await sendAlert('watchdog', name, errMsg, 'error');
              io.emit('watchdog_event', { name: name, status: 'down', message: errMsg, timestamp: now });
            }
          }
        }
      }
    }

    io.emit('watchdog_state', getWatchdogSnapshot());
  } catch (e) {
    // Watchdog cycle error — silently continue
    console.error('[watchdog] cycle error:', e.message);
  }
}, 60000);

// ---------------------------------------------------------
// PHASE 4: ALERT WEBHOOK (TELEGRAM / DISCORD)
// ---------------------------------------------------------
async function sendAlert(type, projectName, message, level) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChat = process.env.TELEGRAM_CHAT_ID;
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;

  const emoji = level === 'error' ? '\u274C' : level === 'warning' ? '\u26A0\uFE0F' : '\u2705';
  const text = emoji + ' [EpicGlobal / ' + type + '] ' + projectName + ': ' + message;

  const errors = [];

  if (telegramToken && telegramChat) {
    try {
      await fetch(
        'https://api.telegram.org/bot' + telegramToken + '/sendMessage',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: telegramChat, text: text, parse_mode: 'HTML' })
        }
      );
    } catch (e) {
      errors.push('telegram: ' + e.message);
    }
  }

  if (discordWebhook) {
    try {
      await fetch(discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
    } catch (e) {
      errors.push('discord: ' + e.message);
    }
  }

  return errors;
}

// ---------------------------------------------------------
// API: Watchdog Status
// ---------------------------------------------------------
app.get('/api/orchestrator/watchdog', (req, res) => {
  res.json({ success: true, watchdog: getWatchdogSnapshot(), failCounts: watchdogFailCounts });
});

// ---------------------------------------------------------
// API: Alert Settings
// ---------------------------------------------------------
app.get('/api/orchestrator/alerts/config', (req, res) => {
  const hasTelegram = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const hasDiscord = !!process.env.DISCORD_WEBHOOK_URL;
  res.json({
    success: true,
    config: {
      telegram: hasTelegram,
      discord: hasDiscord,
      telegramChatId: hasTelegram ? process.env.TELEGRAM_CHAT_ID : null
    }
  });
});

app.post('/api/orchestrator/alerts/test', async (req, res) => {
  const type = String(req.body?.type || 'manual');
  const errors = await sendAlert(type, 'test', 'EpicGlobal alert test fired successfully.', 'info');

  if (errors.length > 0) {
    return res.status(500).json({ success: false, error: errors.join('; ') });
  }
  res.json({ success: true, message: 'Test alert sent.' });
});

// ---------------------------------------------------------
// SOCKET.IO: Real-time Telemetry Heartbeat
// ---------------------------------------------------------
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.emit('telemetry', latestTelemetry);
  socket.emit('deploy_queue', getQueueSnapshot());
  socket.emit('watchdog_state', getWatchdogSnapshot());

  socket.on('telemetry_request', () => {
    socket.emit('telemetry', latestTelemetry);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// ---------------------------------------------------------
// BOOT
// ---------------------------------------------------------
server.listen(PORT, () => {
  console.log('\x1b[32m[system]\x1b[0m EpicGlobal Orchestrator v3 engaged on port ' + PORT);

  // Auto-reconcile PM2 <-> registry <-> Caddyfile on every boot.
  // Runs after a short delay so PM2 processes have time to register ports.
  setTimeout(() => {
    reconcileRegistryWithPM2()
      .then((r) => console.log('\x1b[32m[repair]\x1b[0m Startup reconcile: synced=' + r.synced + ' total=' + r.total + (r.errors.length ? ' errors=' + r.errors.join(',') : '')))
      .catch((e) => console.error('\x1b[31m[repair]\x1b[0m Startup reconcile failed:', e.message));
  }, 5000);
});

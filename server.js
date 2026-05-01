const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const http = require('http');
const { Server } = require('socket.io');

const execPromise = util.promisify(exec);

// ---------------------------------------------------------
// CONFIG
// ---------------------------------------------------------
const DEPLOY_ROOT = '/var/www/epic-deployments';
const REGISTRY_PATH = path.join(process.cwd(), 'projects.json');
const HISTORY_PATH = path.join(process.cwd(), 'deploy-history.json');
const CADDYFILE_PATH = '/etc/caddy/Caddyfile';
const PORT = process.env.PORT || 4000;
// Blue-green: candidate port offset - each project's canary runs at port + this value
const CANDIDATE_PORT_OFFSET = 1000;

// Single-worker deploy queue to prevent overlapping deploys on one VPS.
const deployQueue = [];
let activeDeploy = null;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'https://epicglobal.app',
      'https://www.epicglobal.app',
      'https://api.epicglobal.app'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ---------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://epicglobal.app',
    'https://www.epicglobal.app',
    'https://api.epicglobal.app'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

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

function buildCaddyConfig(registry) {
  let config = 'api.epicglobal.app {\n  reverse_proxy localhost:4000\n}\n';
  
  Object.entries(registry.projects).forEach(([name, data]) => {
    const hosts = [name + '.epicglobal.app'];
    if (data.domain) {
      hosts.push(data.domain);
    }
    hosts.forEach((host) => {
      config += '\n' + host + ' {\n  reverse_proxy localhost:' + data.port + '\n}\n';
    });
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

function enqueueDeploy(payload) {
  return new Promise((resolve, reject) => {
    const item = {
      id: Date.now().toString() + '-' + Math.random().toString(16).slice(2, 8),
      payload,
      enqueuedAt: new Date().toISOString(),
      resolve,
      reject
    };
    deployQueue.push(item);
    emitQueueStatus();
    processDeployQueue();
  });
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
  emitQueueStatus();

  try {
    const result = await executeOrchestratorDeploy(next.payload);
    next.resolve(result);
  } catch (error) {
    next.reject(error);
  } finally {
    activeDeploy = null;
    emitQueueStatus();
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
async function buildCandidate(projectName, repoUrl, candidatePort) {
  const candidateName = projectName + '-candidate';
  const candidatePath = path.join(DEPLOY_ROOT, candidateName);

  const cmd = 'mkdir -p ' + quoteForShell(DEPLOY_ROOT) +
    ' && rm -rf ' + quoteForShell(candidatePath) +
    ' && git clone --depth 1 ' + quoteForShell(repoUrl) + ' ' + quoteForShell(candidatePath) +
    ' && cd ' + quoteForShell(candidatePath) +
    ' && npm install --no-audit --no-fund' +
    ' && npm run build --if-present' +
    ' && pm2 delete ' + quoteForShell(candidateName) + ' || true' +
    ' && if [ -d dist ]; then pm2 start ' + quoteForShell('npx serve -s dist -l ' + candidatePort) + ' --name ' + quoteForShell(candidateName) + ' --cwd ' + quoteForShell(candidatePath) +
    '; elif [ -d build ]; then pm2 start ' + quoteForShell('npx serve -s build -l ' + candidatePort) + ' --name ' + quoteForShell(candidateName) + ' --cwd ' + quoteForShell(candidatePath) +
    '; else pm2 start ' + quoteForShell('npx serve -s . -l ' + candidatePort) + ' --name ' + quoteForShell(candidateName) + ' --cwd ' + quoteForShell(candidatePath) + '; fi' +
    ' && chmod -R 755 ' + quoteForShell(DEPLOY_ROOT);

  const { stdout, stderr } = await execPromise(cmd);
  return { stdout, stderr, candidateName, candidatePath };
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
async function executeFirstDeploy(projectName, repoUrl, domain, port) {
  const deployPath = path.join(DEPLOY_ROOT, projectName);

  const cmd = 'mkdir -p ' + quoteForShell(DEPLOY_ROOT) +
    ' && rm -rf ' + quoteForShell(deployPath) +
    ' && git clone --depth 1 ' + quoteForShell(repoUrl) + ' ' + quoteForShell(deployPath) +
    ' && cd ' + quoteForShell(deployPath) +
    ' && npm install --no-audit --no-fund' +
    ' && npm run build --if-present' +
    ' && pm2 delete ' + quoteForShell(projectName) + ' || true' +
    ' && if [ -d dist ]; then pm2 start ' + quoteForShell('npx serve -s dist -l ' + port) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(deployPath) +
    '; elif [ -d build ]; then pm2 start ' + quoteForShell('npx serve -s build -l ' + port) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(deployPath) +
    '; else pm2 start ' + quoteForShell('npx serve -s . -l ' + port) + ' --name ' + quoteForShell(projectName) + ' --cwd ' + quoteForShell(deployPath) + '; fi' +
    ' && pm2 save' +
    ' && chmod -R 755 ' + quoteForShell(DEPLOY_ROOT);

  const { stdout, stderr } = await execPromise(cmd);
  return [stdout, stderr].filter(Boolean).join('\n').trim();
}

async function executeOrchestratorDeploy(payload) {
  const repoUrl = payload.repoUrl;
  const projectName = payload.projectName;
  const domain = payload.domain;

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

    if (existingProject) {
      // ---- BLUE-GREEN PATH (project already exists) ----
      const candidatePort = port + CANDIDATE_PORT_OFFSET;
      const logPrefix = '[blue-green] ' + projectName + ' candidate on port ' + candidatePort + ' -> ';

      let buildResult;
      try {
        buildResult = await buildCandidate(projectName, repoUrl, candidatePort);
      } catch (buildError) {
        const errOut = [buildError.stdout, buildError.stderr, buildError.message].filter(Boolean).join('\n').trim();
        appendHistory(projectName, 'failed', { error: errOut, repoUrl: repoUrl, strategy: 'blue-green' });
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

      // Health probe — 5 attempts, 3s apart
      const healthy = await probeHealth(candidatePort, 5, 3000);

      if (!healthy) {
        await rollbackCandidate(buildResult.candidateName, buildResult.candidatePath);
        const errMsg = logPrefix + 'health check FAILED. Old version kept. No downtime.';
        appendHistory(projectName, 'failed', { error: errMsg, repoUrl: repoUrl, strategy: 'blue-green' });
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
      await promoteCandidate(projectName, buildResult.candidateName, buildResult.candidatePath, port);
      output += '\n' + logPrefix + 'health OK. Promoted to stable.';

    } else {
      // ---- FIRST-DEPLOY PATH ----
      output = await executeFirstDeploy(projectName, repoUrl, domain, port);
    }

    const finalRegistry = getRegistry();
    fs.writeFileSync(CADDYFILE_PATH, buildCaddyConfig(finalRegistry));
    await execPromise('systemctl reload caddy || sudo systemctl reload caddy');

    const strategy = existingProject ? 'blue-green' : 'first-deploy';
    appendHistory(projectName, 'success', { port: port, url: url, repoUrl: repoUrl, strategy: strategy });

    return {
      success: true,
      port: port,
      url: url,
      terminalOutput: output || 'Deployment finished',
      log: output || 'Deployment finished'
    };
  } catch (error) {
    if (error.statusCode) throw error;
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').trim();
    appendHistory(projectName, 'failed', { error: output, repoUrl: repoUrl });

    throw {
      statusCode: 500,
      body: {
        success: false,
        port: port,
        error: output || 'Deployment failed.',
        terminalOutput: output || 'Deployment failed.'
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

    io.emit('telemetry', {
      ram: Math.round((usedMem / totalMem) * 100),
      cpu: Math.min(Math.round(cpuLoad * 100), 100),
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false })
    });
  } catch (e) {
    // Silently fail telemetry
  }
}, 2500);

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

    res.json({
      success: true,
      projectUrl: 'https://' + projectName + '.pages.dev',
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

  if (isProjectBusy(projectName)) {
    return res.status(409).json({
      success: false,
      error: 'This project already has a running or queued deployment.'
    });
  }

  try {
    const result = await enqueueDeploy({ projectName, repoUrl, domain });
    return res.json(result);
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
// API: Deployment History
// ---------------------------------------------------------
app.get('/api/orchestrator/history', (req, res) => {
  res.json({ success: true, history: getHistory() });
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
// SOCKET.IO: Real-time Telemetry Heartbeat
// ---------------------------------------------------------
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.emit('deploy_queue', getQueueSnapshot());

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// ---------------------------------------------------------
// BOOT
// ---------------------------------------------------------
server.listen(PORT, () => {
  console.log('\x1b[32m[system]\x1b[0m EpicGlobal Orchestrator v3 engaged on port ' + PORT);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Initialize Socket.IO with Production VIP List
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173", 
      "https://epicglobal.app", 
      "https://www.epicglobal.app",
      "https://api.epicglobal.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// --- ROUTE 1: Edge Deployer (Cloudflare Pages) ---
app.post('/api/deploy', async (req, res) => {
  const { projectName, githubUser, githubRepo, targetBranch } = req.body;
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const CF_API_TOKEN = process.env.CF_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return res.status(500).json({ error: 'Missing Cloudflare credentials.' });

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CF_API_TOKEN}`
      },
      body: JSON.stringify({
        name: projectName,
        source: {
          type: 'github',
          config: { owner: githubUser, repo_name: githubRepo, production_branch: targetBranch || 'main' }
        },
        build_config: { build_command: 'npm run build', destination_dir: 'dist', root_dir: '/' }
      })
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.errors[0].message);

    res.status(200).json({ projectUrl: `https://${projectName}.pages.dev`, details: data.result });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to provision deployment.' });
  }
});

// --- ROUTE 2: Backend Orchestrator (PM2) ---
app.post('/api/deploy-backend', async (req, res) => {
  const { projectName, githubUser, githubRepo, targetPort } = req.body;
  
  // Secure GitHub Token Injection
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const authString = GITHUB_TOKEN ? `${GITHUB_TOKEN}@` : '';
  const repoUrl = `https://${authString}github.com/${githubUser}/${githubRepo}.git`;
  
  const deployPath = path.join(os.homedir(), 'deployments', projectName);

  try {
    if (!fs.existsSync(path.join(os.homedir(), 'deployments'))) fs.mkdirSync(path.join(os.homedir(), 'deployments'));
    if (fs.existsSync(deployPath)) await execPromise(`rm -rf ${deployPath}`);

    await execPromise(`git clone ${repoUrl} ${deployPath}`);
    await execPromise(`cd ${deployPath} && npm install`);
    await execPromise(`cd ${deployPath} && PORT=${targetPort} pm2 start server.js --name "${projectName}" --update-env`);
    await execPromise(`pm2 save`);

    res.status(200).json({ message: 'Backend successfully deployed.', port: targetPort });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ROUTE 3: Environment Variables Manager ---
app.post('/api/env', async (req, res) => {
  const { projectName, envVars } = req.body;
  const deployPath = path.join(os.homedir(), 'deployments', projectName);

  try {
    if (!fs.existsSync(deployPath)) return res.status(404).json({ error: 'Backend deployment not found.' });

    let envString = '';
    for (const [key, value] of Object.entries(envVars)) {
      envString += `${key}="${value}"\n`;
    }
    
    // Write the .env file
    fs.writeFileSync(path.join(deployPath, '.env'), envString);
    
    // Restart PM2 to inject the new secrets
    await execPromise(`cd ${deployPath} && pm2 restart "${projectName}" --update-env`);
    await execPromise(`pm2 save`);

    res.status(200).json({ message: 'Secrets injected and backend rebooted safely.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ROUTE 4: Live Log Streamer ---
app.get('/api/logs/:projectName', async (req, res) => {
  try {
    const { stdout } = await execPromise(`pm2 logs "${req.params.projectName}" --nostream --raw --lines 100`);
    res.status(200).json({ logs: stdout });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SOCKET: Real-time Telemetry Heartbeat ---
io.on('connection', (socket) => {
  const metricsInterval = setInterval(() => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    socket.emit('telemetry', {
        ram: Math.round((usedMem / totalMem) * 100),
        cpu: Math.min(Math.round((os.loadavg()[0] / os.cpus().length) * 100), 100),
        timestamp: Date.now()
    });
  }, 2500);

  socket.on('disconnect', () => clearInterval(metricsInterval));
});

// Boot the Engine
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`[system] EpicGlobal API Hub successfully engaged on port ${PORT}`);
});
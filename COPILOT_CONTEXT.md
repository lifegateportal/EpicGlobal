# 🌍 EpicGlobal: Personal Cloud Platform - Project Blueprint

**Status**: V3 Stable | **Date**: May 1, 2026 | **Deployment**: DigitalOcean Ubuntu

---

## 1️⃣ The Vision

**EpicGlobal** is a sovereign, personal Vercel-like deployment platform orchestrated via iPad. It manages multiple sub-applications (EpiClips, EpiCodeSpace, Epignosis, Lifegate Portal) under a unified `*.epicglobal.app` ecosystem, hosted on a single DigitalOcean Ubuntu droplet with zero external CI/CD dependencies.

**Core Promise**: Deploy any repository. Instantly accessible via custom subdomain. Persisted via PM2.

---

## 2️⃣ Complete Tech Stack

| Layer | Technology | Purpose | Port |
|-------|-----------|---------|------|
| **Reverse Proxy** | Caddy v2 | Auto SSL, subdomain routing, load balancing | 80, 443 |
| **Web Server** | Node.js/Express | Orchestrator API + Socket.IO | 4000 |
| **Process Manager** | PM2 | Deployment lifecycle, process persistence, auto-restart | N/A |
| **Package Manager** | npm | Dependency installation (lean: `--no-audit --no-fund`) | N/A |
| **Frontend** | React 19 + Vite + TypeScript | iPad-optimized dashboard, real-time telemetry | 5173 (dev) |
| **Styling** | TailwindCSS v4 (PostCSS) | Dark theme, responsive design | N/A |
| **Real-Time Comms** | Socket.IO | CPU/RAM metrics, log streaming, deployment status | WSS |
| **Component Library** | Lucide + Framer Motion + Recharts | Icons, animations, charts | N/A |
| **Git** | GitHub API + Git CLI | Shallow clone (--depth 1) for efficiency | N/A |

---

## 3️⃣ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      iPad / Web Browser                          │
│  ├─ React Frontend (Vite, TailwindCSS v4)                       │
│  └─ Real-time Socket.IO client (CPU/RAM/logs)                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────────┐
│              Caddy Reverse Proxy (epicglobal.app)               │
│  ├─ api.epicglobal.app → localhost:4000 (Orchestrator)         │
│  ├─ epiclips.epicglobal.app → localhost:5101 (PM2 process)    │
│  ├─ codecspace.epicglobal.app → localhost:5102 (PM2 process)  │
│  └─ [custom domains] → ...                                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│        Node.js/Express Orchestrator (Port 4000)                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ API Endpoints                                             │ │
│  ├─ POST /api/deploy                  (Cloudflare Pages)    │ │
│  ├─ POST /api/orchestrator/deploy     (PM2 Orchestrator)    │ │
│  ├─ POST /api/deploy-backend           (Alt backend deploy)  │ │
│  ├─ POST /api/env                      (Env var injection)   │ │
│  ├─ GET /api/logs/:projectName         (Log streaming)      │ │
│  └─ POST /api/orchestrator/cleanup     (Nuclear reset)       │ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ WebSocket Events                                          │ │
│  └─ telemetry                          (CPU/RAM every 2.5s)  │ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ State Management                                          │ │
│  └─ projects.json registry (port allocation, metadata)       │ │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│         PM2 Process Manager (Deployment Lifecycle)             │
│  ├─ epiclips (npm run build + serve dist → :5101)            │
│  ├─ codecspace (npm run build + serve dist → :5102)          │
│  └─ [dynamic projects] (managed via pm2 CLI)                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│      Deployment Directory (/var/www/epic-deployments/)         │
│  ├─ epiclips/ (git repo + npm_modules + dist/)                │
│  ├─ codecspace/ (git repo + npm_modules + dist/)              │
│  └─ [project-name]/ (cloned, built, served)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4️⃣ Critical Orchestrator Logic (V3 Stable)

### 🔹 **Normalization Rule: Case-Sensitivity**
```javascript
// ALL project names forced to lowercase + validation
function normalizeProjectName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()                    // ← CRITICAL: Linux is case-sensitive
    .replace(/[^a-z0-9-]/g, '-')      // Only alphanumeric + hyphens
    .replace(/-+/g, '-')              // Collapse multiple hyphens
    .replace(/^-|-$/g, '');           // Strip leading/trailing hyphens
}
```
**Why**: Linux file systems are case-sensitive. `MyProject` ≠ `myproject`. Registry lookups MUST be consistent.

---

### 🔹 **Shell Escaping: Prevention of Injection**
```javascript
function quoteForShell(val) {
  return "'" + String(val).replace(/'/g, "'\\''") + "'";
}

// Usage: git clone --depth 1 'https://github.com/user/repo.git' '/var/www/epic-deployments/project-name'
```
**Why**: Prevents shell injection attacks from malicious URLs or project names.

---

### 🔹 **Smart Build Detection**
```javascript
// Build command checks for dist, build, or root
`[ -d dist ] && \
  pm2 start "npx serve -s dist -l 5101" --name epiclips \
|| [ -d build ] && \
  pm2 start "npx serve -s build -l 5101" --name epiclips \
|| \
  pm2 start "npx serve -s . -l 5101" --name epiclips`
```
**Why**: Different projects have different output directories. Auto-detect and serve correctly.

---

### 🔹 **Current Working Directory Protection (CRITICAL)**
```javascript
// PM2 is ALWAYS launched with --cwd flag
pm2 start "npx serve -s dist -l 5101" \
  --name "epiclips" \
  --cwd "/var/www/epic-deployments/epiclips"  // ← PREVENT FILE LEAKAGE
```
**Why**: Without `--cwd`, PM2 might accidentally serve files from the Orchestrator's own `/root` directory. This isolates each deployment.

---

### 🔹 **Sync-Locked Builds (No Race Conditions)**
```javascript
// Use util.promisify(exec) for sequential execution
const { stdout, stderr } = await execPromise(
  `mkdir -p /var/www/epic-deployments && \
   rm -rf /var/www/epic-deployments/project-name && \
   git clone --depth 1 ${repoUrl} /var/www/epic-deployments/project-name && \
   cd /var/www/epic-deployments/project-name && \
   npm install && \
   npm run build --if-present && \
   pm2 start ...`
);
```
**Why**: All steps must complete in order. No parallelization. API only responds when deployment is fully done.

---

### 🔹 **Dynamic Caddyfile Generation**
```javascript
function buildCaddyConfig(registry) {
  let config = 'api.epicglobal.app {\n  reverse_proxy localhost:4000\n}\n';
  
  Object.entries(registry.projects).forEach(([name, data]) => {
    const hosts = [`${name}.epicglobal.app`];
    if (data.domain) hosts.push(data.domain);
    
    hosts.forEach((host) => {
      config += `\n${host} {\n  reverse_proxy localhost:${data.port}\n}\n`;
    });
  });
  
  return config;
}

// After deployment, reload Caddy
fs.writeFileSync('/etc/caddy/Caddyfile', buildCaddyConfig(registry));
await execPromise('systemctl reload caddy || sudo systemctl reload caddy');
```
**Why**: Every deployment updates Caddy routing. No manual config edits. SSL handled automatically.

---

### 🔹 **Registry Persistence** (`projects.json`)
```json
{
  "nextPort": 5103,
  "projects": {
    "epiclips": {
      "port": 5101,
      "repoUrl": "https://github.com/lifegateportal/EpiClips.git",
      "domain": "epiclips.epicglobal.app"
    },
    "codecspace": {
      "port": 5102,
      "repoUrl": "https://github.com/lifegateportal/EpiCodeSpace.git",
      "domain": "codecspace.epicglobal.app"
    }
  }
}
```
**Why**: Tracks which project uses which port. Prevents port collisions. Survives server restarts (via PM2 save).

---

## 5️⃣ Frontend Architecture (React + Vite)

### **Main Component Tree**
```
App.tsx (Root Authentication Gate)
├─ Navbar (Server status indicator + logo)
├─ KeyboardHUD (Shortcuts: 1-5 for tabs)
├─ CommandPalette (Cmd+K modal)
├─ CommandTerminal (Zen mode terminal emulator)
├─ Tabs (Tab navigation)
│  ├─ OverviewTab (Dashboard + real-time metrics)
│  ├─ DeploymentsTab (Cloudflare Pages UI)
│  ├─ DeploymentDashboard (Edge deployment form)
│  ├─ BackendManager (PM2 Orchestrator UI)
│  └─ SettingsTab (Env vars + API topology)
└─ Toaster (Sonner toast notifications)
```

### **Socket.IO Telemetry Loop**
```javascript
// Client connects on auth
useEffect(() => {
  const socket = io(socketUrl, { transports: ['websocket'], timeout: 10000 });
  
  socket.on('telemetry', (data) => {
    // { ram: number, cpu: number, timestamp: string }
    setPerformanceData(prev => {
      const newData = [...prev, data];
      if (newData.length > 15) newData.shift(); // Keep last 15 points
      return newData;
    });
  });
}, [isAuthenticated, socketUrl]);
```
**Why**: iPad dashboard needs real-time CPU/RAM. Socket.IO is faster than polling.

---

## 6️⃣ Known Issues & Their Solutions

### 🐛 **Issue #1: Undefined Logs in Frontend**
**Problem**: Backend returns `terminalOutput` but frontend expected `log`
**Solution**: Ensure API response keys match frontend expectations
```javascript
// CORRECT:
res.json({ success: true, terminalOutput: output, log: output, port, url })

// WRONG:
res.json({ success: true, output, port, url }) // Frontend gets undefined
```

---

### 🐛 **Issue #2: Blue-Code Breakout (iPad Editor Bug)**
**Problem**: Backticks (`) in template literals break iPad code editors
**Solution**: Use string concatenation with `+` instead
```javascript
// ❌ AVOID (causes iPad editor to crash):
const cmd = `mkdir -p ${path} && rm -rf ${deployPath}`;

// ✅ CORRECT:
const cmd = "mkdir -p " + quoteForShell(path) + " && rm -rf " + quoteForShell(deployPath);
```

---

### 🐛 **Issue #3: Case-Sensitivity in URLs**
**Problem**: `MyProject` creates `/var/www/epic-deployments/MyProject/` but Caddyfile references `myproject.epicglobal.app`
**Solution**: Force lowercase in normalization, use consistent casing everywhere
```javascript
const projectName = normalizeProjectName(req.body.projectName); // Always lowercase
const subdomain = `${projectName}.epicglobal.app`; // Always matches directory
```

---

### 🐛 **Issue #4: PM2 CWD Leakage**
**Problem**: PM2 processes can serve Orchestrator's own files if `--cwd` is missing
**Solution**: ALWAYS include `--cwd` flag pointing to deployment directory
```javascript
// ❌ WRONG:
pm2 start "npx serve -s dist -l 5101" --name epiclips

// ✅ CORRECT:
pm2 start "npx serve -s dist -l 5101" --name epiclips --cwd /var/www/epic-deployments/epiclips
```

---

## 7️⃣ API Endpoint Reference

### **POST /api/orchestrator/deploy**
Deploy a repository via PM2 orchestrator.

**Request**:
```json
{
  "projectName": "my-app",
  "repoUrl": "https://github.com/user/repo.git",
  "domain": "my-app.epicglobal.app"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "port": 5101,
  "url": "https://my-app.epicglobal.app",
  "terminalOutput": "Successfully deployed...",
  "log": "npm install output..."
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "Git clone failed: repository not found",
  "terminalOutput": "..."
}
```

---

### **POST /api/orchestrator/cleanup**
Nuclear reset: Delete ALL deployments and reset registry.

**Response**:
```json
{
  "success": true,
  "terminalOutput": "CLEAN SLATE: All projects wiped."
}
```

---

### **WebSocket: telemetry**
Real-time system metrics emitted every 2.5 seconds.

**Emitted Data**:
```json
{
  "ram": 45,
  "cpu": 23,
  "timestamp": "14:30:45"
}
```

---

## 8️⃣ Deployment Checklist

Before pushing to production, verify:

- [ ] **Case-Sensitivity**: All `normalizeProjectName()` calls normalize to lowercase
- [ ] **Shell Escaping**: All user inputs wrapped in `quoteForShell()`
- [ ] **PM2 CWD**: All PM2 starts include `--cwd /var/www/epic-deployments/[project]`
- [ ] **Caddyfile Reload**: After registry update, call `systemctl reload caddy`
- [ ] **Response Keys**: Backend returns keys that frontend expects (`terminalOutput`, `log`, `port`, `url`)
- [ ] **No Template Literals**: Avoid backticks in shell commands (use `+` concatenation)
- [ ] **Error Handling**: All API errors return structured JSON with `error`, `terminalOutput`, `success` flags
- [ ] **Socket.IO Auth**: Only authenticated users receive telemetry
- [ ] **Registry Backup**: Regularly back up `projects.json`

---

## 9️⃣ File Structure (VPS)

```
/root/
├─ epicglobal-api/                    # Orchestrator backend
│  ├─ server.js                       # Main API + Socket.IO
│  ├─ package.json
│  ├─ projects.json                   # Registry (dynamic, managed)
│  └─ node_modules/
├─ epicglobal-ui/                     # Frontend (React + Vite)
│  ├─ src/
│  ├─ dist/                           # Built assets
│  ├─ package.json
│  └─ vite.config.ts
└─ pm2-ecosystem.config.js            # PM2 config (optional)

/var/www/
└─ epic-deployments/                  # User deployments (managed by Orchestrator)
   ├─ epiclips/
   ├─ codecspace/
   ├─ epignosis/
   └─ [project-name]/

/etc/caddy/
└─ Caddyfile                          # Reverse proxy config (auto-generated)
```

---

## 🔟 Environment Variables

### **Backend (.env in /root/epicglobal-api/)**
```bash
PORT=4000
CF_ACCOUNT_ID=your_cloudflare_account_id
CF_API_TOKEN=your_cloudflare_api_token
GITHUB_TOKEN=optional_github_token  # For private repos
```

### **Frontend (.env.local in /root/epicglobal-ui/)**
```bash
VITE_SOCKET_URL=https://api.epicglobal.app
VITE_TEST_MESSAGE=Production
```

---

## 1️⃣1️⃣ Debugging Tips

### **Check PM2 Processes**
```bash
pm2 list                 # All running processes
pm2 logs epiclips        # Real-time logs for specific project
pm2 monit                # Resource usage
```

### **Check Caddy Status**
```bash
systemctl status caddy
sudo journalctl -u caddy -f
```

### **Check Node.js Orchestrator**
```bash
pm2 logs epicglobal-api  # Or run node server.js directly
```

### **Manual Deployment Test**
```bash
curl -X POST https://api.epicglobal.app/api/orchestrator/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "test-app",
    "repoUrl": "https://github.com/user/repo.git",
    "domain": "test-app.epicglobal.app"
  }'
```

---

## 1️⃣2️⃣ For Copilot: Do's and Don'ts

### ✅ **DO**
- Suggest lowercase normalization for all project names
- Include `--cwd` in all PM2 commands (ALWAYS)
- Use `quoteForShell()` for all shell inputs
- Check for `dist`, `build`, then fallback to root
- Emit consistent response keys: `success`, `terminalOutput`, `log`, `port`, `url`, `error`
- Use `util.promisify(exec)` for sequential command execution
- Regenerate & reload Caddyfile after registry updates

### ❌ **DON'T**
- Use template literals (backticks) in shell commands → Use `+` concatenation
- Forget to normalize project names → Always call `normalizeProjectName()`
- Deploy without `--cwd` flag in PM2 → Risk file leakage
- Parallelize build steps → Keep them sequential with `&&`
- Suggest manual Caddyfile edits → Always automate via API
- Mixed-case URLs → `MyProject.epicglobal.app` should be `myproject.epicglobal.app`
- Forget to escape shell inputs → Always use `quoteForShell()`

---

## 1️⃣3️⃣ Next Features (Roadmap)

- [ ] Deployment history & rollback
- [ ] Health checks for deployed projects
- [ ] Rate limiting + CORS restrictions
- [ ] Real authentication (JWT or OAuth)
- [ ] Project deletion endpoint
- [ ] Log persistence & search
- [ ] Webhook-triggered auto-deploys
- [ ] Docker containerization
- [ ] Multi-region support (e.g., NYC + EU droplets)

---

**Last Updated**: May 1, 2026  
**Maintained By**: EpicGlobal Development Team  
**Questions?** Paste this file into Copilot Chat and ask for clarification.

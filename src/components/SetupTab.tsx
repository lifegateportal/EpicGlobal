import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, XCircle, AlertCircle, Copy, Check, RefreshCw,
  Terminal, Globe, Key, Cpu, Layers, ChevronDown, ChevronRight,
  ExternalLink, Server, ShieldCheck, Zap, BookOpen
} from 'lucide-react';
import { API, ORCHESTRATOR_API_KEY, BASE_URL } from '../api/client';

/* ─── tiny helpers ─────────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  return (
    <div className="relative bg-zinc-950 border border-zinc-800 rounded-md">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-zinc-600 text-xs font-mono">{lang}</span>
        <CopyBtn text={code} />
      </div>
      <pre className="p-3 text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">{code}</pre>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return (
    <span className="flex items-center gap-1.5 text-zinc-500 text-xs">
      <span className="w-2 h-2 rounded-full bg-zinc-600 animate-pulse inline-block" />{label}
    </span>
  );
  if (ok) return (
    <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
      <CheckCircle2 size={13} />{label}
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
      <XCircle size={13} />{label}
    </span>
  );
}

type CollapsibleProps = { title: string; icon: React.ReactNode; accent?: string; defaultOpen?: boolean; children: React.ReactNode };
function Collapsible({ title, icon, accent = 'border-zinc-800/60', defaultOpen = false, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border ${accent} bg-[#0A0A0A] rounded-xl overflow-hidden shadow-xl`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-zinc-900/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
        </div>
        {open ? <ChevronDown size={15} className="text-zinc-500" /> : <ChevronRight size={15} className="text-zinc-500" />}
      </button>
      {open && <div className="border-t border-zinc-800/60 p-5 space-y-4">{children}</div>}
    </div>
  );
}

/* ─── env var definitions ───────────────────────────────────────── */
const ENV_VARS = [
  {
    key: 'VITE_SOCKET_URL',
    desc: 'WebSocket & HTTP API origin. Points to your Orchestrator server.',
    example: 'https://api.epicglobal.app',
    value: import.meta.env.VITE_SOCKET_URL?.trim() || '',
    required: true,
  },
  {
    key: 'VITE_ORCHESTRATOR_API_KEY',
    desc: 'Secret API key sent in x-api-key header for protected endpoints.',
    example: 'my-super-secret-key-32chars',
    value: import.meta.env.VITE_ORCHESTRATOR_API_KEY?.trim() || '',
    required: true,
  },
  {
    key: 'VITE_AUTH_PASSWORD',
    desc: 'Dashboard login password. Defaults to "epicglobal" if not set.',
    example: 'ChangeMeNow!',
    value: import.meta.env.VITE_AUTH_PASSWORD?.trim() || '',
    required: false,
  },
] as const;

/* ─── setup steps ───────────────────────────────────────────────── */
const SETUP_STEPS = [
  {
    num: 1,
    title: 'Provision DigitalOcean Droplet',
    desc: 'Create an Ubuntu 22.04/24.04 LTS droplet (recommended: Basic, 2 GB RAM). Enable SSH key auth. Note the public IPv4.',
  },
  {
    num: 2,
    title: 'Install Node.js, PM2 & Caddy',
    desc: 'SSH into your droplet and run the bootstrap script below.',
  },
  {
    num: 3,
    title: 'Clone EpicGlobal & install deps',
    desc: 'Pull the repo and install server dependencies.',
  },
  {
    num: 4,
    title: 'Configure environment variables',
    desc: 'Create a .env file for the frontend build and set server env vars.',
  },
  {
    num: 5,
    title: 'Build frontend & start Orchestrator',
    desc: 'Build the React dashboard and start the Node server under PM2.',
  },
  {
    num: 6,
    title: 'Configure Caddy',
    desc: 'Point Caddy at your domain and auto-TLS every subdomain.',
  },
  {
    num: 7,
    title: 'Point DNS',
    desc: 'Add an A record for *.epicglobal.app → your droplet IP.',
  },
] as const;

/* ─── main component ────────────────────────────────────────────── */
export function SetupTab() {
  const [apiStatus, setApiStatus] = useState<boolean | null>(null);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('eg_setup_steps') || '[]')); }
    catch { return new Set(); }
  });

  const checkApi = useCallback(async () => {
    setChecking(true);
    setApiStatus(null);
    const t0 = performance.now();
    try {
      const res = await fetch(API + '/api/orchestrator/status', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      setApiLatency(Math.round(performance.now() - t0));
      setApiStatus(res.ok);
    } catch {
      setApiLatency(null);
      setApiStatus(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { checkApi(); }, [checkApi]);

  const toggleStep = (n: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      localStorage.setItem('eg_setup_steps', JSON.stringify([...next]));
      return next;
    });
  };

  const envAll = ENV_VARS.filter(v => v.required).every(v => v.value);
  const progress = Math.round((completedSteps.size / SETUP_STEPS.length) * 100);

  const dotenvContent = ENV_VARS.map(v => `${v.key}=${v.value || v.example}`).join('\n');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* ── hero header ── */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 mb-1">Platform Setup</h2>
            <p className="text-sm text-zinc-500 max-w-xl">
              Everything you need to go from a blank DigitalOcean droplet to a fully running EpicGlobal
              deployment platform — Caddy, PM2, Orchestrator, and auto-SSL included.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-bold text-zinc-100">{progress}%</div>
            <div className="text-xs text-zinc-600 mt-0.5">setup complete</div>
          </div>
        </div>

        {/* progress bar */}
        <div className="mt-5 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* live health strip */}
        <div className="mt-5 flex flex-wrap gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">API Endpoint:</span>
            <code className="text-indigo-300">{API || '(not set)'}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">API Status:</span>
            <StatusBadge ok={apiStatus} label={apiStatus === null ? 'Checking…' : apiStatus ? `Online ${apiLatency ? `· ${apiLatency}ms` : ''}` : 'Unreachable'} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Env Vars:</span>
            <StatusBadge ok={envAll} label={envAll ? 'All required vars set' : 'Missing required vars'} />
          </div>
          <button
            onClick={checkApi}
            disabled={checking}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-100 transition-colors ml-auto"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            Re-check
          </button>
        </div>
      </div>

      {/* ── env var status ── */}
      <Collapsible
        title="Environment Variables"
        icon={<Key size={15} className="text-amber-400" />}
        accent={envAll ? 'border-zinc-800/60' : 'border-amber-700/40'}
        defaultOpen={!envAll}
      >
        <p className="text-xs text-zinc-500">
          These must be baked into your frontend at build time via a <code className="bg-zinc-900 px-1 rounded">.env</code> file or your CI/CD secrets.
        </p>

        <div className="space-y-3">
          {ENV_VARS.map(v => {
            const isSet = Boolean(v.value);
            return (
              <div key={v.key} className={`border rounded-lg p-4 ${isSet ? 'border-zinc-800' : v.required ? 'border-amber-700/40 bg-amber-950/10' : 'border-zinc-800'}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <code className="text-sm text-zinc-100 font-mono">{v.key}</code>
                  <div className="flex items-center gap-2">
                    {v.required && !isSet && <span className="text-amber-400 text-xs font-medium">required</span>}
                    {!v.required && <span className="text-zinc-600 text-xs">optional</span>}
                    <StatusBadge ok={isSet} label={isSet ? 'Set' : 'Not set'} />
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mb-2">{v.desc}</p>
                {!isSet && (
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5">
                    <span className="text-zinc-600 text-xs font-mono">{v.key}=</span>
                    <code className="text-xs text-zinc-400 font-mono">{v.example}</code>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <p className="text-xs text-zinc-500 mb-2">Full <code className="bg-zinc-900 px-1 rounded">.env</code> template:</p>
          <CodeBlock code={dotenvContent} lang=".env" />
        </div>
      </Collapsible>

      {/* ── step-by-step guide ── */}
      <Collapsible
        title="First-Time Setup Guide"
        icon={<BookOpen size={15} className="text-purple-400" />}
        accent="border-purple-900/40"
        defaultOpen
      >
        <p className="text-xs text-zinc-500">Click a step to check it off. Steps persist in your browser.</p>

        <div className="space-y-3">
          {SETUP_STEPS.map(step => {
            const done = completedSteps.has(step.num);
            return (
              <div
                key={step.num}
                onClick={() => toggleStep(step.num)}
                className={`flex gap-3 p-4 rounded-lg border cursor-pointer transition-all ${done ? 'border-green-800/40 bg-green-950/10' : 'border-zinc-800 hover:border-zinc-700'}`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${done ? 'border-green-500 bg-green-500/20' : 'border-zinc-600'}`}>
                  {done ? <Check size={12} className="text-green-400" /> : <span className="text-xs text-zinc-500 font-bold">{step.num}</span>}
                </div>
                <div>
                  <p className={`text-sm font-medium mb-0.5 ${done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{step.title}</p>
                  <p className="text-xs text-zinc-600">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Collapsible>

      {/* ── server bootstrap ── */}
      <Collapsible
        title="Server Bootstrap Script"
        icon={<Server size={15} className="text-blue-400" />}
        accent="border-blue-900/40"
      >
        <p className="text-xs text-zinc-500">Run this once on a fresh Ubuntu 22.04 / 24.04 droplet to install all dependencies.</p>

        <CodeBlock lang="bash" code={`# Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 — global process manager
sudo npm install -g pm2

# Caddy — reverse proxy with auto-TLS
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \\
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \\
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Deployment directory
sudo mkdir -p /var/www/epic-deployments
sudo chown $USER:$USER /var/www/epic-deployments`} />
      </Collapsible>

      {/* ── clone & build ── */}
      <Collapsible
        title="Clone, Build & Start Orchestrator"
        icon={<Layers size={15} className="text-emerald-400" />}
        accent="border-emerald-900/40"
      >
        <CodeBlock lang="bash" code={`# Clone the repo
git clone https://github.com/lifegateportal/EpicGlobal.git ~/epicglobal
cd ~/epicglobal

# Install server dependencies
npm install

# Create frontend .env
cat > .env <<'EOF'
VITE_SOCKET_URL=https://api.epicglobal.app
VITE_ORCHESTRATOR_API_KEY=your-api-key-here
VITE_AUTH_PASSWORD=your-dashboard-password
EOF

# Build the React dashboard
npm run build

# Start the orchestrator with PM2
pm2 start server.js --name epicglobal-api \\
  --env production \\
  -- --port 4000
pm2 save
pm2 startup`} />
      </Collapsible>

      {/* ── caddy config ── */}
      <Collapsible
        title="Caddy Configuration"
        icon={<Globe size={15} className="text-cyan-400" />}
        accent="border-cyan-900/40"
      >
        <p className="text-xs text-zinc-500 mb-1">Place this in <code className="bg-zinc-900 px-1 rounded">/etc/caddy/Caddyfile</code>, then reload Caddy.</p>

        <CodeBlock lang="Caddyfile" code={`# Main dashboard
epicglobal.app {
  root * /root/epicglobal/dist
  file_server
  try_files {path} /index.html
}

# Orchestrator API + Socket.IO
api.epicglobal.app {
  reverse_proxy localhost:4000
}

# Wildcard subdomains → PM2-managed apps
*.epicglobal.app {
  reverse_proxy localhost:{env.SUBDOMAIN_PORT}
}
# Note: each deployed app gets its own Caddy block added dynamically
# by the Orchestrator via caddy adapt / API reload.`} />

        <CodeBlock lang="bash" code={`# Reload Caddy after editing Caddyfile
sudo systemctl reload caddy

# Check Caddy status
sudo systemctl status caddy

# Test config syntax
caddy validate --config /etc/caddy/Caddyfile`} />
      </Collapsible>

      {/* ── DNS setup ── */}
      <Collapsible
        title="DNS Configuration"
        icon={<Globe size={15} className="text-violet-400" />}
        accent="border-violet-900/40"
      >
        <p className="text-xs text-zinc-500">Add these DNS records in your domain registrar or Cloudflare dashboard.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left py-2 pr-4 font-semibold">Type</th>
                <th className="text-left py-2 pr-4 font-semibold">Name</th>
                <th className="text-left py-2 pr-4 font-semibold">Value</th>
                <th className="text-left py-2 font-semibold">TTL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              <tr className="text-zinc-300">
                <td className="py-2.5 pr-4">A</td>
                <td className="py-2.5 pr-4 font-mono">epicglobal.app</td>
                <td className="py-2.5 pr-4 font-mono text-indigo-300">YOUR_DROPLET_IP</td>
                <td className="py-2.5">Auto</td>
              </tr>
              <tr className="text-zinc-300">
                <td className="py-2.5 pr-4">A</td>
                <td className="py-2.5 pr-4 font-mono">api</td>
                <td className="py-2.5 pr-4 font-mono text-indigo-300">YOUR_DROPLET_IP</td>
                <td className="py-2.5">Auto</td>
              </tr>
              <tr className="text-zinc-300">
                <td className="py-2.5 pr-4">A</td>
                <td className="py-2.5 pr-4 font-mono">*</td>
                <td className="py-2.5 pr-4 font-mono text-indigo-300">YOUR_DROPLET_IP</td>
                <td className="py-2.5">Auto</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-amber-950/20 border border-amber-800/30 rounded-lg p-3">
          <p className="text-xs text-amber-400/90 flex items-start gap-2">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            Wildcard TLS with Caddy requires DNS challenge (e.g. Cloudflare API token). Set <code className="bg-black/40 px-1 rounded">CLOUDFLARE_API_TOKEN</code> in your environment if using Cloudflare.
          </p>
        </div>
      </Collapsible>

      {/* ── useful commands ── */}
      <Collapsible
        title="Useful Server Commands"
        icon={<Terminal size={15} className="text-zinc-400" />}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-semibold uppercase tracking-widest">PM2</p>
            <CodeBlock lang="bash" code={`pm2 list                  # all processes
pm2 logs epicglobal-api   # live log tail
pm2 restart epicglobal-api
pm2 stop epicglobal-api
pm2 delete epicglobal-api
pm2 monit                 # resource monitor`} />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-semibold uppercase tracking-widest">Orchestrator API</p>
            <CodeBlock lang="bash" code={`# Health check
curl https://api.epicglobal.app/api/orchestrator/status

# Deploy a project
curl -X POST https://api.epicglobal.app/api/orchestrator/deploy \\
  -H "x-api-key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"projectName":"my-app","repoUrl":"https://github.com/you/repo.git","domain":"my-app.epicglobal.app"}'`} />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-semibold uppercase tracking-widest">Caddy</p>
            <CodeBlock lang="bash" code={`sudo systemctl status caddy
sudo systemctl reload caddy
sudo journalctl -u caddy -f   # live Caddy logs`} />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-semibold uppercase tracking-widest">System</p>
            <CodeBlock lang="bash" code={`# Disk usage
df -h /var/www/epic-deployments

# Port listeners
sudo ss -tlnp | grep -E '4000|80|443'

# Rebuild dashboard after .env changes
cd ~/epicglobal && npm run build`} />
          </div>
        </div>
      </Collapsible>

      {/* ── security checklist ── */}
      <Collapsible
        title="Security Checklist"
        icon={<ShieldCheck size={15} className="text-rose-400" />}
        accent="border-rose-900/40"
      >
        {[
          { done: Boolean(ORCHESTRATOR_API_KEY), label: 'VITE_ORCHESTRATOR_API_KEY is set', detail: 'Required to protect all /api/orchestrator endpoints.' },
          { done: Boolean(import.meta.env.VITE_AUTH_PASSWORD), label: 'Custom dashboard password is set', detail: 'Default password "epicglobal" is public. Change it.' },
          { done: BASE_URL.startsWith('https://'), label: 'API URL uses HTTPS', detail: 'All traffic should be encrypted end-to-end via Caddy TLS.' },
          { done: null, label: 'SSH password auth disabled on droplet', detail: 'Use SSH keys only. Edit /etc/ssh/sshd_config → PasswordAuthentication no' },
          { done: null, label: 'UFW firewall: only ports 22, 80, 443 open', detail: 'sudo ufw allow OpenSSH && sudo ufw allow "Caddy Full" && sudo ufw enable' },
        ].map((item, i) => (
          <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${item.done === true ? 'border-green-900/30 bg-green-950/10' : item.done === false ? 'border-red-900/30 bg-red-950/10' : 'border-zinc-800'}`}>
            {item.done === true && <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />}
            {item.done === false && <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />}
            {item.done === null && <AlertCircle size={14} className="text-zinc-500 shrink-0 mt-0.5" />}
            <div>
              <p className="text-xs font-medium text-zinc-200">{item.label}</p>
              <p className="text-xs text-zinc-600 mt-0.5">{item.detail}</p>
            </div>
          </div>
        ))}
      </Collapsible>

      {/* ── quick links ── */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <Zap size={14} className="text-yellow-400" /> Quick Links
        </h3>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'DigitalOcean Console', href: 'https://cloud.digitalocean.com/' },
            { label: 'Cloudflare DNS', href: 'https://dash.cloudflare.com/' },
            { label: 'Caddy Docs', href: 'https://caddyserver.com/docs/' },
            { label: 'PM2 Docs', href: 'https://pm2.keymetrics.io/docs/usage/quick-start/' },
            { label: 'GitHub Repo', href: 'https://github.com/lifegateportal/EpicGlobal' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600 rounded-md px-3 py-1.5 transition-colors"
            >
              {link.label}
              <ExternalLink size={11} className="text-zinc-600" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

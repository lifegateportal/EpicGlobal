import { useState, useEffect, useCallback } from 'react';
import {
  Globe, Search as SearchIcon, Check, X, RefreshCw, Plus, Trash2, Edit3, Save,
  AlertCircle, Loader2, Shield, Clock, ChevronLeft, Tag, Wifi, Server,
} from 'lucide-react';
import { API, apiFetch } from '../api/client';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────────────
type DomainAvailResult = {
  domain: string;
  tld: string;
  available: boolean | null;
  owned: boolean;
  price: number | null;
};

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const;
type DnsType = (typeof DNS_TYPES)[number];

type DnsRecord = {
  id: string;
  type: DnsType;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  createdAt: string;
  updatedAt?: string;
};

type DomainEntry = {
  purchasedAt: string;
  expiresAt: string;
  registrar: string;
  status: 'active' | 'expired' | 'pending';
  autoRenew: boolean;
  price: number | null;
  dnsRecords: DnsRecord[];
};


// ── Constants ──────────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  A:     'bg-blue-900/60 text-blue-300 border border-blue-700/50',
  AAAA:  'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50',
  CNAME: 'bg-purple-900/60 text-purple-300 border border-purple-700/50',
  MX:    'bg-orange-900/60 text-orange-300 border border-orange-700/50',
  TXT:   'bg-green-900/60 text-green-300 border border-green-700/50',
  NS:    'bg-yellow-900/60 text-yellow-300 border border-yellow-700/50',
  SRV:   'bg-pink-900/60 text-pink-300 border border-pink-700/50',
  CAA:   'bg-red-900/60 text-red-300 border border-red-700/50',
};

const BASE = `${API}/api/orchestrator/domains`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
const emptyRecord = (): Partial<DnsRecord> => ({ type: 'A', name: '@', value: '', ttl: 300 });

// ── Main Component ─────────────────────────────────────────────────────────────
export function DomainsTab({ subTab = 'search', onNavigateDns, onNavigate }: { subTab?: 'search' | 'mydomains' | 'dns'; onNavigateDns?: () => void; onNavigate?: (tab: 'search' | 'mydomains' | 'dns') => void }) {

  // Search state
  const [query, setQuery]           = useState('');
  const [searching, setSearching]   = useState(false);
  const [searchResults, setSearchResults] = useState<DomainAvailResult[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // My Domains state
  const [domains, setDomains]               = useState<Record<string, DomainEntry>>({});
  const [loadingDomains, setLoadingDomains] = useState(false);

  // DNS state
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [dnsRecords, setDnsRecords]         = useState<DnsRecord[]>([]);
  const [loadingDns, setLoadingDns]         = useState(false);
  const [addingRecord, setAddingRecord]     = useState(false);
  const [newRecord, setNewRecord]           = useState<Partial<DnsRecord>>(emptyRecord());
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [editRecord, setEditRecord]         = useState<Partial<DnsRecord>>({});
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  // ── API calls ────────────────────────────────────────────────────────────────
  const fetchDomains = useCallback(async () => {
    setLoadingDomains(true);
    try {
      const res  = await apiFetch(BASE);
      const json = await res.json();
      if (json.success) setDomains(json.domains);
      else toast.error(json.error || 'Failed to load domains');
    } catch { toast.error('Could not reach domains API'); }
    finally   { setLoadingDomains(false); }
  }, []);

  const fetchDns = useCallback(async (domain: string) => {
    setLoadingDns(true);
    try {
      const res  = await apiFetch(`${BASE}/${encodeURIComponent(domain)}/dns`);
      const json = await res.json();
      if (json.success) setDnsRecords(json.records);
      else toast.error(json.error || 'Failed to load DNS records');
    } catch { toast.error('Could not reach DNS API'); }
    finally   { setLoadingDns(false); }
  }, []);

  useEffect(() => { if (subTab === 'mydomains') fetchDomains(); }, [subTab, fetchDomains]);
  useEffect(() => { if (subTab === 'dns' && selectedDomain) fetchDns(selectedDomain); }, [subTab, selectedDomain, fetchDns]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setSearchResults([]);
    try {
      const res  = await apiFetch(`${BASE}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: query.trim() }),
      });
      const json = await res.json();
      if (json.success) setSearchResults(json.results);
      else toast.error(json.error || 'Search failed');
    } catch { toast.error('Could not reach availability API'); }
    finally   { setSearching(false); }
  };

  const handlePurchase = async (domain: string) => {
    setPurchasing(domain);
    try {
      const res  = await apiFetch(`${BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, years: 1 }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${domain} registered successfully!`);
        setSearchResults(prev => prev.map(r => r.domain === domain ? { ...r, owned: true, available: false } : r));
      } else { toast.error(json.error || 'Registration failed'); }
    } catch { toast.error('Registration request failed'); }
    finally   { setPurchasing(null); }
  };

  const openDns = (domain: string) => {
    setSelectedDomain(domain);
    onNavigateDns?.();
    setAddingRecord(false);
    setEditingId(null);
  };

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`Remove ${domain} from your registry?`)) return;
    try {
      const res  = await apiFetch(`${BASE}/${encodeURIComponent(domain)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success(`${domain} removed`); fetchDomains(); }
      else toast.error(json.error || 'Delete failed');
    } catch { toast.error('Delete request failed'); }
  };

  const toggleAutoRenew = async (domain: string, current: boolean) => {
    try {
      const res  = await apiFetch(`${BASE}/${encodeURIComponent(domain)}/autorenew`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoRenew: !current }),
      });
      const json = await res.json();
      if (json.success) setDomains(prev => ({ ...prev, [domain]: { ...prev[domain], autoRenew: !current } }));
      else toast.error(json.error);
    } catch { toast.error('Toggle failed'); }
  };

  const handleAddRecord = async () => {
    if (!selectedDomain || !newRecord.type || !newRecord.name || !newRecord.value) {
      toast.error('Type, Name and Value are required'); return;
    }
    try {
      const res  = await apiFetch(`${BASE}/${encodeURIComponent(selectedDomain)}/dns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Record added');
        setDnsRecords(prev => [...prev, json.record]);
        setAddingRecord(false); setNewRecord(emptyRecord());
      } else toast.error(json.error || 'Add failed');
    } catch { toast.error('Add record request failed'); }
  };

  const handleSaveEdit = async () => {
    if (!selectedDomain || !editingId) return;
    try {
      const res  = await apiFetch(`${BASE}/${encodeURIComponent(selectedDomain)}/dns/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRecord),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Record updated');
        setDnsRecords(prev => prev.map(r => r.id === editingId ? json.record : r));
        setEditingId(null);
      } else toast.error(json.error || 'Update failed');
    } catch { toast.error('Update request failed'); }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!selectedDomain) return;
    setDeletingId(id);
    try {
      const res  = await apiFetch(`${BASE}/${encodeURIComponent(selectedDomain)}/dns/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('Record deleted');
        setDnsRecords(prev => prev.filter(r => r.id !== id));
      } else toast.error(json.error || 'Delete failed');
    } catch { toast.error('Delete request failed'); }
    finally   { setDeletingId(null); }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full flex flex-col gap-6">
      {/* ═══════════════════ SEARCH VIEW ═══════════════════ */}
      {subTab === 'search' && (
        <div className="flex flex-col gap-4">
          {/* Search Card */}
          <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-zinc-800/40 bg-zinc-900/20 flex items-center gap-3">
              <Globe size={15} className="text-indigo-400" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Domain Search</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Check availability across .com, .net, .org, .io, .app, .dev and more — then register in one click.
                </p>
              </div>
            </div>
            <div className="p-5">
              <form onSubmit={handleSearch} className="flex gap-3">
                <div className="flex-1 relative">
                  <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="yourbrand  or  yourbrand.io"
                    className="w-full bg-black border border-zinc-800 rounded-lg py-2.5 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-700 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shrink-0"
                >
                  {searching ? <Loader2 size={14} className="animate-spin" /> : <SearchIcon size={14} />}
                  Check
                </button>
              </form>
            </div>
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
              <div className="p-5 border-b border-zinc-800/40 bg-zinc-900/20">
                <h3 className="text-sm font-semibold text-zinc-100">Availability Results</h3>
              </div>
              <div className="divide-y divide-zinc-800/40">
                {searchResults.map(r => {
                  const isOwned     = r.owned;
                  const isFree      = r.available === true && !isOwned;
                  const isUnknown   = r.available === null;
                  const isPurchasing = purchasing === r.domain;

                  return (
                    <div key={r.domain} className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-900/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isOwned   ? 'bg-blue-500/20'  :
                          isFree    ? 'bg-green-500/20' :
                          isUnknown ? 'bg-zinc-700/40'  : 'bg-red-500/20'
                        }`}>
                          {isOwned   ? <Shield size={12} className="text-blue-400" />     :
                           isFree    ? <Check  size={12} className="text-green-400" />    :
                           isUnknown ? <AlertCircle size={12} className="text-zinc-400" /> :
                           <X size={12} className="text-red-400" />}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-zinc-100">{r.domain}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${
                            isOwned   ? 'text-blue-400 bg-blue-900/40'   :
                            isFree    ? 'text-green-400 bg-green-900/40' :
                            isUnknown ? 'text-zinc-400 bg-zinc-800/40'   : 'text-red-400 bg-red-900/40'
                          }`}>
                            {isOwned ? 'Owned' : isFree ? 'Available' : isUnknown ? 'Unknown' : 'Taken'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {r.price != null && (
                          <span className="text-xs text-zinc-500">
                            <span className="text-zinc-200 font-semibold">${r.price.toFixed(2)}</span>/yr
                          </span>
                        )}
                        {isFree && (
                          <button
                            onClick={() => handlePurchase(r.domain)}
                            disabled={!!isPurchasing}
                            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isPurchasing ? <Loader2 size={12} className="animate-spin" /> : <Tag size={12} />}
                            Register
                          </button>
                        )}
                        {isOwned && (
                          <button
                            onClick={() => openDns(r.domain)}
                            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Server size={12} />
                            DNS
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {searchResults.length === 0 && !searching && (
            <div className="border border-dashed border-zinc-800/40 rounded-xl p-12 text-center">
              <Globe size={36} className="mx-auto mb-4 text-zinc-700" />
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Search any name above. We'll check .com, .net, .org, .io, .app and .dev availability instantly.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['.com', '.net', '.io', '.app', '.dev', '.co'].map(tld => (
                  <span key={tld} className="text-xs text-zinc-600 bg-zinc-900/60 border border-zinc-800/40 px-2.5 py-1 rounded-full">{tld}</span>
                ))}
              </div>
            </div>
          )}

          {/* Registrar notice */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-zinc-800/40 bg-zinc-900/20">
            <AlertCircle size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-zinc-500">
              To enable real domain registration, add{' '}
              <span className="font-mono text-zinc-300">NAMECHEAP_API_USER</span> and{' '}
              <span className="font-mono text-zinc-300">NAMECHEAP_API_KEY</span> to your{' '}
              <span className="font-mono text-zinc-300">.env</span>. Without these, domains are saved to your local registry only.
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════ MY DOMAINS VIEW ═══════════════════ */}
      {subTab === 'mydomains' && (
        <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl flex-1 flex flex-col min-h-0">
          <div className="p-5 border-b border-zinc-800/40 bg-zinc-900/20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Globe size={15} className="text-indigo-400" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">My Domains</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {Object.keys(domains).length} domain{Object.keys(domains).length !== 1 ? 's' : ''} in registry
                </p>
              </div>
            </div>
            <button
              onClick={fetchDomains}
              disabled={loadingDomains}
              className="p-2 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <RefreshCw size={14} className={loadingDomains ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex-1">
          {loadingDomains ? (
            <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading domains…</span>
            </div>
          ) : Object.keys(domains).length === 0 ? (
            <div className="p-12 text-center">
              <Globe size={36} className="mx-auto mb-4 text-zinc-700" />
              <p className="text-sm text-zinc-500 mb-4">No domains registered yet.</p>
              <button
                onClick={() => onNavigate?.('search')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Search for a domain
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {Object.entries(domains).map(([fqdn, entry]) => {
                const days          = daysUntil(entry.expiresAt);
                const isExpiringSoon = days > 0 && days <= 30;
                const isExpired     = days <= 0;
                return (
                  <div key={fqdn} className="flex items-center justify-between px-5 py-4 hover:bg-zinc-900/20 transition-colors gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        entry.status === 'active' && !isExpired ? 'bg-green-900/30' : 'bg-red-900/30'
                      }`}>
                        <Globe size={15} className={entry.status === 'active' && !isExpired ? 'text-green-400' : 'text-red-400'} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{fqdn}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            isExpired     ? 'text-red-400 bg-red-900/40'       :
                            isExpiringSoon ? 'text-yellow-400 bg-yellow-900/40' : 'text-green-400 bg-green-900/40'
                          }`}>
                            {isExpired ? 'Expired' : isExpiringSoon ? `Expires in ${days}d` : 'Active'}
                          </span>
                          <span className="text-xs text-zinc-600">via {entry.registrar}</span>
                          <span className="text-xs text-zinc-600 flex items-center gap-1">
                            <Clock size={10} />
                            {fmtDate(entry.expiresAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleAutoRenew(fqdn, entry.autoRenew)}
                        title={entry.autoRenew ? 'Auto-renew ON — click to disable' : 'Auto-renew OFF — click to enable'}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          entry.autoRenew
                            ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
                            : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                        }`}
                      >
                        <RefreshCw size={11} />
                        <span className="hidden sm:inline">Auto-renew</span>
                      </button>
                      <button
                        onClick={() => openDns(fqdn)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                      >
                        <Server size={12} />
                        DNS
                      </button>
                      <button
                        onClick={() => handleDeleteDomain(fqdn)}
                        className="p-1.5 rounded-lg hover:bg-red-900/30 text-zinc-600 hover:text-red-400 transition-colors"
                        title="Remove domain"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      )}

      {/* ═══════════════════ DNS MANAGER VIEW ═══════════════════ */}
      {subTab === 'dns' && !selectedDomain && (
        <div className="border border-dashed border-zinc-800/40 rounded-xl p-12 text-center">
          <Server size={36} className="mx-auto mb-4 text-zinc-700" />
          <p className="text-sm text-zinc-500 mb-4">No domain selected. Go to My Domains and click DNS.</p>
          <button
            onClick={() => onNavigateDns?.()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
          >
            Go to My Domains
          </button>
        </div>
      )}

      {subTab === 'dns' && selectedDomain && (
        <div className="flex-1 flex flex-col gap-4">
          <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="p-5 border-b border-zinc-800/40 bg-zinc-900/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => onNavigate?.('mydomains')}
                  className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                >
                  <ChevronLeft size={16} />
                </button>
                <Server size={15} className="text-indigo-400 flex-shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-100 truncate">DNS Manager</h2>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    <span className="text-zinc-300 font-medium">{selectedDomain}</span>
                    {' '}— {dnsRecords.length} record{dnsRecords.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => fetchDns(selectedDomain)}
                  disabled={loadingDns}
                  className="p-2 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <RefreshCw size={14} className={loadingDns ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => { setAddingRecord(true); setNewRecord(emptyRecord()); }}
                  disabled={addingRecord}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <Plus size={14} />
                  Add Record
                </button>
              </div>
            </div>

            {/* Add Record Form */}
            {addingRecord && (
              <div className="p-5 border-b border-zinc-800/40 bg-indigo-950/20">
                <p className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-3">New Record</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <select
                    value={newRecord.type || 'A'}
                    onChange={e => setNewRecord(p => ({ ...p, type: e.target.value as DnsType }))}
                    className="bg-black border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-600 transition-colors"
                  >
                    {DNS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    placeholder="Name (@, www)"
                    value={newRecord.name || ''}
                    onChange={e => setNewRecord(p => ({ ...p, name: e.target.value }))}
                    className="bg-black border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-600 transition-colors placeholder:text-zinc-600"
                  />
                  <input
                    placeholder="Value / IP / Target"
                    value={newRecord.value || ''}
                    onChange={e => setNewRecord(p => ({ ...p, value: e.target.value }))}
                    className="bg-black border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-600 transition-colors placeholder:text-zinc-600 sm:col-span-2"
                  />
                  <input
                    placeholder="TTL"
                    type="number"
                    min={60}
                    value={newRecord.ttl || 300}
                    onChange={e => setNewRecord(p => ({ ...p, ttl: parseInt(e.target.value) || 300 }))}
                    className="bg-black border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-600 transition-colors"
                  />
                </div>
                {(newRecord.type === 'MX' || newRecord.type === 'SRV') && (
                  <div className="mt-3">
                    <input
                      placeholder="Priority (10)"
                      type="number"
                      min={0}
                      value={newRecord.priority ?? ''}
                      onChange={e => setNewRecord(p => ({ ...p, priority: parseInt(e.target.value) }))}
                      className="w-44 bg-black border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-600 transition-colors"
                    />
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleAddRecord}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Save size={13} /> Save Record
                  </button>
                  <button
                    onClick={() => setAddingRecord(false)}
                    className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* DNS Table */}
            {loadingDns ? (
              <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Loading records…</span>
              </div>
            ) : dnsRecords.length === 0 ? (
              <div className="p-12 text-center">
                <Wifi size={36} className="mx-auto mb-4 text-zinc-700" />
                <p className="text-sm text-zinc-500 mb-4">No DNS records yet.</p>
                <button
                  onClick={() => setAddingRecord(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Add first record
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/40">
                      {['Type', 'Name', 'Value', 'TTL', ''].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-widest whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/30">
                    {dnsRecords.map(r => {
                      const isEditing = editingId === r.id;
                      return (
                        <tr key={r.id} className={`transition-colors ${isEditing ? 'bg-indigo-950/20' : 'hover:bg-zinc-900/20'}`}>
                          {isEditing ? (
                            <>
                              <td className="px-5 py-3">
                                <select
                                  value={editRecord.type || r.type}
                                  onChange={e => setEditRecord(p => ({ ...p, type: e.target.value as DnsType }))}
                                  className="bg-black border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 focus:outline-none"
                                >
                                  {DNS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </td>
                              <td className="px-5 py-3">
                                <input
                                  value={editRecord.name ?? r.name}
                                  onChange={e => setEditRecord(p => ({ ...p, name: e.target.value }))}
                                  className="bg-black border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 w-24 focus:outline-none"
                                />
                              </td>
                              <td className="px-5 py-3">
                                <input
                                  value={editRecord.value ?? r.value}
                                  onChange={e => setEditRecord(p => ({ ...p, value: e.target.value }))}
                                  className="bg-black border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 w-52 focus:outline-none"
                                />
                              </td>
                              <td className="px-5 py-3">
                                <input
                                  type="number"
                                  value={editRecord.ttl ?? r.ttl}
                                  onChange={e => setEditRecord(p => ({ ...p, ttl: parseInt(e.target.value) || 300 }))}
                                  className="bg-black border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 w-20 focus:outline-none"
                                />
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1.5 justify-end">
                                  <button onClick={handleSaveEdit} className="p-1.5 rounded-md bg-green-900/40 hover:bg-green-900/70 text-green-400 transition-colors">
                                    <Save size={13} />
                                  </button>
                                  <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
                                    <X size={13} />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-5 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold ${TYPE_COLORS[r.type] || 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                                  {r.type}
                                </span>
                              </td>
                              <td className="px-5 py-3 font-mono text-xs text-zinc-300">{r.name}</td>
                              <td className="px-5 py-3 font-mono text-xs text-zinc-400 max-w-xs">
                                <span className="truncate block max-w-[18rem]" title={r.value}>{r.value}</span>
                                {r.priority != null && (
                                  <span className="text-zinc-600 ml-1">priority {r.priority}</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-xs text-zinc-600 whitespace-nowrap">{r.ttl}s</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <button
                                    onClick={() => { setEditingId(r.id); setEditRecord({ type: r.type, name: r.name, value: r.value, ttl: r.ttl, priority: r.priority }); }}
                                    className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition-colors"
                                    title="Edit"
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRecord(r.id)}
                                    disabled={deletingId === r.id}
                                    className="p-1.5 rounded-md hover:bg-red-900/30 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                                    title="Delete"
                                  >
                                    {deletingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Propagation hint */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-zinc-800/40 bg-zinc-900/20">
            <AlertCircle size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-zinc-500">
              DNS changes can take up to 48 hours to propagate globally. Verify with{' '}
              <span className="font-mono text-zinc-300">dig {selectedDomain} @8.8.8.8</span>{' '}
              or{' '}
              <a
                href={`https://dnschecker.org/#A/${selectedDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
              >
                dnschecker.org
              </a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

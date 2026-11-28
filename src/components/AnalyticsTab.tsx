import { useCallback, useEffect, useState } from 'react';
import { Activity, Eye, RefreshCw, Users } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { API, apiFetch } from '../api/client';

type AnalyticsData = {
  days: number;
  totals: { visitors: number; pageviews: number };
  daily: Array<{ date: string; visitors: number; pageviews: number }>;
  projects: Array<{ name: string; domain: string | null; visitors: number; pageviews: number }>;
};

const ranges = [7, 30, 90];
const numberFormatter = new Intl.NumberFormat();

export function AnalyticsTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (): Promise<AnalyticsData> => {
    const response = await apiFetch(`${API}/api/orchestrator/analytics?days=${days}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Could not load analytics (HTTP ${response.status}).`);
    }
    return result;
  }, [days]);

  useEffect(() => {
    let active = true;
    fetchAnalytics()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not load website analytics.');
      });
    return () => { active = false; };
  }, [fetchAnalytics]);

  const report = data?.days === days ? data : null;
  const loading = !report && !error;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await fetchAnalytics();
      setData(result);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load website analytics.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-zinc-100">Website traffic</h2>
          <p className="mt-1 text-xs text-zinc-500">Estimated visitors and page views across your hosted projects.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Analytics date range"
            value={days}
            onChange={(event) => {
              setError(null);
              setDays(Number(event.target.value));
            }}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
          >
            {ranges.map((range) => <option key={range} value={range}>Last {range} days</option>)}
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Refresh analytics"
            className="rounded-md border border-zinc-800 p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Estimated visitors" value={report?.totals.visitors ?? 0} icon={Users} />
        <MetricCard label="Page views" value={report?.totals.pageviews ?? 0} icon={Eye} />
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-800/60 bg-[#0A0A0A]">
        <div className="flex items-center gap-2 border-b border-zinc-800/60 px-4 py-3">
          <Activity size={16} className="text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-200">Daily traffic</h3>
        </div>
        <div className="h-[280px] p-3 sm:p-5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={report?.daily ?? []} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="analyticsVisitors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#52525b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
              />
              <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }}
                labelFormatter={(date) => String(date)}
              />
              <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#38bdf8" strokeWidth={2} fill="url(#analyticsVisitors)" />
              <Area type="monotone" dataKey="pageviews" name="Page views" stroke="#a78bfa" strokeWidth={2} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-800/60 bg-[#0A0A0A]">
        <div className="border-b border-zinc-800/60 px-4 py-3">
          <h3 className="text-sm font-medium text-zinc-200">Traffic by website</h3>
        </div>
        {loading ? (
          <p className="p-6 text-center text-sm text-zinc-500">Loading analytics…</p>
        ) : report?.projects.length ? (
          <div className="divide-y divide-zinc-800/60">
            {report.projects.map((project) => (
              <div key={project.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-200">{project.name}</p>
                  <p className="truncate text-xs text-zinc-500">{project.domain || `${project.name}.epicglobal.app`}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{numberFormatter.format(project.visitors)}</p>
                    <p className="text-[11px] text-zinc-500">visitors</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{numberFormatter.format(project.pageviews)}</p>
                    <p className="text-[11px] text-zinc-500">page views</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-zinc-500">No deployed websites to report yet.</p>
        )}
      </section>

      <p className="text-xs leading-relaxed text-zinc-600">
        Visitors are estimated by unique IP address, not identified people. Shared networks may count as one visitor, changing IP addresses may count the same person more than once, and a CDN proxy can make visitors appear to share one address. Counts begin after analytics is deployed; previous visits are not available. Caddy access logs containing IP addresses are retained for up to 90 days.
      </p>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-[#0A0A0A] p-4">
      <div className="rounded-lg bg-zinc-900 p-2 text-zinc-400"><Icon size={17} /></div>
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="mt-0.5 text-xl font-semibold text-zinc-100">{numberFormatter.format(value)}</p>
      </div>
    </div>
  );
}

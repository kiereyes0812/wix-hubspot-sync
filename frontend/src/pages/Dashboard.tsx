import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, XCircle, RefreshCw, ExternalLink,
  ArrowRight, AlertCircle, Users, Activity,
} from 'lucide-react';
import api from '../utils/api';

export default function Dashboard() {
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['hubspot-status'],
    queryFn: () => api.get('/auth/hubspot/status').then(r => r.data),
  });

  const { data: events } = useQuery({
    queryKey: ['sync-events'],
    queryFn: () => api.get('/sync/events?limit=5').then(r => r.data),
    refetchInterval: 15_000,
  });

  const connectMutation = useMutation({
    mutationFn: () => api.get('/auth/hubspot/connect').then(r => r.data),
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/auth/hubspot/disconnect'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hubspot-status'] }),
  });

  const recentEvents = events?.events || [];
  const successCount = recentEvents.filter((e: any) => e.status === 'success').length;
  const failCount = recentEvents.filter((e: any) => e.status === 'failed').length;

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Overview</h1>
        <p className="text-zinc-500 mt-1">Manage your Wix ↔ HubSpot contact sync</p>
      </div>

      {/* Connection Card */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900 mb-1">HubSpot Connection</h2>
            <p className="text-zinc-500 text-sm">
              {status?.connected
                ? `Connected to portal ${status.portalId}`
                : 'Connect your HubSpot account to start syncing contacts'}
            </p>
          </div>

          {!isLoading && (
            <div className="flex items-center gap-2">
              {status?.connected ? (
                <>
                  <span className="badge-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                    Connected
                  </span>
                  <button
                    className="btn-danger text-sm"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : <XCircle size={13} />}
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                >
                  {connectMutation.isPending
                    ? <RefreshCw size={14} className="animate-spin" />
                    : <ExternalLink size={14} />}
                  Connect HubSpot
                </button>
              )}
            </div>
          )}
        </div>

        {status?.connected && (
          <div className="mt-4 pt-4 border-t border-zinc-100 grid grid-cols-3 gap-4">
            <StatCard label="Portal ID" value={status.portalId} icon={<CheckCircle2 size={14} className="text-emerald-500" />} />
            <StatCard label="Connected" value={status.connectedAt ? new Date(status.connectedAt).toLocaleDateString() : '—'} icon={<Activity size={14} className="text-blue-600" />} />
            <StatCard label="Token" value="Auto-refreshing" icon={<RefreshCw size={14} className="text-zinc-400" />} />
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {status?.connected && (
        <div className="grid grid-cols-3 gap-4">
          <QuickActionCard
            title="Field Mapping"
            description="Configure which fields sync between platforms"
            href="/mapping"
            color="wix"
          />
          <QuickActionCard
            title="Form Integration"
            description="Embed HubSpot forms or push Wix submissions"
            href="/forms"
            color="hubspot"
          />
          <QuickActionCard
            title="Sync Activity"
            description="Monitor all sync events and resolve errors"
            href="/sync-log"
            color="neutral"
          />
        </div>
      )}

      {/* Recent Sync Activity */}
      <div className="card">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
            <Activity size={16} className="text-zinc-400" />
            Recent Sync Activity
          </h2>
          <Link to="/sync-log" className="text-sm text-blue-700 hover:text-blue-800 flex items-center gap-1">
            View all <ArrowRight size={13} />
          </Link>
        </div>

        {recentEvents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users size={32} className="text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No sync events yet</p>
            <p className="text-zinc-400 text-xs mt-1">
              Events will appear here once contacts start syncing
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {recentEvents.map((event: any) => (
              <SyncEventRow key={event.id} event={event} />
            ))}
          </div>
        )}

        {recentEvents.length > 0 && (
          <div className="px-6 py-3 border-t border-zinc-100 flex gap-4 text-xs text-zinc-500">
            <span className="text-emerald-600 font-medium">{successCount} succeeded</span>
            {failCount > 0 && <span className="text-red-600 font-medium">{failCount} failed</span>}
          </div>
        )}
      </div>

      {/* Architecture Info */}
      <div className="card p-6 bg-zinc-50">
        <h3 className="font-semibold text-zinc-700 mb-3 text-sm uppercase tracking-wide">How Sync Works</h3>
        <div className="grid grid-cols-2 gap-6 text-sm text-zinc-600">
          <div>
            <p className="font-medium text-zinc-800 mb-1">🔄 Bi-Directional Sync</p>
            <p>Changes in Wix automatically push to HubSpot, and vice versa. Loop prevention via correlation IDs and a 30-second dedup window ensures no ping-pong updates.</p>
          </div>
          <div>
            <p className="font-medium text-zinc-800 mb-1">🔐 Secure by Default</p>
            <p>OAuth 2.0 with token rotation. All credentials encrypted at rest (AES-256-GCM). Tokens never exposed to the browser or logged.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-zinc-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
        {icon}
        {label}
      </div>
      <p className="font-medium text-zinc-900 text-sm">{value}</p>
    </div>
  );
}

function QuickActionCard({ title, description, href, color }: {
  title: string; description: string; href: string; color: 'wix' | 'hubspot' | 'neutral';
}) {
  const accent = color === 'wix' ? 'border-blue-200 hover:border-blue-400'
    : color === 'hubspot' ? 'border-orange-200 hover:border-orange-400'
    : 'border-zinc-200 hover:border-zinc-400';

  return (
    <Link to={href} className={`card p-5 border-2 transition-all duration-150 hover:shadow-md ${accent} block`}>
      <p className="font-semibold text-zinc-900 text-sm mb-1">{title}</p>
      <p className="text-zinc-500 text-xs leading-relaxed">{description}</p>
      <div className="flex items-center gap-1 mt-3 text-xs font-medium text-zinc-600">
        Configure <ArrowRight size={12} />
      </div>
    </Link>
  );
}

function SyncEventRow({ event }: { event: any }) {
  const statusBadge = {
    success: <span className="badge-success"><CheckCircle2 size={10} />Success</span>,
    failed: <span className="badge-error"><XCircle size={10} />Failed</span>,
    skipped: <span className="badge-neutral">Skipped</span>,
    pending: <span className="badge-warning"><RefreshCw size={10} className="animate-spin" />Pending</span>,
  }[event.status as string] || <span className="badge-neutral">{event.status}</span>;

  return (
    <div className="px-6 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 truncate">
          {event.event_type.replace(/_/g, ' ')}
        </p>
        <p className="text-xs text-zinc-400 truncate">
          {event.source} · {event.entity_id?.slice(0, 20)}…
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {statusBadge}
        <span className="text-xs text-zinc-400">
          {new Date(event.created_at).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

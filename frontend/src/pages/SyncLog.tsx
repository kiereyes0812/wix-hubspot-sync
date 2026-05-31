import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, RefreshCw, Clock, SkipForward, Activity } from 'lucide-react';
import api from '../utils/api';

export default function SyncLog() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sync-events-full'],
    queryFn: () => api.get('/sync/events?limit=100').then(r => r.data),
    refetchInterval: 10_000,
  });

  const events = data?.events || [];

  const stats = {
    total: events.length,
    success: events.filter((e: any) => e.status === 'success').length,
    failed: events.filter((e: any) => e.status === 'failed').length,
    skipped: events.filter((e: any) => e.status === 'skipped').length,
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Sync Log</h1>
          <p className="text-zinc-500 mt-1">Real-time audit trail of all sync events</p>
        </div>
        <button
          className="btn-secondary text-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard value={stats.total} label="Total Events" color="neutral" />
        <StatCard value={stats.success} label="Succeeded" color="success" />
        <StatCard value={stats.failed} label="Failed" color="error" />
        <StatCard value={stats.skipped} label="Skipped (dedup)" color="warning" />
      </div>

      {/* Log Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={20} className="animate-spin text-zinc-300" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20">
            <Activity size={32} className="text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No sync events yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Entity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Sync ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {events.map((event: any) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="card p-4 bg-zinc-50">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Legend</p>
        <div className="grid grid-cols-2 gap-3 text-xs text-zinc-600">
          <div className="flex items-start gap-2">
            <SkipForward size={12} className="mt-0.5 text-zinc-400" />
            <span><strong>Skipped (dedup):</strong> Event was within the 30s dedup window, preventing infinite sync loops.</span>
          </div>
          <div className="flex items-start gap-2">
            <SkipForward size={12} className="mt-0.5 text-amber-500" />
            <span><strong>Skipped (own write):</strong> HubSpot event was triggered by our own write — safely ignored.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  const colors = {
    neutral: 'bg-zinc-100 text-zinc-700',
    success: 'bg-emerald-50 text-emerald-700',
    error: 'bg-red-50 text-red-700',
    warning: 'bg-amber-50 text-amber-700',
  }[color] || 'bg-zinc-100 text-zinc-700';

  return (
    <div className={`card p-4 ${colors}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5 opacity-75">{label}</p>
    </div>
  );
}

function EventRow({ event }: { event: any }) {
  const statusIcon = {
    success: <CheckCircle2 size={14} className="text-emerald-500" />,
    failed: <XCircle size={14} className="text-red-500" />,
    skipped: <SkipForward size={14} className="text-zinc-400" />,
    pending: <Clock size={14} className="text-amber-500" />,
  }[event.status as string];

  const sourceBadge = {
    wix: <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-xs">Wix</span>,
    hubspot: <span className="inline-flex items-center px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-full text-xs">HubSpot</span>,
    form: <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs">Form</span>,
  }[event.source as string];

  return (
    <tr className="hover:bg-zinc-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {statusIcon}
          <span className="capitalize text-xs text-zinc-600">{event.status}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-zinc-700">
        {event.event_type?.replace(/_/g, ' ')}
        {event.error_message && (
          <p className="text-xs text-red-500 mt-0.5">{event.error_message}</p>
        )}
      </td>
      <td className="px-4 py-3">{sourceBadge}</td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-zinc-500">
          {event.entity_id?.slice(0, 24)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-zinc-400">
          {event.sync_id?.slice(0, 8)}…
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
        {new Date(event.created_at).toLocaleString()}
      </td>
    </tr>
  );
}

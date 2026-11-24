import { AlertTriangle, CheckCheck, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { AlertSeverity, NocSystemState } from '../types/network';
import { formatDateTime, getSeverityColor } from './StatusUtils';

interface AlertsViewProps {
  state: NocSystemState;
  onAcknowledge: (alertId: string) => void;
  onAcknowledgeAll: () => void;
  onSelectDevice: (deviceId: string) => void;
}

export function AlertsView({
  state,
  onAcknowledge,
  onAcknowledgeAll,
  onSelectDevice,
}: AlertsViewProps) {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Acknowledged' | 'Resolved'>('ALL');

  const filtered = state.alerts.filter((a) => {
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    return true;
  });

  const activeCount = state.alerts.filter((a) => a.status === 'Active').length;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'Critical', 'Warning', 'Normal', 'Unknown'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                severityFilter === sev
                  ? 'bg-cyan-600 text-white'
                  : 'bg-[#060B17] border border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {sev === 'ALL' ? 'All Severities' : sev}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-200"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Acknowledged">Acknowledged</option>
            <option value="Resolved">Resolved</option>
          </select>

          <button
            onClick={onAcknowledgeAll}
            disabled={activeCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-cyan-300 transition-colors disabled:opacity-40"
          >
            <CheckCheck className="w-4 h-4" />
            Acknowledge All ({activeCount})
          </button>
        </div>
      </div>

      {/* Alert List */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No alerts match the selected filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {filtered.map((alert) => {
              const sev = getSeverityColor(alert.severity);
              return (
                <div
                  key={alert.id}
                  className="px-5 py-4 flex flex-wrap items-start justify-between gap-4 hover:bg-slate-900/30"
                >
                  <div className="space-y-1.5 min-w-0 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 font-semibold ${sev.text}`}>
                        {alert.severity === 'Critical' && <XCircle className="w-4 h-4" />}
                        {alert.severity === 'Warning' && <AlertTriangle className="w-4 h-4" />}
                        {alert.severity === 'Normal' && <CheckCircle2 className="w-4 h-4" />}
                        {alert.severity === 'Unknown' && <Info className="w-4 h-4" />}
                        {alert.severity}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="font-semibold text-slate-100">{alert.name}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-400">{alert.category}</span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{alert.description}</p>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono tabular-nums">
                      <button
                        onClick={() => onSelectDevice(alert.affectedDeviceId)}
                        className="text-cyan-400 hover:underline"
                      >
                        {alert.affectedDeviceName}
                      </button>
                      <span aria-hidden="true">·</span>
                      <span>{formatDateTime(alert.timestamp)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{alert.source}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-medium ${
                        alert.status === 'Active'
                          ? 'text-red-400'
                          : alert.status === 'Acknowledged'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {alert.status}
                    </span>

                    {alert.status === 'Active' && (
                      <button
                        onClick={() => onAcknowledge(alert.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

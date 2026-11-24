import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Database,
  HardDrive,
  Server,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import type { CloudBackupState, NocSystemState } from '../types/network';
import { formatDateTime } from './StatusUtils';

interface CloudBackupViewProps {
  state: NocSystemState;
  onTriggerBackup: () => void;
  onSimulateFailure: () => void;
  onSaveSettings: (patch: Partial<CloudBackupState>) => void;
  busyAction: string | null;
}

export function CloudBackupView({
  state,
  onTriggerBackup,
  onSimulateFailure,
  onSaveSettings,
  busyAction,
}: CloudBackupViewProps) {
  const { backup } = state;
  const [scheduleTime, setScheduleTime] = useState(backup.scheduleTime);
  const [schedulerEnabled, setSchedulerEnabled] = useState(backup.schedulerEnabled);
  const [retentionDays, setRetentionDays] = useState(backup.retentionDays);

  const storagePct = Math.min(
    100,
    Math.round((backup.usedStorageGb / backup.totalCapacityGb) * 1000) / 10
  );
  const isRunning = backup.status === 'In Progress';

  return (
    <div className="space-y-6">
      {/* Top Status & Pipeline Animation */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-xl border border-slate-800 bg-[#0B1222] p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Automatic Off-Site Cloud Backup Pipeline
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Daily encrypted replication from Main File Server to off-site cloud storage via Enterprise Dedicated Line.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onTriggerBackup}
                disabled={isRunning || busyAction === 'backup-trigger'}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-colors disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4" />
                {isRunning ? `Transferring (${backup.progressPct}%)` : 'Run Backup Now'}
              </button>
              <button
                onClick={onSimulateFailure}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-xs font-medium text-red-300 transition-colors"
              >
                <AlertTriangle className="w-4 h-4" />
                Simulate Backup Failure
              </button>
            </div>
          </div>

          {/* Animated Transfer Pipeline */}
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-5">
            <div className="grid grid-cols-1 md:grid-cols-5 items-center gap-3">
              <div className="rounded-lg border border-slate-700 bg-[#0B1222] p-3 text-center">
                <Server className="w-6 h-6 text-cyan-400 mx-auto" />
                <div className="text-xs font-semibold text-slate-100 mt-2">Main File Server</div>
                <div className="text-[11px] font-mono text-slate-400">10.0.10.10</div>
              </div>

              <div className="flex flex-col items-center justify-center gap-1">
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      backup.status === 'Failed'
                        ? 'bg-red-500 w-1/2'
                        : isRunning
                        ? 'bg-emerald-400 w-full animate-pulse'
                        : 'bg-cyan-500/50 w-full'
                    }`}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                  LAN Sync <ArrowRight className="w-3 h-3" />
                </span>
              </div>

              <div className="rounded-lg border border-slate-700 bg-[#0B1222] p-3 text-center">
                <HardDrive className="w-6 h-6 text-sky-400 mx-auto" />
                <div className="text-xs font-semibold text-slate-100 mt-2">Backup Server</div>
                <div className="text-[11px] font-mono text-slate-400">10.0.10.20</div>
              </div>

              <div className="flex flex-col items-center justify-center gap-1">
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      backup.status === 'Failed'
                        ? 'bg-red-500 w-1/3'
                        : isRunning
                        ? 'bg-emerald-400 w-full animate-pulse'
                        : 'bg-cyan-500/50 w-full'
                    }`}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                  {isRunning ? `${backup.currentThroughputMbps} Mbps` : 'TLS 1.3'} <ArrowRight className="w-3 h-3" />
                </span>
              </div>

              <div className="rounded-lg border border-cyan-500/40 bg-[#0B172C] p-3 text-center">
                <Cloud className="w-6 h-6 text-emerald-400 mx-auto" />
                <div className="text-xs font-semibold text-slate-100 mt-2">Cloud Storage</div>
                <div className="text-[11px] font-mono text-slate-400 truncate">{backup.targetBucket}</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-300 flex items-center gap-1.5">
                  {backup.status === 'Completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {backup.status === 'Failed' && <XCircle className="w-4 h-4 text-red-400" />}
                  Status: <span className="font-semibold text-slate-100">{backup.status}</span>
                </span>
                <span className="font-mono tabular-nums text-cyan-300">{backup.progressPct}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    backup.status === 'Failed'
                      ? 'bg-red-500'
                      : backup.status === 'In Progress'
                      ? 'bg-emerald-400'
                      : 'bg-cyan-500'
                  }`}
                  style={{ width: `${backup.progressPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3.5">
              <div className="text-slate-500">Last Successful Backup</div>
              <div className="font-mono text-slate-100 tabular-nums mt-1">
                {formatDateTime(backup.lastSuccessfulBackup)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3.5">
              <div className="text-slate-500">Next Scheduled Backup</div>
              <div className="font-mono text-cyan-300 tabular-nums mt-1">
                {formatDateTime(backup.nextScheduledBackup)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3.5">
              <div className="text-slate-500">Retention Policy</div>
              <div className="font-mono text-slate-100 tabular-nums mt-1">
                {backup.retentionDays} Daily Snapshots
              </div>
            </div>
          </div>
        </div>

        {/* Storage Capacity & Scheduler Config */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-5 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Cloud Storage Capacity</h3>
              <Database className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-display font-bold text-slate-100 tabular-nums">
                  {backup.usedStorageGb.toLocaleString()} GB
                </span>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  of {backup.totalCapacityGb.toLocaleString()} GB ({storagePct}%)
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden mt-2.5">
                <div
                  className="h-full bg-cyan-400 transition-all duration-300"
                  style={{ width: `${storagePct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <CalendarClock className="w-4 h-4 text-cyan-400" />
              Automated Backup Scheduler
            </div>
            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between">
                <span className="text-slate-300">Enable Daily Auto-Backup</span>
                <input
                  type="checkbox"
                  checked={schedulerEnabled}
                  onChange={(e) => setSchedulerEnabled(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
              </label>
              <label className="block">
                <span className="text-slate-400">Daily Schedule Time (24h)</span>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-slate-100 font-mono"
                />
              </label>
              <label className="block">
                <span className="text-slate-400">Retention (Days)</span>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-slate-100 font-mono"
                />
              </label>
              <button
                onClick={() =>
                  onSaveSettings({ schedulerEnabled, scheduleTime, retentionDays })
                }
                className="w-full py-2 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-cyan-300 transition-colors"
              >
                Save Backup Schedule
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Backup Job History Table */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">Backup Execution History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#111A2E] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Job ID</th>
                <th className="text-left py-2.5 px-4 font-medium">Job Name</th>
                <th className="text-left py-2.5 px-4 font-medium">Trigger</th>
                <th className="text-left py-2.5 px-4 font-medium">Status</th>
                <th className="text-right py-2.5 px-4 font-medium">Files</th>
                <th className="text-right py-2.5 px-4 font-medium">Volume</th>
                <th className="text-left py-2.5 px-4 font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {backup.jobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-4 font-mono text-slate-300">{job.id}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-100">{job.jobName}</div>
                    {job.errorMessage && (
                      <div className="text-[11px] text-red-400 mt-0.5">{job.errorMessage}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-slate-400">{job.triggerType}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`font-medium ${
                        job.status === 'Completed'
                          ? 'text-emerald-400'
                          : job.status === 'Failed'
                          ? 'text-red-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {job.status} ({job.progressPct}%)
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                    {job.filesTransferred.toLocaleString()} / {job.totalFiles.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                    {job.sizeGb} GB
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400">
                    {formatDateTime(job.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

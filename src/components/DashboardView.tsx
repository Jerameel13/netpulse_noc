import {
  Activity,
  AlertTriangle,
  CloudUpload,
  Cpu,
  HardDrive,
  Network,
  Package,
  RotateCcw,
  ServerCrash,
  ShieldAlert,
  Wifi,
  ZapOff,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NocSystemState } from '../types/network';
import { formatShortTime, getSeverityColor } from './StatusUtils';

interface DashboardViewProps {
  state: NocSystemState;
  onNavigate: (tab: string) => void;
  onSelectDevice: (deviceId: string) => void;
  onTriggerBackup: () => void;
  onSimulateBackupFailure: () => void;
  onFailDedicatedLine: () => void;
  onRecoverDedicatedLine: () => void;
  onFailCoreSwitch: () => void;
  onReplaceCoreWithSpare: () => void;
  onSimulateSnmpAlert: () => void;
  onResetAll: () => void;
  busyAction: string | null;
}

export function DashboardView({
  state,
  onNavigate,
  onSelectDevice,
  onTriggerBackup,
  onSimulateBackupFailure,
  onFailDedicatedLine,
  onRecoverDedicatedLine,
  onFailCoreSwitch,
  onReplaceCoreWithSpare,
  onSimulateSnmpAlert,
  onResetAll,
  busyAction,
}: DashboardViewProps) {
  const operationalDevices = state.devices.filter((d) => d.type !== 'cold-spare');
  const totalDevices = operationalDevices.length;
  const onlineDevices = operationalDevices.filter((d) => d.status === 'online' || d.status === 'warning').length;
  const offlineDevices = operationalDevices.filter((d) => d.status === 'offline').length;
  const activeConnections = state.links.filter((l) => l.status === 'up' || l.status === 'degraded').length;
  const availabilityPct =
    totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 1000) / 10 : 100;

  const availableSpareSwitches = state.spares.filter(
    (s) =>
      s.status === 'Available' &&
      (s.category === 'Core Switch' || s.category === 'Access Switch')
  ).length;

  const activeAlerts = state.alerts.filter((a) => a.status === 'Active');
  const storagePct = Math.round(
    (state.backup.usedStorageGb / state.backup.totalCapacityGb) * 1000
  ) / 10;

  const coreSwitch = state.devices.find((d) => d.id === 'core-switch');
  const coreOffline = coreSwitch?.status === 'offline';
  const lineOffline = state.dedicatedLine.status === 'Offline' || state.dedicatedLine.failoverActive;
  const backupInProgress = state.backup.status === 'In Progress';
  const availableCoreSpare = state.spares.find(
    (s) => s.status === 'Available' && s.compatibleWith.includes('core-switch')
  );

  // Segment availability chart data
  const segments = [
    'Central ICT Cabinet',
    'CID Cabinet',
    'SGOD Cabinet',
    'OSDS Cabinet',
    'Library Cabinet',
    'Server & Cloud',
  ].map((cab) => {
    const devs = operationalDevices.filter((d) => d.cabinet === cab);
    const up = devs.filter((d) => d.status !== 'offline').length;
    const pct = devs.length > 0 ? Math.round((up / devs.length) * 100) : 100;
    return {
      segment: cab.replace(' Cabinet', ''),
      availability: pct,
      online: up,
      total: devs.length,
    };
  });

  // Backup activity chart data
  const backupChartData = state.backup.jobs
    .slice(0, 6)
    .reverse()
    .map((job) => ({
      name: job.id.toUpperCase(),
      sizeGb: job.sizeGb,
      files: job.filesTransferred,
    }));

  const kpiCards = [
    {
      label: 'Total Network Devices',
      value: String(totalDevices),
      sub: `${state.spares.length} cold spare units staged`,
      tone: 'text-slate-100',
    },
    {
      label: 'Online Devices',
      value: String(onlineDevices),
      sub: 'Operational & reachable',
      tone: 'text-emerald-400',
    },
    {
      label: 'Offline Devices',
      value: String(offlineDevices),
      sub: offlineDevices > 0 ? 'Action required' : 'Zero outages',
      tone: offlineDevices > 0 ? 'text-red-400' : 'text-slate-300',
    },
    {
      label: 'Active Network Connections',
      value: String(activeConnections),
      sub: `of ${state.links.filter((l) => l.medium !== 'standby').length} trunk & access links`,
      tone: 'text-cyan-400',
    },
    {
      label: 'Network Availability',
      value: `${availabilityPct}%`,
      sub: `Dedicated SLA target ${state.dedicatedLine.slaTargetPct}%`,
      tone: availabilityPct >= 99 ? 'text-emerald-400' : 'text-amber-400',
    },
    {
      label: 'Internet Latency',
      value: lineOffline ? 'Timeout' : `${state.dedicatedLine.latencyMs} ms`,
      sub: `${state.dedicatedLine.telemetrySource === 'LIVE' ? 'Live Probe' : 'Simulated'} · Jitter ${state.dedicatedLine.jitterMs} ms`,
      tone: lineOffline ? 'text-red-400' : 'text-cyan-400',
    },
    {
      label: 'Packet Loss',
      value: `${state.dedicatedLine.packetLossPct}%`,
      sub: lineOffline ? 'Primary carrier severed' : 'Within 0.1% threshold',
      tone: state.dedicatedLine.packetLossPct > 1 ? 'text-red-400' : 'text-emerald-400',
    },
    {
      label: 'Daily Backup Status',
      value:
        state.backup.status === 'In Progress'
          ? `Syncing ${state.backup.progressPct}%`
          : state.backup.status,
      sub: `Schedule ${state.backup.scheduleTime} daily`,
      tone:
        state.backup.status === 'Completed'
          ? 'text-emerald-400'
          : state.backup.status === 'Failed'
          ? 'text-red-400'
          : 'text-cyan-400',
    },
    {
      label: 'Cloud Storage Utilization',
      value: `${storagePct}%`,
      sub: `${state.backup.usedStorageGb.toLocaleString()} / ${state.backup.totalCapacityGb.toLocaleString()} GB`,
      tone: storagePct > 85 ? 'text-amber-400' : 'text-slate-100',
    },
    {
      label: 'Available Spare Switches',
      value: String(availableSpareSwitches),
      sub: `${state.replacementHistory.length} replacements logged`,
      tone: availableSpareSwitches > 0 ? 'text-cyan-400' : 'text-amber-400',
    },
    {
      label: 'Active SNMP Alerts',
      value: String(activeAlerts.length),
      sub: `${state.snmpLogs.length} recent polls & traps`,
      tone: activeAlerts.length > 0 ? 'text-red-400' : 'text-emerald-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 11 Real-Time Monitoring KPI Cards */}
      <section aria-label="Key Network Telemetry">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpiCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-slate-800 bg-[#0B1222] px-4 py-3.5 flex flex-col justify-between"
            >
              <div className="text-xs text-slate-400 leading-snug">{card.label}</div>
              <div className={`text-2xl font-display font-bold tabular-nums mt-2 ${card.tone}`}>
                {card.value}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 truncate">{card.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive 4-Scenario Presentation Deck */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1222] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Interactive Network Improvement Demonstration Scenarios
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Trigger live backend simulations across the four recommended infrastructure upgrades. Changes propagate immediately to the topology and alert engine.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('topology')}
              className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-xs font-medium text-cyan-300 transition-colors whitespace-nowrap"
            >
              Open Live Topology
            </button>
            <button
              onClick={onResetAll}
              disabled={busyAction === 'reset-all'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* Scenario 1 */}
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-400">Scenario 01</span>
                <HardDrive className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mt-1">Automatic Cloud Backup</h3>
              <p className="text-xs text-slate-400 mt-1">
                Stream files from Main File Server to Off-Site Cloud Storage and monitor progress or failure alerts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onTriggerBackup}
                disabled={backupInProgress}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-colors disabled:opacity-50"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                {backupInProgress ? `${state.backup.progressPct}%` : 'Start Backup'}
              </button>
              <button
                onClick={onSimulateBackupFailure}
                className="px-2.5 py-2 rounded-md bg-[#111A2E] hover:bg-red-950/50 border border-slate-700 hover:border-red-500/40 text-xs text-slate-300 hover:text-red-300 transition-colors"
              >
                Fail
              </button>
            </div>
          </div>

          {/* Scenario 2 */}
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-cyan-400">Scenario 02</span>
                <Wifi className="w-4 h-4 text-cyan-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mt-1">Dedicated Line Failure</h3>
              <p className="text-xs text-slate-400 mt-1">
                Simulate an ISP carrier outage, verify 99.9% SLA breach alert & failover, then restore connectivity.
              </p>
            </div>
            {!lineOffline ? (
              <button
                onClick={onFailDedicatedLine}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-xs font-medium text-red-300 transition-colors"
              >
                <ZapOff className="w-3.5 h-3.5" />
                Simulate Line Outage
              </button>
            ) : (
              <button
                onClick={onRecoverDedicatedLine}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors"
              >
                <Activity className="w-3.5 h-3.5" />
                Recover Dedicated Line
              </button>
            )}
          </div>

          {/* Scenario 3 */}
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-400">Scenario 03</span>
                <Package className="w-4 h-4 text-sky-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mt-1">Cold Spare Replacement</h3>
              <p className="text-xs text-slate-400 mt-1">
                Take Core Switch offline, then swap in a pre-staged Onsite Cold Spare to avoid procurement delays.
              </p>
            </div>
            {!coreOffline ? (
              <button
                onClick={onFailCoreSwitch}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-xs font-medium text-red-300 transition-colors"
              >
                <ServerCrash className="w-3.5 h-3.5" />
                Simulate Core Switch Failure
              </button>
            ) : availableCoreSpare ? (
              <button
                onClick={onReplaceCoreWithSpare}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors"
              >
                Deploy Cold Spare ({availableCoreSpare.serialNumber})
              </button>
            ) : (
              <button
                onClick={() => onNavigate('spares')}
                className="w-full px-3 py-2 rounded-md bg-slate-800 text-xs font-medium text-slate-200"
              >
                Manage Cold Spares
              </button>
            )}
          </div>

          {/* Scenario 4 */}
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-amber-400">Scenario 04</span>
                <ShieldAlert className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mt-1">SNMP Smart Alerts</h3>
              <p className="text-xs text-slate-400 mt-1">
                Trigger switch trunk saturation (94%) and RAID disk SMART predictive warning via SNMP traps.
              </p>
            </div>
            <button
              onClick={onSimulateSnmpAlert}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-xs font-medium text-amber-300 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Trigger SNMP Smart Alert
            </button>
          </div>
        </div>
      </section>

      {/* 6 Live Monitoring Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Chart 1: Network Bandwidth Utilization */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Network Bandwidth Utilization</h3>
              <p className="text-xs text-slate-400">Dedicated Line Download vs Upload (Mbps)</p>
            </div>
            <Network className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={state.dashboardHistory}>
                <defs>
                  <linearGradient id="bwIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bwOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} width={38} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#060B17', borderColor: '#1E293B', fontSize: '12px' }}
                />
                <Area
                  type="monotone"
                  dataKey="bandwidthInMbps"
                  name="Download (Mbps)"
                  stroke="#22d3ee"
                  fill="url(#bwIn)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="bandwidthOutMbps"
                  name="Upload (Mbps)"
                  stroke="#3b82f6"
                  fill="url(#bwOut)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Internet Latency */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Internet Latency</h3>
              <p className="text-xs text-slate-400">Dedicated Fiber RTT (ms)</p>
            </div>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={state.dashboardHistory}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} width={35} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#060B17', borderColor: '#1E293B', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="latencyMs"
                  name="Latency (ms)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Network Uptime vs 99.9% SLA */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Network Uptime & 99.9% SLA</h3>
              <p className="text-xs text-slate-400">Enterprise Dedicated Line Compliance</p>
            </div>
            <span className="text-xs font-mono text-cyan-400 tabular-nums">Target 99.9%</span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={state.dashboardHistory}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis domain={[99.5, 100]} stroke="#64748B" fontSize={10} tickLine={false} width={42} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#060B17', borderColor: '#1E293B', fontSize: '12px' }}
                />
                <ReferenceLine y={99.9} stroke="#F59E0B" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="uptimePct"
                  name="Uptime (%)"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Backup Activity */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Cloud Backup Activity</h3>
              <p className="text-xs text-slate-400">Snapshot Volume Transferred (GB)</p>
            </div>
            <HardDrive className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={backupChartData}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} width={35} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#060B17', borderColor: '#1E293B', fontSize: '12px' }}
                />
                <Bar dataKey="sizeGb" name="Backup Size (GB)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Device Availability by Segment */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Device Availability by Cabinet</h3>
              <p className="text-xs text-slate-400">Online Ratio per Division Segment (%)</p>
            </div>
            <Cpu className="w-4 h-4 text-sky-400" />
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segments}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="segment" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#64748B" fontSize={10} tickLine={false} width={35} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#060B17', borderColor: '#1E293B', fontSize: '12px' }}
                />
                <Bar dataKey="availability" name="Availability (%)" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 6: CPU & Memory Utilization */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">CPU & Memory Utilization</h3>
              <p className="text-xs text-slate-400">Managed Infrastructure Fleet Average (%)</p>
            </div>
            <Cpu className="w-4 h-4 text-amber-400" />
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={state.dashboardHistory}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#64748B" fontSize={10} tickLine={false} width={35} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#060B17', borderColor: '#1E293B', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="avgCpuPct"
                  name="Avg CPU (%)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="avgMemoryPct"
                  name="Avg Memory (%)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Recent Alerts & Critical Infrastructure Quick Inspect */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-100">Recent SNMP & Infrastructure Alerts</h3>
            <button
              onClick={() => onNavigate('alerts')}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
            >
              View All Alerts
            </button>
          </div>
          <div className="divide-y divide-slate-800/70">
            {state.alerts.slice(0, 5).map((alert) => {
              const sev = getSeverityColor(alert.severity);
              return (
                <div key={alert.id} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`font-semibold ${sev.text}`}>{alert.severity}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="font-medium text-slate-100 truncate">{alert.name}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{alert.description}</p>
                    <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                      {alert.affectedDeviceName} · {formatShortTime(alert.timestamp)}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{alert.status}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-100">Core Infrastructure Health</h3>
            <button
              onClick={() => onNavigate('topology')}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
            >
              Inspect in Topology
            </button>
          </div>
          <div className="divide-y divide-slate-800/70">
            {state.devices
              .filter((d) =>
                [
                  'dedicated-line',
                  'edge-router',
                  'core-switch',
                  'dist-1',
                  'dist-2',
                  'main-file-server',
                  'backup-server',
                  'watchdog-server',
                ].includes(d.id)
              )
              .map((dev) => (
                <button
                  key={dev.id}
                  onClick={() => onSelectDevice(dev.id)}
                  className="w-full px-5 py-2.5 flex items-center justify-between text-left hover:bg-[#111A2E] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-100 truncate">{dev.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {dev.ipAddress} · {dev.telemetrySource}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs font-mono tabular-nums">
                    <span className="text-slate-400">
                      {typeof dev.cpuUsage === 'number' ? `CPU ${dev.cpuUsage}%` : `${dev.bandwidthInMbps} Mbps`}
                    </span>
                    <span
                      className={`font-sans font-medium ${
                        dev.status === 'online'
                          ? 'text-emerald-400'
                          : dev.status === 'warning'
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    >
                      {dev.status === 'online' ? 'Online' : dev.status === 'warning' ? 'Warning' : 'Offline'}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}

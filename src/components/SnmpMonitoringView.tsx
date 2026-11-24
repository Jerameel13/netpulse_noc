import {
  Activity,
  AlertTriangle,
  Cpu,
  HardDrive,
  Radio,
  RefreshCw,
} from 'lucide-react';
import type { NocSystemState } from '../types/network';
import { formatDateTime, getSeverityColor, getStatusTextColor } from './StatusUtils';

interface SnmpMonitoringViewProps {
  state: NocSystemState;
  onSimulateSnmp: (kind: 'utilization' | 'disk' | 'both') => void;
  onProbeDevice: (deviceId: string) => void;
  onSelectDevice: (deviceId: string) => void;
}

export function SnmpMonitoringView({
  state,
  onSimulateSnmp,
  onProbeDevice,
  onSelectDevice,
}: SnmpMonitoringViewProps) {
  const managedDevices = state.devices.filter((d) => d.snmpEnabled);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-100">
              SNMP Polling & Automated Trap Collector
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Monitors interface counters (`ifOperStatus`, `ifInOctets`), CPU/Memory (`hrProcessorLoad`), and disk health (`hrStorageUsed`) · UDP Trap Listener active on port {state.settings.snmp.trapPort}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onSimulateSnmp('utilization')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-xs font-medium text-amber-300 transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            Simulate High Switch Utilization
          </button>
          <button
            onClick={() => onSimulateSnmp('disk')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-xs font-medium text-red-300 transition-colors"
          >
            <HardDrive className="w-3.5 h-3.5" />
            Simulate Server Disk SMART Warning
          </button>
        </div>
      </div>

      {/* Managed SNMP Devices Matrix */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">SNMP Managed Devices Telemetry</h3>
          <span className="text-xs text-slate-400 font-mono">
            Community: {state.settings.snmp.community} · Poll: {state.settings.pollIntervalMs / 1000}s
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#111A2E] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Device</th>
                <th className="text-left py-2.5 px-4 font-medium">IP Address</th>
                <th className="text-left py-2.5 px-4 font-medium">Status</th>
                <th className="text-left py-2.5 px-4 font-medium">Source</th>
                <th className="text-right py-2.5 px-4 font-medium">CPU</th>
                <th className="text-right py-2.5 px-4 font-medium">Memory</th>
                <th className="text-right py-2.5 px-4 font-medium">Disk</th>
                <th className="text-right py-2.5 px-4 font-medium">Traffic</th>
                <th className="text-right py-2.5 px-4 font-medium">Poll</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {managedDevices.map((dev) => (
                <tr key={dev.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => onSelectDevice(dev.id)}
                      className="font-medium text-cyan-300 hover:text-cyan-200 text-left"
                    >
                      {dev.name}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-300">{dev.ipAddress}</td>
                  <td className={`py-2.5 px-4 font-medium capitalize ${getStatusTextColor(dev.status)}`}>
                    {dev.status}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                    {dev.telemetrySource}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                    {typeof dev.cpuUsage === 'number' ? `${dev.cpuUsage}%` : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                    {typeof dev.memoryUsage === 'number' ? `${dev.memoryUsage}%` : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {typeof dev.diskUsage === 'number' ? (
                      <span className={dev.diskUsage >= 85 ? 'text-red-400 font-semibold' : 'text-slate-200'}>
                        {dev.diskUsage}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-cyan-300">
                    {dev.bandwidthInMbps} Mbps
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => onProbeDevice(dev.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-200"
                    >
                      <RefreshCw className="w-3 h-3" /> Poll
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live SNMP Polls & Trap Event Stream */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">SNMP Poll & Trap Event Log</h3>
          </div>
          <span className="text-xs text-slate-400">Green: Normal · Yellow: Warning · Red: Critical · Gray: Unknown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#111A2E] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Timestamp</th>
                <th className="text-left py-2.5 px-4 font-medium">Severity</th>
                <th className="text-left py-2.5 px-4 font-medium">Method</th>
                <th className="text-left py-2.5 px-4 font-medium">Device</th>
                <th className="text-left py-2.5 px-4 font-medium">OID</th>
                <th className="text-left py-2.5 px-4 font-medium">Metric & Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {state.snmpLogs.map((log) => {
                const sev = getSeverityColor(log.severity);
                return (
                  <tr key={log.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className={`py-2.5 px-4 font-semibold ${sev.text}`}>
                      <span className="inline-flex items-center gap-1">
                        {log.severity === 'Critical' || log.severity === 'Warning' ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : null}
                        {log.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">{log.method}</td>
                    <td className="py-2.5 px-4 text-slate-100 font-medium">{log.deviceName}</td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">{log.oid}</td>
                    <td className="py-2.5 px-4">
                      <span className="text-slate-200">{log.metric}: </span>
                      <span className="font-mono text-cyan-300">{log.value}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

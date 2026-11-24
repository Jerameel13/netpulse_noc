import {
  ArrowRight,
  RefreshCw,
  RotateCcw,
  Wrench,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ColdSpareItem, NetworkDevice } from '../types/network';
import {
  DeviceTypeIcon,
  formatDateTime,
  formatUptime,
  getStatusLabel,
  getStatusTextColor,
  StatusIcon,
} from './StatusUtils';

interface DeviceDetailsDrawerProps {
  device: NetworkDevice | null;
  allDevices: NetworkDevice[];
  spares: ColdSpareItem[];
  onClose: () => void;
  onSelectDevice: (deviceId: string) => void;
  onProbe: (deviceId: string) => void;
  onSimulateFailure: (deviceId: string) => void;
  onRestore: (deviceId: string) => void;
  onReplaceWithSpare: (failedDeviceId: string, spareItemId: string) => void;
  busyAction: string | null;
}

export function DeviceDetailsDrawer({
  device,
  allDevices,
  spares,
  onClose,
  onSelectDevice,
  onProbe,
  onSimulateFailure,
  onRestore,
  onReplaceWithSpare,
  busyAction,
}: DeviceDetailsDrawerProps) {
  if (!device) return null;

  const isSwitch =
    device.type === 'core-switch' ||
    device.type === 'distribution-switch' ||
    device.type === 'access-switch';

  const compatibleAvailableSpares = spares.filter(
    (s) => s.status === 'Available' && s.compatibleWith.includes(device.id)
  );

  const connectedDevices = device.connectedTo
    .map((id) => allDevices.find((d) => d.id === id))
    .filter((d): d is NetworkDevice => Boolean(d));

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#0B1222] border-l border-slate-800 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-800">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-lg bg-[#111A2E] border border-slate-800 text-cyan-400 shrink-0">
            <DeviceTypeIcon type={device.type} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-100 truncate">{device.name}</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 mt-1">
              <span className={`inline-flex items-center gap-1 font-medium ${getStatusTextColor(device.status)}`}>
                <StatusIcon status={device.status} className="w-3.5 h-3.5" />
                {getStatusLabel(device.status)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{device.ipAddress}</span>
              <span aria-hidden="true">·</span>
              <span>
                {device.telemetrySource === 'LIVE' ? 'Live Probe' : 'Demo Simulated'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close device details"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Identity Grid */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 mb-3">Device Specification & Identity</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs border border-slate-800 rounded-lg p-4 bg-[#060B17]">
            <div>
              <div className="text-slate-500">Device Type</div>
              <div className="text-slate-200 font-medium mt-0.5 capitalize">{device.type.replace('-', ' ')}</div>
            </div>
            <div>
              <div className="text-slate-500">Cabinet / Zone</div>
              <div className="text-slate-200 font-medium mt-0.5">{device.cabinet}</div>
            </div>
            <div>
              <div className="text-slate-500">IP Address</div>
              <div className="text-slate-200 font-mono tabular-nums mt-0.5">{device.ipAddress}</div>
            </div>
            {device.macAddress && (
              <div>
                <div className="text-slate-500">MAC Address</div>
                <div className="text-slate-200 font-mono tabular-nums mt-0.5">{device.macAddress}</div>
              </div>
            )}
            {device.model && (
              <div>
                <div className="text-slate-500">Hardware Model</div>
                <div className="text-slate-200 font-medium mt-0.5">{device.model}</div>
              </div>
            )}
            {device.serialNumber && (
              <div>
                <div className="text-slate-500">Serial Number</div>
                <div className="text-slate-200 font-mono mt-0.5">{device.serialNumber}</div>
              </div>
            )}
            <div>
              <div className="text-slate-500">Uptime</div>
              <div className="text-slate-200 font-mono tabular-nums mt-0.5">{formatUptime(device.uptimeSeconds)}</div>
            </div>
            <div>
              <div className="text-slate-500">Last Monitoring Update</div>
              <div className="text-slate-200 font-mono tabular-nums mt-0.5">{formatDateTime(device.lastUpdated)}</div>
            </div>
          </div>
        </section>

        {/* Live Telemetry (only render metrics actually collected for this device) */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 mb-3">Collected Telemetry Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-slate-800 bg-[#060B17]">
              <div className="text-xs text-slate-500">Traffic In / Out</div>
              <div className="text-sm font-mono font-semibold text-cyan-400 tabular-nums mt-1">
                {device.bandwidthInMbps} / {device.bandwidthOutMbps} Mbps
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-800 bg-[#060B17]">
              <div className="text-xs text-slate-500">Latency / Loss</div>
              <div className="text-sm font-mono font-semibold text-slate-100 tabular-nums mt-1">
                {device.latencyMs} ms · {device.packetLossPct}%
              </div>
            </div>
            {typeof device.cpuUsage === 'number' && (
              <div className="p-3 rounded-lg border border-slate-800 bg-[#060B17]">
                <div className="text-xs text-slate-500">CPU Usage</div>
                <div
                  className={`text-sm font-mono font-semibold tabular-nums mt-1 ${
                    device.cpuUsage >= 85 ? 'text-red-400' : device.cpuUsage >= 70 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {device.cpuUsage}%
                </div>
              </div>
            )}
            {typeof device.memoryUsage === 'number' && (
              <div className="p-3 rounded-lg border border-slate-800 bg-[#060B17]">
                <div className="text-xs text-slate-500">Memory Usage</div>
                <div
                  className={`text-sm font-mono font-semibold tabular-nums mt-1 ${
                    device.memoryUsage >= 85 ? 'text-amber-400' : 'text-slate-100'
                  }`}
                >
                  {device.memoryUsage}%
                </div>
              </div>
            )}
            {typeof device.diskUsage === 'number' && (
              <div className="p-3 rounded-lg border border-slate-800 bg-[#060B17]">
                <div className="text-xs text-slate-500">Disk Utilization</div>
                <div
                  className={`text-sm font-mono font-semibold tabular-nums mt-1 ${
                    device.diskUsage >= 85 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {device.diskUsage}% ({device.diskHealth || 'Healthy'})
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Historical Performance Chart */}
        {device.history.length > 1 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 mb-3">Historical Traffic & Resource Trend</h3>
            <div className="h-40 w-full border border-slate-800 rounded-lg p-3 bg-[#060B17]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={device.history}>
                  <defs>
                    <linearGradient id="devTrafficGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" hide />
                  <YAxis stroke="#475569" fontSize={10} width={36} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B1222',
                      borderColor: '#1E293B',
                      fontSize: '12px',
                      color: '#F1F5F9',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="trafficMbps"
                    name="Traffic (Mbps)"
                    stroke="#22d3ee"
                    fill="url(#devTrafficGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Interface Status */}
        {device.interfaces.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 mb-3">Interface Status</h3>
            <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#060B17]">
              <table className="w-full text-xs">
                <thead className="bg-[#111A2E] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Port</th>
                    <th className="text-left py-2 px-3 font-medium">State</th>
                    <th className="text-right py-2 px-3 font-medium">Util</th>
                    <th className="text-right py-2 px-3 font-medium">In / Out</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {device.interfaces.map((iface) => (
                    <tr key={iface.name} className="hover:bg-slate-900/50">
                      <td className="py-2 px-3">
                        <div className="font-mono text-slate-200">{iface.name}</div>
                        <div className="text-[11px] text-slate-500">{iface.description}</div>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`font-medium capitalize ${
                            iface.status === 'up'
                              ? 'text-emerald-400'
                              : iface.status === 'degraded'
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}
                        >
                          {iface.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                        {iface.utilizationPct}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">
                        {iface.inMbps} / {iface.outMbps}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Connected Devices */}
        {connectedDevices.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 mb-3">Connected Devices</h3>
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-[#060B17]">
              {connectedDevices.map((peer) => (
                <button
                  key={peer.id}
                  onClick={() => onSelectDevice(peer.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[#111A2E] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StatusIcon status={peer.status} className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-medium text-slate-200 truncate">{peer.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs text-slate-500 font-mono">
                    <span>{peer.ipAddress}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Cold Spare Quick Replacement if Switch Offline */}
        {isSwitch && device.status === 'offline' && compatibleAvailableSpares.length > 0 && (
          <section className="p-4 rounded-lg border border-cyan-500/40 bg-cyan-500/5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
              <Wrench className="w-4 h-4" />
              Onsite Cold Spare Available for Immediate Swap
            </div>
            <p className="text-xs text-slate-300">
              Replace this failed switch with a pre-staged spare from the Onsite Cold Spares bay to restore network links without waiting for procurement.
            </p>
            <div className="space-y-2">
              {compatibleAvailableSpares.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => onReplaceWithSpare(device.id, sp.id)}
                  disabled={busyAction === 'spare-replace'}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <span>Deploy {sp.name}</span>
                  <span className="font-mono text-[11px]">{sp.serialNumber}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-slate-800 bg-[#060B17] flex flex-wrap items-center gap-2">
        <button
          onClick={() => onProbe(device.id)}
          disabled={busyAction === `probe-${device.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busyAction === `probe-${device.id}` ? 'animate-spin' : ''}`} />
          Run ICMP / SNMP Probe
        </button>

        {device.status !== 'offline' && device.status !== 'standby' && (
          <button
            onClick={() => onSimulateFailure(device.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-xs font-medium text-red-300 transition-colors"
          >
            Simulate Failure
          </button>
        )}

        {(device.status === 'offline' || device.status === 'warning') && (
          <button
            onClick={() => onRestore(device.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore Device
          </button>
        )}
      </div>
    </div>
  );
}

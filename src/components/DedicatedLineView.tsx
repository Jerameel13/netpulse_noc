import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Globe,
  RefreshCw,
  Shield,
  ShieldCheck,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { IspLineMetrics, NocSystemState } from '../types/network';
import { formatDateTime } from './StatusUtils';

interface DedicatedLineViewProps {
  state: NocSystemState;
  onFailIsp: (ispId: 'isp-1' | 'isp-2') => void;
  onRecoverIsp: (ispId: 'isp-1' | 'isp-2') => void;
  onRecoverAll: () => void;
  onProbeDevice: (deviceId: string) => void;
  busyAction: string | null;
}

export function DedicatedLineView({
  state,
  onFailIsp,
  onRecoverIsp,
  onRecoverAll,
  onProbeDevice,
  busyAction,
}: DedicatedLineViewProps) {
  const { dedicatedLine } = state;
  const isps: IspLineMetrics[] = dedicatedLine.isps || [];
  const isp1 = isps.find((i) => i.id === 'isp-1');
  const isp2 = isps.find((i) => i.id === 'isp-2');

  const isp1Offline = isp1?.status === 'Offline';
  const isp2Offline = isp2?.status === 'Offline';
  const totalOutage = dedicatedLine.status === 'Offline' || (isp1Offline && isp2Offline);
  const failoverActive = dedicatedLine.failoverActive && !isp2Offline;

  return (
    <div className="space-y-6">
      {/* Dual-ISP Redundancy Status Banner & Visual Failover Path */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`p-3 rounded-xl border ${
                totalOutage
                  ? 'bg-red-500/15 border-red-500/40 text-red-400'
                  : failoverActive || isp2Offline
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
              }`}
            >
              {totalOutage ? <WifiOff className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-semibold text-slate-100">
                  Dual-ISP Dedicated Line & Automatic Failover
                </h2>
                <span
                  className={`text-xs font-semibold ${
                    totalOutage
                      ? 'text-red-400'
                      : failoverActive
                      ? 'text-amber-400'
                      : isp2Offline
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {totalOutage
                    ? 'Total WAN Outage (ISP 1 & ISP 2 Down)'
                    : failoverActive
                    ? 'Failover Active — Running on ISP 2'
                    : isp2Offline
                    ? 'ISP 1 Active (ISP 2 Redundancy Offline)'
                    : 'Dual-ISP Optimal (ISP 1 Active · ISP 2 Ready)'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Primary Dedicated Fiber (ISP 1) carries production traffic with automatic sub-second failover to Secondary Fiber (ISP 2) if ISP 1 drops.
              </p>
            </div>
          </div>

          {(isp1Offline || isp2Offline) && (
            <button
              onClick={onRecoverAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restore Both ISPs
            </button>
          )}
        </div>

        {/* Dual-ISP Visual Path Diagram */}
        <div className="mt-5 rounded-lg border border-slate-800 bg-[#060B17] p-4">
          <div className="grid grid-cols-1 lg:grid-cols-7 items-center gap-4">
            {/* Two ISP Uplinks */}
            <div className="lg:col-span-2 space-y-3">
              {/* ISP 1 Node */}
              <div
                className={`rounded-lg border p-3 transition-colors ${
                  isp1Offline
                    ? 'border-red-500/60 bg-red-950/25'
                    : isp1?.trafficState === 'Active'
                    ? 'border-cyan-400/70 bg-[#0B172C]'
                    : 'border-slate-700 bg-[#0B1222]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className={`w-4 h-4 ${isp1Offline ? 'text-red-400' : 'text-cyan-400'}`} />
                    <span className="text-xs font-semibold text-slate-100">ISP 1 (Primary DIA)</span>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-semibold ${
                      isp1Offline ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {isp1Offline ? 'OFFLINE' : 'ACTIVE'}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>{isp1?.ipAddress || '203.177.40.1'}</span>
                  <span className="tabular-nums text-slate-200">
                    {isp1Offline ? '0 Mbps' : `${isp1?.downloadMbps ?? 0} Mbps DL`}
                  </span>
                </div>
              </div>

              {/* ISP 2 Node */}
              <div
                className={`rounded-lg border p-3 transition-colors ${
                  isp2Offline
                    ? 'border-red-500/60 bg-red-950/25'
                    : isp2?.trafficState === 'Active'
                    ? 'border-amber-400/80 bg-amber-950/20'
                    : 'border-slate-700 bg-[#0B1222]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Globe
                      className={`w-4 h-4 ${
                        isp2Offline
                          ? 'text-red-400'
                          : isp2?.trafficState === 'Active'
                          ? 'text-amber-300'
                          : 'text-sky-400'
                      }`}
                    />
                    <span className="text-xs font-semibold text-slate-100">ISP 2 (Failover WAN)</span>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-semibold ${
                      isp2Offline
                        ? 'text-red-400'
                        : isp2?.trafficState === 'Active'
                        ? 'text-amber-300'
                        : 'text-cyan-400'
                    }`}
                  >
                    {isp2Offline ? 'OFFLINE' : isp2?.trafficState === 'Active' ? 'ACTIVE FAILOVER' : 'STANDBY READY'}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>{isp2?.ipAddress || '122.54.18.1'}</span>
                  <span className="tabular-nums text-slate-200">
                    {isp2Offline ? '0 Mbps' : `${isp2?.downloadMbps ?? 0} Mbps DL`}
                  </span>
                </div>
              </div>
            </div>

            {/* Dual Conduits */}
            <div className="lg:col-span-3 space-y-6 px-2">
              {/* ISP 1 Line Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Primary Fiber (1000 Mbps)</span>
                  <span className={isp1Offline ? 'text-red-400 font-semibold' : 'text-cyan-300 font-semibold'}>
                    {isp1Offline ? 'LINK DOWN · 100% LOSS' : `${isp1?.latencyMs ?? 9.8} ms · 99.9% SLA`}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isp1Offline ? 'bg-red-500 w-full' : 'bg-cyan-400 w-full animate-pulse'
                    }`}
                  />
                </div>
              </div>

              {/* ISP 2 Line Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Secondary Fiber (500 Mbps)</span>
                  <span
                    className={
                      isp2Offline
                        ? 'text-red-400 font-semibold'
                        : isp2?.trafficState === 'Active'
                        ? 'text-amber-300 font-semibold'
                        : 'text-sky-400'
                    }
                  >
                    {isp2Offline
                      ? 'LINK DOWN · NO FAILOVER'
                      : isp2?.trafficState === 'Active'
                      ? `CARRYING LIVE TRAFFIC · ${isp2?.latencyMs ?? 22} ms`
                      : `HEALTH CHECK OK · ${isp2?.latencyMs ?? 22} ms`}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isp2Offline
                        ? 'bg-red-500 w-full'
                        : isp2?.trafficState === 'Active'
                        ? 'bg-amber-400 w-full animate-pulse'
                        : 'bg-sky-500/40 w-1/3'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Firewall HA & Edge Router R1 */}
            <div className="lg:col-span-2 rounded-lg border border-slate-700 bg-[#0B1222] p-4 text-center space-y-2">
              <Shield className={`w-6 h-6 mx-auto ${totalOutage ? 'text-red-400' : 'text-emerald-400'}`} />
              <div className="text-xs font-semibold text-slate-100">Firewall 1/2 HA & Edge Router R1</div>
              <div className="text-[11px] font-mono text-slate-400">10.0.0.254 → 10.0.0.1</div>
              <div className="pt-1 border-t border-slate-800 text-[11px]">
                {totalOutage ? (
                  <span className="text-red-400 font-semibold">No Active WAN Route</span>
                ) : failoverActive ? (
                  <span className="text-amber-300 font-semibold">Routed via ISP 2 (Failover)</span>
                ) : (
                  <span className="text-emerald-400 font-semibold">Routed via ISP 1 (Primary)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Aggregate Key Line Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
            <div className="text-xs text-slate-500">Active Uplink</div>
            <div className="text-base font-display font-bold text-cyan-300 mt-1">
              {dedicatedLine.activeIsp === 'isp-1'
                ? 'ISP 1 (Primary)'
                : dedicatedLine.activeIsp === 'isp-2'
                ? 'ISP 2 (Failover)'
                : 'None (Offline)'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
            <div className="text-xs text-slate-500">SLA Target / Uptime</div>
            <div
              className={`text-lg font-mono font-bold tabular-nums mt-1 ${
                dedicatedLine.currentUptimePct >= dedicatedLine.slaTargetPct
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }`}
            >
              {dedicatedLine.currentUptimePct}%
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
            <div className="text-xs text-slate-500">Active DL / UL</div>
            <div className="text-lg font-mono font-bold text-cyan-400 tabular-nums mt-1">
              {dedicatedLine.downloadMbps} / {dedicatedLine.uploadMbps}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
            <div className="text-xs text-slate-500">Latency / Jitter</div>
            <div className="text-lg font-mono font-bold text-slate-100 tabular-nums mt-1">
              {dedicatedLine.latencyMs} / {dedicatedLine.jitterMs} ms
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
            <div className="text-xs text-slate-500">Packet Loss</div>
            <div
              className={`text-lg font-mono font-bold tabular-nums mt-1 ${
                dedicatedLine.packetLossPct > 1 ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {dedicatedLine.packetLossPct}%
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
            <div className="text-xs text-slate-500">WAN Redundancy</div>
            <div className="text-sm font-semibold mt-1.5 flex items-center gap-1.5">
              {totalOutage ? (
                <span className="text-red-400">Offline</span>
              ) : failoverActive ? (
                <span className="text-amber-400 inline-flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> ISP 2 Carrying
                </span>
              ) : isp2Offline ? (
                <span className="text-amber-400">Degraded (1/2)</span>
              ) : (
                <span className="text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 2/2 Online
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Individual ISP 1 & ISP 2 Telemetry & Control Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isps.map((isp) => {
          const isDown = isp.status === 'Offline';
          const isCarrying = isp.trafficState === 'Active';
          return (
            <div
              key={isp.id}
              className={`rounded-xl border bg-[#0B1222] p-5 space-y-4 ${
                isDown
                  ? 'border-red-500/50'
                  : isCarrying
                  ? 'border-cyan-500/50'
                  : 'border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{isp.name}</h3>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span
                      className={`text-xs font-semibold ${
                        isDown
                          ? 'text-red-400'
                          : isCarrying
                          ? 'text-emerald-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {isDown ? 'Offline' : isCarrying ? 'Active Traffic' : 'Standby Ready'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    {isp.circuitId} · {isp.ipAddress} · {isp.subscribedCapacityMbps} Mbps
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onProbeDevice(isp.deviceId)}
                    disabled={busyAction === `probe-${isp.deviceId}`}
                    className="px-2.5 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
                  >
                    Probe
                  </button>
                  {!isDown ? (
                    <button
                      onClick={() => onFailIsp(isp.id)}
                      disabled={busyAction === `isp-fail-${isp.id}`}
                      className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-xs font-medium text-red-300 transition-colors"
                    >
                      Simulate {isp.id === 'isp-1' ? 'ISP 1' : 'ISP 2'} Down
                    </button>
                  ) : (
                    <button
                      onClick={() => onRecoverIsp(isp.id)}
                      disabled={busyAction === `isp-recover-${isp.id}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-colors"
                    >
                      Restore {isp.id === 'isp-1' ? 'ISP 1' : 'ISP 2'}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
                  <div className="text-slate-500">Download</div>
                  <div className="text-sm font-mono font-semibold text-cyan-300 tabular-nums mt-1">
                    {isp.downloadMbps} Mbps
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
                  <div className="text-slate-500">Upload</div>
                  <div className="text-sm font-mono font-semibold text-sky-300 tabular-nums mt-1">
                    {isp.uploadMbps} Mbps
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
                  <div className="text-slate-500">Latency / Loss</div>
                  <div className="text-sm font-mono font-semibold text-slate-100 tabular-nums mt-1">
                    {isDown ? 'Timeout' : `${isp.latencyMs} ms`} · {isp.packetLossPct}%
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#060B17] p-3">
                  <div className="text-slate-500">SLA / Uptime</div>
                  <div className="text-sm font-mono font-semibold text-emerald-400 tabular-nums mt-1">
                    {isp.currentUptimePct}% / {isp.slaTargetPct}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Bandwidth & Latency Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Active WAN Throughput (Mbps)</h3>
              <p className="text-xs text-slate-400">
                Real-time bandwidth served by {dedicatedLine.activeIsp === 'isp-2' ? 'ISP 2 (Failover)' : 'ISP 1 (Primary)'}
              </p>
            </div>
            <ArrowDownUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={state.dashboardHistory}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={10} />
                <YAxis stroke="#64748B" fontSize={10} width={38} />
                <Tooltip contentStyle={{ backgroundColor: '#060B17', borderColor: '#1E293B', fontSize: '12px' }} />
                <Area type="monotone" dataKey="bandwidthInMbps" name="Download Mbps" stroke="#22d3ee" fill="#22d3ee25" strokeWidth={2} />
                <Area type="monotone" dataKey="bandwidthOutMbps" name="Upload Mbps" stroke="#3b82f6" fill="#3b82f625" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">SLA Availability & Failover Continuity</h3>
              <p className="text-xs text-slate-400">99.9% SLA Reference Threshold</p>
            </div>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={state.dashboardHistory}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={10} />
                <YAxis domain={[99.5, 100]} stroke="#64748B" fontSize={10} width={42} />
                <Tooltip contentStyle={{ backgroundColor: '#060B17', borderColor: '#1E293B', fontSize: '12px' }} />
                <ReferenceLine y={99.9} stroke="#F59E0B" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="uptimePct" name="Uptime %" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {dedicatedLine.lastOutageAt && (
        <div className="rounded-xl border border-slate-800 bg-[#0B1222] px-5 py-3.5 text-xs text-slate-300 flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          Last recorded ISP interruption: <span className="font-mono">{formatDateTime(dedicatedLine.lastOutageAt)}</span>
        </div>
      )}
    </div>
  );
}

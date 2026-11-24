import { RotateCcw, Save, Sliders } from 'lucide-react';
import { useState } from 'react';
import type { MonitoringSettings, NocSystemState } from '../types/network';

interface SettingsViewProps {
  state: NocSystemState;
  onSaveSettings: (patch: Partial<MonitoringSettings>) => void;
  onResetAll: () => void;
  busyAction: string | null;
}

export function SettingsView({
  state,
  onSaveSettings,
  onResetAll,
  busyAction,
}: SettingsViewProps) {
  const [form, setForm] = useState<MonitoringSettings>(state.settings);
  const [savedBanner, setSavedBanner] = useState(false);

  const handleSave = () => {
    onSaveSettings(form);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Monitoring Engine & Telemetry Mode Settings
            </h2>
          </div>
          {savedBanner && (
            <span className="text-xs font-medium text-emerald-400">Configuration Saved</span>
          )}
        </div>

        {/* Mode Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setForm({ ...form, mode: 'DEMO' })}
            className={`text-left p-4 rounded-lg border transition-colors ${
              form.mode === 'DEMO'
                ? 'border-cyan-400 bg-cyan-500/10'
                : 'border-slate-800 bg-[#060B17] hover:border-slate-700'
            }`}
          >
            <div className="text-sm font-semibold text-slate-100">
              DEMO MODE (Simulated Presentation + Local Host Telemetry)
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Simulates switch disconnections, dedicated line outages, backups, and SNMP traps while reading real local Watchdog server CPU/memory.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setForm({ ...form, mode: 'HYBRID_LIVE' })}
            className={`text-left p-4 rounded-lg border transition-colors ${
              form.mode === 'HYBRID_LIVE'
                ? 'border-emerald-400 bg-emerald-500/10'
                : 'border-slate-800 bg-[#060B17] hover:border-slate-700'
            }`}
          >
            <div className="text-sm font-semibold text-slate-100">
              HYBRID LIVE MODE (Real ICMP/TCP & SNMP Polling)
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Actively runs ICMP/TCP latency probes to configured ISP IP and optional SNMPv2c queries to reachable LAN devices.
            </p>
          </button>
        </div>

        {/* Probe & SNMP Config */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-3 rounded-lg border border-slate-800 bg-[#060B17] p-4">
            <h3 className="text-xs font-semibold text-slate-300">ICMP & Polling Configuration</h3>
            <label className="block">
              <span className="text-slate-400">ISP Probe IP Address</span>
              <input
                type="text"
                value={form.icmpTargets.ispProbeIp}
                onChange={(e) =>
                  setForm({
                    ...form,
                    icmpTargets: { ...form.icmpTargets, ispProbeIp: e.target.value },
                  })
                }
                className="mt-1 w-full px-3 py-1.5 rounded-lg bg-[#0B1222] border border-slate-700 text-slate-100 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-400">Polling Interval (ms)</span>
              <input
                type="number"
                min={1500}
                max={30000}
                step={500}
                value={form.pollIntervalMs}
                onChange={(e) => setForm({ ...form, pollIntervalMs: Number(e.target.value) })}
                className="mt-1 w-full px-3 py-1.5 rounded-lg bg-[#0B1222] border border-slate-700 text-slate-100 font-mono"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-800 bg-[#060B17] p-4">
            <h3 className="text-xs font-semibold text-slate-300">SNMPv2c & Trap Listener</h3>
            <label className="block">
              <span className="text-slate-400">SNMP Community String</span>
              <input
                type="text"
                value={form.snmp.community}
                onChange={(e) =>
                  setForm({
                    ...form,
                    snmp: { ...form.snmp, community: e.target.value },
                  })
                }
                className="mt-1 w-full px-3 py-1.5 rounded-lg bg-[#0B1222] border border-slate-700 text-slate-100 font-mono"
              />
            </label>
            <label className="flex items-center justify-between pt-2">
              <span className="text-slate-300">Enable Live SNMP Polls (when in Hybrid Mode)</span>
              <input
                type="checkbox"
                checked={form.snmp.enableRealSnmp}
                onChange={(e) =>
                  setForm({
                    ...form,
                    snmp: { ...form.snmp, enableRealSnmp: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-cyan-500"
              />
            </label>
          </div>
        </div>

        {/* Thresholds */}
        <div className="rounded-lg border border-slate-800 bg-[#060B17] p-4 space-y-3 text-xs">
          <h3 className="text-xs font-semibold text-slate-300">Automated Alert Thresholds</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-slate-400">CPU Warning (%)</span>
              <input
                type="number"
                value={form.thresholds.cpuWarningPct}
                onChange={(e) =>
                  setForm({
                    ...form,
                    thresholds: { ...form.thresholds, cpuWarningPct: Number(e.target.value) },
                  })
                }
                className="mt-1 w-full px-2.5 py-1.5 rounded bg-[#0B1222] border border-slate-700 font-mono text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-slate-400">Memory Warning (%)</span>
              <input
                type="number"
                value={form.thresholds.memoryWarningPct}
                onChange={(e) =>
                  setForm({
                    ...form,
                    thresholds: { ...form.thresholds, memoryWarningPct: Number(e.target.value) },
                  })
                }
                className="mt-1 w-full px-2.5 py-1.5 rounded bg-[#0B1222] border border-slate-700 font-mono text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-slate-400">Disk Warning (%)</span>
              <input
                type="number"
                value={form.thresholds.diskWarningPct}
                onChange={(e) =>
                  setForm({
                    ...form,
                    thresholds: { ...form.thresholds, diskWarningPct: Number(e.target.value) },
                  })
                }
                className="mt-1 w-full px-2.5 py-1.5 rounded bg-[#0B1222] border border-slate-700 font-mono text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-slate-400">Latency Warning (ms)</span>
              <input
                type="number"
                value={form.thresholds.latencyWarningMs}
                onChange={(e) =>
                  setForm({
                    ...form,
                    thresholds: { ...form.thresholds, latencyWarningMs: Number(e.target.value) },
                  })
                }
                className="mt-1 w-full px-2.5 py-1.5 rounded bg-[#0B1222] border border-slate-700 font-mono text-slate-100"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            onClick={onResetAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111A2E] hover:bg-red-950/50 border border-slate-700 hover:border-red-500/40 text-xs font-medium text-slate-300 hover:text-red-300 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Factory Reset Topology & Telemetry
          </button>

          <button
            onClick={handleSave}
            disabled={busyAction === 'settings-save'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Monitoring Settings
          </button>
        </div>
      </div>
    </div>
  );
}

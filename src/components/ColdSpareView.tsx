import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Package,
  RefreshCw,
  ServerCrash,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import type { NocSystemState, SpareStatus } from '../types/network';
import { formatDateTime } from './StatusUtils';

interface ColdSpareViewProps {
  state: NocSystemState;
  onFailSwitch: (deviceId: string) => void;
  onReplaceWithSpare: (failedDeviceId: string, spareItemId: string, performedBy: string) => void;
  onUpdateSpareStatus: (spareId: string, status: SpareStatus) => void;
  busyAction: string | null;
}

export function ColdSpareView({
  state,
  onFailSwitch,
  onReplaceWithSpare,
  onUpdateSpareStatus,
  busyAction,
}: ColdSpareViewProps) {
  const activeSwitches = state.devices.filter(
    (d) =>
      d.type === 'core-switch' ||
      d.type === 'distribution-switch' ||
      d.type === 'access-switch'
  );

  const failedSwitches = activeSwitches.filter((d) => d.status === 'offline');
  const [selectedFailedId, setSelectedFailedId] = useState<string>(
    failedSwitches[0]?.id || 'core-switch'
  );
  const [selectedSpareId, setSelectedSpareId] = useState<string>('sp-inv-1');
  const [adminName, setAdminName] = useState<string>('ICT Network Administrator');

  const effectiveFailedId =
    failedSwitches.find((f) => f.id === selectedFailedId)?.id ||
    failedSwitches[0]?.id ||
    selectedFailedId;

  const targetSwitch = activeSwitches.find((d) => d.id === effectiveFailedId);
  const compatibleSpares = state.spares.filter(
    (s) =>
      s.status === 'Available' &&
      (s.compatibleWith.includes(effectiveFailedId) || s.category === 'Access Switch')
  );

  const chosenSpare =
    compatibleSpares.find((s) => s.id === selectedSpareId) || compatibleSpares[0];

  return (
    <div className="space-y-6">
      {/* Top Interactive Replacement Demonstration */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Onsite Cold Spares & Rapid Hardware Replacement Workflow
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pre-staged switches eliminate 14–30 day procurement and bidding delays. Note: physical rack swap is performed by IT staff, then verified and re-linked in the NOC topology.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onFailSwitch('core-switch')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-xs font-medium text-red-300 transition-colors"
            >
              <ServerCrash className="w-4 h-4" />
              Simulate Core Switch Failure
            </button>
            <button
              onClick={() => onFailSwitch('sw5-cid')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-xs font-medium text-red-300 transition-colors"
            >
              Simulate SW5_CID Failure
            </button>
          </div>
        </div>

        {/* Visual Replacement Flow */}
        <div className="rounded-lg border border-slate-800 bg-[#060B17] p-4 grid grid-cols-1 lg:grid-cols-7 items-center gap-4">
          <div className="lg:col-span-2 space-y-2">
            <label className="block text-xs text-slate-400">1. Target / Failed Primary Switch</label>
            <select
              value={effectiveFailedId}
              onChange={(e) => setSelectedFailedId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0B1222] border border-slate-700 text-xs text-slate-100"
            >
              {activeSwitches.map((sw) => (
                <option key={sw.id} value={sw.id}>
                  {sw.label} ({sw.status.toUpperCase()})
                </option>
              ))}
            </select>
            {targetSwitch && (
              <div className="text-[11px] font-mono text-slate-400">
                {targetSwitch.model} · S/N {targetSwitch.serialNumber}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center text-slate-500">
            <ArrowRight className="w-5 h-5 text-cyan-400" />
            <span className="text-[10px] mt-1">Disconnect & Swap</span>
          </div>

          <div className="lg:col-span-2 space-y-2">
            <label className="block text-xs text-slate-400">2. Available Onsite Cold Spare</label>
            <select
              value={chosenSpare?.id || ''}
              onChange={(e) => setSelectedSpareId(e.target.value)}
              disabled={compatibleSpares.length === 0}
              className="w-full px-3 py-2 rounded-lg bg-[#0B1222] border border-slate-700 text-xs text-slate-100"
            >
              {compatibleSpares.length === 0 ? (
                <option value="">No available compatible spare</option>
              ) : (
                compatibleSpares.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} · {sp.serialNumber}
                  </option>
                ))
              )}
            </select>
            {chosenSpare && (
              <div className="text-[11px] font-mono text-cyan-400">
                {chosenSpare.condition} · {chosenSpare.location}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-2">
            <label className="block text-xs text-slate-400">3. Execute Physical Swap & Re-Link</label>
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Technician / Admin name"
              className="w-full px-3 py-1.5 rounded-lg bg-[#0B1222] border border-slate-700 text-xs text-slate-100"
            />
            <button
              onClick={() =>
                chosenSpare &&
                onReplaceWithSpare(effectiveFailedId, chosenSpare.id, adminName)
              }
              disabled={
                !chosenSpare ||
                targetSwitch?.status !== 'offline' ||
                busyAction === 'spare-replace'
              }
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors disabled:opacity-40"
            >
              <Wrench className="w-3.5 h-3.5" />
              {targetSwitch?.status !== 'offline'
                ? 'Mark Switch Failed First'
                : 'Replace Device & Update Topology'}
            </button>
          </div>
        </div>

        {failedSwitches.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-red-300 bg-red-950/30 border border-red-500/30 rounded-lg px-3.5 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              Offline switches awaiting spare swap:{' '}
              <strong>{failedSwitches.map((f) => f.name).join(', ')}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Cold Spare Inventory Table */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">Onsite Cold Spare Equipment Inventory</h3>
          </div>
          <span className="text-xs text-slate-400 tabular-nums">
            {state.spares.filter((s) => s.status === 'Available').length} of {state.spares.length} Available
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#111A2E] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Equipment Name</th>
                <th className="text-left py-2.5 px-4 font-medium">Category</th>
                <th className="text-left py-2.5 px-4 font-medium">Model & Serial</th>
                <th className="text-left py-2.5 px-4 font-medium">Condition</th>
                <th className="text-left py-2.5 px-4 font-medium">Location</th>
                <th className="text-left py-2.5 px-4 font-medium">Availability Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {state.spares.map((spare) => (
                <tr key={spare.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-4 font-medium text-slate-100">
                    {spare.name}
                    {spare.assignedToDeviceId && (
                      <div className="text-[11px] text-cyan-400">
                        Deployed in place of {spare.assignedToDeviceId}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-slate-300">{spare.category}</td>
                  <td className="py-2.5 px-4">
                    <div className="text-slate-200">{spare.model}</div>
                    <div className="text-[11px] font-mono text-slate-500">S/N: {spare.serialNumber}</div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-300">{spare.condition}</td>
                  <td className="py-2.5 px-4 text-slate-400">{spare.location}</td>
                  <td className="py-2.5 px-4">
                    <select
                      value={spare.status}
                      onChange={(e) => onUpdateSpareStatus(spare.id, e.target.value as SpareStatus)}
                      className={`px-2.5 py-1 rounded bg-[#060B17] border border-slate-700 text-xs font-medium ${
                        spare.status === 'Available'
                          ? 'text-emerald-400'
                          : spare.status === 'In Use'
                          ? 'text-cyan-400'
                          : 'text-amber-400'
                      }`}
                    >
                      <option value="Available">Available</option>
                      <option value="In Use">In Use</option>
                      <option value="Under Maintenance">Under Maintenance</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Equipment Replacement History */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">Equipment Replacement Audit History</h3>
          </div>
        </div>
        {state.replacementHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No cold spare replacements executed in this session yet. Simulate a switch failure above to test the replacement workflow.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {state.replacementHistory.map((rec) => (
              <div key={rec.id} className="px-5 py-3.5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Replaced {rec.failedDeviceName} with {rec.spareName} ({rec.spareSerial})
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{rec.reason}</p>
                  <p className="text-[11px] text-cyan-400 mt-0.5">{rec.downtimeAvoidedNote}</p>
                </div>
                <div className="text-right text-[11px] font-mono text-slate-400">
                  <div>{formatDateTime(rec.timestamp)}</div>
                  <div>By: {rec.performedBy}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

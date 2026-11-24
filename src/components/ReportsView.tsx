import { Download, FileText } from 'lucide-react';
import type { NocSystemState } from '../types/network';

interface ReportsViewProps {
  state: NocSystemState;
}

export function ReportsView({ state }: ReportsViewProps) {
  const improvements = [
    {
      area: '1. Automatic Cloud Backup Files',
      before: 'Manual local USB / single-server backups prone to human error and ransomware loss.',
      after: `Automated daily ${state.backup.scheduleTime} encrypted sync to off-site cloud vault (${state.backup.usedStorageGb} / ${state.backup.totalCapacityGb} GB).`,
      metric: `${state.backup.jobs.filter((j) => j.status === 'Completed').length} Verified Snapshots`,
    },
    {
      area: '2. Enterprise Dedicated Line',
      before: 'Shared broadband with high jitter, dropped video conferences, and no SLA guarantee.',
      after: `1 Gbps symmetrical dedicated fiber with ${state.dedicatedLine.slaTargetPct}% SLA target and automatic secondary ISP failover.`,
      metric: `${state.dedicatedLine.currentUptimePct}% Current Uptime`,
    },
    {
      area: '3. Onsite Cold Spares',
      before: '14–30 day network outage during government/institutional procurement and bidding cycles.',
      after: `Pre-staged Core & Access switches ready for immediate hardware swap (${state.spares.filter((s) => s.status === 'Available').length} ready onsite).`,
      metric: `${state.replacementHistory.length} Swaps Logged`,
    },
    {
      area: '4. Automated Smart Alerts (SNMP)',
      before: 'Reactive troubleshooting only after users report full outages or failed server disks.',
      after: `Continuous SNMP polling & trap receiver catching CPU, utilization, link-down, and SMART disk warnings early.`,
      metric: `${state.snmpLogs.length} Telemetry Events`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Infrastructure Reliability & Improvement Assessment Report
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Export real-time device inventory, availability metrics, and improvement impact analysis for IT audit review.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/reports/export?format=csv"
            download="noc-infrastructure-report.csv"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Devices CSV
          </a>
          <a
            href="/api/reports/export?format=json"
            download="noc-infrastructure-report.json"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Full Snapshot JSON
          </a>
        </div>
      </div>

      {/* Before vs After Comparison */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">
            Four Recommended Improvements · Operational Impact Matrix
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#111A2E] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Recommendation</th>
                <th className="text-left py-2.5 px-4 font-medium">Baseline Risk (Before)</th>
                <th className="text-left py-2.5 px-4 font-medium">Implemented Control (After)</th>
                <th className="text-right py-2.5 px-4 font-medium">Live Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {improvements.map((row) => (
                <tr key={row.area} className="hover:bg-slate-900/40">
                  <td className="py-3 px-4 font-semibold text-cyan-300 align-top">{row.area}</td>
                  <td className="py-3 px-4 text-slate-400 align-top">{row.before}</td>
                  <td className="py-3 px-4 text-slate-200 align-top">{row.after}</td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-400 align-top whitespace-nowrap">
                    {row.metric}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reference Physical Topology Diagram */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1222] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">
            Physical Cabling & Division Cabinet Reference Diagram
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Central ICT Data Cabinet, CID, SGOD, OSDS, Library, and Guest VLAN infrastructure baseline.
          </p>
        </div>
        <div className="p-4 bg-white">
          <img
            src="/assets/aistudio/ciscoFINAL1.drawio_a8a86e79.png"
            alt="Physical Network Topology Reference Diagram"
            className="w-full max-w-4xl mx-auto h-auto rounded"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  );
}

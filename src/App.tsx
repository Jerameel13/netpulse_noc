/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Activity,
  Bell,
  Cloud,
  FileText,
  GitFork,
  LayoutDashboard,
  MapPin,
  Menu,
  Network,
  Package,
  Radio,
  Settings,
  Wifi,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AlertsView } from './components/AlertsView';
import { CloudBackupView } from './components/CloudBackupView';
import { ColdSpareView } from './components/ColdSpareView';
import { DashboardView } from './components/DashboardView';
import { DedicatedLineView } from './components/DedicatedLineView';
import { DeviceDetailsDrawer } from './components/DeviceDetailsDrawer';
import { ReportsView } from './components/ReportsView';
import { SchoolConnectivityMapView } from './components/SchoolConnectivityMapView';
import { SchoolTopologyBuilderView } from './components/SchoolTopologyBuilderView';
import { SettingsView } from './components/SettingsView';
import { SnmpMonitoringView } from './components/SnmpMonitoringView';
import { formatShortTime } from './components/StatusUtils';
import { TopologyView } from './components/TopologyView';
import { useNocSocket } from './hooks/useNocSocket';
import { useSchoolNetworkPlanner } from './hooks/useSchoolNetworkPlanner';

type NavTab =
  | 'dashboard'
  | 'topology'
  | 'backup'
  | 'dedicated-line'
  | 'spares'
  | 'snmp'
  | 'alerts'
  | 'reports'
  | 'settings'
  | 'school-map'
  | 'school-builder';

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  section: 'noc' | 'school';
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard', section: 'noc', icon: LayoutDashboard },
  { id: 'topology', label: 'Network Topology', section: 'noc', icon: Network },
  { id: 'backup', label: 'Cloud Backup Management', section: 'noc', icon: Cloud },
  { id: 'dedicated-line', label: 'Dedicated Line Monitoring', section: 'noc', icon: Wifi },
  { id: 'spares', label: 'Cold Spare Inventory', section: 'noc', icon: Package },
  { id: 'snmp', label: 'SNMP Monitoring', section: 'noc', icon: Radio },
  { id: 'alerts', label: 'Alerts and Notifications', section: 'noc', icon: Bell },
  { id: 'reports', label: 'Reports', section: 'noc', icon: FileText },
  { id: 'settings', label: 'Settings', section: 'noc', icon: Settings },
  { id: 'school-map', label: 'School Connectivity Map', section: 'school', icon: MapPin },
  { id: 'school-builder', label: 'School Topology Builder', section: 'school', icon: GitFork },
];

export default function App() {
  const {
    state,
    connected,
    loading,
    error,
    busyAction,
    triggerBackup,
    simulateBackupFailure,
    updateBackupSettings,
    failDedicatedLine,
    recoverDedicatedLine,
    failIsp,
    recoverIsp,
    failSwitch,
    replaceWithSpare,
    updateSpareStatus,
    simulateSnmpAlert,
    probeDevice,
    restoreDevice,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    updateSettings,
    resetAll,
  } = useNocSocket();

  const planner = useSchoolNetworkPlanner();

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { ensureInitialized, fetchSchools, generateTopology, radiusKm } = planner;

  useEffect(() => {
    if (activeTab === 'school-map' || activeTab === 'school-builder') {
      ensureInitialized();
    }
  }, [activeTab, ensureInitialized]);

  const handleRefreshSchools = useCallback(() => {
    void fetchSchools(radiusKm, true);
  }, [fetchSchools, radiusKm]);

  const handleGenerateSchoolTopology = useCallback(() => {
    const generated = generateTopology(true);
    if (generated) {
      setActiveTab('school-builder');
    }
  }, [generateTopology]);

  if (loading && !state) {
    return (
      <div className="min-h-screen bg-[#060B17] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-slate-800 bg-[#0B1222] p-6 space-y-3">
          <div className="text-sm font-semibold text-cyan-400">NetPulse NOC</div>
          <div className="text-base font-display font-semibold text-slate-100">
            Initializing Real-Time Network Telemetry...
          </div>
          <p className="text-xs text-slate-400">
            Connecting to Socket.IO monitoring stream and loading hierarchical campus topology.
          </p>
        </div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="min-h-screen bg-[#060B17] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-red-500/40 bg-[#0B1222] p-6 space-y-3">
          <div className="text-sm font-semibold text-red-400">Connection Error</div>
          <p className="text-xs text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const activeAlertsCount = state.alerts.filter((a) => a.status === 'Active').length;
  const selectedDevice =
    state.devices.find((d) => d.id === selectedDeviceId) || null;
  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  const handleCoreSpareReplace = () => {
    const spare = state.spares.find(
      (s) => s.status === 'Available' && s.compatibleWith.includes('core-switch')
    );
    if (spare) {
      void replaceWithSpare('core-switch', spare.id);
    }
  };

  return (
    <div className="min-h-screen bg-[#060B17] text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      {/* Left NOC Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0B1222] border-r border-slate-800 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-display font-bold tracking-tight text-slate-100">
                NetPulse NOC
              </div>
              <div className="text-[11px] text-slate-400">Infrastructure Monitor</div>
            </div>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-100"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" aria-label="Primary NOC Navigation">
          {(
            [
              { key: 'noc', title: 'NOC Monitoring' },
              { key: 'school', title: 'School Network Planning' },
            ] as const
          ).map((group) => (
            <div key={group.key} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.title}
              </div>
              {NAV_ITEMS.filter((item) => item.section === group.key).map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-[#111A2E] border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'alerts' && activeAlertsCount > 0 && (
                      <span className="font-mono text-[11px] font-semibold text-red-400 tabular-nums">
                        {activeAlertsCount}
                      </span>
                    )}
                    {item.id === 'school-map' && planner.selectedSchoolIds.length > 0 && (
                      <span className="font-mono text-[11px] font-semibold text-cyan-400 tabular-nums">
                        {planner.selectedSchoolIds.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Telemetry Mode</span>
            <span className="font-mono font-semibold text-cyan-300">
              {state.settings.mode === 'DEMO' ? 'DEMO MODE' : 'HYBRID LIVE'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Socket Stream</span>
            <span className={connected ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
              {connected ? 'Connected' : 'Reconnecting'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-800 bg-[#0B1222]/85 backdrop-blur flex items-center justify-between gap-6 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-500 hidden sm:inline">NetPulse NOC</span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-100 truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-xs">
            <button
              onClick={() => setActiveTab('settings')}
              className="hidden md:inline-flex items-center gap-1.5 text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {state.settings.mode === 'DEMO'
                  ? 'DEMO MODE (Simulated + Local Host)'
                  : 'HYBRID LIVE MODE'}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono text-slate-400 tabular-nums">
                {formatShortTime(state.serverTime)}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('alerts')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                activeAlertsCount > 0
                  ? 'bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25'
                  : 'bg-[#111A2E] border-slate-700 text-slate-200 hover:border-slate-500'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Alerts ({activeAlertsCount})</span>
            </button>
          </div>
        </header>

        {/* Active Page Body */}
        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {activeTab === 'dashboard' && (
            <DashboardView
              state={state}
              onNavigate={(tab) => setActiveTab(tab as NavTab)}
              onSelectDevice={(id) => setSelectedDeviceId(id)}
              onTriggerBackup={() => void triggerBackup('Demo')}
              onSimulateBackupFailure={() => void simulateBackupFailure()}
              onFailDedicatedLine={() => void failDedicatedLine()}
              onRecoverDedicatedLine={() => void recoverDedicatedLine()}
              onFailCoreSwitch={() => void failSwitch('core-switch')}
              onReplaceCoreWithSpare={handleCoreSpareReplace}
              onSimulateSnmpAlert={() => void simulateSnmpAlert('both')}
              onResetAll={() => void resetAll()}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'topology' && (
            <TopologyView
              state={state}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={(id) => setSelectedDeviceId(id)}
              onTriggerBackup={() => void triggerBackup('Demo')}
              onFailDedicatedLine={() => void failDedicatedLine()}
              onRecoverDedicatedLine={() => void recoverDedicatedLine()}
              onFailCoreSwitch={() => void failSwitch('core-switch')}
              onReplaceCoreWithSpare={handleCoreSpareReplace}
              onSimulateSnmpAlert={() => void simulateSnmpAlert('both')}
              onResetAll={() => void resetAll()}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'backup' && (
            <CloudBackupView
              state={state}
              onTriggerBackup={() => void triggerBackup('Manual')}
              onSimulateFailure={() => void simulateBackupFailure()}
              onSaveSettings={(patch) => void updateBackupSettings(patch)}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'dedicated-line' && (
            <DedicatedLineView
              state={state}
              onFailIsp={(ispId) => void failIsp(ispId)}
              onRecoverIsp={(ispId) => void recoverIsp(ispId)}
              onRecoverAll={() => void recoverDedicatedLine()}
              onProbeDevice={(id) => void probeDevice(id)}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'spares' && (
            <ColdSpareView
              state={state}
              onFailSwitch={(deviceId) => void failSwitch(deviceId)}
              onReplaceWithSpare={(failedId, spareId, by) =>
                void replaceWithSpare(failedId, spareId, by)
              }
              onUpdateSpareStatus={(id, status) => void updateSpareStatus(id, status)}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'snmp' && (
            <SnmpMonitoringView
              state={state}
              onSimulateSnmp={(kind) => void simulateSnmpAlert(kind)}
              onProbeDevice={(id) => void probeDevice(id)}
              onSelectDevice={(id) => setSelectedDeviceId(id)}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsView
              state={state}
              onAcknowledge={(id) => void acknowledgeAlert(id)}
              onAcknowledgeAll={() => void acknowledgeAllAlerts()}
              onSelectDevice={(id) => setSelectedDeviceId(id)}
            />
          )}

          {activeTab === 'reports' && <ReportsView state={state} />}

          {activeTab === 'settings' && (
            <SettingsView
              state={state}
              onSaveSettings={(patch) => void updateSettings(patch)}
              onResetAll={() => void resetAll()}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'school-map' && (
            <SchoolConnectivityMapView
              discovery={planner.discovery}
              loading={planner.discoverLoading}
              error={planner.discoverError}
              radiusKm={planner.radiusKm}
              selectedSchoolIds={planner.selectedSchoolIds}
              onChangeRadius={planner.changeRadius}
              onRefresh={handleRefreshSchools}
              onToggleSchool={planner.toggleSchool}
              onSelectAllInRadius={planner.selectAllInRadius}
              onClearSelection={planner.clearSelection}
              onGenerateTopology={handleGenerateSchoolTopology}
            />
          )}

          {activeTab === 'school-builder' && (
            <SchoolTopologyBuilderView
              project={planner.project}
              savedProjects={planner.savedProjects}
              saving={planner.saving}
              onUpdateProject={planner.setProject}
              onResetOriginal={planner.resetToOriginalGenerated}
              onSaveProject={planner.saveProject}
              onLoadProject={planner.loadSavedProject}
              onDeleteSavedProject={planner.deleteSavedProject}
              onToggleEndDevices={planner.toggleEndDevices}
              onGoToMap={() => setActiveTab('school-map')}
            />
          )}
        </main>
      </div>

      {/* Global Device Details Slide-Over Drawer */}
      <DeviceDetailsDrawer
        device={selectedDevice}
        allDevices={state.devices}
        spares={state.spares}
        onClose={() => setSelectedDeviceId(null)}
        onSelectDevice={(id) => setSelectedDeviceId(id)}
        onProbe={(id) => void probeDevice(id)}
        onSimulateFailure={(id) => {
          if (id === 'dedicated-line' || id === 'isp-primary') {
            void failIsp('isp-1');
          } else if (id === 'isp-secondary') {
            void failIsp('isp-2');
          } else {
            void failSwitch(id);
          }
        }}
        onRestore={(id) => void restoreDevice(id)}
        onReplaceWithSpare={(failedId, spareId) =>
          void replaceWithSpare(failedId, spareId)
        }
        busyAction={busyAction}
      />
    </div>
  );
}

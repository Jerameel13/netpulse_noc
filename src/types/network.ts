export type DeviceStatus = 'online' | 'warning' | 'offline' | 'unknown' | 'standby';

export type DeviceType =
  | 'isp'
  | 'dedicated-line'
  | 'firewall'
  | 'router'
  | 'core-switch'
  | 'distribution-switch'
  | 'access-switch'
  | 'wireless-ap'
  | 'server'
  | 'backup-server'
  | 'cloud-storage'
  | 'monitoring-server'
  | 'snmp-system'
  | 'endpoint'
  | 'cold-spare';

export type CabinetGroup =
  | 'ISP & WAN'
  | 'Central ICT Cabinet'
  | 'CID Cabinet'
  | 'SGOD Cabinet'
  | 'OSDS Cabinet'
  | 'Library Cabinet'
  | 'Guest Zone'
  | 'Server & Cloud'
  | 'Onsite Cold Spares';

export type TelemetrySource = 'LIVE' | 'SIMULATED';

export type AlertSeverity = 'Normal' | 'Warning' | 'Critical' | 'Unknown';
export type AlertStatus = 'Active' | 'Acknowledged' | 'Resolved';

export type SpareStatus = 'Available' | 'In Use' | 'Under Maintenance';

export interface DeviceInterface {
  name: string;
  description: string;
  status: 'up' | 'down' | 'degraded';
  speedMbps: number;
  utilizationPct: number;
  inMbps: number;
  outMbps: number;
  errors: number;
}

export interface DeviceMetricPoint {
  timestamp: string;
  cpuPct: number;
  memoryPct: number;
  trafficMbps: number;
  latencyMs: number;
}

export interface NetworkDevice {
  id: string;
  name: string;
  label: string;
  type: DeviceType;
  cabinet: CabinetGroup;
  ipAddress: string;
  macAddress?: string;
  model?: string;
  serialNumber?: string;
  status: DeviceStatus;
  snmpEnabled: boolean;
  snmpCommunity?: string;
  telemetrySource: TelemetrySource;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  diskHealth?: 'Healthy' | 'Warning' | 'Critical';
  latencyMs: number;
  packetLossPct: number;
  bandwidthInMbps: number;
  bandwidthOutMbps: number;
  uptimeSeconds: number;
  lastUpdated: string;
  position: { x: number; y: number };
  interfaces: DeviceInterface[];
  connectedTo: string[];
  history: DeviceMetricPoint[];
  replacedBySpareId?: string;
  isQuarantined?: boolean;
}

export interface NetworkLink {
  id: string;
  source: string;
  target: string;
  label: string;
  medium: 'fiber' | 'ethernet' | 'dedicated-fiber' | 'cloud-tunnel' | 'standby';
  bandwidthMbps: number;
  utilizationPct: number;
  status: 'up' | 'degraded' | 'down' | 'standby';
  isDedicatedLine?: boolean;
  isBackupPath?: boolean;
  direction?: 'bidirectional' | 'forward' | 'reverse';
}

export interface BackupJob {
  id: string;
  jobName: string;
  sourceDevice: string;
  targetVault: string;
  startedAt: string;
  completedAt?: string;
  status: 'Completed' | 'In Progress' | 'Failed' | 'Scheduled';
  progressPct: number;
  filesTransferred: number;
  totalFiles: number;
  sizeGb: number;
  throughputMbps: number;
  errorMessage?: string;
  triggerType: 'Scheduled' | 'Manual' | 'Demo';
}

export interface CloudBackupState {
  schedulerEnabled: boolean;
  scheduleTime: string;
  retentionDays: number;
  targetBucket: string;
  totalCapacityGb: number;
  usedStorageGb: number;
  status: 'Completed' | 'In Progress' | 'Failed';
  progressPct: number;
  lastSuccessfulBackup: string;
  nextScheduledBackup: string;
  currentThroughputMbps: number;
  activeFilesCount: number;
  jobs: BackupJob[];
}

export interface IspLineMetrics {
  id: 'isp-1' | 'isp-2';
  deviceId: string;
  name: string;
  providerName: string;
  circuitId: string;
  ipAddress: string;
  role: 'Primary Dedicated' | 'Secondary Failover';
  status: 'Online' | 'Degraded' | 'Offline';
  trafficState: 'Active' | 'Standby' | 'Offline';
  slaTargetPct: number;
  currentUptimePct: number;
  subscribedCapacityMbps: number;
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  lastOutageAt?: string;
  telemetrySource: TelemetrySource;
}

export interface DedicatedLineState {
  providerName: string;
  circuitId: string;
  status: 'Online' | 'Degraded' | 'Offline';
  activeIsp: 'isp-1' | 'isp-2' | 'none';
  slaTargetPct: number;
  currentUptimePct: number;
  downloadMbps: number;
  uploadMbps: number;
  subscribedCapacityMbps: number;
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  failoverActive: boolean;
  healthLabel: 'Optimal' | 'Warning' | 'Critical';
  lastOutageAt?: string;
  telemetrySource: TelemetrySource;
  isps: IspLineMetrics[];
}

export interface ColdSpareItem {
  id: string;
  deviceId: string;
  name: string;
  category: 'Core Switch' | 'Access Switch' | 'Cables & Optics' | 'Replacement Equipment';
  model: string;
  serialNumber: string;
  condition: 'New / Tested' | 'Ready / Pre-configured' | 'Tested' | 'Inspecting';
  status: SpareStatus;
  location: string;
  compatibleWith: string[];
  assignedToDeviceId?: string;
  lastTestedAt: string;
}

export interface ReplacementRecord {
  id: string;
  timestamp: string;
  failedDeviceId: string;
  failedDeviceName: string;
  spareItemId: string;
  spareName: string;
  spareSerial: string;
  performedBy: string;
  reason: string;
  downtimeAvoidedNote: string;
}

export interface SnmpEventLog {
  id: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  method: 'SNMPv2c Poll' | 'SNMP Trap' | 'ICMP Ping';
  oid: string;
  metric: string;
  value: string;
  severity: AlertSeverity;
  source: TelemetrySource;
}

export interface NetworkAlert {
  id: string;
  name: string;
  affectedDeviceId: string;
  affectedDeviceName: string;
  category:
    | 'Dedicated Line'
    | 'Cloud Backup'
    | 'Switch & Routing'
    | 'Server Health'
    | 'SNMP Telemetry';
  severity: AlertSeverity;
  timestamp: string;
  description: string;
  status: AlertStatus;
  acknowledgedAt?: string;
  source: TelemetrySource;
}

export interface DashboardHistoryPoint {
  time: string;
  bandwidthInMbps: number;
  bandwidthOutMbps: number;
  latencyMs: number;
  packetLossPct: number;
  uptimePct: number;
  avgCpuPct: number;
  avgMemoryPct: number;
  backupVolumeGb: number;
}

export interface MonitoringSettings {
  mode: 'DEMO' | 'HYBRID_LIVE';
  pollIntervalMs: number;
  icmpTargets: {
    ispProbeIp: string;
    edgeRouterIp: string;
    localHostProbe: boolean;
  };
  snmp: {
    community: string;
    trapPort: number;
    enableRealSnmp: boolean;
  };
  thresholds: {
    cpuWarningPct: number;
    cpuCriticalPct: number;
    memoryWarningPct: number;
    diskWarningPct: number;
    latencyWarningMs: number;
    packetLossWarningPct: number;
  };
  backupScheduleTime: string;
  autoAlertsEnabled: boolean;
}

export interface NocSystemState {
  devices: NetworkDevice[];
  links: NetworkLink[];
  backup: CloudBackupState;
  dedicatedLine: DedicatedLineState;
  spares: ColdSpareItem[];
  replacementHistory: ReplacementRecord[];
  snmpLogs: SnmpEventLog[];
  alerts: NetworkAlert[];
  dashboardHistory: DashboardHistoryPoint[];
  settings: MonitoringSettings;
  activeScenario: string | null;
  serverTime: string;
}

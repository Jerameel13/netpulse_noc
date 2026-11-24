import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import type { Server as SocketIOServer } from 'socket.io';
import type {
  AlertSeverity,
  BackupJob,
  NetworkAlert,
  NetworkDevice,
  NocSystemState,
  ReplacementRecord,
  SnmpEventLog,
  SpareStatus,
} from '../src/types/network.ts';
import type { NocStorage } from './storage.ts';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const snmp: any = require('net-snmp');

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function execPing(ip: string): Promise<{ reachable: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    execFile('ping', ['-c', '1', '-W', '1', ip], { timeout: 1500 }, (err, stdout) => {
      if (!err && stdout) {
        const match = stdout.match(/time=([0-9.]+)\s*ms/i);
        if (match) {
          resolve({ reachable: true, latencyMs: round1(parseFloat(match[1])) });
          return;
        }
        resolve({ reachable: true, latencyMs: 1.0 });
        return;
      }
      // Fallback TCP connect check if ICMP raw socket is restricted in container
      const started = performance.now();
      const socket = net.createConnection({ host: ip, port: 443, timeout: 1000 });
      socket.on('connect', () => {
        const ms = round1(performance.now() - started);
        socket.destroy();
        resolve({ reachable: true, latencyMs: ms });
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ reachable: false, latencyMs: 0 });
      });
      socket.on('error', () => {
        socket.destroy();
        resolve({ reachable: false, latencyMs: 0 });
      });
    });
  });
}

export class NocMonitoringService {
  private storage: NocStorage;
  private io: SocketIOServer;
  private pollTimer: NodeJS.Timeout | null = null;
  private backupTimer: NodeJS.Timeout | null = null;
  private backupStepTimer: NodeJS.Timeout | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private trapReceiver: any = null;
  private lastScheduledMinute = '';

  constructor(storage: NocStorage, io: SocketIOServer) {
    this.storage = storage;
    this.io = io;
  }

  public start(): void {
    this.startSnmpTrapListener();
    this.restartPollLoop();
    this.startBackupScheduler();
  }

  public stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.backupTimer) clearInterval(this.backupTimer);
    if (this.backupStepTimer) clearInterval(this.backupStepTimer);
    if (this.trapReceiver) {
      try {
        this.trapReceiver.close();
      } catch {
        // ignore close errors
      }
    }
  }

  public restartPollLoop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const interval = Math.max(1500, this.storage.getState().settings.pollIntervalMs || 3000);
    this.pollTimer = setInterval(() => {
      void this.runTelemetryTick();
    }, interval);
  }

  private startSnmpTrapListener(): void {
    const port = this.storage.getState().settings.snmp.trapPort || 1162;
    try {
      this.trapReceiver = snmp.createReceiver(
        {
          port,
          disableAuthorization: true,
          transport: 'udp4',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error: Error | null, notification: any) => {
          if (error || !notification) return;
          const rinfo = notification.rinfo || { address: 'unknown' };
          const pdu = notification.pdu;
          const varbinds = Array.isArray(pdu?.varbinds) ? pdu.varbinds : [];
          const summary = varbinds
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((v: any) => `${v.oid}=${String(v.value)}`)
            .slice(0, 3)
            .join(', ');

          this.recordSnmpEvent({
            deviceId: 'snmp-system',
            deviceName: `Trap Source (${rinfo.address})`,
            ipAddress: String(rinfo.address),
            method: 'SNMP Trap',
            oid: varbinds[0]?.oid || '1.3.6.1.6.3.1.1.5',
            metric: 'Incoming UDP SNMP Trap',
            value: summary || 'Trap PDU received',
            severity: 'Warning',
            source: 'LIVE',
          });
        }
      );
    } catch {
      // Port may already be bound during hot restart; non-fatal
    }
  }

  private startBackupScheduler(): void {
    this.backupTimer = setInterval(() => {
      const state = this.storage.getState();
      if (!state.backup.schedulerEnabled) return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (
        hhmm === state.backup.scheduleTime &&
        this.lastScheduledMinute !== hhmm &&
        state.backup.status !== 'In Progress'
      ) {
        this.lastScheduledMinute = hhmm;
        this.triggerCloudBackup('Scheduled');
      }
    }, 15000);
  }

  private async runTelemetryTick(): Promise<void> {
    const state = this.storage.getState();
    const nowIso = new Date().toISOString();
    const timeLabel = nowTimeLabel();
    const isHybrid = state.settings.mode === 'HYBRID_LIVE';

    // 1. Gather real host CPU / memory for Watchdog server
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const hostMemPct = Math.round(((totalMem - freeMem) / totalMem) * 100);
    const load1 = os.loadavg()[0] || 0.2;
    const cpuCount = Math.max(1, os.cpus().length);
    const hostCpuPct = Math.min(99, Math.max(4, Math.round((load1 / cpuCount) * 100)));

    // 2. Real ICMP/TCP probe when Hybrid Live mode is enabled
    let liveIspProbe: { reachable: boolean; latencyMs: number } | null = null;
    if (isHybrid && state.settings.icmpTargets.ispProbeIp) {
      liveIspProbe = await execPing(state.settings.icmpTargets.ispProbeIp);
    }

    // 3. Optional real SNMPv2c poll for devices with snmpEnabled when enabled
    if (isHybrid && state.settings.snmp.enableRealSnmp) {
      const target = state.devices.find(
        (d) => d.snmpEnabled && d.ipAddress !== '127.0.0.1' && !d.ipAddress.startsWith('Unassigned')
      );
      if (target) {
        this.pollRealSnmpSysUpTime(target, state.settings.snmp.community);
      }
    }

    const coreDevice = state.devices.find((d) => d.id === 'core-switch');
    const coreDown = coreDevice?.status === 'offline';
    const isp1Info = state.dedicatedLine.isps?.find((i) => i.id === 'isp-1');
    const isp2Info = state.dedicatedLine.isps?.find((i) => i.id === 'isp-2');
    const isp1Down = isp1Info ? isp1Info.status === 'Offline' : state.dedicatedLine.status === 'Offline';
    const isp2Down = isp2Info ? isp2Info.status === 'Offline' : false;
    const lineDown = isp1Down && isp2Down;

    // Update devices telemetry
    for (const dev of state.devices) {
      dev.lastUpdated = nowIso;

      if (dev.id === 'watchdog-server' || dev.id === 'snmp-system') {
        dev.telemetrySource = 'LIVE';
        dev.cpuUsage = dev.id === 'watchdog-server' ? hostCpuPct : Math.max(4, hostCpuPct - 3);
        dev.memoryUsage = hostMemPct;
        dev.latencyMs = 0.2;
        dev.uptimeSeconds += Math.round(state.settings.pollIntervalMs / 1000);
        dev.history.push({
          timestamp: timeLabel,
          cpuPct: dev.cpuUsage,
          memoryPct: dev.memoryUsage,
          trafficMbps: round1(dev.bandwidthInMbps + dev.bandwidthOutMbps),
          latencyMs: dev.latencyMs,
        });
        if (dev.history.length > 24) dev.history.shift();
        continue;
      }

      if (dev.type === 'cold-spare' || dev.status === 'standby') {
        continue;
      }

      if (dev.status === 'offline') {
        dev.bandwidthInMbps = 0;
        dev.bandwidthOutMbps = 0;
        dev.latencyMs = 0;
        dev.packetLossPct = 100;
        continue;
      }

      // If live ISP probe ran for dedicated-line/isp-primary
      if (liveIspProbe && (dev.id === 'isp-primary' || dev.id === 'dedicated-line') && !isp1Down) {
        dev.telemetrySource = 'LIVE';
        if (liveIspProbe.reachable) {
          dev.latencyMs = liveIspProbe.latencyMs;
          dev.packetLossPct = 0;
        }
      } else {
        dev.telemetrySource = 'SIMULATED';
      }

      dev.uptimeSeconds += Math.round(state.settings.pollIntervalMs / 1000);

      // Smooth realistic traffic oscillation
      const delta = (Math.random() - 0.48) * 14;
      const baseTraffic =
        dev.type === 'core-switch'
          ? 600
          : dev.id === 'isp-secondary'
          ? isp1Down
            ? 385
            : 15
          : dev.type === 'dedicated-line' || dev.type === 'firewall' || dev.type === 'router'
          ? 425
          : dev.type === 'distribution-switch'
          ? 210
          : 75;

      if (isp1Down && (dev.id === 'isp-primary' || dev.id === 'dedicated-line')) {
        dev.bandwidthInMbps = 0;
        dev.bandwidthOutMbps = 0;
      } else if (isp2Down && dev.id === 'isp-secondary') {
        dev.bandwidthInMbps = 0;
        dev.bandwidthOutMbps = 0;
      } else if (dev.id === 'isp-secondary' && !isp1Down) {
        // Standby heartbeat traffic when ISP 1 is healthy
        dev.bandwidthInMbps = round1(Math.max(8, Math.min(24, (dev.bandwidthInMbps > 40 ? 15 : dev.bandwidthInMbps || 15) + delta * 0.15)));
        dev.bandwidthOutMbps = round1(Math.max(3, Math.min(12, (dev.bandwidthOutMbps > 20 ? 6 : dev.bandwidthOutMbps || 6) + delta * 0.08)));
      } else if (dev.id === 'isp-secondary' && isp1Down && !isp2Down) {
        // Failover active on ISP 2: carry division load up to 500 Mbps capacity
        dev.bandwidthInMbps = round1(Math.max(240, Math.min(480, (dev.bandwidthInMbps < 100 ? 385 : dev.bandwidthInMbps) + delta)));
        dev.bandwidthOutMbps = round1(Math.max(95, Math.min(220, (dev.bandwidthOutMbps < 40 ? 142 : dev.bandwidthOutMbps) + delta * 0.45)));
      } else if (lineDown && (dev.id === 'fw-1' || dev.id === 'edge-router')) {
        dev.bandwidthInMbps = 0;
        dev.bandwidthOutMbps = 0;
      } else if (coreDown && (dev.cabinet === 'CID Cabinet' || dev.cabinet === 'SGOD Cabinet' || dev.cabinet === 'OSDS Cabinet' || dev.cabinet === 'Library Cabinet')) {
        dev.bandwidthInMbps = round1(Math.max(0, dev.bandwidthInMbps * 0.2));
        dev.bandwidthOutMbps = round1(Math.max(0, dev.bandwidthOutMbps * 0.2));
      } else {
        dev.bandwidthInMbps = round1(Math.max(4, Math.min(950, (dev.bandwidthInMbps || baseTraffic) + delta)));
        dev.bandwidthOutMbps = round1(Math.max(2, Math.min(450, (dev.bandwidthOutMbps || baseTraffic * 0.4) + delta * 0.45)));
      }

      if (typeof dev.cpuUsage === 'number' && dev.status !== 'warning') {
        dev.cpuUsage = Math.max(8, Math.min(72, Math.round(dev.cpuUsage + (Math.random() - 0.5) * 4)));
      }
      if (typeof dev.memoryUsage === 'number' && dev.status !== 'warning') {
        dev.memoryUsage = Math.max(15, Math.min(76, Math.round(dev.memoryUsage + (Math.random() - 0.5) * 2)));
      }

      if (dev.status !== 'warning' && !liveIspProbe) {
        dev.latencyMs = round1(Math.max(0.3, dev.latencyMs + (Math.random() - 0.5) * 0.6));
      }

      for (const iface of dev.interfaces) {
        if (iface.status === 'down') {
          iface.inMbps = 0;
          iface.outMbps = 0;
          iface.utilizationPct = 0;
        } else {
          const factor = iface.speedMbps >= 10000 ? 10000 : iface.speedMbps;
          iface.inMbps = round1(Math.max(1, dev.bandwidthInMbps * 0.6));
          iface.outMbps = round1(Math.max(1, dev.bandwidthOutMbps * 0.6));
          if (dev.status !== 'warning') {
            iface.utilizationPct = Math.min(98, Math.max(1, Math.round(((iface.inMbps + iface.outMbps) / factor) * 100)));
          }
        }
      }

      dev.history.push({
        timestamp: timeLabel,
        cpuPct: dev.cpuUsage ?? 20,
        memoryPct: dev.memoryUsage ?? 35,
        trafficMbps: round1(dev.bandwidthInMbps + dev.bandwidthOutMbps),
        latencyMs: dev.latencyMs,
      });
      if (dev.history.length > 24) dev.history.shift();
    }

    // Update Dual-ISP Dedicated Line stats
    const diaDevice = state.devices.find((d) => d.id === 'dedicated-line');
    const isp2Device = state.devices.find((d) => d.id === 'isp-secondary');
    if (isp1Info && diaDevice) {
      if (isp1Info.status !== 'Offline') {
        isp1Info.downloadMbps = diaDevice.bandwidthInMbps;
        isp1Info.uploadMbps = diaDevice.bandwidthOutMbps;
        isp1Info.latencyMs = diaDevice.latencyMs;
        isp1Info.jitterMs = round1(0.8 + Math.random() * 1.1);
        isp1Info.telemetrySource = diaDevice.telemetrySource;
      } else {
        isp1Info.downloadMbps = 0;
        isp1Info.uploadMbps = 0;
        isp1Info.latencyMs = 0;
        isp1Info.jitterMs = 0;
        isp1Info.packetLossPct = 100;
      }
    }
    if (isp2Info && isp2Device) {
      if (isp2Info.status !== 'Offline') {
        isp2Info.downloadMbps = isp2Device.bandwidthInMbps;
        isp2Info.uploadMbps = isp2Device.bandwidthOutMbps;
        isp2Info.latencyMs = isp2Device.latencyMs;
        isp2Info.jitterMs = round1(1.5 + Math.random() * 1.6);
        isp2Info.telemetrySource = isp2Device.telemetrySource;
      } else {
        isp2Info.downloadMbps = 0;
        isp2Info.uploadMbps = 0;
        isp2Info.latencyMs = 0;
        isp2Info.jitterMs = 0;
        isp2Info.packetLossPct = 100;
      }
    }

    if (!isp1Down && isp1Info) {
      state.dedicatedLine.activeIsp = 'isp-1';
      state.dedicatedLine.failoverActive = false;
      state.dedicatedLine.status = isp2Down ? 'Degraded' : 'Online';
      state.dedicatedLine.healthLabel = isp2Down ? 'Warning' : 'Optimal';
      state.dedicatedLine.downloadMbps = isp1Info.downloadMbps;
      state.dedicatedLine.uploadMbps = isp1Info.uploadMbps;
      state.dedicatedLine.latencyMs = isp1Info.latencyMs;
      state.dedicatedLine.jitterMs = isp1Info.jitterMs;
      state.dedicatedLine.packetLossPct = isp1Info.packetLossPct;
      state.dedicatedLine.telemetrySource = isp1Info.telemetrySource;
    } else if (!isp2Down && isp2Info) {
      state.dedicatedLine.activeIsp = 'isp-2';
      state.dedicatedLine.failoverActive = true;
      state.dedicatedLine.status = 'Degraded';
      state.dedicatedLine.healthLabel = 'Warning';
      state.dedicatedLine.downloadMbps = isp2Info.downloadMbps;
      state.dedicatedLine.uploadMbps = isp2Info.uploadMbps;
      state.dedicatedLine.latencyMs = isp2Info.latencyMs;
      state.dedicatedLine.jitterMs = isp2Info.jitterMs;
      state.dedicatedLine.packetLossPct = isp2Info.packetLossPct;
      state.dedicatedLine.telemetrySource = isp2Info.telemetrySource;
    } else {
      state.dedicatedLine.activeIsp = 'none';
      state.dedicatedLine.failoverActive = false;
      state.dedicatedLine.status = 'Offline';
      state.dedicatedLine.healthLabel = 'Critical';
      state.dedicatedLine.downloadMbps = 0;
      state.dedicatedLine.uploadMbps = 0;
      state.dedicatedLine.latencyMs = 0;
      state.dedicatedLine.jitterMs = 0;
      state.dedicatedLine.packetLossPct = 100;
    }

    // Update link utilization from connected source/target
    for (const link of state.links) {
      if (link.status === 'down' || link.status === 'standby') continue;
      const src = state.devices.find((d) => d.id === link.source);
      const tgt = state.devices.find((d) => d.id === link.target);
      if (src?.status === 'offline' || tgt?.status === 'offline') {
        link.status = 'down';
        link.utilizationPct = 0;
        continue;
      }
      if (link.isBackupPath && state.backup.status === 'In Progress') {
        link.utilizationPct = 82;
      } else if (link.id === 'lnk-isp2-fw' && src) {
        link.utilizationPct = Math.min(
          96,
          Math.max(2, Math.round((src.bandwidthInMbps / link.bandwidthMbps) * 100))
        );
      } else if (src && tgt) {
        const traffic = Math.max(src.bandwidthInMbps, tgt.bandwidthInMbps);
        link.utilizationPct = Math.min(96, Math.max(2, Math.round((traffic / link.bandwidthMbps) * 100)));
      }
    }

    // Append dashboard history point
    const activeDevices = state.devices.filter((d) => d.status !== 'offline' && d.status !== 'standby');
    const avgCpu =
      activeDevices.reduce((acc, d) => acc + (d.cpuUsage ?? 20), 0) / Math.max(1, activeDevices.length);
    const avgMem =
      activeDevices.reduce((acc, d) => acc + (d.memoryUsage ?? 35), 0) / Math.max(1, activeDevices.length);

    state.dashboardHistory.push({
      time: timeLabel,
      bandwidthInMbps: state.dedicatedLine.status === 'Offline' ? 0 : state.dedicatedLine.downloadMbps,
      bandwidthOutMbps: state.dedicatedLine.status === 'Offline' ? 0 : state.dedicatedLine.uploadMbps,
      latencyMs: state.dedicatedLine.latencyMs,
      packetLossPct: state.dedicatedLine.packetLossPct,
      uptimePct: state.dedicatedLine.currentUptimePct,
      avgCpuPct: Math.round(avgCpu),
      avgMemoryPct: Math.round(avgMem),
      backupVolumeGb: state.backup.jobs[0]?.sizeGb || 38.4,
    });
    if (state.dashboardHistory.length > 24) state.dashboardHistory.shift();

    state.serverTime = nowIso;
    this.storage.setState(state);

    this.io.emit('telemetry:tick', {
      devices: state.devices,
      links: state.links,
      dedicatedLine: state.dedicatedLine,
      dashboardHistory: state.dashboardHistory,
      serverTime: state.serverTime,
    });
  }

  private pollRealSnmpSysUpTime(device: NetworkDevice, community: string): void {
    try {
      const session = snmp.createSession(device.ipAddress, community, {
        timeout: 1000,
        retries: 0,
      });
      session.get(['1.3.6.1.2.1.1.3.0'], (error: Error | null, varbinds: Array<{ value: unknown }>) => {
        if (!error && varbinds && varbinds[0]) {
          device.telemetrySource = 'LIVE';
          this.recordSnmpEvent({
            deviceId: device.id,
            deviceName: device.name,
            ipAddress: device.ipAddress,
            method: 'SNMPv2c Poll',
            oid: '1.3.6.1.2.1.1.3.0 (sysUpTime)',
            metric: 'System Uptime',
            value: `${String(varbinds[0].value)} ticks`,
            severity: 'Normal',
            source: 'LIVE',
          });
        }
        try {
          session.close();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore unreachable private LAN IPs in cloud container
    }
  }

  public recordSnmpEvent(
    entry: Omit<SnmpEventLog, 'id' | 'timestamp'>
  ): SnmpEventLog {
    const state = this.storage.getState();
    const log: SnmpEventLog = {
      id: `snmp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    state.snmpLogs.unshift(log);
    if (state.snmpLogs.length > 60) state.snmpLogs.pop();
    this.storage.setState(state);
    this.io.emit('snmp:log', log);
    return log;
  }

  public createAlert(
    alertInput: Omit<NetworkAlert, 'id' | 'timestamp' | 'status'>
  ): NetworkAlert {
    const state = this.storage.getState();
    const alert: NetworkAlert = {
      id: `alt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      status: 'Active',
      ...alertInput,
    };
    state.alerts.unshift(alert);
    if (state.alerts.length > 80) state.alerts.pop();
    this.storage.setState(state);
    this.io.emit('alert:new', alert);
    return alert;
  }

  public acknowledgeAlert(alertId: string): NetworkAlert | null {
    const state = this.storage.getState();
    const found = state.alerts.find((a) => a.id === alertId);
    if (!found) return null;
    found.status = 'Acknowledged';
    found.acknowledgedAt = new Date().toISOString();
    this.storage.setState(state);
    this.io.emit('alert:updated', found);
    return found;
  }

  public acknowledgeAllAlerts(): void {
    const state = this.storage.getState();
    const now = new Date().toISOString();
    for (const alert of state.alerts) {
      if (alert.status === 'Active') {
        alert.status = 'Acknowledged';
        alert.acknowledgedAt = now;
      }
    }
    this.storage.setState(state);
    this.io.emit('state:sync', state);
  }

  // SCENARIO 1: AUTOMATIC CLOUD BACKUP
  public triggerCloudBackup(triggerType: 'Scheduled' | 'Manual' | 'Demo' = 'Manual'): NocSystemState {
    const state = this.storage.getState();
    if (this.backupStepTimer) {
      clearInterval(this.backupStepTimer);
      this.backupStepTimer = null;
    }

    if (state.dedicatedLine.status === 'Offline') {
      return this.simulateBackupFailure('Off-site cloud vault unreachable: Enterprise Dedicated Line is offline.');
    }

    const totalFiles = 2480;
    const jobSizeGb = 46.8;
    const job: BackupJob = {
      id: `bk-${Date.now().toString().slice(-4)}`,
      jobName: `Automated Off-Site Sync · Main File Server`,
      sourceDevice: 'Main File Server (10.0.10.10)',
      targetVault: state.backup.targetBucket,
      startedAt: new Date().toISOString(),
      status: 'In Progress',
      progressPct: 4,
      filesTransferred: 96,
      totalFiles,
      sizeGb: jobSizeGb,
      throughputMbps: 465,
      triggerType,
    };

    state.backup.status = 'In Progress';
    state.backup.progressPct = 4;
    state.backup.currentThroughputMbps = 465;
    state.backup.activeFilesCount = totalFiles;
    state.backup.jobs.unshift(job);
    if (state.backup.jobs.length > 15) state.backup.jobs.pop();
    state.activeScenario = 'SCENARIO_1_CLOUD_BACKUP';

    // Animate backup links & devices
    for (const link of state.links) {
      if (link.isBackupPath) {
        link.status = 'up';
        link.utilizationPct = 86;
      }
    }

    this.storage.setState(state);
    this.io.emit('state:sync', state);

    let progress = 4;
    this.backupStepTimer = setInterval(() => {
      const current = this.storage.getState();
      const activeJob = current.backup.jobs.find((j) => j.id === job.id);
      if (!activeJob || activeJob.status !== 'In Progress') {
        if (this.backupStepTimer) clearInterval(this.backupStepTimer);
        this.backupStepTimer = null;
        return;
      }

      progress = Math.min(100, progress + 12);
      activeJob.progressPct = progress;
      activeJob.filesTransferred = Math.round((progress / 100) * totalFiles);
      activeJob.throughputMbps = progress < 100 ? Math.round(440 + Math.random() * 55) : 0;

      current.backup.progressPct = progress;
      current.backup.currentThroughputMbps = activeJob.throughputMbps;

      if (progress >= 100) {
        activeJob.status = 'Completed';
        activeJob.completedAt = new Date().toISOString();
        current.backup.status = 'Completed';
        current.backup.lastSuccessfulBackup = activeJob.completedAt;
        current.backup.nextScheduledBackup = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        current.backup.usedStorageGb = round1(current.backup.usedStorageGb + jobSizeGb);
        current.backup.currentThroughputMbps = 0;
        current.backup.activeFilesCount = 0;
        if (current.activeScenario === 'SCENARIO_1_CLOUD_BACKUP') {
          current.activeScenario = null;
        }
        for (const link of current.links) {
          if (link.isBackupPath) link.utilizationPct = 4;
        }

        this.recordSnmpEvent({
          deviceId: 'backup-server',
          deviceName: 'Backup Server & Scheduler',
          ipAddress: '10.0.10.20',
          method: 'SNMPv2c Poll',
          oid: '1.3.6.1.4.1.6574.4.2 (backupSyncStatus)',
          metric: 'Off-Site Cloud Backup Completed',
          value: `${jobSizeGb} GB synced (${totalFiles} files)`,
          severity: 'Normal',
          source: 'SIMULATED',
        });

        if (this.backupStepTimer) clearInterval(this.backupStepTimer);
        this.backupStepTimer = null;
      }

      this.storage.setState(current);
      this.io.emit('backup:progress', current.backup);
      this.io.emit('state:sync', current);
    }, 650);

    return state;
  }

  public simulateBackupFailure(reason = 'TLS upload stream interrupted: Off-site cloud bucket quota or auth handshake failure'): NocSystemState {
    if (this.backupStepTimer) {
      clearInterval(this.backupStepTimer);
      this.backupStepTimer = null;
    }
    const state = this.storage.getState();
    const failJob: BackupJob = {
      id: `bk-err-${Date.now().toString().slice(-4)}`,
      jobName: 'Automated Off-Site Sync · Main File Server',
      sourceDevice: 'Main File Server (10.0.10.10)',
      targetVault: state.backup.targetBucket,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'Failed',
      progressPct: 38,
      filesTransferred: 942,
      totalFiles: 2480,
      sizeGb: 46.8,
      throughputMbps: 0,
      errorMessage: reason,
      triggerType: 'Demo',
    };

    state.backup.status = 'Failed';
    state.backup.progressPct = 38;
    state.backup.currentThroughputMbps = 0;
    state.backup.jobs.unshift(failJob);
    if (state.backup.jobs.length > 15) state.backup.jobs.pop();

    const bkpDev = state.devices.find((d) => d.id === 'backup-server');
    if (bkpDev) bkpDev.status = 'warning';

    for (const link of state.links) {
      if (link.id === 'lnk-backupsrv-cloud') {
        link.status = 'degraded';
      }
    }

    this.storage.setState(state);

    this.createAlert({
      name: 'Failed Cloud Backup Operation',
      affectedDeviceId: 'backup-server',
      affectedDeviceName: 'Backup Server & Scheduler',
      category: 'Cloud Backup',
      severity: 'Critical',
      description: reason,
      source: 'SIMULATED',
    });

    this.io.emit('state:sync', state);
    return state;
  }

  // SCENARIO 2: DUAL-ISP DEDICATED LINE FAILURE & FAILOVER / RECOVERY
  public simulateIspFailure(ispId: 'isp-1' | 'isp-2' = 'isp-1'): NocSystemState {
    const state = this.storage.getState();
    const nowIso = new Date().toISOString();
    const isp1 = state.dedicatedLine.isps.find((i) => i.id === 'isp-1');
    const isp2 = state.dedicatedLine.isps.find((i) => i.id === 'isp-2');

    if (ispId === 'isp-1') {
      state.activeScenario = 'SCENARIO_2_DEDICATED_LINE_OUTAGE';
      if (isp1) {
        isp1.status = 'Offline';
        isp1.trafficState = 'Offline';
        isp1.downloadMbps = 0;
        isp1.uploadMbps = 0;
        isp1.latencyMs = 0;
        isp1.jitterMs = 0;
        isp1.packetLossPct = 100;
        isp1.currentUptimePct = 99.82;
        isp1.lastOutageAt = nowIso;
      }

      const diaDev = state.devices.find((d) => d.id === 'dedicated-line');
      if (diaDev) {
        diaDev.status = 'offline';
        diaDev.bandwidthInMbps = 0;
        diaDev.bandwidthOutMbps = 0;
        diaDev.packetLossPct = 100;
        diaDev.latencyMs = 0;
      }
      const isp1Dev = state.devices.find((d) => d.id === 'isp-primary');
      if (isp1Dev) isp1Dev.status = 'offline';

      const isp2Online = isp2 && isp2.status !== 'Offline';
      if (isp2 && isp2Online) {
        isp2.trafficState = 'Active';
        isp2.downloadMbps = 384.6;
        isp2.uploadMbps = 142.3;
        isp2.latencyMs = 21.8;
        isp2.packetLossPct = 0.04;
      }
      const isp2Dev = state.devices.find((d) => d.id === 'isp-secondary');
      if (isp2Dev && isp2Online) {
        isp2Dev.status = 'online';
        isp2Dev.bandwidthInMbps = 384.6;
        isp2Dev.bandwidthOutMbps = 142.3;
        isp2Dev.latencyMs = 21.8;
      }

      for (const link of state.links) {
        if (link.isDedicatedLine) {
          link.status = 'down';
          link.utilizationPct = 0;
        }
        if (link.id === 'lnk-isp2-fw' && isp2Online) {
          link.status = 'up';
          link.utilizationPct = 78;
          link.label = 'ISP 2 Active Failover';
        }
      }

      state.dedicatedLine.lastOutageAt = nowIso;
      state.dedicatedLine.currentUptimePct = isp2Online ? 99.94 : 99.82;
      state.dedicatedLine.failoverActive = Boolean(isp2Online);
      state.dedicatedLine.activeIsp = isp2Online ? 'isp-2' : 'none';
      state.dedicatedLine.status = isp2Online ? 'Degraded' : 'Offline';
      state.dedicatedLine.healthLabel = isp2Online ? 'Warning' : 'Critical';
      state.dedicatedLine.downloadMbps = isp2Online ? 384.6 : 0;
      state.dedicatedLine.uploadMbps = isp2Online ? 142.3 : 0;
      state.dedicatedLine.latencyMs = isp2Online ? 21.8 : 0;
      state.dedicatedLine.packetLossPct = isp2Online ? 0.04 : 100;

      this.storage.setState(state);

      this.recordSnmpEvent({
        deviceId: 'dedicated-line',
        deviceName: 'Enterprise Dedicated Line (ISP 1)',
        ipAddress: '203.177.40.2',
        method: 'ICMP Ping',
        oid: '1.3.6.1.6.3.1.1.5.3 (linkDown)',
        metric: 'ISP 1 Carrier Status',
        value: isp2Online
          ? 'DOWN · Traffic Automatically Failed Over to ISP 2'
          : 'DOWN · No Backup ISP Available (Total WAN Outage)',
        severity: 'Critical',
        source: 'SIMULATED',
      });

      this.createAlert({
        name: isp2Online
          ? 'ISP 1 Dedicated Line Down — Failover Active on ISP 2'
          : 'Total WAN Outage — ISP 1 & ISP 2 Offline',
        affectedDeviceId: 'dedicated-line',
        affectedDeviceName: 'Enterprise Dedicated Line (ISP 1)',
        category: 'Dedicated Line',
        severity: 'Critical',
        description: isp2Online
          ? 'ISP 1 lost carrier signal. Firewall HA automatically shifted division internet traffic onto Secondary ISP 2 (384.6 Mbps DL) to keep operations online.'
          : 'Both ISP 1 and ISP 2 are offline. All external cloud backups and internet access are interrupted.',
        source: 'SIMULATED',
      });
    } else {
      // Simulate ISP 2 failure
      if (isp2) {
        isp2.status = 'Offline';
        isp2.trafficState = 'Offline';
        isp2.downloadMbps = 0;
        isp2.uploadMbps = 0;
        isp2.latencyMs = 0;
        isp2.jitterMs = 0;
        isp2.packetLossPct = 100;
        isp2.lastOutageAt = nowIso;
      }
      const isp2Dev = state.devices.find((d) => d.id === 'isp-secondary');
      if (isp2Dev) {
        isp2Dev.status = 'offline';
        isp2Dev.bandwidthInMbps = 0;
        isp2Dev.bandwidthOutMbps = 0;
      }
      for (const link of state.links) {
        if (link.id === 'lnk-isp2-fw') {
          link.status = 'down';
          link.utilizationPct = 0;
          link.label = 'Failover WAN (Down)';
        }
      }

      const isp1Online = isp1 && isp1.status !== 'Offline';
      state.dedicatedLine.activeIsp = isp1Online ? 'isp-1' : 'none';
      state.dedicatedLine.failoverActive = false;
      state.dedicatedLine.status = isp1Online ? 'Degraded' : 'Offline';
      state.dedicatedLine.healthLabel = isp1Online ? 'Warning' : 'Critical';
      if (!isp1Online) {
        state.dedicatedLine.downloadMbps = 0;
        state.dedicatedLine.uploadMbps = 0;
        state.dedicatedLine.latencyMs = 0;
        state.dedicatedLine.packetLossPct = 100;
      }

      this.storage.setState(state);

      this.recordSnmpEvent({
        deviceId: 'isp-secondary',
        deviceName: 'Secondary ISP (ISP 2)',
        ipAddress: '122.54.18.1',
        method: 'ICMP Ping',
        oid: '1.3.6.1.6.3.1.1.5.3 (linkDown)',
        metric: 'ISP 2 Failover Link Status',
        value: isp1Online
          ? 'DOWN · Primary ISP 1 Carrying All Traffic'
          : 'DOWN · Both ISP Uplinks Offline',
        severity: isp1Online ? 'Warning' : 'Critical',
        source: 'SIMULATED',
      });

      this.createAlert({
        name: isp1Online
          ? 'Secondary ISP (ISP 2) Offline — Redundancy Lost'
          : 'Total WAN Outage — ISP 1 & ISP 2 Offline',
        affectedDeviceId: 'isp-secondary',
        affectedDeviceName: 'Secondary ISP (ISP 2)',
        category: 'Dedicated Line',
        severity: isp1Online ? 'Warning' : 'Critical',
        description: isp1Online
          ? 'Secondary failover ISP 2 stopped responding. Primary ISP 1 continues serving all traffic, but WAN redundancy is degraded.'
          : 'Both ISP 1 and ISP 2 are offline. External internet connectivity is down.',
        source: 'SIMULATED',
      });
    }

    this.io.emit('state:sync', state);
    return state;
  }

  public recoverIsp(ispId: 'isp-1' | 'isp-2' = 'isp-1'): NocSystemState {
    const state = this.storage.getState();
    const isp1 = state.dedicatedLine.isps.find((i) => i.id === 'isp-1');
    const isp2 = state.dedicatedLine.isps.find((i) => i.id === 'isp-2');

    if (ispId === 'isp-1') {
      if (state.activeScenario === 'SCENARIO_2_DEDICATED_LINE_OUTAGE') {
        state.activeScenario = null;
      }
      if (isp1) {
        isp1.status = 'Online';
        isp1.trafficState = 'Active';
        isp1.downloadMbps = 428.0;
        isp1.uploadMbps = 162.4;
        isp1.latencyMs = 9.6;
        isp1.packetLossPct = 0.01;
        isp1.currentUptimePct = 99.97;
      }
      const diaDev = state.devices.find((d) => d.id === 'dedicated-line');
      if (diaDev) {
        diaDev.status = 'online';
        diaDev.latencyMs = 9.6;
        diaDev.packetLossPct = 0.01;
        diaDev.bandwidthInMbps = 428.0;
        diaDev.bandwidthOutMbps = 162.4;
      }
      const isp1Dev = state.devices.find((d) => d.id === 'isp-primary');
      if (isp1Dev) {
        isp1Dev.status = 'online';
        isp1Dev.latencyMs = 11.2;
        isp1Dev.packetLossPct = 0;
      }
      const isp2Online = isp2 && isp2.status !== 'Offline';
      if (isp2 && isp2Online) {
        isp2.trafficState = 'Standby';
        isp2.downloadMbps = 14.8;
        isp2.uploadMbps = 6.1;
      }
      const isp2Dev = state.devices.find((d) => d.id === 'isp-secondary');
      if (isp2Dev && isp2Online) {
        isp2Dev.bandwidthInMbps = 14.8;
        isp2Dev.bandwidthOutMbps = 6.1;
      }
      for (const link of state.links) {
        if (link.isDedicatedLine) {
          link.status = 'up';
          link.utilizationPct = 43;
        }
        if (link.id === 'lnk-isp2-fw' && isp2Online) {
          link.status = 'up';
          link.utilizationPct = 5;
          link.label = 'Failover WAN (Standby)';
        }
      }

      state.dedicatedLine.activeIsp = 'isp-1';
      state.dedicatedLine.failoverActive = false;
      state.dedicatedLine.status = isp2Online ? 'Online' : 'Degraded';
      state.dedicatedLine.healthLabel = isp2Online ? 'Optimal' : 'Warning';
      state.dedicatedLine.downloadMbps = 428.0;
      state.dedicatedLine.uploadMbps = 162.4;
      state.dedicatedLine.latencyMs = 9.6;
      state.dedicatedLine.packetLossPct = 0.01;
      state.dedicatedLine.currentUptimePct = 99.97;

      this.recordSnmpEvent({
        deviceId: 'dedicated-line',
        deviceName: 'Enterprise Dedicated Line (ISP 1)',
        ipAddress: '203.177.40.2',
        method: 'SNMP Trap',
        oid: '1.3.6.1.6.3.1.1.5.4 (linkUp)',
        metric: 'ISP 1 Primary Fiber Restored',
        value: 'UP · Traffic Returned to ISP 1 (ISP 2 Back to Standby)',
        severity: 'Normal',
        source: 'SIMULATED',
      });
    } else {
      const isp1Online = isp1 && isp1.status !== 'Offline';
      if (isp2) {
        isp2.status = 'Online';
        isp2.trafficState = isp1Online ? 'Standby' : 'Active';
        isp2.downloadMbps = isp1Online ? 14.8 : 384.6;
        isp2.uploadMbps = isp1Online ? 6.1 : 142.3;
        isp2.latencyMs = 22.4;
        isp2.packetLossPct = 0.05;
      }
      const isp2Dev = state.devices.find((d) => d.id === 'isp-secondary');
      if (isp2Dev) {
        isp2Dev.status = 'online';
        isp2Dev.bandwidthInMbps = isp1Online ? 14.8 : 384.6;
        isp2Dev.bandwidthOutMbps = isp1Online ? 6.1 : 142.3;
        isp2Dev.latencyMs = 22.4;
        isp2Dev.packetLossPct = 0.05;
      }
      for (const link of state.links) {
        if (link.id === 'lnk-isp2-fw') {
          link.status = 'up';
          link.utilizationPct = isp1Online ? 5 : 78;
          link.label = isp1Online ? 'Failover WAN (Standby)' : 'ISP 2 Active Failover';
        }
      }

      if (!isp1Online) {
        state.dedicatedLine.activeIsp = 'isp-2';
        state.dedicatedLine.failoverActive = true;
        state.dedicatedLine.status = 'Degraded';
        state.dedicatedLine.healthLabel = 'Warning';
        state.dedicatedLine.downloadMbps = 384.6;
        state.dedicatedLine.uploadMbps = 142.3;
        state.dedicatedLine.latencyMs = 22.4;
        state.dedicatedLine.packetLossPct = 0.05;
      } else {
        state.dedicatedLine.activeIsp = 'isp-1';
        state.dedicatedLine.failoverActive = false;
        state.dedicatedLine.status = 'Online';
        state.dedicatedLine.healthLabel = 'Optimal';
      }

      this.recordSnmpEvent({
        deviceId: 'isp-secondary',
        deviceName: 'Secondary ISP (ISP 2)',
        ipAddress: '122.54.18.1',
        method: 'SNMP Trap',
        oid: '1.3.6.1.6.3.1.1.5.4 (linkUp)',
        metric: 'ISP 2 Failover Line Restored',
        value: isp1Online ? 'UP · Standby Redundancy Ready' : 'UP · Taking Failover Load',
        severity: 'Normal',
        source: 'SIMULATED',
      });
    }

    if (isp1?.status !== 'Offline' && isp2?.status !== 'Offline') {
      for (const alert of state.alerts) {
        if (alert.category === 'Dedicated Line' && alert.status !== 'Resolved') {
          alert.status = 'Resolved';
        }
      }
    }

    this.storage.setState(state);
    this.io.emit('state:sync', state);
    return state;
  }

  public simulateDedicatedLineOutage(): NocSystemState {
    return this.simulateIspFailure('isp-1');
  }

  public recoverDedicatedLine(): NocSystemState {
    this.recoverIsp('isp-2');
    return this.recoverIsp('isp-1');
  }

  // SCENARIO 3: COLD SPARE REPLACEMENT
  public simulateSwitchFailure(deviceId = 'core-switch'): NocSystemState {
    const state = this.storage.getState();
    const target = state.devices.find((d) => d.id === deviceId);
    if (!target) return state;

    state.activeScenario = 'SCENARIO_3_COLD_SPARE';
    target.status = 'offline';
    target.bandwidthInMbps = 0;
    target.bandwidthOutMbps = 0;
    target.packetLossPct = 100;
    target.latencyMs = 0;

    for (const iface of target.interfaces) {
      iface.status = 'down';
      iface.utilizationPct = 0;
    }

    for (const link of state.links) {
      if (link.medium === 'standby') continue;
      if (link.source === deviceId || link.target === deviceId) {
        link.status = 'down';
        link.utilizationPct = 0;
      }
    }

    this.storage.setState(state);

    this.recordSnmpEvent({
      deviceId: target.id,
      deviceName: target.name,
      ipAddress: target.ipAddress,
      method: 'SNMP Trap',
      oid: '1.3.6.1.6.3.1.1.5.3 (linkDown)',
      metric: 'Switch Power / Backplane Failure',
      value: 'OFFLINE · All Trunk Ports Down',
      severity: 'Critical',
      source: 'SIMULATED',
    });

    this.createAlert({
      name: `Switch Disconnection (${target.label} Failed)`,
      affectedDeviceId: target.id,
      affectedDeviceName: target.name,
      category: 'Switch & Routing',
      severity: 'Critical',
      description: `${target.name} (${target.ipAddress}) stopped responding to ICMP and SNMP polls. Onsite Cold Spare replacement is recommended immediately to eliminate procurement delay.`,
      source: 'SIMULATED',
    });

    this.io.emit('state:sync', state);
    return state;
  }

  public replaceFailedSwitchWithSpare(
    failedDeviceId: string,
    spareItemId: string,
    performedBy = 'ICT Network Administrator'
  ): { state: NocSystemState; record: ReplacementRecord } | null {
    const state = this.storage.getState();
    const failedDevice = state.devices.find((d) => d.id === failedDeviceId);
    const spare = state.spares.find((s) => s.id === spareItemId);
    if (!failedDevice || !spare || spare.status !== 'Available') {
      return null;
    }

    const oldSerial = failedDevice.serialNumber || 'UNKNOWN-SN';
    const oldModel = failedDevice.model || 'Switch';

    // Update spare inventory status to In Use
    spare.status = 'In Use';
    spare.assignedToDeviceId = failedDevice.id;

    // Update the spare visual node in topology to show it is now Deployed
    const spareTopologyNode = state.devices.find((d) => d.id === spare.deviceId);
    if (spareTopologyNode) {
      spareTopologyNode.status = 'online';
      spareTopologyNode.label = `${spare.name.split('(')[0].trim()} (Deployed)`;
      spareTopologyNode.ipAddress = failedDevice.ipAddress;
    }

    // Disconnect old failed unit visually into quarantine label & restore active routing with spare hardware
    failedDevice.status = 'online';
    failedDevice.model = `${spare.model} [Cold Spare Active]`;
    failedDevice.serialNumber = spare.serialNumber;
    failedDevice.replacedBySpareId = spare.id;
    failedDevice.packetLossPct = 0;
    failedDevice.latencyMs = 0.8;
    failedDevice.uptimeSeconds = 12;

    for (const iface of failedDevice.interfaces) {
      iface.status = 'up';
      iface.utilizationPct = 14;
    }

    // Re-link topology: activate links connected to failedDevice and update standby link to show replacement
    for (const link of state.links) {
      if (link.source === failedDevice.id || link.target === failedDevice.id) {
        if (link.medium === 'standby') {
          link.label = `Replaced w/ ${spare.serialNumber}`;
          link.status = 'up';
        } else {
          link.status = 'up';
          link.utilizationPct = 18;
        }
      }
      if (link.source === spare.deviceId) {
        link.status = 'up';
        link.label = 'Deployed to Active Rack';
      }
    }

    // Resolve switch failure alerts
    for (const alert of state.alerts) {
      if (alert.affectedDeviceId === failedDevice.id && alert.status !== 'Resolved') {
        alert.status = 'Resolved';
      }
    }

    if (state.activeScenario === 'SCENARIO_3_COLD_SPARE') {
      state.activeScenario = null;
    }

    const record: ReplacementRecord = {
      id: `rep-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      failedDeviceId: failedDevice.id,
      failedDeviceName: `${failedDevice.name} (${oldModel} · S/N ${oldSerial})`,
      spareItemId: spare.id,
      spareName: spare.name,
      spareSerial: spare.serialNumber,
      performedBy,
      reason: 'Hardware failure detected via SNMP; physically swapped with pre-configured Onsite Cold Spare.',
      downtimeAvoidedNote: 'Avoided 14–30 day procurement & bidding delay using pre-staged cold spare.',
    };

    state.replacementHistory.unshift(record);
    this.storage.setState(state);

    this.recordSnmpEvent({
      deviceId: failedDevice.id,
      deviceName: failedDevice.name,
      ipAddress: failedDevice.ipAddress,
      method: 'SNMPv2c Poll',
      oid: '1.3.6.1.2.1.1.1.0 (sysDescr)',
      metric: 'Cold Spare Replacement Verified',
      value: `Active S/N ${spare.serialNumber} online`,
      severity: 'Normal',
      source: 'SIMULATED',
    });

    this.createAlert({
      name: `Cold Spare Deployed (${spare.serialNumber})`,
      affectedDeviceId: failedDevice.id,
      affectedDeviceName: failedDevice.name,
      category: 'Switch & Routing',
      severity: 'Normal',
      description: `Replaced failed hardware (${oldSerial}) with Onsite Cold Spare ${spare.name} (${spare.serialNumber}). Topology links restored.`,
      source: 'SIMULATED',
    });

    this.io.emit('spare:replaced', { record, state });
    this.io.emit('state:sync', state);
    return { state, record };
  }

  public updateSpareStatus(spareId: string, status: SpareStatus): NocSystemState {
    const state = this.storage.getState();
    const spare = state.spares.find((s) => s.id === spareId);
    if (spare) {
      spare.status = status;
      this.storage.setState(state);
      this.io.emit('state:sync', state);
    }
    return state;
  }

  // SCENARIO 4: AUTOMATED SMART ALERTS USING SNMP
  public simulateSnmpSmartAlert(kind: 'utilization' | 'disk' | 'both' = 'both'): NocSystemState {
    const state = this.storage.getState();
    state.activeScenario = 'SCENARIO_4_SNMP_ALERTS';

    if (kind === 'utilization' || kind === 'both') {
      const dist2 = state.devices.find((d) => d.id === 'dist-2');
      if (dist2) {
        dist2.status = 'warning';
        dist2.cpuUsage = 89;
        dist2.memoryUsage = 84;
        dist2.bandwidthInMbps = 932.4;
        for (const iface of dist2.interfaces) {
          iface.utilizationPct = 94;
          iface.status = 'degraded';
        }
        for (const link of state.links) {
          if (link.source === 'dist-2' || link.target === 'dist-2') {
            link.status = 'degraded';
            link.utilizationPct = 94;
          }
        }
      }

      this.recordSnmpEvent({
        deviceId: 'dist-2',
        deviceName: 'Distribution Switch 2 (OSDS/Lib/Guest)',
        ipAddress: '10.0.2.1',
        method: 'SNMP Trap',
        oid: '1.3.6.1.2.1.2.2.1.10 (ifInOctets)',
        metric: 'High Switch Interface Utilization',
        value: '94% trunk saturation · CPU 89%',
        severity: 'Warning',
        source: 'SIMULATED',
      });

      this.createAlert({
        name: 'Abnormal Switch Utilization (SNMP Threshold)',
        affectedDeviceId: 'dist-2',
        affectedDeviceName: 'Distribution Switch 2 (10.0.2.1)',
        category: 'SNMP Telemetry',
        severity: 'Warning',
        description:
          'SNMP poller detected 94% bandwidth utilization on Te1/0/1 and 89% CPU load. Potential broadcast storm or heavy transfer in OSDS/Library segment.',
        source: 'SIMULATED',
      });
    }

    if (kind === 'disk' || kind === 'both') {
      const fileServer = state.devices.find((d) => d.id === 'main-file-server');
      if (fileServer) {
        fileServer.status = 'warning';
        fileServer.diskUsage = 92;
        fileServer.diskHealth = 'Warning';
        fileServer.cpuUsage = 86;
        fileServer.memoryUsage = 88;
      }

      this.recordSnmpEvent({
        deviceId: 'main-file-server',
        deviceName: 'Main File Server',
        ipAddress: '10.0.10.10',
        method: 'SNMPv2c Poll',
        oid: '1.3.6.1.2.1.25.2.3.1.6 (hrStorageUsed)',
        metric: 'RAID-10 Disk Capacity & SMART Pre-Fail',
        value: '92% used · SMART Predictive Warning',
        severity: 'Critical',
        source: 'SIMULATED',
      });

      this.createAlert({
        name: 'High Disk Utilization & SMART Warning',
        affectedDeviceId: 'main-file-server',
        affectedDeviceName: 'Main File Server (10.0.10.10)',
        category: 'Server Health',
        severity: 'Critical',
        description:
          'SNMP Host-Resources MIB reported 92% disk capacity and SMART predictive wear alert on Drive Bay 2. Expand storage or verify off-site backup immediately.',
        source: 'SIMULATED',
      });
    }

    this.storage.setState(state);
    this.io.emit('state:sync', state);
    return state;
  }

  public async probeDeviceNow(deviceId: string): Promise<NetworkDevice | null> {
    const state = this.storage.getState();
    const dev = state.devices.find((d) => d.id === deviceId);
    if (!dev) return null;

    if (dev.ipAddress === '127.0.0.1') {
      const pingRes = await execPing('127.0.0.1');
      dev.latencyMs = pingRes.latencyMs || 0.2;
      dev.telemetrySource = 'LIVE';
      this.recordSnmpEvent({
        deviceId: dev.id,
        deviceName: dev.name,
        ipAddress: dev.ipAddress,
        method: 'ICMP Ping',
        oid: 'ICMP Echo Request',
        metric: 'Manual On-Demand Probe',
        value: `${dev.latencyMs} ms · 0% loss`,
        severity: 'Normal',
        source: 'LIVE',
      });
    } else if (state.settings.mode === 'HYBRID_LIVE' && !dev.ipAddress.startsWith('Unassigned')) {
      const pingRes = await execPing(dev.ipAddress);
      if (pingRes.reachable) {
        dev.latencyMs = pingRes.latencyMs;
        dev.telemetrySource = 'LIVE';
      }
      this.recordSnmpEvent({
        deviceId: dev.id,
        deviceName: dev.name,
        ipAddress: dev.ipAddress,
        method: 'ICMP Ping',
        oid: 'ICMP Echo Request',
        metric: 'Manual On-Demand Probe',
        value: pingRes.reachable ? `${pingRes.latencyMs} ms` : 'Timeout (Private LAN / Demo)',
        severity: pingRes.reachable ? 'Normal' : 'Unknown',
        source: pingRes.reachable ? 'LIVE' : 'SIMULATED',
      });
    } else {
      this.recordSnmpEvent({
        deviceId: dev.id,
        deviceName: dev.name,
        ipAddress: dev.ipAddress,
        method: 'SNMPv2c Poll',
        oid: '1.3.6.1.2.1.1.3.0 (sysUpTime)',
        metric: 'Manual Demo Poll',
        value: dev.status === 'offline' ? 'No Response (Offline)' : `${dev.latencyMs} ms · Nominal`,
        severity: dev.status === 'offline' ? 'Critical' : dev.status === 'warning' ? 'Warning' : 'Normal',
        source: 'SIMULATED',
      });
    }

    dev.lastUpdated = new Date().toISOString();
    this.storage.setState(state);
    this.io.emit('state:sync', state);
    return dev;
  }

  public restoreDevice(deviceId: string): NocSystemState {
    const state = this.storage.getState();
    const dev = state.devices.find((d) => d.id === deviceId);
    if (!dev) return state;

    if (dev.id === 'dedicated-line' || dev.id === 'isp-primary') {
      return this.recoverIsp('isp-1');
    }
    if (dev.id === 'isp-secondary') {
      return this.recoverIsp('isp-2');
    }

    dev.status = 'online';
    dev.packetLossPct = 0;
    dev.latencyMs = 1.2;
    if (typeof dev.diskUsage === 'number' && dev.diskUsage > 85) {
      dev.diskUsage = 64;
      dev.diskHealth = 'Healthy';
    }
    if (typeof dev.cpuUsage === 'number' && dev.cpuUsage > 80) {
      dev.cpuUsage = 28;
      dev.memoryUsage = 44;
    }
    for (const iface of dev.interfaces) {
      iface.status = 'up';
      iface.utilizationPct = 12;
    }
    for (const link of state.links) {
      if (link.medium === 'standby') continue;
      if (link.source === dev.id || link.target === dev.id) {
        link.status = 'up';
        link.utilizationPct = 15;
      }
    }
    for (const alert of state.alerts) {
      if (alert.affectedDeviceId === dev.id && alert.status !== 'Resolved') {
        alert.status = 'Resolved';
      }
    }

    if (state.backup.status === 'Failed' && dev.id === 'backup-server') {
      state.backup.status = 'Completed';
      state.backup.progressPct = 100;
    }

    this.storage.setState(state);
    this.io.emit('state:sync', state);
    return state;
  }

  public resetAll(): NocSystemState {
    if (this.backupStepTimer) {
      clearInterval(this.backupStepTimer);
      this.backupStepTimer = null;
    }
    const fresh = this.storage.resetState();
    this.io.emit('state:sync', fresh);
    return fresh;
  }
}

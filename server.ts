import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server as SocketIOServer } from 'socket.io';
import { NocMonitoringService } from './server/monitoring.ts';
import {
  deleteSchoolTopologyProject,
  discoverNearbySchools,
  loadSavedSchoolTopologies,
  saveSchoolTopologyProject,
} from './server/schools.ts';
import { NocStorage } from './server/storage.ts';
import type { MonitoringSettings, SpareStatus } from './src/types/network.ts';
import type { SchoolTopologyProject } from './src/types/schoolTopology.ts';

async function bootstrap() {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  app.use(express.json());

  const storage = new NocStorage();
  const monitoring = new NocMonitoringService(storage, io);
  monitoring.start();

  io.on('connection', (socket) => {
    socket.emit('state:init', storage.getState());
  });

  // REST API endpoints
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, serverTime: new Date().toISOString() });
  });

  app.get('/api/state', (_req, res) => {
    res.json(storage.getState());
  });

  app.post('/api/reset', (_req, res) => {
    const fresh = monitoring.resetAll();
    res.json(fresh);
  });

  // Scenario 1: Automatic Cloud Backup
  app.post('/api/backup/trigger', (req, res) => {
    const triggerType = req.body?.triggerType === 'Demo' ? 'Demo' : 'Manual';
    const next = monitoring.triggerCloudBackup(triggerType);
    res.json(next);
  });

  app.post('/api/backup/fail', (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const next = monitoring.simulateBackupFailure(reason);
    res.json(next);
  });

  app.post('/api/backup/settings', (req, res) => {
    const state = storage.getState();
    const { schedulerEnabled, scheduleTime, retentionDays, targetBucket } = req.body || {};
    if (typeof schedulerEnabled === 'boolean') state.backup.schedulerEnabled = schedulerEnabled;
    if (typeof scheduleTime === 'string') {
      state.backup.scheduleTime = scheduleTime;
      state.settings.backupScheduleTime = scheduleTime;
    }
    if (typeof retentionDays === 'number') state.backup.retentionDays = retentionDays;
    if (typeof targetBucket === 'string' && targetBucket.trim()) state.backup.targetBucket = targetBucket.trim();
    storage.setState(state);
    io.emit('state:sync', state);
    res.json(state);
  });

  // Scenario 2: Dedicated Line (Dual-ISP Failover)
  app.post('/api/scenarios/dedicated-line/fail', (_req, res) => {
    const next = monitoring.simulateDedicatedLineOutage();
    res.json(next);
  });

  app.post('/api/scenarios/dedicated-line/recover', (_req, res) => {
    const next = monitoring.recoverDedicatedLine();
    res.json(next);
  });

  app.post('/api/scenarios/dedicated-line/isp/:ispId/fail', (req, res) => {
    const ispId = req.params.ispId === 'isp-2' ? 'isp-2' : 'isp-1';
    const next = monitoring.simulateIspFailure(ispId);
    res.json(next);
  });

  app.post('/api/scenarios/dedicated-line/isp/:ispId/recover', (req, res) => {
    const ispId = req.params.ispId === 'isp-2' ? 'isp-2' : 'isp-1';
    const next = monitoring.recoverIsp(ispId);
    res.json(next);
  });

  // Scenario 3: Cold Spares
  app.post('/api/scenarios/cold-spare/fail-switch', (req, res) => {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : 'core-switch';
    const next = monitoring.simulateSwitchFailure(deviceId);
    res.json(next);
  });

  app.post('/api/spares/replace', (req, res) => {
    const { failedDeviceId, spareItemId, performedBy } = req.body || {};
    if (typeof failedDeviceId !== 'string' || typeof spareItemId !== 'string') {
      res.status(400).json({ error: 'failedDeviceId and spareItemId are required' });
      return;
    }
    const result = monitoring.replaceFailedSwitchWithSpare(failedDeviceId, spareItemId, performedBy);
    if (!result) {
      res.status(409).json({ error: 'Selected cold spare is unavailable or device not found' });
      return;
    }
    res.json(result);
  });

  app.patch('/api/spares/:id/status', (req, res) => {
    const status = req.body?.status as SpareStatus;
    if (!['Available', 'In Use', 'Under Maintenance'].includes(status)) {
      res.status(400).json({ error: 'Invalid spare status' });
      return;
    }
    const next = monitoring.updateSpareStatus(req.params.id, status);
    res.json(next);
  });

  // Scenario 4: SNMP Smart Alerts
  app.post('/api/scenarios/snmp/simulate', (req, res) => {
    const kind =
      req.body?.kind === 'utilization' || req.body?.kind === 'disk' ? req.body.kind : 'both';
    const next = monitoring.simulateSnmpSmartAlert(kind);
    res.json(next);
  });

  // Device controls & probes
  app.post('/api/devices/:id/probe', async (req, res) => {
    const dev = await monitoring.probeDeviceNow(req.params.id);
    if (!dev) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    res.json(dev);
  });

  app.post('/api/devices/:id/restore', (req, res) => {
    const next = monitoring.restoreDevice(req.params.id);
    res.json(next);
  });

  // Alerts
  app.post('/api/alerts/:id/acknowledge', (req, res) => {
    const updated = monitoring.acknowledgeAlert(req.params.id);
    if (!updated) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    res.json(updated);
  });

  app.post('/api/alerts/acknowledge-all', (_req, res) => {
    monitoring.acknowledgeAllAlerts();
    res.json(storage.getState());
  });

  // Settings
  app.put('/api/settings', (req, res) => {
    const state = storage.getState();
    const patch = req.body as Partial<MonitoringSettings>;
    state.settings = {
      ...state.settings,
      ...patch,
      icmpTargets: {
        ...state.settings.icmpTargets,
        ...(patch.icmpTargets || {}),
      },
      snmp: {
        ...state.settings.snmp,
        ...(patch.snmp || {}),
      },
      thresholds: {
        ...state.settings.thresholds,
        ...(patch.thresholds || {}),
      },
    };
    storage.setState(state);
    monitoring.restartPollLoop();
    io.emit('state:sync', state);
    res.json(state);
  });

  // Reports Export (CSV or JSON)
  app.get('/api/reports/export', (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const state = storage.getState();
    if (format === 'csv') {
      const headers = [
        'Device ID',
        'Name',
        'Type',
        'Cabinet',
        'IP Address',
        'Status',
        'Telemetry Source',
        'CPU %',
        'Memory %',
        'Latency (ms)',
        'Bandwidth In (Mbps)',
        'Bandwidth Out (Mbps)',
      ];
      const rows = state.devices.map((d) => [
        d.id,
        `"${d.name.replace(/"/g, '""')}"`,
        d.type,
        `"${d.cabinet}"`,
        d.ipAddress,
        d.status,
        d.telemetrySource,
        d.cpuUsage ?? 'N/A',
        d.memoryUsage ?? 'N/A',
        d.latencyMs,
        d.bandwidthInMbps,
        d.bandwidthOutMbps,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="noc-infrastructure-report.csv"');
      res.send(csv);
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="noc-infrastructure-report.json"');
    res.send(JSON.stringify(state, null, 2));
  });

  app.get('/api/maps-config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      mapProvider: 'arcgis',
      layers: ['street', 'satellite'],
      requiresApiKey: false,
    });
  });

  // School Connectivity Map & School Topology Builder API
  app.get('/api/schools/discover', async (req, res) => {
    const rawRadius = Number(req.query.radiusKm ?? 5);
    if (!Number.isFinite(rawRadius) || rawRadius < 1 || rawRadius > 20) {
      res.status(400).json({ error: 'radiusKm must be between 1 and 20 km' });
      return;
    }
    const forceRefresh = req.query.refresh === 'true';
    try {
      const data = await discoverNearbySchools(rawRadius, forceRefresh);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to retrieve nearby schools',
      });
    }
  });

  app.get('/api/school-topologies', (_req, res) => {
    res.json(loadSavedSchoolTopologies());
  });

  app.post('/api/school-topologies', (req, res) => {
    const project = req.body as Partial<SchoolTopologyProject> | undefined;
    if (
      !project ||
      typeof project.id !== 'string' ||
      !project.id.trim() ||
      typeof project.name !== 'string' ||
      !project.name.trim() ||
      !Array.isArray(project.nodes) ||
      !Array.isArray(project.links)
    ) {
      res.status(400).json({ error: 'Valid topology project payload (id, name, nodes, links) is required' });
      return;
    }
    const saved = saveSchoolTopologyProject(project as SchoolTopologyProject);
    res.json(saved);
  });

  app.delete('/api/school-topologies/:id', (req, res) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: 'Project id is required' });
      return;
    }
    const remaining = deleteSchoolTopologyProject(id);
    res.json(remaining);
  });

  // Frontend Vite middleware (dev) or static dist (prod)
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NetPulse NOC server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start NetPulse NOC server:', err);
  process.exit(1);
});

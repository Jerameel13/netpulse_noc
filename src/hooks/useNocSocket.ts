import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  CloudBackupState,
  DashboardHistoryPoint,
  DedicatedLineState,
  MonitoringSettings,
  NetworkAlert,
  NetworkDevice,
  NetworkLink,
  NocSystemState,
  SnmpEventLog,
  SpareStatus,
} from '../types/network';

export function useNocSocket() {
  const [state, setState] = useState<NocSystemState | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NocSystemState;
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to NOC server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('state:init', (initData: NocSystemState) => {
      setState(initData);
      setLoading(false);
    });

    socket.on('state:sync', (syncData: NocSystemState) => {
      setState(syncData);
    });

    socket.on(
      'telemetry:tick',
      (tick: {
        devices: NetworkDevice[];
        links: NetworkLink[];
        dedicatedLine: DedicatedLineState;
        dashboardHistory: DashboardHistoryPoint[];
        serverTime: string;
      }) => {
        setState((prev) =>
          prev
            ? {
                ...prev,
                devices: tick.devices,
                links: tick.links,
                dedicatedLine: tick.dedicatedLine,
                dashboardHistory: tick.dashboardHistory,
                serverTime: tick.serverTime,
              }
            : prev
        );
      }
    );

    socket.on('backup:progress', (backup: CloudBackupState) => {
      setState((prev) => (prev ? { ...prev, backup } : prev));
    });

    socket.on('snmp:log', (log: SnmpEventLog) => {
      setState((prev) => {
        if (!prev) return prev;
        if (prev.snmpLogs.some((item) => item.id === log.id)) return prev;
        return {
          ...prev,
          snmpLogs: [log, ...prev.snmpLogs].slice(0, 60),
        };
      });
    });

    socket.on('alert:new', (alert: NetworkAlert) => {
      setState((prev) => {
        if (!prev) return prev;
        if (prev.alerts.some((item) => item.id === alert.id)) return prev;
        return {
          ...prev,
          alerts: [alert, ...prev.alerts].slice(0, 80),
        };
      });
    });

    socket.on('alert:updated', (alert: NetworkAlert) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          alerts: prev.alerts.map((a) => (a.id === alert.id ? alert : a)),
        };
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchState]);

  const runPost = useCallback(async (url: string, actionKey: string, body?: unknown) => {
    setBusyAction(actionKey);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      if (data && Array.isArray(data.devices)) {
        setState(data as NocSystemState);
      } else if (data?.state && Array.isArray(data.state.devices)) {
        setState(data.state as NocSystemState);
      }
      return data;
    } finally {
      setBusyAction(null);
    }
  }, []);

  const triggerBackup = useCallback(
    (triggerType: 'Manual' | 'Demo' = 'Manual') =>
      runPost('/api/backup/trigger', 'backup-trigger', { triggerType }),
    [runPost]
  );

  const simulateBackupFailure = useCallback(
    () => runPost('/api/backup/fail', 'backup-fail'),
    [runPost]
  );

  const updateBackupSettings = useCallback(
    (payload: Partial<CloudBackupState>) =>
      runPost('/api/backup/settings', 'backup-settings', payload),
    [runPost]
  );

  const failDedicatedLine = useCallback(
    () => runPost('/api/scenarios/dedicated-line/fail', 'line-fail'),
    [runPost]
  );

  const recoverDedicatedLine = useCallback(
    () => runPost('/api/scenarios/dedicated-line/recover', 'line-recover'),
    [runPost]
  );

  const failIsp = useCallback(
    (ispId: 'isp-1' | 'isp-2') =>
      runPost(`/api/scenarios/dedicated-line/isp/${ispId}/fail`, `isp-fail-${ispId}`),
    [runPost]
  );

  const recoverIsp = useCallback(
    (ispId: 'isp-1' | 'isp-2') =>
      runPost(`/api/scenarios/dedicated-line/isp/${ispId}/recover`, `isp-recover-${ispId}`),
    [runPost]
  );

  const failSwitch = useCallback(
    (deviceId = 'core-switch') =>
      runPost('/api/scenarios/cold-spare/fail-switch', 'switch-fail', { deviceId }),
    [runPost]
  );

  const replaceWithSpare = useCallback(
    (failedDeviceId: string, spareItemId: string, performedBy?: string) =>
      runPost('/api/spares/replace', 'spare-replace', {
        failedDeviceId,
        spareItemId,
        performedBy,
      }),
    [runPost]
  );

  const updateSpareStatus = useCallback(async (spareId: string, status: SpareStatus) => {
    setBusyAction(`spare-status-${spareId}`);
    try {
      const res = await fetch(`/api/spares/${spareId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const next = (await res.json()) as NocSystemState;
        setState(next);
      }
    } finally {
      setBusyAction(null);
    }
  }, []);

  const simulateSnmpAlert = useCallback(
    (kind: 'utilization' | 'disk' | 'both' = 'both') =>
      runPost('/api/scenarios/snmp/simulate', 'snmp-sim', { kind }),
    [runPost]
  );

  const probeDevice = useCallback(
    (deviceId: string) => runPost(`/api/devices/${deviceId}/probe`, `probe-${deviceId}`),
    [runPost]
  );

  const restoreDevice = useCallback(
    (deviceId: string) => runPost(`/api/devices/${deviceId}/restore`, `restore-${deviceId}`),
    [runPost]
  );

  const acknowledgeAlert = useCallback(
    (alertId: string) => runPost(`/api/alerts/${alertId}/acknowledge`, `ack-${alertId}`),
    [runPost]
  );

  const acknowledgeAllAlerts = useCallback(
    () => runPost('/api/alerts/acknowledge-all', 'ack-all'),
    [runPost]
  );

  const updateSettings = useCallback(async (patch: Partial<MonitoringSettings>) => {
    setBusyAction('settings-save');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const next = (await res.json()) as NocSystemState;
        setState(next);
      }
    } finally {
      setBusyAction(null);
    }
  }, []);

  const resetAll = useCallback(() => runPost('/api/reset', 'reset-all'), [runPost]);

  return {
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
  };
}

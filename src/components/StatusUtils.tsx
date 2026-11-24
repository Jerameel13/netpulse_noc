import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Monitor,
  Package,
  Radio,
  Router,
  Server,
  Shield,
  Wifi,
  XCircle,
  Zap,
} from 'lucide-react';
import type { AlertSeverity, DeviceStatus, DeviceType } from '../types/network';

export function getStatusLabel(status: DeviceStatus): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'warning':
      return 'Warning';
    case 'offline':
      return 'Offline';
    case 'standby':
      return 'Cold Spare';
    default:
      return 'Unknown';
  }
}

export function getStatusTextColor(status: DeviceStatus): string {
  switch (status) {
    case 'online':
      return 'text-emerald-400';
    case 'warning':
      return 'text-amber-400';
    case 'offline':
      return 'text-red-400';
    case 'standby':
      return 'text-cyan-400';
    default:
      return 'text-slate-400';
  }
}

export function getStatusBorderColor(status: DeviceStatus): string {
  switch (status) {
    case 'online':
      return 'border-emerald-500/40';
    case 'warning':
      return 'border-amber-500/50';
    case 'offline':
      return 'border-red-500/70';
    case 'standby':
      return 'border-cyan-500/40';
    default:
      return 'border-slate-600';
  }
}

export function getSeverityColor(severity: AlertSeverity): {
  text: string;
  bg: string;
  border: string;
} {
  switch (severity) {
    case 'Normal':
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
      };
    case 'Warning':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
      };
    case 'Critical':
      return {
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
      };
    default:
      return {
        text: 'text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/30',
      };
  }
}

export function StatusIcon({ status, className = 'w-4 h-4' }: { status: DeviceStatus; className?: string }) {
  switch (status) {
    case 'online':
      return <CheckCircle2 className={`${className} text-emerald-400`} />;
    case 'warning':
      return <AlertTriangle className={`${className} text-amber-400`} />;
    case 'offline':
      return <XCircle className={`${className} text-red-400`} />;
    case 'standby':
      return <Package className={`${className} text-cyan-400`} />;
    default:
      return <Activity className={`${className} text-slate-400`} />;
  }
}

export function DeviceTypeIcon({ type, className = 'w-5 h-5' }: { type: DeviceType; className?: string }) {
  switch (type) {
    case 'isp':
      return <Globe className={className} />;
    case 'dedicated-line':
      return <Zap className={className} />;
    case 'firewall':
      return <Shield className={className} />;
    case 'router':
      return <Router className={className} />;
    case 'core-switch':
    case 'distribution-switch':
    case 'access-switch':
      return <Cpu className={className} />;
    case 'wireless-ap':
      return <Wifi className={className} />;
    case 'server':
      return <Server className={className} />;
    case 'backup-server':
      return <HardDrive className={className} />;
    case 'cloud-storage':
      return <Cloud className={className} />;
    case 'monitoring-server':
      return <Activity className={className} />;
    case 'snmp-system':
      return <Radio className={className} />;
    case 'cold-spare':
      return <Package className={className} />;
    case 'endpoint':
    default:
      return <Monitor className={className} />;
  }
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return 'Standby';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

export function formatShortTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export { Database };

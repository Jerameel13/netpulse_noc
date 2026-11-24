import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  MiniMap,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useUpdateNodeInternals,
  ViewportPortal,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  Activity,
  AlertTriangle,
  CloudUpload,
  Filter,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Search,
  ServerCrash,
  ShieldAlert,
  Tag,
  Wrench,
  X,
  ZapOff,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { NetworkDevice, NetworkLink, NocSystemState } from '../types/network';
import { DeviceTypeIcon, getStatusLabel, getStatusTextColor, StatusIcon } from './StatusUtils';

const NODE_WIDTH = 216;
const NODE_HEIGHT = 100;

/**
 * Clean, collision-free orthogonal grid coordinates for all 29 topology devices.
 * Guarantees wide routing corridors between tiers and zero overlapping cards.
 */
const TOPOLOGY_LAYOUT: Record<string, { x: number; y: number }> = {
  // Tier 1: Primary ISP & Off-Site Cloud Vault
  'isp-primary': { x: 730, y: 20 },
  'cloud-storage': { x: 1920, y: 20 },

  // Tier 2: Dedicated Line & Secondary Failover ISP
  'dedicated-line': { x: 730, y: 185 },
  'isp-secondary': { x: 1210, y: 185 },

  // Tier 3: Firewall HA + Backup Servers
  'fw-1': { x: 970, y: 350 },
  'main-file-server': { x: 1620, y: 350 },
  'backup-server': { x: 1920, y: 350 },

  // Tier 4: Edge Router
  'edge-router': { x: 970, y: 510 },

  // Tier 5: Core Switch & Server Switch
  'core-switch': { x: 970, y: 670 },
  'server-switch': { x: 1620, y: 670 },

  // Tier 6: Distribution Switches & Watchdog Monitoring
  'dist-1': { x: 580, y: 845 },
  'dist-2': { x: 1360, y: 845 },
  'watchdog-server': { x: 1920, y: 845 },

  // Tier 7: Division Access Switches & SNMP Engine
  'sw5-cid': { x: 320, y: 1020 },
  'sw6-cid': { x: 580, y: 1020 },
  'sw3-sgod': { x: 840, y: 1020 },
  'new-sw1': { x: 1100, y: 1020 },
  'sw4-library': { x: 1360, y: 1020 },
  'guest-sw': { x: 1620, y: 1020 },
  'snmp-system': { x: 1920, y: 1020 },

  // Tier 8: Workstations, Wireless APs & Endpoints
  'cid-computers': { x: 450, y: 1190 },
  'ap2-unifi': { x: 840, y: 1190 },
  'osds-computers': { x: 1100, y: 1190 },
  'library-computers': { x: 1360, y: 1190 },
  'guest-devices': { x: 1620, y: 1190 },

  // Dedicated Onsite Cold Spares Bay (Left Rack Column)
  'spare-cables-01': { x: 20, y: 350 },
  'spare-equipment-01': { x: 20, y: 510 },
  'spare-core-01': { x: 20, y: 670 },
  'spare-access-01': { x: 20, y: 845 },
};

interface EdgeRouteSpec {
  sourceHandle: string;
  targetHandle: string;
  busY?: number;
  busX?: number;
  labelBias?: 'start' | 'middle' | 'end';
}

const EDGE_ROUTING: Record<string, EdgeRouteSpec> = {
  // WAN & Enterprise Dedicated Line
  'lnk-isp-dia': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },
  'lnk-dia-fw': { sourceHandle: 'src-bottom', targetHandle: 'tgt-left', labelBias: 'start' },
  'lnk-isp2-fw': { sourceHandle: 'src-bottom', targetHandle: 'tgt-right', labelBias: 'start' },
  'lnk-cloud-isp': { sourceHandle: 'src-right', targetHandle: 'tgt-left' },

  // Central ICT Spine
  'lnk-fw-r1': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },
  'lnk-r1-core': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },

  // Core Switch -> Distribution & Server Network
  'lnk-core-d1': { sourceHandle: 'src-bottom-left', targetHandle: 'tgt-top', busY: 808 },
  'lnk-core-d2': { sourceHandle: 'src-bottom-right', targetHandle: 'tgt-top', busY: 808 },
  'lnk-core-srv': { sourceHandle: 'src-right', targetHandle: 'tgt-left' },

  // Distribution 1 -> CID / SGOD Access Switches
  'lnk-d1-sw5': { sourceHandle: 'src-bottom-left', targetHandle: 'tgt-top', busY: 982 },
  'lnk-d1-sw6': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },
  'lnk-d1-sw3': { sourceHandle: 'src-bottom-right', targetHandle: 'tgt-top', busY: 982 },

  // Distribution 2 -> OSDS / Library / Guest Access Switches
  'lnk-d2-newsw1': { sourceHandle: 'src-bottom-left', targetHandle: 'tgt-top', busY: 982 },
  'lnk-d2-sw4': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },
  'lnk-d2-guest': { sourceHandle: 'src-bottom-right', targetHandle: 'tgt-top', busY: 982 },

  // Access Switches -> Endpoints
  'lnk-sw5-cidpc': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top-left', busY: 1155 },
  'lnk-sw6-cidpc': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top-right', busY: 1155 },
  'lnk-sw3-ap2': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },
  'lnk-newsw1-osds': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },
  'lnk-sw4-libpc': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },
  'lnk-guest-dev': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },

  // Server Network, Cloud Backup & SNMP Monitoring
  'lnk-srv-filesrv': { sourceHandle: 'src-top', targetHandle: 'tgt-bottom' },
  'lnk-srv-backupsrv': { sourceHandle: 'src-top-right', targetHandle: 'tgt-bottom', busY: 555 },
  'lnk-filesrv-backupsrv': { sourceHandle: 'src-right', targetHandle: 'tgt-left' },
  'lnk-backupsrv-cloud': { sourceHandle: 'src-top', targetHandle: 'tgt-bottom' },
  'lnk-srv-watchdog': { sourceHandle: 'src-right', targetHandle: 'tgt-top' },
  'lnk-watchdog-snmp': { sourceHandle: 'src-bottom', targetHandle: 'tgt-top' },

  // Onsite Cold Spares Standby Links
  'lnk-spare-core-ready': { sourceHandle: 'src-right', targetHandle: 'tgt-left' },
  'lnk-spare-access-ready': { sourceHandle: 'src-right', targetHandle: 'tgt-left' },
};

interface ZoneFrame {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  deviceIds: string[];
  tone: 'cyan' | 'slate' | 'emerald' | 'dashed';
}

const ZONE_FRAMES: ZoneFrame[] = [
  {
    id: 'zone-wan',
    title: 'ISP & Enterprise WAN',
    x: 705,
    y: -15,
    width: 746,
    height: 320,
    deviceIds: ['isp-primary', 'dedicated-line', 'isp-secondary'],
    tone: 'cyan',
  },
  {
    id: 'zone-central-ict',
    title: 'Central ICT Data Cabinet',
    x: 945,
    y: 315,
    width: 266,
    height: 475,
    deviceIds: ['fw-1', 'edge-router', 'core-switch'],
    tone: 'slate',
  },
  {
    id: 'zone-cold-spares',
    title: 'Onsite Cold Spares Bay',
    x: -5,
    y: 315,
    width: 266,
    height: 650,
    deviceIds: ['spare-cables-01', 'spare-equipment-01', 'spare-core-01', 'spare-access-01'],
    tone: 'dashed',
  },
  {
    id: 'zone-server-cloud',
    title: 'Server & Cloud Backup Network',
    x: 1595,
    y: -15,
    width: 566,
    height: 805,
    deviceIds: ['cloud-storage', 'main-file-server', 'backup-server', 'server-switch'],
    tone: 'emerald',
  },
  {
    id: 'zone-snmp',
    title: 'Watchdog & SNMP',
    x: 1895,
    y: 815,
    width: 266,
    height: 325,
    deviceIds: ['watchdog-server', 'snmp-system'],
    tone: 'slate',
  },
  {
    id: 'zone-dist-1',
    title: 'Distribution 1 · CID & SGOD Cabinets',
    x: 298,
    y: 815,
    width: 778,
    height: 495,
    deviceIds: ['dist-1', 'sw5-cid', 'sw6-cid', 'sw3-sgod', 'cid-computers', 'ap2-unifi'],
    tone: 'slate',
  },
  {
    id: 'zone-dist-2',
    title: 'Distribution 2 · OSDS, Library & Guest',
    x: 1084,
    y: 815,
    width: 774,
    height: 495,
    deviceIds: [
      'dist-2',
      'new-sw1',
      'sw4-library',
      'guest-sw',
      'osds-computers',
      'library-computers',
      'guest-devices',
    ],
    tone: 'slate',
  },
];

interface Point {
  x: number;
  y: number;
}

/**
 * Generates clean 90-degree orthogonal SVG path strings from strictly horizontal/vertical segments.
 */
function buildOrthogonalPath(rawPoints: Point[], cornerRadius = 4): string {
  // Remove consecutive duplicate points
  const deduped: Point[] = [];
  for (const pt of rawPoints) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(prev.x - pt.x) > 0.5 || Math.abs(prev.y - pt.y) > 0.5) {
      deduped.push({ x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 });
    }
  }

  // Collapse collinear intermediate points
  const points: Point[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const p = deduped[i];
    if (i === 0 || i === deduped.length - 1) {
      points.push(p);
      continue;
    }
    const prev = points[points.length - 1];
    const next = deduped[i + 1];
    const sameX = Math.abs(prev.x - p.x) < 0.5 && Math.abs(p.x - next.x) < 0.5;
    const sameY = Math.abs(prev.y - p.y) < 0.5 && Math.abs(p.y - next.y) < 0.5;
    if (!sameX && !sameY) {
      points.push(p);
    }
  }

  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dxIn = curr.x - prev.x;
    const dyIn = curr.y - prev.y;
    const lenIn = Math.hypot(dxIn, dyIn);

    const dxOut = next.x - curr.x;
    const dyOut = next.y - curr.y;
    const lenOut = Math.hypot(dxOut, dyOut);

    if (lenIn < 1 || lenOut < 1) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const r = Math.min(cornerRadius, lenIn / 2, lenOut / 2);
    const uxIn = dxIn / lenIn;
    const uyIn = dyIn / lenIn;
    const uxOut = dxOut / lenOut;
    const uyOut = dyOut / lenOut;

    const pEnterX = curr.x - uxIn * r;
    const pEnterY = curr.y - uyIn * r;
    const pExitX = curr.x + uxOut * r;
    const pExitY = curr.y + uyOut * r;

    d += ` L ${pEnterX} ${pEnterY} Q ${curr.x} ${curr.y} ${pExitX} ${pExitY}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function computeOrthogonalEdgeGeometry(params: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  route?: EdgeRouteSpec;
}): { path: string; labelX: number; labelY: number } {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, route } = params;
  const points: Point[] = [{ x: sourceX, y: sourceY }];

  const isVerticalStart = sourcePosition === Position.Bottom || sourcePosition === Position.Top;
  const isVerticalEnd = targetPosition === Position.Top || targetPosition === Position.Bottom;
  const isHorizontalStart = sourcePosition === Position.Left || sourcePosition === Position.Right;
  const isHorizontalEnd = targetPosition === Position.Left || targetPosition === Position.Right;

  if (isVerticalStart && isVerticalEnd) {
    if (Math.abs(sourceX - targetX) < 1) {
      points.push({ x: targetX, y: targetY });
    } else {
      const midY = route?.busY ?? (sourceY + targetY) / 2;
      points.push({ x: sourceX, y: midY }, { x: targetX, y: midY }, { x: targetX, y: targetY });
    }
  } else if (isHorizontalStart && isHorizontalEnd) {
    if (Math.abs(sourceY - targetY) < 1) {
      points.push({ x: targetX, y: targetY });
    } else {
      const midX = route?.busX ?? (sourceX + targetX) / 2;
      points.push({ x: midX, y: sourceY }, { x: midX, y: targetY }, { x: targetX, y: targetY });
    }
  } else if (isVerticalStart && isHorizontalEnd) {
    // Clean single 90-degree L-bend (e.g., Dedicated Line / ISP 2 -> Firewall Left/Right)
    points.push({ x: sourceX, y: targetY }, { x: targetX, y: targetY });
  } else if (isHorizontalStart && isVerticalEnd) {
    // Clean single 90-degree L-bend (e.g., Server Switch Right -> Watchdog Top)
    points.push({ x: targetX, y: sourceY }, { x: targetX, y: targetY });
  } else {
    points.push({ x: targetX, y: targetY });
  }

  const path = buildOrthogonalPath(points, 4);

  // Choose clean label coordinates along the primary segment
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;

  if (points.length === 2) {
    labelX = (points[0].x + points[1].x) / 2;
    labelY = (points[0].y + points[1].y) / 2;
  } else if (points.length === 3) {
    // 1-elbow L-bend
    if (route?.labelBias === 'start') {
      labelX = (points[0].x + points[1].x) / 2;
      labelY = (points[0].y + points[1].y) / 2;
    } else {
      const len1 = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const len2 = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
      if (len2 >= len1) {
        labelX = (points[1].x + points[2].x) / 2;
        labelY = (points[1].y + points[2].y) / 2;
      } else {
        labelX = (points[0].x + points[1].x) / 2;
        labelY = (points[0].y + points[1].y) / 2;
      }
    }
  } else if (points.length >= 4) {
    // Z-shaped bus step: place label on the horizontal/vertical middle bus segment
    labelX = (points[1].x + points[2].x) / 2;
    labelY = (points[1].y + points[2].y) / 2;
  }

  return { path, labelX, labelY };
}

interface DeviceNodeData extends Record<string, unknown> {
  device: NetworkDevice;
  isSelected: boolean;
  isSearchMatch: boolean;
  backupInProgress: boolean;
  backupProgressPct: number;
  connectedHandles: string[];
  onSelect: (id: string) => void;
}

interface CustomLinkData extends Record<string, unknown> {
  link: NetworkLink;
  backupInProgress: boolean;
  showAllLabels: boolean;
  isHovered: boolean;
  onHover: (edgeId: string | null) => void;
}

function NetworkDeviceNode({ data }: NodeProps<Node<DeviceNodeData>>) {
  const {
    device,
    isSelected,
    isSearchMatch,
    backupInProgress,
    backupProgressPct,
    connectedHandles,
    onSelect,
  } = data;

  const connectedSet = useMemo(() => new Set(connectedHandles), [connectedHandles]);

  const isOffline = device.status === 'offline';
  const isWarning = device.status === 'warning';
  const isStandby = device.status === 'standby';
  const isDedicated = device.type === 'dedicated-line';
  const isBackupNode =
    device.id === 'main-file-server' ||
    device.id === 'backup-server' ||
    device.id === 'cloud-storage';

  const borderStyle = isOffline
    ? 'border-red-500 bg-[#1B0D14] shadow-[0_0_24px_rgba(239,68,68,0.24)]'
    : isWarning
    ? 'border-amber-500/80 bg-[#1A140B] shadow-[0_0_20px_rgba(245,158,11,0.18)]'
    : isDedicated
    ? 'border-cyan-400/80 bg-[#0B172C] shadow-[0_0_24px_rgba(34,211,238,0.2)]'
    : isStandby
    ? 'border-dashed border-cyan-500/50 bg-[#081224]'
    : isSelected || isSearchMatch
    ? 'border-cyan-400 bg-[#111D35] ring-2 ring-cyan-400/30'
    : 'border-slate-700/85 bg-[#0B1222] hover:border-cyan-500/70';

  const pinClass = (handleId: string) =>
    connectedSet.has(handleId)
      ? `!w-2 !h-2 !border !border-[#060B17] !pointer-events-none ${
          isOffline
            ? '!bg-red-400'
            : isWarning
            ? '!bg-amber-400'
            : isStandby
            ? '!bg-cyan-500/80'
            : '!bg-cyan-400'
        }`
      : '!w-1 !h-1 !opacity-0 !pointer-events-none';

  return (
    <div
      onClick={() => onSelect(device.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(device.id);
        }
      }}
      className={`w-[216px] h-[100px] rounded-xl border px-3 py-2.5 cursor-pointer transition-colors duration-150 flex flex-col justify-between relative select-none ${borderStyle}`}
    >
      {/* Top Ports */}
      <Handle type="target" position={Position.Top} id="tgt-top" style={{ left: '50%' }} className={pinClass('tgt-top')} />
      <Handle type="target" position={Position.Top} id="tgt-top-left" style={{ left: '28%' }} className={pinClass('tgt-top-left')} />
      <Handle type="target" position={Position.Top} id="tgt-top-right" style={{ left: '72%' }} className={pinClass('tgt-top-right')} />
      <Handle type="source" position={Position.Top} id="src-top" style={{ left: '50%' }} className={pinClass('src-top')} />
      <Handle type="source" position={Position.Top} id="src-top-right" style={{ left: '75%' }} className={pinClass('src-top-right')} />

      {/* Left & Right Ports */}
      <Handle type="target" position={Position.Left} id="tgt-left" style={{ top: '50%' }} className={pinClass('tgt-left')} />
      <Handle type="source" position={Position.Right} id="src-right" style={{ top: '50%' }} className={pinClass('src-right')} />
      <Handle type="target" position={Position.Right} id="tgt-right" style={{ top: '50%' }} className={pinClass('tgt-right')} />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`p-1.5 rounded-lg shrink-0 ${
              isOffline
                ? 'bg-red-500/20 text-red-400'
                : isWarning
                ? 'bg-amber-500/20 text-amber-400'
                : isStandby
                ? 'bg-cyan-500/10 text-cyan-400'
                : 'bg-sky-500/15 text-cyan-300'
            }`}
          >
            <DeviceTypeIcon type={device.type} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">{device.label}</div>
            <div className="text-[10px] font-mono text-slate-400 truncate tabular-nums">{device.ipAddress}</div>
          </div>
        </div>
        <StatusIcon status={device.status} className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      </div>

      {backupInProgress && isBackupNode ? (
        <div className="pt-1.5 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[10px] text-cyan-300 mb-1">
            <span>Cloud Sync</span>
            <span className="font-mono tabular-nums">{backupProgressPct}%</span>
          </div>
          <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-300"
              style={{ width: `${backupProgressPct}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] gap-2">
          <span className={`font-medium truncate ${getStatusTextColor(device.status)}`}>
            {device.replacedBySpareId ? 'Cold Spare Active' : getStatusLabel(device.status)}
          </span>
          {isStandby ? (
            <span className="font-mono text-cyan-400/85 truncate max-w-[95px]">
              {device.serialNumber || 'Ready'}
            </span>
          ) : (
            <span className="font-mono text-slate-300 tabular-nums shrink-0">
              {isOffline ? '0 Mbps' : `${device.bandwidthInMbps} Mbps`}
            </span>
          )}
        </div>
      )}

      {/* Bottom Ports */}
      <Handle type="source" position={Position.Bottom} id="src-bottom" style={{ left: '50%' }} className={pinClass('src-bottom')} />
      <Handle type="source" position={Position.Bottom} id="src-bottom-left" style={{ left: '25%' }} className={pinClass('src-bottom-left')} />
      <Handle type="source" position={Position.Bottom} id="src-bottom-right" style={{ left: '75%' }} className={pinClass('src-bottom-right')} />
      <Handle type="target" position={Position.Bottom} id="tgt-bottom" style={{ left: '50%' }} className={pinClass('tgt-bottom')} />
    </div>
  );
}

function AnimatedNetworkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<Edge<CustomLinkData>>) {
  const link = data?.link;
  const backupInProgress = Boolean(data?.backupInProgress);
  const showAllLabels = Boolean(data?.showAllLabels);
  const isHovered = Boolean(data?.isHovered);
  const onHover = data?.onHover;

  const route = EDGE_ROUTING[id];
  const { path: edgePath, labelX, labelY } = computeOrthogonalEdgeGeometry({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    route,
  });

  const isDown = link?.status === 'down';
  const isDegraded = link?.status === 'degraded';
  const isStandby = link?.status === 'standby';
  const isDedicated = Boolean(link?.isDedicatedLine);
  const isFailoverActive = link?.id === 'lnk-isp2-fw' && !isDown && (link?.utilizationPct ?? 0) > 25;
  const isBackupActive = Boolean(link?.isBackupPath && backupInProgress && !isDown);

  const strokeColor = isDown
    ? '#EF4444'
    : isDegraded || isFailoverActive
    ? '#F59E0B'
    : isBackupActive
    ? '#10B981'
    : isDedicated
    ? '#22D3EE'
    : isStandby
    ? '#0891B2'
    : '#38BDF8';

  const baseStrokeWidth = isDedicated || isBackupActive || isFailoverActive ? 2.75 : isDown ? 2.25 : 1.75;
  const strokeWidth = isHovered ? baseStrokeWidth + 1.25 : baseStrokeWidth;
  const isAnimated = !isDown && !isStandby;

  const shouldShowLabel =
    Boolean(link?.label) &&
    (isHovered || showAllLabels || isDown || isDedicated || isFailoverActive || isBackupActive || isStandby || isDegraded);

  const labelText = isDown
    ? `DOWN · ${link?.label}`
    : isFailoverActive
    ? `ISP 2 FAILOVER (${link?.utilizationPct}%)`
    : isBackupActive
    ? `SYNCING ${link?.utilizationPct}%`
    : isHovered && link
    ? `${link.label} · ${link.utilizationPct}%`
    : link?.label;

  return (
    <g
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
      style={{ pointerEvents: 'visibleStroke' }}
    >
      {(isDedicated || isBackupActive || isFailoverActive || isHovered) && !isDown && (
        <path
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 4}
          strokeOpacity={isHovered ? 0.25 : 0.14}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={18}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isStandby ? '6 5' : isDown ? '6 4' : undefined,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          opacity: isStandby ? 0.78 : 0.96,
          fill: 'none',
        }}
      />

      {/* Clean endpoint terminations at card connectors */}
      <circle cx={sourceX} cy={sourceY} r={2.5} fill={strokeColor} pointerEvents="none" />
      <circle cx={targetX} cy={targetY} r={2.5} fill={strokeColor} pointerEvents="none" />

      {isAnimated && (
        <circle
          r={isBackupActive || isDedicated || isFailoverActive ? 4 : 2.75}
          fill={isFailoverActive ? '#FBBF24' : isBackupActive ? '#34D399' : '#22D3EE'}
          pointerEvents="none"
        >
          <animateMotion
            key={`${id}-${edgePath}`}
            dur={isBackupActive ? '1.1s' : isDedicated || isFailoverActive ? '1.4s' : '2.4s'}
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      )}

      {shouldShowLabel && labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border whitespace-nowrap ${
              isDown
                ? 'bg-red-950/95 border-red-500/70 text-red-200'
                : isDegraded || isFailoverActive
                ? 'bg-amber-950/95 border-amber-500/70 text-amber-200'
                : isBackupActive
                ? 'bg-emerald-950/95 border-emerald-500/70 text-emerald-200'
                : isDedicated
                ? 'bg-cyan-950/95 border-cyan-400/70 text-cyan-200'
                : isStandby
                ? 'bg-[#081224]/95 border-cyan-600/60 text-cyan-300'
                : 'bg-[#0B1222]/95 border-slate-700 text-slate-200'
            }`}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

const nodeTypes = {
  networkDevice: NetworkDeviceNode,
};

const edgeTypes = {
  animatedNetwork: AnimatedNetworkEdge,
};

interface TopologyCanvasProps {
  state: NocSystemState;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onTriggerBackup: () => void;
  onFailDedicatedLine: () => void;
  onRecoverDedicatedLine: () => void;
  onFailCoreSwitch: () => void;
  onReplaceCoreWithSpare: () => void;
  onSimulateSnmpAlert: () => void;
  onResetAll: () => void;
  busyAction: string | null;
}

function TopologyInner({
  state,
  selectedDeviceId,
  onSelectDevice,
  onTriggerBackup,
  onFailDedicatedLine,
  onRecoverDedicatedLine,
  onFailCoreSwitch,
  onReplaceCoreWithSpare,
  onSimulateSnmpAlert,
  onResetAll,
  busyAction,
}: TopologyCanvasProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [cabinetFilter, setCabinetFilter] = useState<string>('all');
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [showPhysicalDiagram, setShowPhysicalDiagram] = useState(false);

  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodesInitialized = useNodesInitialized();

  const backupInProgress = state.backup.status === 'In Progress';
  const lineOffline = state.dedicatedLine.status === 'Offline' || state.dedicatedLine.failoverActive;
  const coreSwitch = state.devices.find((d) => d.id === 'core-switch');
  const coreOffline = coreSwitch?.status === 'offline';
  const availableCoreSpare = state.spares.find(
    (s) => s.status === 'Available' && s.compatibleWith.includes('core-switch')
  );

  const filteredDeviceIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return new Set(
      state.devices
        .filter((d) => {
          if (cabinetFilter !== 'all' && d.cabinet !== cabinetFilter) return false;
          if (
            typeFilter === 'switching' &&
            !['core-switch', 'distribution-switch', 'access-switch', 'router', 'firewall'].includes(d.type)
          ) {
            return false;
          }
          if (
            typeFilter === 'servers' &&
            !['server', 'backup-server', 'cloud-storage', 'monitoring-server', 'snmp-system'].includes(d.type)
          ) {
            return false;
          }
          if (typeFilter === 'wan' && !['isp', 'dedicated-line', 'firewall', 'router'].includes(d.type)) {
            return false;
          }
          if (typeFilter === 'spares' && d.type !== 'cold-spare') {
            return false;
          }
          if (q) {
            const match =
              d.name.toLowerCase().includes(q) ||
              d.label.toLowerCase().includes(q) ||
              d.ipAddress.toLowerCase().includes(q) ||
              d.cabinet.toLowerCase().includes(q);
            if (!match) return false;
          }
          return true;
        })
        .map((d) => d.id)
    );
  }, [state.devices, searchQuery, typeFilter, cabinetFilter]);

  const visibleLinks = useMemo(
    () => state.links.filter((l) => filteredDeviceIds.has(l.source) && filteredDeviceIds.has(l.target)),
    [state.links, filteredDeviceIds]
  );

  // Map each visible device to the exact handle IDs currently wired to it
  const handlesByDevice = useMemo(() => {
    const map = new Map<string, string[]>();
    const addHandle = (deviceId: string, handleId: string) => {
      const list = map.get(deviceId) || [];
      if (!list.includes(handleId)) list.push(handleId);
      map.set(deviceId, list);
    };

    for (const link of visibleLinks) {
      const route = EDGE_ROUTING[link.id];
      addHandle(link.source, route?.sourceHandle || 'src-bottom');
      addHandle(link.target, route?.targetHandle || 'tgt-top');
    }
    return map;
  }, [visibleLinks]);

  const nodes: Node<DeviceNodeData>[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.devices
      .filter((d) => filteredDeviceIds.has(d.id))
      .map((device) => ({
        id: device.id,
        type: 'networkDevice',
        position: TOPOLOGY_LAYOUT[device.id] ?? device.position,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        initialWidth: NODE_WIDTH,
        initialHeight: NODE_HEIGHT,
        data: {
          device,
          isSelected: selectedDeviceId === device.id,
          isSearchMatch: Boolean(q && filteredDeviceIds.has(device.id)),
          backupInProgress,
          backupProgressPct: state.backup.progressPct,
          connectedHandles: handlesByDevice.get(device.id) || [],
          onSelect: onSelectDevice,
        },
      }));
  }, [
    state.devices,
    filteredDeviceIds,
    selectedDeviceId,
    searchQuery,
    backupInProgress,
    state.backup.progressPct,
    handlesByDevice,
    onSelectDevice,
  ]);

  const edges: Edge<CustomLinkData>[] = useMemo(() => {
    return visibleLinks.map((link) => {
      const route = EDGE_ROUTING[link.id];
      return {
        id: link.id,
        source: link.source,
        target: link.target,
        sourceHandle: route?.sourceHandle || 'src-bottom',
        targetHandle: route?.targetHandle || 'tgt-top',
        type: 'animatedNetwork',
        data: {
          link,
          backupInProgress,
          showAllLabels,
          isHovered: hoveredEdgeId === link.id,
          onHover: setHoveredEdgeId,
        },
      };
    });
  }, [visibleLinks, backupInProgress, showAllLabels, hoveredEdgeId]);

  const visibleIdsKey = useMemo(
    () =>
      nodes
        .map((n) => n.id)
        .sort()
        .join(','),
    [nodes]
  );

  // Force handle bounds sync after initial mount, filter changes, and resize so wires never vanish
  useEffect(() => {
    const ids = visibleIdsKey ? visibleIdsKey.split(',') : [];
    if (ids.length === 0) return;
    const raf = requestAnimationFrame(() => {
      updateNodeInternals(ids);
    });
    return () => cancelAnimationFrame(raf);
  }, [visibleIdsKey, backupInProgress, updateNodeInternals]);

  useEffect(() => {
    if (!nodesInitialized) return;
    const timer = setTimeout(() => {
      fitView({ padding: 0.08, duration: 240 });
    }, 40);
    return () => clearTimeout(timer);
  }, [nodesInitialized, typeFilter, cabinetFilter, fitView]);

  const visibleZones = useMemo(
    () => ZONE_FRAMES.filter((z) => z.deviceIds.some((id) => filteredDeviceIds.has(id))),
    [filteredDeviceIds]
  );

  const cabinets = Array.from(new Set(state.devices.map((d) => d.cabinet)));

  return (
    <div className="flex flex-col h-[calc(100vh-112px)] min-h-[640px] gap-4">
      {/* Toolbar: Search, Filters & Physical Topology Modal Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B1222] border border-slate-800 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search device, IP, cabinet..."
              className="pl-9 pr-3 py-1.5 w-60 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Device Types</option>
              <option value="wan">ISP & Dedicated Line</option>
              <option value="switching">Routers & Switches</option>
              <option value="servers">Servers, Backup & SNMP</option>
              <option value="spares">Onsite Cold Spares</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={cabinetFilter}
              onChange={(e) => setCabinetFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Data Cabinets</option>
              {cabinets.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAllLabels((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
              showAllLabels
                ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-200'
                : 'bg-[#111A2E] hover:bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-cyan-400" />
            {showAllLabels ? 'Hide Cable Labels' : 'Show All Cable Labels'}
          </button>
          <button
            onClick={() => setShowPhysicalDiagram(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
            Reference Physical Diagram
          </button>
          <button
            onClick={() => fitView({ padding: 0.08, duration: 240 })}
            className="px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            Fit View
          </button>
        </div>
      </div>

      {/* Live Scenario Demonstration Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0B1222] border border-slate-800 rounded-xl px-4 py-2.5">
        <div className="text-xs text-slate-400 font-medium">
          Interactive Scenarios · Click any node to inspect interfaces or hover a wire to trace link utilization
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onTriggerBackup}
            disabled={backupInProgress || busyAction === 'backup-trigger'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs font-medium text-emerald-300 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            {backupInProgress ? `Backing Up (${state.backup.progressPct}%)` : '1. Animate Cloud Backup'}
          </button>

          {!lineOffline ? (
            <button
              onClick={onFailDedicatedLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-xs font-medium text-red-300 transition-colors whitespace-nowrap"
            >
              <ZapOff className="w-3.5 h-3.5" />
              2. Interrupt Dedicated Line
            </button>
          ) : (
            <button
              onClick={onRecoverDedicatedLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors whitespace-nowrap"
            >
              <Activity className="w-3.5 h-3.5" />
              2. Recover Dedicated Line
            </button>
          )}

          {!coreOffline ? (
            <button
              onClick={onFailCoreSwitch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-xs font-medium text-red-300 transition-colors whitespace-nowrap"
            >
              <ServerCrash className="w-3.5 h-3.5" />
              3. Fail Core Switch
            </button>
          ) : availableCoreSpare ? (
            <button
              onClick={onReplaceCoreWithSpare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white transition-colors whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5" />
              3. Replace w/ Cold Spare
            </button>
          ) : null}

          <button
            onClick={onSimulateSnmpAlert}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-xs font-medium text-amber-300 transition-colors whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            4. Trigger SNMP Alert
          </button>

          <button
            onClick={onResetAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* React Flow Interactive Canvas */}
      <div className="flex-1 rounded-xl border border-slate-800 bg-[#060B17] overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.25}
          maxZoom={1.75}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1E293B" />

          {/* Architectural Rack & Cabinet Zone Frames behind Wires & Nodes */}
          <ViewportPortal>
            <div style={{ position: 'relative', zIndex: 0, pointerEvents: 'none' }}>
              {visibleZones.map((zone) => {
                const frameClasses =
                  zone.tone === 'cyan'
                    ? 'border-cyan-500/25 bg-cyan-950/[0.08] text-cyan-300/80'
                    : zone.tone === 'emerald'
                    ? 'border-emerald-500/20 bg-emerald-950/[0.06] text-emerald-300/80'
                    : zone.tone === 'dashed'
                    ? 'border-dashed border-cyan-500/30 bg-cyan-950/[0.05] text-cyan-300/80'
                    : 'border-slate-700/50 bg-slate-900/[0.18] text-slate-400';

                return (
                  <div
                    key={zone.id}
                    style={{
                      position: 'absolute',
                      left: zone.x,
                      top: zone.y,
                      width: zone.width,
                      height: zone.height,
                    }}
                    className={`rounded-2xl border ${frameClasses}`}
                  >
                    <div className="px-3.5 py-2 text-[11px] font-medium tracking-wide">
                      {zone.title}
                    </div>
                  </div>
                );
              })}
            </div>
          </ViewportPortal>

          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const dev = (n.data as DeviceNodeData | undefined)?.device;
              if (!dev) return '#38BDF8';
              if (dev.status === 'offline') return '#EF4444';
              if (dev.status === 'warning') return '#F59E0B';
              if (dev.status === 'standby') return '#06B6D4';
              return '#10B981';
            }}
            maskColor="rgba(6, 11, 23, 0.78)"
          />
        </ReactFlow>

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-14 z-10 flex flex-wrap items-center gap-4 px-3 py-2 rounded-lg bg-[#0B1222]/90 border border-slate-800 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Normal / Online
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Enterprise Dedicated Line
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Warning / Failover / SNMP Alert
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Offline / Link Down
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-cyan-400" /> Onsite Cold Spare
          </span>
        </div>

        {/* Active Fault Callout Banner inside Canvas */}
        {(coreOffline || lineOffline) && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/90 border border-red-500/60 text-xs text-red-200 max-w-md">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              {coreOffline
                ? 'Core Switch CSW-01 is offline. Downstream distribution links are severed — click "3. Replace w/ Cold Spare" to restore service.'
                : state.dedicatedLine.status === 'Offline'
                ? 'Both ISP 1 and ISP 2 are offline — Total WAN outage.'
                : 'ISP 1 Dedicated Line is offline — Failover active on Secondary ISP (ISP 2).'}
            </span>
          </div>
        )}
      </div>

      {/* Reference Physical Topology Modal */}
      {showPhysicalDiagram && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-[#0B1222] border border-slate-700 rounded-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Reference Physical Topology (Central ICT, CID, SGOD, OSDS, Library & Guest Cabinets)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Original physical cabling blueprint mapped into the live interactive NOC topology.
                </p>
              </div>
              <button
                onClick={() => setShowPhysicalDiagram(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto bg-white">
              <img
                src="/assets/aistudio/ciscoFINAL1.drawio_a8a86e79.png"
                alt="Physical Network Topology Blueprint"
                className="w-full h-auto rounded"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TopologyView(props: TopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <TopologyInner {...props} />
    </ReactFlowProvider>
  );
}

import {
  addEdge,
  Background,
  BackgroundVariant,
  BaseEdge,
  type Connection,
  Controls,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  getStraightPath,
  Handle,
  MiniMap,
  type NodeProps,
  type OnNodesChange,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Laptop,
  LayoutGrid,
  Network,
  Plus,
  Radio,
  Redo2,
  RotateCcw,
  Router,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Wifi,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BuilderLayoutMode,
  BuilderNodeType,
  SchoolTopologyLink,
  SchoolTopologyNode,
  SchoolTopologyProject,
  WirelessLinkStatus,
} from '../types/schoolTopology';
import {
  autoArrangeNodes,
  exportDeviceConfigsAndPacketTracerGuide,
  exportIpPlanCsv,
  exportNetworkDesignPdf,
  exportSchoolsCsv,
  exportTopologyAsPng,
  exportTopologyAsSvg,
  generateIpAddressingPlan,
  validateTopologyNetwork,
} from '../utils/schoolTopologyEngine';

interface SchoolTopologyBuilderViewProps {
  project: SchoolTopologyProject | null;
  savedProjects: SchoolTopologyProject[];
  saving: boolean;
  onUpdateProject: (project: SchoolTopologyProject) => void;
  onResetOriginal: () => void;
  onSaveProject: (project: SchoolTopologyProject) => Promise<void>;
  onLoadProject: (project: SchoolTopologyProject) => void;
  onDeleteSavedProject: (projectId: string) => Promise<void>;
  onToggleEndDevices: (includeEndDevices: boolean) => void;
  onGoToMap: () => void;
}

interface BuilderNodeData extends Record<string, unknown> {
  node: SchoolTopologyNode;
  isSelected: boolean;
  hasIpIssue: boolean;
  onSelect: (id: string) => void;
}

interface BuilderEdgeData extends Record<string, unknown> {
  link: SchoolTopologyLink;
  showLabels: boolean;
  isSelected: boolean;
}

function BuilderNodeIcon({ type, className }: { type: BuilderNodeType; className?: string }) {
  switch (type) {
    case 'central-tower':
    case 'remote-tower':
      return <Radio className={className} />;
    case 'core-router':
    case 'school-router':
      return <Router className={className} />;
    case 'core-switch':
    case 'access-switch':
      return <Network className={className} />;
    case 'central-server':
      return <Server className={className} />;
    case 'end-device':
      return <Laptop className={className} />;
  }
}

function SchoolBuilderNode({ data }: NodeProps<Node<BuilderNodeData>>) {
  const { node, isSelected, hasIpIssue, onSelect } = data;
  const isWireless = node.type === 'central-tower' || node.type === 'remote-tower';
  const unvalidatedWarning =
    node.type === 'remote-tower' && !node.losValidated && node.wirelessStatus !== 'Validated';

  const cardStyle = hasIpIssue
    ? 'border-red-500 bg-red-950/30 shadow-[0_0_16px_rgba(239,68,68,0.25)]'
    : isSelected
    ? 'border-cyan-400 bg-[#111D35] ring-2 ring-cyan-400/35'
    : node.isCentral
    ? 'border-cyan-500/75 bg-[#0B172C] shadow-[0_0_20px_rgba(34,211,238,0.16)]'
    : isWireless
    ? 'border-sky-500/70 bg-[#0B1528]'
    : 'border-slate-700/85 bg-[#0B1222] hover:border-cyan-500/60';

  return (
    <div
      onClick={() => onSelect(node.id)}
      className={`w-[214px] rounded-xl border px-3 py-2.5 cursor-grab active:cursor-grabbing transition-colors select-none ${cardStyle}`}
    >
      {/* Multi-side dual handles so dragging nodes or connecting any port works cleanly */}
      <Handle type="target" position={Position.Top} id="t-top" className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[#060B17]" />
      <Handle type="source" position={Position.Top} id="s-top" className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[#060B17] !opacity-0 hover:!opacity-100" />
      <Handle type="target" position={Position.Left} id="t-left" className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[#060B17]" />
      <Handle type="source" position={Position.Left} id="s-left" className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[#060B17] !opacity-0 hover:!opacity-100" />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`p-1.5 rounded-lg shrink-0 ${
              node.isCentral
                ? 'bg-cyan-500/20 text-cyan-300'
                : isWireless
                ? 'bg-sky-500/20 text-sky-300'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            <BuilderNodeIcon type={node.type} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-100 truncate">{node.label}</div>
            <div className="text-[10px] font-mono text-slate-400 truncate tabular-nums">
              {node.hostname} · {node.ipAddress}
            </div>
          </div>
        </div>
        {hasIpIssue ? (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
        ) : unvalidatedWarning ? (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        ) : null}
      </div>

      <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] gap-2">
        <span className="text-slate-400 truncate">{node.schoolName}</span>
        <span className="font-mono text-cyan-300 shrink-0">VLAN {node.vlanId}</span>
      </div>

      <Handle type="source" position={Position.Bottom} id="s-bottom" className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[#060B17]" />
      <Handle type="target" position={Position.Bottom} id="t-bottom" className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[#060B17] !opacity-0 hover:!opacity-100" />
      <Handle type="source" position={Position.Right} id="s-right" className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[#060B17]" />
      <Handle type="target" position={Position.Right} id="t-right" className="!w-2.5 !h-2.5 !bg-cyan-400 !border-[#060B17] !opacity-0 hover:!opacity-100" />
    </div>
  );
}

function SchoolBuilderEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<Edge<BuilderEdgeData>>) {
  const link = data?.link;
  const showLabels = data?.showLabels ?? true;
  const isSelected = Boolean(data?.isSelected);
  const isWireless = link?.medium === 'wireless';

  // Use straight ray paths for wireless tower-to-school star beams, and clean orthogonal step paths for wired LAN links
  const [edgePath, labelX, labelY] = isWireless
    ? getStraightPath({ sourceX, sourceY, targetX, targetY })
    : getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 6,
      });

  const strokeColor = isSelected
    ? '#F8FAFC'
    : isWireless
    ? link?.wirelessStatus === 'Validated'
      ? '#10B981'
      : link?.wirelessStatus === 'Configured'
      ? '#F59E0B'
      : '#22D3EE'
    : link?.medium === 'wired-fiber'
    ? '#38BDF8'
    : '#64748B';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={18}
        style={{
          stroke: strokeColor,
          strokeWidth: isSelected ? 3 : isWireless ? 2.4 : 1.75,
          strokeDasharray: isWireless ? '7 5' : undefined,
          fill: 'none',
        }}
      />
      {showLabels && link?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border whitespace-nowrap ${
              isWireless
                ? link.wirelessStatus === 'Validated'
                  ? 'bg-emerald-950/95 border-emerald-500/70 text-emerald-200'
                  : link.wirelessStatus === 'Configured'
                  ? 'bg-amber-950/95 border-amber-500/70 text-amber-200'
                  : 'bg-cyan-950/95 border-cyan-400/70 text-cyan-200'
                : 'bg-[#0B1222]/95 border-slate-700 text-slate-300'
            }`}
          >
            {isWireless ? `RF · ${link.label}` : link.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const builderNodeTypes = {
  schoolDevice: SchoolBuilderNode,
};

const builderEdgeTypes = {
  schoolLink: SchoolBuilderEdge,
};

function chooseClosestHandles(
  src: SchoolTopologyNode,
  tgt: SchoolTopologyNode
): { sourceHandle: string; targetHandle: string } {
  const dx = tgt.position.x - src.position.x;
  const dy = tgt.position.y - src.position.y;
  if (Math.abs(dx) > Math.abs(dy) * 1.15) {
    return dx >= 0
      ? { sourceHandle: 's-right', targetHandle: 't-left' }
      : { sourceHandle: 's-left', targetHandle: 't-right' };
  }
  return dy >= 0
    ? { sourceHandle: 's-bottom', targetHandle: 't-top' }
    : { sourceHandle: 's-top', targetHandle: 't-bottom' };
}

function BuilderInner({
  project,
  savedProjects,
  saving,
  onUpdateProject,
  onResetOriginal,
  onSaveProject,
  onLoadProject,
  onDeleteSavedProject,
  onToggleEndDevices,
  onGoToMap,
}: SchoolTopologyBuilderViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [rightTab, setRightTab] = useState<'inspector' | 'ip-plan' | 'wireless'>('inspector');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Undo / Redo snapshot history
  const [undoStack, setUndoStack] = useState<SchoolTopologyProject[]>([]);
  const [redoStack, setRedoStack] = useState<SchoolTopologyProject[]>([]);
  const dragSnapshotRef = useRef<SchoolTopologyProject | null>(null);

  const { fitView } = useReactFlow();

  const commitChange = useCallback(
    (next: SchoolTopologyProject, recordUndo = true) => {
      if (recordUndo && project) {
        setUndoStack((prev) => [...prev.slice(-24), project]);
        setRedoStack([]);
      }
      onUpdateProject({ ...next, updatedAt: new Date().toISOString() });
    },
    [project, onUpdateProject]
  );

  const handleUndo = useCallback(() => {
    if (!project || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, project]);
    onUpdateProject(previous);
  }, [project, undoStack, onUpdateProject]);

  const handleRedo = useCallback(() => {
    if (!project || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, project]);
    onUpdateProject(next);
  }, [project, redoStack, onUpdateProject]);

  useEffect(() => {
    if (project && !selectedNodeId && project.nodes.length > 0) {
      setSelectedNodeId(project.nodes[0].id);
    }
  }, [project?.id]);

  useEffect(() => {
    if (!project) return;
    const timer = setTimeout(() => {
      fitView({ padding: 0.12, duration: 220 });
    }, 60);
    return () => clearTimeout(timer);
  }, [project?.id, project?.layoutMode, fitView]);

  const ipIssues = useMemo(
    () => (project ? validateTopologyNetwork(project.nodes) : []),
    [project]
  );

  const issueNodeIds = useMemo(() => new Set(ipIssues.map((i) => i.nodeId)), [ipIssues]);

  const rfNodes: Node<BuilderNodeData>[] = useMemo(() => {
    if (!project) return [];
    return project.nodes.map((node) => ({
      id: node.id,
      type: 'schoolDevice',
      position: node.position,
      data: {
        node,
        isSelected: selectedNodeId === node.id,
        hasIpIssue: issueNodeIds.has(node.id),
        onSelect: (id) => {
          setSelectedNodeId(id);
          setSelectedEdgeId(null);
          setRightTab('inspector');
        },
      },
    }));
  }, [project, selectedNodeId, issueNodeIds]);

  const rfEdges: Edge<BuilderEdgeData>[] = useMemo(() => {
    if (!project) return [];
    const nodeMap = new Map(project.nodes.map((n) => [n.id, n]));
    return project.links
      .filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target))
      .map((link) => {
        const src = nodeMap.get(link.source)!;
        const tgt = nodeMap.get(link.target)!;
        const handles = chooseClosestHandles(src, tgt);
        return {
          id: link.id,
          source: link.source,
          target: link.target,
          sourceHandle: link.sourceHandle || handles.sourceHandle,
          targetHandle: link.targetHandle || handles.targetHandle,
          type: 'schoolLink',
          data: {
            link,
            showLabels,
            isSelected: selectedEdgeId === link.id,
          },
        };
      });
  }, [project, showLabels, selectedEdgeId]);

  const handleNodesChange: OnNodesChange<Node<BuilderNodeData>> = useCallback(
    (changes) => {
      if (!project) return;
      const posChanges = changes.getByType('position').filter((c) => Boolean(c.position));
      if (posChanges.length === 0) return;

      const updatedNodes = project.nodes.map((node) => {
        const match = posChanges.find((c) => c.id === node.id);
        if (match && match.position) {
          return { ...node, position: match.position };
        }
        return node;
      });
      onUpdateProject({ ...project, nodes: updatedNodes });
    },
    [project, onUpdateProject]
  );

  const handleNodeDragStart = useCallback(() => {
    if (project) {
      dragSnapshotRef.current = project;
    }
  }, [project]);

  const handleNodeDragStop = useCallback(() => {
    if (dragSnapshotRef.current && project) {
      setUndoStack((prev) => [...prev.slice(-24), dragSnapshotRef.current!]);
      setRedoStack([]);
      dragSnapshotRef.current = null;
    }
  }, [project]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!project || !connection.source || !connection.target) return;
      const src = project.nodes.find((n) => n.id === connection.source);
      const tgt = project.nodes.find((n) => n.id === connection.target);
      if (!src || !tgt) return;

      const isWireless =
        src.type === 'central-tower' ||
        src.type === 'remote-tower' ||
        tgt.type === 'central-tower' ||
        tgt.type === 'remote-tower';

      const newLink: SchoolTopologyLink = {
        id: `lnk-custom-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
        medium: isWireless ? 'wireless' : 'wired-utp',
        label: isWireless ? 'Custom RF Link' : 'Custom 1G Link',
        bandwidthMbps: isWireless ? 300 : 1000,
        wirelessStatus: isWireless ? 'Proposed' : undefined,
      };

      const nextEdges = addEdge(newLink as unknown as Edge, project.links as unknown as Edge[]);
      commitChange({
        ...project,
        links: nextEdges as unknown as SchoolTopologyLink[],
      });
    },
    [project, commitChange]
  );

  const handleAddDevice = (type: BuilderNodeType) => {
    if (!project) return;
    const count = project.nodes.filter((n) => n.type === type).length + 1;
    const roleLabelMap: Record<BuilderNodeType, string> = {
      'central-tower': 'Wireless Tower',
      'core-router': 'Core Router',
      'core-switch': 'Core Switch',
      'central-server': 'Central Server',
      'remote-tower': 'Wireless Bridge',
      'school-router': 'School Router',
      'access-switch': 'Access Switch',
      'end-device': 'End Devices',
    };
    const hostPrefixMap: Record<BuilderNodeType, string> = {
      'central-tower': 'TWR',
      'core-router': 'CRTR',
      'core-switch': 'CSW',
      'central-server': 'SRV',
      'remote-tower': 'CPE',
      'school-router': 'RTR',
      'access-switch': 'ASW',
      'end-device': 'PC',
    };

    const newNode: SchoolTopologyNode = {
      id: `custom-${type}-${Date.now()}`,
      type,
      label: `${roleLabelMap[type]} ${count}`,
      hostname: `CUSTOM-${hostPrefixMap[type]}-${count}`,
      schoolId: 'custom-site',
      schoolName: project.centralSchool.name,
      isCentral: type.startsWith('central') || type.startsWith('core'),
      ipAddress: `10.10.250.${Math.min(254, 10 + project.nodes.length)}`,
      subnetMask: '255.255.255.0',
      defaultGateway: '10.10.250.1',
      vlanId: 10,
      dhcpEnabled: type === 'school-router' || type === 'core-router',
      routingMode: 'Default Gateway',
      model: `Standard ${roleLabelMap[type]}`,
      position: {
        x: 920 + ((project.nodes.length % 4) - 1.5) * 90,
        y: 120 + (project.nodes.length % 3) * 70,
      },
      interfaces: [
        {
          name: 'eth0',
          ipAddress: `10.10.250.${Math.min(254, 10 + project.nodes.length)}`,
          subnetMask: '255.255.255.0',
          vlanId: 10,
          mode: 'static',
          description: 'Management / Uplink Interface',
        },
      ],
      wirelessStatus: type === 'remote-tower' || type === 'central-tower' ? 'Proposed' : undefined,
      losValidated: false,
    };

    commitChange({
      ...project,
      nodes: [...project.nodes, newNode],
    });
    setSelectedNodeId(newNode.id);
    setRightTab('inspector');
  };

  const handleDeleteSelected = () => {
    if (!project) return;
    if (selectedEdgeId) {
      commitChange({
        ...project,
        links: project.links.filter((l) => l.id !== selectedEdgeId),
      });
      setSelectedEdgeId(null);
      return;
    }
    if (selectedNodeId) {
      commitChange({
        ...project,
        nodes: project.nodes.filter((n) => n.id !== selectedNodeId),
        links: project.links.filter((l) => l.source !== selectedNodeId && l.target !== selectedNodeId),
      });
      setSelectedNodeId(null);
    }
  };

  const handleLayoutChange = (mode: BuilderLayoutMode) => {
    if (!project) return;
    const arranged = autoArrangeNodes(project.nodes, project.links, mode);
    commitChange({
      ...project,
      layoutMode: mode,
      nodes: arranged,
    });
  };

  const handleAutoArrange = () => {
    if (!project) return;
    const arranged = autoArrangeNodes(project.nodes, project.links, project.layoutMode);
    commitChange({
      ...project,
      nodes: arranged,
    });
    setTimeout(() => fitView({ padding: 0.12, duration: 240 }), 40);
  };

  const handleAutoIpPlan = () => {
    if (!project) return;
    const planned = generateIpAddressingPlan(project.nodes, project.schools);
    commitChange({
      ...project,
      nodes: planned.nodes,
      schools: planned.schools,
    });
  };

  const updateSelectedNode = (patch: Partial<SchoolTopologyNode>) => {
    if (!project || !selectedNodeId) return;
    const nextNodes = project.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n));

    // Synchronize wireless status/LOS validation back to SchoolWirelessProfile & wireless edge
    const targetNode = nextNodes.find((n) => n.id === selectedNodeId);
    let nextSchools = project.schools;
    let nextLinks = project.links;
    if (targetNode && targetNode.type === 'remote-tower') {
      nextSchools = project.schools.map((s) =>
        s.schoolId === targetNode.schoolId
          ? {
              ...s,
              connectionStatus: targetNode.wirelessStatus || s.connectionStatus,
              losValidated: Boolean(targetNode.losValidated),
            }
          : s
      );
      nextLinks = project.links.map((l) =>
        l.target === targetNode.id && l.medium === 'wireless'
          ? {
              ...l,
              wirelessStatus: targetNode.wirelessStatus || l.wirelessStatus,
              losValidated: Boolean(targetNode.losValidated),
              label: `${(targetNode.distanceKm ?? l.distanceKm ?? 0).toFixed(2)} km · ${
                targetNode.wirelessStatus || 'Proposed'
              }`,
            }
          : l
      );
    }

    commitChange({
      ...project,
      nodes: nextNodes,
      schools: nextSchools,
      links: nextLinks,
    });
  };

  const selectedNode = useMemo(
    () => project?.nodes.find((n) => n.id === selectedNodeId) || null,
    [project, selectedNodeId]
  );

  if (!project) {
    return (
      <div className="bg-[#0B1222] border border-slate-800 rounded-xl p-8 max-w-2xl mx-auto mt-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-300 mx-auto">
          <Network className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-display font-semibold text-slate-100">
          School Network Topology Builder
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          No active school topology has been generated yet. Select nearby schools around{' '}
          <strong className="text-slate-200">Tanauan South Central School</strong> on the School Connectivity Map,
          or load a previously saved topology project.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={onGoToMap}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Open School Connectivity Map
          </button>
          {savedProjects.length > 0 && (
            <button
              onClick={() => setShowLoadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200"
            >
              <FolderOpen className="w-4 h-4 text-cyan-400" />
              Load Saved Topology ({savedProjects.length})
            </button>
          )}
        </div>

        {showLoadModal && (
          <SavedTopologiesModal
            savedProjects={savedProjects}
            onLoad={(p) => {
              onLoadProject(p);
              setShowLoadModal(false);
            }}
            onDelete={onDeleteSavedProject}
            onClose={() => setShowLoadModal(false)}
          />
        )}
      </div>
    );
  }

  const unvalidatedSchoolsCount = project.schools.filter((s) => !s.losValidated).length;

  return (
    <div className="space-y-4">
      {/* Top Action Toolbar */}
      <div className="bg-[#0B1222] border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <button
            onClick={onGoToMap}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
            Map Selection
          </button>
          <input
            type="text"
            value={project.name}
            onChange={(e) => onUpdateProject({ ...project, name: e.target.value })}
            aria-label="Topology project name"
            className="px-3 py-1.5 w-72 rounded-lg bg-[#060B17] border border-slate-700 text-xs font-semibold text-slate-100 focus:outline-none focus:border-cyan-400"
          />
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {project.schools.length} Schools · {project.nodes.length} Nodes · {project.links.length} Links
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 disabled:opacity-40"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 disabled:opacity-40"
          >
            <Redo2 className="w-3.5 h-3.5" /> Redo
          </button>

          <button
            onClick={handleAutoArrange}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 whitespace-nowrap"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
            Auto Arrange
          </button>

          <button
            onClick={() => void onSaveProject(project)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Topology'}
          </button>

          <button
            onClick={() => setShowLoadModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 whitespace-nowrap"
          >
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
            Load ({savedProjects.length})
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs font-medium text-emerald-200 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export Topology
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#0B1222] border border-slate-700 shadow-2xl p-1.5 z-50 space-y-1">
                <button
                  onClick={async () => {
                    setShowExportMenu(false);
                    setExportStatus('Exported PNG diagram');
                    await exportTopologyAsPng(project);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-slate-200 hover:bg-[#111A2E]"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                  Topology Diagram (PNG)
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportTopologyAsSvg(project);
                    setExportStatus('Exported SVG diagram');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-slate-200 hover:bg-[#111A2E]"
                >
                  <Network className="w-3.5 h-3.5 text-cyan-400" />
                  Topology Diagram (SVG)
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportSchoolsCsv(project);
                    setExportStatus('Exported School Connectivity CSV');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-slate-200 hover:bg-[#111A2E]"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  School Connectivity List (CSV)
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportIpPlanCsv(project);
                    setExportStatus('Exported IP Addressing Plan CSV');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-slate-200 hover:bg-[#111A2E]"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  IP Addressing Plan (CSV)
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportNetworkDesignPdf(project);
                    setExportStatus('Exported Network Design PDF');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-slate-200 hover:bg-[#111A2E]"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Network Design Documentation (PDF)
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportDeviceConfigsAndPacketTracerGuide(project);
                    setExportStatus('Exported Device Configs & Packet Tracer Guide (.txt)');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-slate-200 hover:bg-[#111A2E]"
                >
                  <Cpu className="w-3.5 h-3.5 text-sky-400" />
                  Device Configs & Packet Tracer Guide (.txt)
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setUndoStack([]);
              setRedoStack([]);
              onResetOriginal();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Workspace
          </button>
        </div>
      </div>

      {/* Sub-toolbar: Palette Add Devices, Layout Switch, End Devices & Validation Status */}
      <div className="bg-[#0B1222] border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400 font-medium">Add Device:</span>
          {(
            [
              ['school-router', 'Router'],
              ['access-switch', 'Switch'],
              ['central-server', 'Server'],
              ['remote-tower', 'Wireless Tower'],
              ['end-device', 'End Device'],
            ] as Array<[BuilderNodeType, string]>
          ).map(([type, label]) => (
            <button
              key={type}
              onClick={() => handleAddDevice(type)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#060B17] hover:bg-[#111A2E] border border-slate-700 text-[11px] text-slate-200 transition-colors"
            >
              <Plus className="w-3 h-3 text-cyan-400" />
              {label}
            </button>
          ))}

          {(selectedNodeId || selectedEdgeId) && (
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-[11px] text-red-300 ml-1"
            >
              <Trash2 className="w-3 h-3" />
              Delete Selected {selectedEdgeId ? 'Link' : 'Node'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Layout:</span>
            {(['star', 'radial', 'hierarchical'] as BuilderLayoutMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleLayoutChange(mode)}
                className={`px-2 py-1 rounded text-[11px] capitalize ${
                  project.layoutMode === mode
                    ? 'bg-cyan-500/20 border border-cyan-400/60 text-cyan-200'
                    : 'bg-[#060B17] border border-slate-700 text-slate-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={project.includeEndDevices}
              onChange={(e) => onToggleEndDevices(e.target.checked)}
              className="rounded border-slate-600 bg-[#060B17] text-cyan-500"
            />
            <span>End Devices</span>
          </label>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded border-slate-600 bg-[#060B17] text-cyan-500"
            />
            <span>Link Labels</span>
          </label>
        </div>
      </div>

      {/* Export Feedback or LOS / IP Validation Banners */}
      {exportStatus && (
        <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-lg px-4 py-2 flex items-center justify-between text-xs text-emerald-200">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {exportStatus}
          </span>
          <button onClick={() => setExportStatus(null)} className="text-emerald-300 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {unvalidatedSchoolsCount > 0 && (
        <div className="bg-amber-950/25 border border-amber-500/40 rounded-lg px-4 py-2 flex items-center gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            {unvalidatedSchoolsCount} wireless school link(s) are currently marked{' '}
            <strong>Proposed / Unvalidated</strong>. The {project.radiusKm} km radius is an initial planning boundary—verify field line-of-sight and link budget in the Wireless tab or Node Inspector before deployment.
          </span>
        </div>
      )}

      {/* Main Split: Editable React Flow Canvas (8 cols) + Configurator Panel (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 h-[640px] rounded-xl border border-slate-800 bg-[#060B17] overflow-hidden relative">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={builderNodeTypes}
            edgeTypes={builderEdgeTypes}
            onNodesChange={handleNodesChange}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onEdgeClick={(_e, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedEdgeId(null);
            }}
            nodesDraggable
            nodesConnectable
            fitView
            minZoom={0.2}
            maxZoom={1.75}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1E293B" />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const dev = (n.data as BuilderNodeData | undefined)?.node;
                if (!dev) return '#38BDF8';
                if (dev.isCentral) return '#22D3EE';
                if (dev.type === 'remote-tower') return '#38BDF8';
                return '#64748B';
              }}
              maskColor="rgba(6, 11, 23, 0.78)"
            />
          </ReactFlow>

          {/* Canvas Legend */}
          <div className="absolute bottom-3 left-14 z-10 flex flex-wrap items-center gap-4 px-3 py-1.5 rounded-lg bg-[#0B1222]/90 border border-slate-800 text-[10px] text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-cyan-400" /> Wireless RF Link (Proposed)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-amber-400" /> Wireless Configured
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-emerald-400" /> Wireless Validated
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-sky-400" /> Wired LAN / Fiber
            </span>
            <span className="text-slate-400">Drag nodes to move · Drag port dots to connect</span>
          </div>
        </div>

        {/* Right Panel: Inspector, IP Plan, Wireless LOS Assessment */}
        <div className="xl:col-span-4 bg-[#0B1222] border border-slate-800 rounded-xl flex flex-col h-[640px] overflow-hidden">
          <div className="grid grid-cols-3 border-b border-slate-800 text-xs font-medium">
            <button
              onClick={() => setRightTab('inspector')}
              className={`py-2.5 px-2 text-center border-b-2 transition-colors ${
                rightTab === 'inspector'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/[0.06]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Device Config
            </button>
            <button
              onClick={() => setRightTab('ip-plan')}
              className={`py-2.5 px-2 text-center border-b-2 transition-colors ${
                rightTab === 'ip-plan'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/[0.06]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              IP Plan {ipIssues.length > 0 ? `(${ipIssues.length})` : ''}
            </button>
            <button
              onClick={() => setRightTab('wireless')}
              className={`py-2.5 px-2 text-center border-b-2 transition-colors ${
                rightTab === 'wireless'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/[0.06]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Wireless ({project.schools.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {rightTab === 'inspector' && (
              <>
                {selectedNode ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="text-[11px] text-cyan-300 font-medium">
                        {selectedNode.schoolName} · {selectedNode.model}
                      </div>
                      <h3 className="text-sm font-display font-semibold text-slate-100 mt-0.5">
                        {selectedNode.label}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      <label className="block space-y-1">
                        <span className="text-[11px] text-slate-400">Display Label</span>
                        <input
                          type="text"
                          value={selectedNode.label}
                          onChange={(e) => updateSelectedNode({ label: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="text-[11px] text-slate-400">Hostname</span>
                          <input
                            type="text"
                            value={selectedNode.hostname}
                            onChange={(e) => updateSelectedNode({ hostname: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] text-slate-400">VLAN ID</span>
                          <input
                            type="number"
                            min={1}
                            max={4094}
                            value={selectedNode.vlanId}
                            onChange={(e) =>
                              updateSelectedNode({ vlanId: Number(e.target.value) || 1 })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="text-[11px] text-slate-400">IP Address</span>
                          <input
                            type="text"
                            value={selectedNode.ipAddress}
                            onChange={(e) => updateSelectedNode({ ipAddress: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] text-slate-400">Subnet Mask</span>
                          <input
                            type="text"
                            value={selectedNode.subnetMask}
                            onChange={(e) => updateSelectedNode({ subnetMask: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="text-[11px] text-slate-400">Default Gateway</span>
                          <input
                            type="text"
                            value={selectedNode.defaultGateway}
                            onChange={(e) => updateSelectedNode({ defaultGateway: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] text-slate-400">Routing Mode</span>
                          <select
                            value={selectedNode.routingMode}
                            onChange={(e) =>
                              updateSelectedNode({
                                routingMode: e.target.value as SchoolTopologyNode['routingMode'],
                              })
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                          >
                            <option value="Default Gateway">Default Gateway</option>
                            <option value="Static Route">Static Route</option>
                            <option value="OSPF Area 0">OSPF Area 0</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    {/* DHCP Section */}
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-medium text-slate-200">DHCP Server Enabled</span>
                        <input
                          type="checkbox"
                          checked={selectedNode.dhcpEnabled}
                          onChange={(e) => updateSelectedNode({ dhcpEnabled: e.target.checked })}
                          className="rounded border-slate-600 bg-[#060B17] text-cyan-500"
                        />
                      </label>
                      {selectedNode.dhcpEnabled && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block space-y-1">
                            <span className="text-[10px] text-slate-400">DHCP Start</span>
                            <input
                              type="text"
                              value={selectedNode.dhcpRangeStart || ''}
                              onChange={(e) => updateSelectedNode({ dhcpRangeStart: e.target.value })}
                              className="w-full px-2 py-1 rounded bg-[#060B17] border border-slate-700 text-[11px] font-mono text-slate-100"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] text-slate-400">DHCP End</span>
                            <input
                              type="text"
                              value={selectedNode.dhcpRangeEnd || ''}
                              onChange={(e) => updateSelectedNode({ dhcpRangeEnd: e.target.value })}
                              className="w-full px-2 py-1 rounded bg-[#060B17] border border-slate-700 text-[11px] font-mono text-slate-100"
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Wireless Link Section */}
                    {(selectedNode.type === 'central-tower' || selectedNode.type === 'remote-tower') && (
                      <div className="pt-2 border-t border-slate-800 space-y-2.5">
                        <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                          <Wifi className="w-3.5 h-3.5" /> Wireless Link Parameters
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block space-y-1">
                            <span className="text-[10px] text-slate-400">SSID</span>
                            <input
                              type="text"
                              value={selectedNode.wirelessSsid || 'TSCS-DIVNET-5G'}
                              onChange={(e) => updateSelectedNode({ wirelessSsid: e.target.value })}
                              className="w-full px-2 py-1 rounded bg-[#060B17] border border-slate-700 text-[11px] font-mono text-slate-100"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] text-slate-400">Link Status</span>
                            <select
                              value={selectedNode.wirelessStatus || 'Proposed'}
                              onChange={(e) =>
                                updateSelectedNode({
                                  wirelessStatus: e.target.value as WirelessLinkStatus,
                                })
                              }
                              className="w-full px-2 py-1 rounded bg-[#060B17] border border-slate-700 text-[11px] text-slate-100"
                            >
                              <option value="Proposed">Proposed</option>
                              <option value="Configured">Configured</option>
                              <option value="Validated">Validated</option>
                            </select>
                          </label>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-200">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedNode.losValidated)}
                            onChange={(e) =>
                              updateSelectedNode({
                                losValidated: e.target.checked,
                                wirelessStatus: e.target.checked ? 'Validated' : 'Configured',
                              })
                            }
                            className="rounded border-slate-600 bg-[#060B17] text-emerald-500"
                          />
                          <span>Line-of-Sight & Link Budget Survey Validated</span>
                        </label>
                      </div>
                    )}

                    {/* Interface Configuration Table */}
                    <div className="pt-2 border-t border-slate-800 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-300">
                        Interface Configuration ({selectedNode.interfaces.length})
                      </div>
                      {selectedNode.interfaces.map((iface, i) => (
                        <div
                          key={`${iface.name}-${i}`}
                          className="p-2 rounded-lg bg-[#060B17] border border-slate-800 flex items-center justify-between text-[11px]"
                        >
                          <div>
                            <div className="font-mono text-cyan-300">{iface.name}</div>
                            <div className="text-[10px] text-slate-400">{iface.description}</div>
                          </div>
                          <div className="text-right font-mono text-[10px] text-slate-200">
                            <div>{iface.ipAddress}</div>
                            <div className="text-slate-500">{iface.mode}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Validation Errors for Selected Node */}
                    {ipIssues
                      .filter((iss) => iss.nodeId === selectedNode.id)
                      .map((iss, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-red-950/40 border border-red-500/50 text-[11px] text-red-200 flex items-start gap-2"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          <span>{iss.message}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 text-center py-8">
                    Click any device node in the topology canvas to configure IP addressing, VLANs, DHCP, routing, or wireless link settings.
                  </div>
                )}
              </>
            )}

            {rightTab === 'ip-plan' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100">IP Addressing Plan</h3>
                    <p className="text-[11px] text-slate-400">
                      Unique subnets per school + duplicate/mask validation
                    </p>
                  </div>
                  <button
                    onClick={handleAutoIpPlan}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-[11px] font-semibold text-white whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto-Generate IPs
                  </button>
                </div>

                {ipIssues.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-[11px] text-emerald-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Zero duplicate IPs, invalid masks, or gateway conflicts detected.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {ipIssues.map((iss, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedNodeId(iss.nodeId);
                          setRightTab('inspector');
                        }}
                        className="p-2 rounded-lg bg-red-950/35 border border-red-500/50 text-[11px] text-red-200 cursor-pointer hover:bg-red-950/50"
                      >
                        <strong className="font-mono">{iss.hostname}:</strong> {iss.message}
                      </div>
                    ))}
                  </div>
                )}

                <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                  {project.nodes.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        setSelectedNodeId(n.id);
                        setRightTab('inspector');
                      }}
                      className="px-3 py-2 bg-[#060B17] hover:bg-[#111A2E] cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] text-slate-100 truncate">
                          {n.hostname}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{n.schoolName}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] shrink-0">
                        <div className={issueNodeIds.has(n.id) ? 'text-red-400' : 'text-cyan-300'}>
                          {n.ipAddress}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          VLAN {n.vlanId} · GW {n.defaultGateway}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rightTab === 'wireless' && (
              <div className="space-y-3 text-xs">
                <div>
                  <h3 className="text-xs font-semibold text-slate-100">
                    Wireless Connectivity & LOS Matrix
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Initial planning radius: {project.radiusKm} km. Validate physical line-of-sight per school.
                  </p>
                </div>

                {project.schools.map((school) => (
                  <div
                    key={school.schoolId}
                    className="p-3 rounded-lg bg-[#060B17] border border-slate-800 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-100 text-xs">
                          {school.schoolName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {school.distanceKm.toFixed(2)} km · {school.subnetCidr} (VLAN {school.vlanId})
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono font-semibold ${
                          school.connectionStatus === 'Validated'
                            ? 'text-emerald-400'
                            : school.connectionStatus === 'Configured'
                            ? 'text-amber-300'
                            : 'text-cyan-300'
                        }`}
                      >
                        {school.connectionStatus}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300">{school.proposedConnection}</div>
                    <div className="text-[10px] text-slate-400">{school.suggestedEquipment}</div>

                    {!school.losValidated && (
                      <div className="text-[10px] text-amber-300 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Unvalidated: {school.losRequirement}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showLoadModal && (
        <SavedTopologiesModal
          savedProjects={savedProjects}
          onLoad={(p) => {
            onLoadProject(p);
            setShowLoadModal(false);
          }}
          onDelete={onDeleteSavedProject}
          onClose={() => setShowLoadModal(false)}
        />
      )}
    </div>
  );
}

function SavedTopologiesModal({
  savedProjects,
  onLoad,
  onDelete,
  onClose,
}: {
  savedProjects: SchoolTopologyProject[];
  onLoad: (p: SchoolTopologyProject) => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-[#0B1222] border border-slate-700 rounded-xl max-w-xl w-full max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-display font-semibold text-slate-100">
            Load Saved School Topology
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto divide-y divide-slate-800">
          {savedProjects.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No saved school topologies yet. Click Save Topology to store your current design.
            </div>
          ) : (
            savedProjects.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">{item.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {item.schools.length} schools · {item.nodes.length} nodes · Updated{' '}
                    {new Date(item.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onLoad(item)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium text-white"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => void onDelete(item.id)}
                    className="p-1.5 rounded-lg bg-red-600/15 hover:bg-red-600/25 border border-red-500/40 text-red-300"
                    title="Delete saved topology"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function SchoolTopologyBuilderView(props: SchoolTopologyBuilderViewProps) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}

import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Compass,
  Crosshair,
  ExternalLink,
  Filter,
  HelpCircle,
  Layers,
  MapPin,
  Minus,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  Square,
  Wifi,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CentralSchoolAnchor,
  DiscoveredSchool,
  SchoolCategory,
  SchoolDiscoveryResponse,
} from '../types/schoolTopology';

interface SchoolConnectivityMapViewProps {
  discovery: SchoolDiscoveryResponse | null;
  loading: boolean;
  error: string | null;
  radiusKm: number;
  selectedSchoolIds: string[];
  onChangeRadius: (radiusKm: number) => void;
  onRefresh: () => void;
  onToggleSchool: (schoolId: string) => void;
  onSelectAllInRadius: (schoolIds: string[]) => void;
  onClearSelection: () => void;
  onGenerateTopology: () => void;
}

type ArcGisLayerMode = 'street' | 'satellite';

const TILE_SIZE = 256;

function lngToWorldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
}

function latToWorldY(lat: number, zoom: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  const clamped = Math.min(Math.max(sin, -0.9999), 0.9999);
  const y = 0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI);
  return y * TILE_SIZE * Math.pow(2, zoom);
}

function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

// Floating popup when clicking a school marker
function SchoolMarkerInfoPopup({
  inspectedSchool,
  radiusKm,
  isSelected,
  onClose,
  onToggleSchool,
}: {
  inspectedSchool: DiscoveredSchool;
  radiusKm: number;
  isSelected: boolean;
  onClose: () => void;
  onToggleSchool: (schoolId: string) => void;
}) {
  return (
    <div className="absolute bottom-3 left-3 z-20 max-w-sm bg-[#0B1222]/95 border border-slate-700 rounded-xl p-3 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-medium text-cyan-300">
            {inspectedSchool.category} ·{' '}
            <span className="font-mono tabular-nums">
              {inspectedSchool.distanceKm.toFixed(2)} km
            </span>
          </div>
          <div className="text-xs font-semibold text-slate-100 truncate">
            {inspectedSchool.name}
          </div>
          <div className="text-[10px] text-slate-400 truncate">{inspectedSchool.address}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close school popup"
          className="text-[10px] text-slate-400 hover:text-slate-200 px-1"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
        <span className="font-mono text-[10px] text-slate-400 tabular-nums">
          {inspectedSchool.lat.toFixed(5)}, {inspectedSchool.lng.toFixed(5)}
        </span>
        {inspectedSchool.withinRadius ? (
          <button
            type="button"
            onClick={() => onToggleSchool(inspectedSchool.id)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap ${
              isSelected
                ? 'bg-emerald-600/25 border border-emerald-500/60 text-emerald-200'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {isSelected ? 'Selected ✓' : 'Select School'}
          </button>
        ) : (
          <span className="text-[10px] text-red-400 font-medium">
            Outside {radiusKm} km Radius
          </span>
        )}
      </div>
    </div>
  );
}

// Primary Live Interactive Map (Esri ArcGIS World Street Map & World Satellite Imagery)
function ArcGisSchoolMap({
  centralAnchor,
  radiusKm,
  allDisplayedSchools,
  selectedSchools,
  selectedSet,
  inspectedSchoolId,
  inspectedSchool,
  onInspectSchool,
  onToggleSchool,
}: {
  centralAnchor: CentralSchoolAnchor;
  radiusKm: number;
  allDisplayedSchools: DiscoveredSchool[];
  selectedSchools: DiscoveredSchool[];
  selectedSet: Set<string>;
  inspectedSchoolId: string | null;
  inspectedSchool: DiscoveredSchool | null;
  onInspectSchool: (id: string | null) => void;
  onToggleSchool: (schoolId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 580,
  });
  const [layer, setLayer] = useState<ArcGisLayerMode>('street');
  const [zoom, setZoom] = useState<number>(13);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: centralAnchor.lat,
    lng: centralAnchor.lng,
  });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null);

  useEffect(() => {
    setCenter({ lat: centralAnchor.lat, lng: centralAnchor.lng });
  }, [centralAnchor.lat, centralAnchor.lng]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = (width: number, height: number) => {
      const nextW = Math.round(width);
      const nextH = Math.round(height);
      if (nextW <= 0 || nextH <= 0) return;
      setBoxSize((prev) =>
        prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH }
      );
    };
    const rect = el.getBoundingClientRect();
    updateSize(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entryRect = entries[0]?.contentRect;
      if (entryRect) {
        updateSize(entryRect.width, entryRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const tileOverlay = useMemo(() => {
    const centerWorldX = lngToWorldX(center.lng, zoom);
    const centerWorldY = latToWorldY(center.lat, zoom);
    const topLeftWorldX = centerWorldX - boxSize.width / 2;
    const topLeftWorldY = centerWorldY - boxSize.height / 2;

    const minTileX = Math.floor(topLeftWorldX / TILE_SIZE);
    const maxTileX = Math.floor((topLeftWorldX + boxSize.width) / TILE_SIZE);
    const minTileY = Math.floor(topLeftWorldY / TILE_SIZE);
    const maxTileY = Math.floor((topLeftWorldY + boxSize.height) / TILE_SIZE);

    const maxIndex = Math.pow(2, zoom);
    const tiles: Array<{
      key: string;
      url: string;
      labelOverlayUrl?: string;
      left: number;
      top: number;
    }> = [];

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        if (ty < 0 || ty >= maxIndex) continue;
        const wrappedX = ((tx % maxIndex) + maxIndex) % maxIndex;
        const baseUrl =
          layer === 'satellite'
            ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${wrappedX}`
            : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${ty}/${wrappedX}`;
        const labelOverlayUrl =
          layer === 'satellite'
            ? `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${zoom}/${ty}/${wrappedX}`
            : undefined;
        tiles.push({
          key: `${layer}-${zoom}-${tx}-${ty}`,
          url: baseUrl,
          labelOverlayUrl,
          left: Math.round(tx * TILE_SIZE - topLeftWorldX),
          top: Math.round(ty * TILE_SIZE - topLeftWorldY),
        });
      }
    }

    const project = (lat: number, lng: number) => ({
      x: lngToWorldX(lng, zoom) - topLeftWorldX,
      y: latToWorldY(lat, zoom) - topLeftWorldY,
    });

    return { tiles, project };
  }, [center, zoom, boxSize, layer]);

  const centralPixel = tileOverlay.project(centralAnchor.lat, centralAnchor.lng);
  const radiusPixels = (radiusKm * 1000) / metersPerPixel(centralAnchor.lat, zoom);

  const handleRecenter = () => {
    setCenter({ lat: centralAnchor.lat, lng: centralAnchor.lng });
    setZoom(radiusKm >= 8 ? 12 : radiusKm <= 2 ? 14 : 13);
  };

  const panByDelta = (clientX: number, clientY: number) => {
    if (!dragStartRef.current) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    const worldScale = TILE_SIZE * Math.pow(2, zoom);
    const startWorldX = lngToWorldX(dragStartRef.current.lng, zoom) - dx;
    const startWorldY = latToWorldY(dragStartRef.current.lat, zoom) - dy;
    const newLng = (startWorldX / worldScale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * startWorldY) / worldScale;
    const newLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    setCenter({ lat: newLat, lng: newLng });
  };

  return (
    <div className="relative w-full h-full bg-[#060B17] flex flex-col">
      {/* Live ArcGIS Slippy Map Canvas */}
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          setDragging(true);
          dragStartRef.current = { x: e.clientX, y: e.clientY, lat: center.lat, lng: center.lng };
        }}
        onMouseMove={(e) => {
          if (!dragging) return;
          panByDelta(e.clientX, e.clientY);
        }}
        onMouseUp={() => {
          setDragging(false);
          dragStartRef.current = null;
        }}
        onMouseLeave={() => {
          setDragging(false);
          dragStartRef.current = null;
        }}
        onTouchStart={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const t = e.touches[0];
          if (!t) return;
          setDragging(true);
          dragStartRef.current = { x: t.clientX, y: t.clientY, lat: center.lat, lng: center.lng };
        }}
        onTouchMove={(e) => {
          if (!dragging) return;
          const t = e.touches[0];
          if (!t) return;
          panByDelta(t.clientX, t.clientY);
        }}
        onTouchEnd={() => {
          setDragging(false);
          dragStartRef.current = null;
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          setZoom((z) => Math.min(18, z + 1));
        }}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.max(9, Math.min(18, z + (e.deltaY < 0 ? 1 : -1))));
        }}
        className={`relative flex-1 overflow-hidden select-none ${
          layer === 'street' ? 'bg-[#E5E3DF]' : 'bg-[#060B17]'
        } ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {/* ArcGIS Web Mercator Tiles */}
        <div className="absolute inset-0 pointer-events-none">
          {tileOverlay.tiles.map((t) => (
            <div
              key={t.key}
              style={{
                position: 'absolute',
                left: t.left,
                top: t.top,
                width: TILE_SIZE,
                height: TILE_SIZE,
              }}
            >
              <img
                src={t.url}
                alt=""
                width={TILE_SIZE}
                height={TILE_SIZE}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                className="w-full h-full block"
              />
              {t.labelOverlayUrl && (
                <img
                  src={t.labelOverlayUrl}
                  alt=""
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                  className="absolute inset-0 w-full h-full block"
                />
              )}
            </div>
          ))}
        </div>

        {/* SVG Coverage Radius & Wireless RF Links */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <circle
            cx={centralPixel.x}
            cy={centralPixel.y}
            r={Math.max(12, radiusPixels)}
            fill={layer === 'street' ? 'rgba(8, 145, 178, 0.12)' : 'rgba(34, 211, 238, 0.1)'}
            stroke={layer === 'street' ? '#0E7490' : '#22D3EE'}
            strokeWidth={2.5}
            strokeDasharray="8 6"
          />

          {selectedSchools.map((s) => {
            const pt = tileOverlay.project(s.lat, s.lng);
            const mx = (centralPixel.x + pt.x) / 2;
            const my = (centralPixel.y + pt.y) / 2;
            return (
              <g key={`rf-link-${s.id}`}>
                <line
                  x1={centralPixel.x}
                  y1={centralPixel.y}
                  x2={pt.x}
                  y2={pt.y}
                  stroke="#059669"
                  strokeWidth={2.5}
                  strokeDasharray="5 4"
                />
                <rect
                  x={mx - 24}
                  y={my - 9}
                  width={48}
                  height={18}
                  rx={4}
                  fill="#060B17"
                  fillOpacity={0.92}
                  stroke="#10B981"
                  strokeWidth={0.9}
                />
                <text
                  x={mx}
                  y={my + 3}
                  textAnchor="middle"
                  fill="#6EE7B7"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {s.distanceKm.toFixed(2)}km
                </text>
              </g>
            );
          })}
        </svg>

        {/* Top-Left ArcGIS Layer Switcher (Street / Satellite) */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-[#0B1222]/95 border border-slate-700 rounded-lg p-1 shadow-lg">
          {(
            [
              { id: 'street', label: 'ArcGIS Street' },
              { id: 'satellite', label: 'ArcGIS Satellite' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLayer(mode.id);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                layer === mode.id
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Central Tower Marker */}
        <button
          type="button"
          onClick={() => onInspectSchool(null)}
          style={{
            left: centralPixel.x,
            top: centralPixel.y,
            transform: 'translate(-50%, -50%)',
          }}
          className="absolute z-20 flex flex-col items-center"
        >
          <div className="w-9 h-9 rounded-full bg-[#060B17]/95 border-2 border-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.55)]">
            <Radio className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="mt-1 px-2 py-0.5 rounded bg-[#060B17]/95 border border-cyan-400/80 text-[10px] font-semibold text-cyan-200 whitespace-nowrap shadow">
            {centralAnchor.name} · Main Tower
          </div>
        </button>

        {/* School Markers */}
        {allDisplayedSchools.map((school) => {
          const pt = tileOverlay.project(school.lat, school.lng);
          if (pt.x < -50 || pt.y < -50 || pt.x > boxSize.width + 50 || pt.y > boxSize.height + 50) {
            return null;
          }
          const isSelected = selectedSet.has(school.id);
          const isInspected = inspectedSchoolId === school.id;
          const outside = !school.withinRadius;

          const markerClasses = outside
            ? 'bg-slate-800/95 border-slate-400 text-slate-300 opacity-80'
            : isSelected
            ? 'bg-emerald-950/95 border-emerald-400 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.55)]'
            : school.verificationStatus === 'unverified'
            ? 'bg-amber-950/95 border-amber-400 text-amber-300'
            : 'bg-[#0B1222]/95 border-sky-400 text-sky-300';

          return (
            <button
              key={school.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInspectSchool(school.id);
              }}
              style={{
                left: pt.x,
                top: pt.y,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute flex flex-col items-center group ${
                isInspected || isSelected ? 'z-20' : 'z-10'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shadow-md transition-transform ${
                  isInspected ? 'scale-125 ring-2 ring-cyan-400' : 'group-hover:scale-110'
                } ${markerClasses}`}
              >
                {isSelected ? (
                  <Wifi className="w-3 h-3" />
                ) : school.verificationStatus === 'unverified' && !outside ? (
                  <HelpCircle className="w-3 h-3" />
                ) : (
                  <MapPin className="w-3 h-3" />
                )}
              </div>
              {(isInspected || isSelected || zoom >= 14) && (
                <div
                  className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap border shadow ${
                    outside
                      ? 'bg-[#060B17]/90 border-slate-700 text-slate-300'
                      : isSelected
                      ? 'bg-emerald-950/95 border-emerald-500/70 text-emerald-200'
                      : 'bg-[#0B1222]/95 border-slate-700 text-slate-100'
                  }`}
                >
                  {school.name} ({school.distanceKm.toFixed(2)} km)
                </div>
              )}
            </button>
          );
        })}

        {/* Zoom / Recenter Controls */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1 bg-[#0B1222]/95 border border-slate-700 rounded-lg p-1 shadow-lg">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(18, z + 1))}
            title="Zoom In"
            aria-label="Zoom In"
            className="p-1.5 rounded text-slate-200 hover:text-cyan-300 hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(9, z - 1))}
            title="Zoom Out"
            aria-label="Zoom Out"
            className="p-1.5 rounded text-slate-200 hover:text-cyan-300 hover:bg-slate-800"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRecenter}
            title="Recenter on Tanauan South Central School"
            aria-label="Recenter on Tanauan South Central School"
            className="p-1.5 rounded text-slate-200 hover:text-cyan-300 hover:bg-slate-800 border-t border-slate-800"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        </div>

        {inspectedSchool && (
          <SchoolMarkerInfoPopup
            inspectedSchool={inspectedSchool}
            radiusKm={radiusKm}
            isSelected={selectedSet.has(inspectedSchool.id)}
            onClose={() => onInspectSchool(null)}
            onToggleSchool={onToggleSchool}
          />
        )}
      </div>
    </div>
  );
}

export function SchoolConnectivityMapView({
  discovery,
  loading,
  error,
  radiusKm,
  selectedSchoolIds,
  onChangeRadius,
  onRefresh,
  onToggleSchool,
  onSelectAllInRadius,
  onClearSelection,
  onGenerateTopology,
}: SchoolConnectivityMapViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | SchoolCategory>('all');
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'verified' | 'unverified'>(
    'all'
  );
  const [showOutsideRadius, setShowOutsideRadius] = useState(true);
  const [inspectedSchoolId, setInspectedSchoolId] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedSchoolIds), [selectedSchoolIds]);

  const filteredInRadius = useMemo(() => {
    if (!discovery) return [];
    const q = searchQuery.trim().toLowerCase();
    return discovery.schoolsInRadius.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (verificationFilter !== 'all' && s.verificationStatus !== verificationFilter) return false;
      if (q) {
        const hit =
          s.name.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [discovery, searchQuery, categoryFilter, verificationFilter]);

  const filteredOutRadius = useMemo(() => {
    if (!discovery || !showOutsideRadius) return [];
    const q = searchQuery.trim().toLowerCase();
    return discovery.schoolsOutsideRadius.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (verificationFilter !== 'all' && s.verificationStatus !== verificationFilter) return false;
      if (q) {
        const hit = s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [discovery, showOutsideRadius, searchQuery, categoryFilter, verificationFilter]);

  const allDisplayedSchools = useMemo(
    () => [...filteredInRadius, ...filteredOutRadius],
    [filteredInRadius, filteredOutRadius]
  );

  const selectedSchools = useMemo(
    () => (discovery ? discovery.schoolsInRadius.filter((s) => selectedSet.has(s.id)) : []),
    [discovery, selectedSet]
  );

  const inspectedSchool = useMemo(() => {
    if (!discovery || !inspectedSchoolId) return null;
    return (
      discovery.schoolsInRadius.find((s) => s.id === inspectedSchoolId) ||
      discovery.schoolsOutsideRadius.find((s) => s.id === inspectedSchoolId) ||
      null
    );
  }, [discovery, inspectedSchoolId]);

  const centralAnchor: CentralSchoolAnchor = discovery?.centralSchool ?? {
    name: 'Tanauan South Central School',
    address: 'Tanauan City, Batangas, Philippines',
    lat: 14.0867108,
    lng: 121.150039,
    source: 'openstreetmap-overpass',
    verificationStatus: 'verified',
  };

  return (
    <div className="space-y-4">
      {/* Top Planning Header & Actions */}
      <div className="bg-[#0B1222] border border-slate-800 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-300 font-medium">
            <Compass className="w-4 h-4" />
            <span>Tanauan City, Batangas · Star Architecture Wireless Planner</span>
          </div>
          <h2 className="text-base font-display font-semibold text-slate-100">
            School Connectivity Map · Tanauan South Central School ({radiusKm} km Coverage Radius)
          </h2>
          <p className="text-xs text-slate-400">
            Geodesic Haversine distance calculated from lat/lng coordinates ({centralAnchor.lat.toFixed(5)},{' '}
            {centralAnchor.lng.toFixed(5)}). Radius is an initial planning boundary—field LOS & link budget validation remain required.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Discovering Schools...' : 'Refresh Schools'}
          </button>

          <button
            onClick={() => onSelectAllInRadius(filteredInRadius.map((s) => s.id))}
            disabled={filteredInRadius.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
            Select All in Radius ({filteredInRadius.length})
          </button>

          <button
            onClick={onClearSelection}
            disabled={selectedSchoolIds.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111A2E] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Square className="w-3.5 h-3.5" />
            Clear Selection
          </button>

          <button
            onClick={onGenerateTopology}
            disabled={selectedSchoolIds.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            <Network className="w-3.5 h-3.5" />
            Generate Topology ({selectedSchoolIds.length} Selected)
          </button>
        </div>
      </div>

      {/* Primary Map Provider & Live Geodata Status Strip */}
      <div className="bg-[#0B1222] border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Map Provider:</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              ArcGIS World Street &amp; Satellite Imagery
            </span>
          </div>

          <span aria-hidden="true" className="text-slate-700">|</span>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">School Geodata:</span>
            <span className="font-medium text-sky-300">
              {discovery?.provider === 'google-places'
                ? 'Google Places API (New)'
                : 'OpenStreetMap Live Geodata'}
            </span>
          </div>
        </div>

        {discovery?.fetchedAt && (
          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
            Synced {new Date(discovery.fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-500/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>School discovery request failed: {error}</span>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 text-red-100 font-medium whitespace-nowrap"
          >
            Retry Query
          </button>
        </div>
      )}

      {/* Filters & Coverage Radius Controls */}
      <div className="bg-[#0B1222] border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter school name or address..."
              className="pl-8 pr-3 py-1.5 w-60 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | SchoolCategory)}
              className="px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Educational Institutions</option>
              <option value="Public Elementary">Public Elementary</option>
              <option value="Public High School">Public High School</option>
              <option value="Private School">Private School</option>
              <option value="College / University">College / University</option>
              <option value="Preschool / Kindergarten">Preschool / Kindergarten</option>
              <option value="Educational Institution">Other Educational</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={verificationFilter}
              onChange={(e) =>
                setVerificationFilter(e.target.value as 'all' | 'verified' | 'unverified')
              }
              className="px-2.5 py-1.5 rounded-lg bg-[#060B17] border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Verification States</option>
              <option value="verified">Verified Schools Only</option>
              <option value="unverified">Unverified / Partial Records</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOutsideRadius}
              onChange={(e) => setShowOutsideRadius(e.target.checked)}
              className="rounded border-slate-600 bg-[#060B17] text-cyan-500 focus:ring-cyan-400"
            />
            <span>Show Out-of-Range Schools</span>
          </label>
        </div>

        {/* Coverage Radius Control */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400">Coverage Radius:</span>
          <div className="flex items-center gap-1">
            {[3, 5, 8, 10].map((preset) => (
              <button
                key={preset}
                onClick={() => onChangeRadius(preset)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                  radiusKm === preset
                    ? 'bg-cyan-500/20 border border-cyan-400/60 text-cyan-200'
                    : 'bg-[#060B17] border border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {preset} km
              </button>
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={12}
            step={0.5}
            value={radiusKm}
            onChange={(e) => onChangeRadius(Number(e.target.value))}
            aria-label="Coverage radius in kilometers"
            className="w-28 accent-cyan-400"
          />
          <span className="font-mono text-xs font-semibold text-cyan-300 tabular-nums w-14">
            {radiusKm.toFixed(1)} km
          </span>
        </div>
      </div>

      {/* Main Split: ArcGIS Interactive Map (Left 7 cols) + School Directory (Right 5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Interactive Map Container */}
        <div className="xl:col-span-7 bg-[#0B1222] border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="relative h-[580px] w-full bg-[#060B17] overflow-hidden">
            <ArcGisSchoolMap
              centralAnchor={centralAnchor}
              radiusKm={radiusKm}
              allDisplayedSchools={allDisplayedSchools}
              selectedSchools={selectedSchools}
              selectedSet={selectedSet}
              inspectedSchoolId={inspectedSchoolId}
              inspectedSchool={inspectedSchool}
              onInspectSchool={setInspectedSchoolId}
              onToggleSchool={onToggleSchool}
            />

            {/* School Discovery Query Loading Overlay */}
            {loading && (
              <div className="absolute inset-0 z-30 bg-[#060B17]/65 backdrop-blur-[1px] flex items-center justify-center">
                <div className="bg-[#0B1222] border border-cyan-500/40 rounded-xl px-5 py-3 flex items-center gap-3 text-xs text-slate-200">
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span>Querying verified educational institutions within {radiusKm} km...</span>
                </div>
              </div>
            )}
          </div>

          {/* Map Marker Legend */}
          <div className="px-4 py-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-300 bg-[#0B1222]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Central Server / Main Tower
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Selected for Network
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Available Verified School
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Unverified / Partial Record
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> Outside {radiusKm} km Radius
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              Map imagery © Esri, HERE, Garmin, OpenStreetMap contributors
            </span>
          </div>
        </div>

        {/* Right Panel: Selected Marker Details + Discovered Schools Checklist */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          {/* Inspected School Card OR Central Hub Card */}
          <div className="bg-[#0B1222] border border-slate-800 rounded-xl p-4 space-y-3">
            {inspectedSchool ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium text-cyan-300">
                      {inspectedSchool.category} ·{' '}
                      {inspectedSchool.verificationStatus === 'verified'
                        ? 'Verified Location'
                        : 'Unverified / Partial Record'}
                    </div>
                    <h3 className="text-sm font-display font-semibold text-slate-100 mt-0.5">
                      {inspectedSchool.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{inspectedSchool.address}</p>
                  </div>
                  {inspectedSchool.withinRadius ? (
                    <button
                      onClick={() => onToggleSchool(inspectedSchool.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        selectedSet.has(inspectedSchool.id)
                          ? 'bg-emerald-600/25 border border-emerald-500/60 text-emerald-200'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      }`}
                    >
                      {selectedSet.has(inspectedSchool.id) ? 'Selected ✓' : 'Include in Topology'}
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium text-red-400 shrink-0">
                      Outside {radiusKm} km
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800">
                  <div>
                    <div className="text-[10px] text-slate-500">Coordinates (Lat, Lng)</div>
                    <div className="font-mono text-slate-200 tabular-nums">
                      {inspectedSchool.lat.toFixed(5)}, {inspectedSchool.lng.toFixed(5)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Geodesic Distance</div>
                    <div className="font-mono text-cyan-300 tabular-nums">
                      {inspectedSchool.distanceKm.toFixed(2)} km ({inspectedSchool.distanceMeters} m)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Proposed Wireless Link</div>
                    <div className="text-slate-200">{inspectedSchool.proposedConnectionType}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Connection Status</div>
                    <div className="text-amber-300 font-medium">Proposed (LOS Unvalidated)</div>
                  </div>
                </div>

                <div className="text-xs space-y-1 pt-2 border-t border-slate-800">
                  <div className="text-[10px] text-slate-500">Suggested Wireless Equipment</div>
                  <div className="text-slate-200">{inspectedSchool.suggestedEquipment}</div>
                  <div className="text-[10px] text-amber-300/90 flex items-start gap-1.5 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Planning radius is NOT guaranteed wireless range. {inspectedSchool.losRequirement}.
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1">
                    Verification Note: {inspectedSchool.verificationReason}
                  </div>
                  {inspectedSchool.placeUri && (
                    <a
                      href={inspectedSchool.placeUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline pt-1"
                    >
                      Open external map record <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-300 shrink-0">
                  <Server className="w-5 h-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="text-xs font-semibold text-cyan-300">
                    Central Network Hub &amp; Main Wireless Tower
                  </div>
                  <div className="text-sm font-display font-semibold text-slate-100">
                    {centralAnchor.name}
                  </div>
                  <p className="text-xs text-slate-400">{centralAnchor.address}</p>
                  <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                    Coordinates: {centralAnchor.lat.toFixed(6)}, {centralAnchor.lng.toFixed(6)} · Radius:{' '}
                    {radiusKm} km
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1">
                    Click any school pin on the map or checklist below to inspect coordinates, geodesic distance, and wireless link requirements.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Nearby Schools List (Within Radius + Outside Excluded Summary) */}
          <div className="bg-[#0B1222] border border-slate-800 rounded-xl flex flex-col flex-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-100">
                  Schools Within {radiusKm} km Radius ({filteredInRadius.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  {selectedSchools.length} selected for Star Topology ·{' '}
                  {discovery?.schoolsOutsideRadius.length ?? 0} outside radius excluded
                </p>
              </div>
            </div>

            <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-800/70">
              {filteredInRadius.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  {loading
                    ? 'Searching for educational institutions...'
                    : 'No schools matched the current filters inside this radius.'}
                </div>
              ) : (
                filteredInRadius.map((school) => {
                  const isSelected = selectedSet.has(school.id);
                  const isInspected = inspectedSchoolId === school.id;
                  return (
                    <div
                      key={school.id}
                      onClick={() => setInspectedSchoolId(school.id)}
                      className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isInspected
                          ? 'bg-cyan-500/10'
                          : isSelected
                          ? 'bg-emerald-500/[0.06] hover:bg-emerald-500/10'
                          : 'hover:bg-[#111A2E]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {school.verificationStatus === 'verified' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                          <span className="text-xs font-medium text-slate-100 truncate">
                            {school.name}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {school.category} · {school.verificationStatus === 'verified' ? 'Verified' : 'Unverified'} ·{' '}
                          <span className="font-mono text-cyan-300 tabular-nums">
                            {school.distanceKm.toFixed(2)} km
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSchool(school.id);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-[#060B17] border-slate-700 text-slate-300 hover:border-cyan-400'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

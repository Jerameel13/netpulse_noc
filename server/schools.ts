import fs from 'node:fs';
import path from 'node:path';
import type {
  CentralSchoolAnchor,
  DiscoveredSchool,
  SchoolCategory,
  SchoolDiscoveryResponse,
  SchoolTopologyProject,
} from '../src/types/schoolTopology.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SCHOOL_TOPOLOGIES_FILE = path.join(DATA_DIR, 'school-topologies.json');

const DEFAULT_CENTRAL_COORDS = {
  name: 'Tanauan South Central School',
  address:
    'President Jose P. Laurel Highway, Barangay 4, Poblacion, Tanauan, Batangas, 4232, Philippines',
  lat: 14.0867108,
  lng: 121.150039,
};

interface CachedSearch {
  expiresAt: number;
  data: SchoolDiscoveryResponse;
}

const discoveryCache = new Map<string, CachedSearch>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371.0088;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const dLambda = toRadians(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

function recommendWirelessEquipment(distanceKm: number): {
  proposedConnectionType: string;
  suggestedEquipment: string;
  losRequirement: string;
} {
  if (distanceKm <= 1.5) {
    return {
      proposedConnectionType: '5 GHz PtMP Sector Link (Short-Range)',
      suggestedEquipment: 'Central: Ubiquiti LiteAP GPS · Remote: NanoStation 5AC Loco',
      losRequirement: 'Clear rooftop line-of-sight (>= 12m mast, 1st Fresnel zone >= 60% clear)',
    };
  }
  if (distanceKm <= 3.2) {
    return {
      proposedConnectionType: '5 GHz PtMP / High-Gain Bridge (Mid-Range)',
      suggestedEquipment: 'Central: Rocket Prism 5AC + 120° Sector · Remote: NanoBeam 5AC Gen2',
      losRequirement: 'Elevated tower >= 18m with rooftop/tree obstacle survey & link budget check',
    };
  }
  return {
    proposedConnectionType: '5 GHz Dedicated PtP High-Gain Dish (Long-Range)',
    suggestedEquipment: 'Central & Remote: Ubiquiti PowerBeam 5AC-500 / Mimosa C5x 25dBi Dish',
    losRequirement: 'Mandatory field LOS + Fresnel clearance & rain-fade link budget validation',
  };
}

function classifyOsmSchool(
  name: string,
  tags: Record<string, string | undefined>
): SchoolCategory {
  const lower = name.toLowerCase();
  const amenity = (tags.amenity || '').toLowerCase();
  const opType = (tags['operator:type'] || '').toLowerCase();
  const operator = (tags.operator || '').toLowerCase();

  if (amenity === 'college' || amenity === 'university' || lower.includes('college') || lower.includes('university') || lower.includes('polytechnic')) {
    return 'College / University';
  }
  if (amenity === 'kindergarten' || lower.includes('kinder') || lower.includes('daycare') || lower.includes('preschool') || lower.includes('learning center')) {
    return 'Preschool / Kindergarten';
  }
  if (lower.includes('high school') || lower.includes('nhs') || lower.includes('national high') || lower.includes('integrated school') || lower.includes('senior high')) {
    return 'Public High School';
  }
  if (
    lower.includes('elementary') ||
    lower.includes('central school') ||
    opType === 'public' ||
    opType === 'government' ||
    operator.includes('deped')
  ) {
    return 'Public Elementary';
  }
  if (opType === 'private' || lower.includes('academy') || lower.includes('christian') || lower.includes('montessori') || lower.includes('institute') || lower.includes('inc')) {
    return 'Private School';
  }
  return 'Educational Institution';
}

function classifyGoogleSchool(name: string, types: string[]): SchoolCategory {
  const lower = name.toLowerCase();
  if (types.includes('university') || lower.includes('college') || lower.includes('university')) {
    return 'College / University';
  }
  if (types.includes('preschool') || lower.includes('kinder') || lower.includes('daycare')) {
    return 'Preschool / Kindergarten';
  }
  if (types.includes('secondary_school') || lower.includes('high school') || lower.includes('integrated')) {
    return 'Public High School';
  }
  if (types.includes('primary_school') || lower.includes('elementary') || lower.includes('central school')) {
    return 'Public Elementary';
  }
  if (lower.includes('academy') || lower.includes('christian') || lower.includes('montessori') || lower.includes('institute')) {
    return 'Private School';
  }
  return 'Educational Institution';
}

function normalizeSchoolName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function deduplicateSchools(schools: DiscoveredSchool[]): DiscoveredSchool[] {
  const unique: DiscoveredSchool[] = [];
  for (const candidate of schools) {
    const norm = normalizeSchoolName(candidate.name);
    const existingIdx = unique.findIndex((item) => {
      const sameName = normalizeSchoolName(item.name) === norm;
      const closeGeo = haversineDistanceKm(item.lat, item.lng, candidate.lat, candidate.lng) < 0.12;
      return sameName && closeGeo;
    });
    if (existingIdx === -1) {
      unique.push(candidate);
    } else if (
      unique[existingIdx].verificationStatus === 'unverified' &&
      candidate.verificationStatus === 'verified'
    ) {
      unique[existingIdx] = candidate;
    }
  }
  return unique.sort((a, b) => a.distanceKm - b.distanceKm);
}

async function resolveCentralSchoolViaNominatim(): Promise<CentralSchoolAnchor> {
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?q=Tanauan+South+Central+School,+Tanauan,+Batangas,+Philippines&format=json&limit=1';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NetPulse-NOC/1.0 (School-Network-Planner)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const items = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name?: string;
      }>;
      if (Array.isArray(items) && items.length > 0) {
        const lat = Number(items[0].lat);
        const lng = Number(items[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            name: DEFAULT_CENTRAL_COORDS.name,
            address: items[0].display_name || DEFAULT_CENTRAL_COORDS.address,
            lat,
            lng,
            source: 'openstreetmap-overpass',
            verificationStatus: 'verified',
          };
        }
      }
    }
  } catch {
    // Fallback to verified coordinates if Nominatim times out
  }

  return {
    ...DEFAULT_CENTRAL_COORDS,
    source: 'openstreetmap-overpass',
    verificationStatus: 'verified',
  };
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}

async function queryOverpassFast(query: string): Promise<OverpassElement[]> {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'User-Agent': 'NetPulse-NOC/1.0 (School-Network-Planner)',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        console.warn(`Overpass endpoint ${endpoint} returned HTTP ${res.status}`);
        continue;
      }

      const payload = (await res.json()) as { elements?: OverpassElement[] };
      if (Array.isArray(payload.elements)) return payload.elements;
    } catch (error) {
      console.warn(`Overpass request failed for ${endpoint}:`, error);
    }
  }

  return [];
}

async function discoverSchoolsViaOverpass(
  central: CentralSchoolAnchor,
  radiusKm: number
): Promise<DiscoveredSchool[]> {
  const radiusMeters = Math.round(radiusKm * 1000);
  const query = `
    [out:json][timeout:25];
    (
      nwr(around:${radiusMeters},${central.lat},${central.lng})["amenity"~"^(school|college|university|kindergarten)$"];
    );
    out center tags;
  `;

  const elements = await queryOverpassFast(query);
  const results: DiscoveredSchool[] = [];

  for (const element of elements) {
    const tags = element.tags || {};
    const name = tags.name?.trim();
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!name || typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const distanceKm = haversineDistanceKm(central.lat, central.lng, lat, lng);
    if (distanceKm > radiusKm) continue;
    if (normalizeSchoolName(name).includes('tanauan south central') && distanceKm < 0.25) continue;

    const addressParts = [
      tags['addr:street'],
      tags['addr:suburb'] || tags['addr:quarter'] || tags['addr:neighbourhood'],
      tags['addr:city'] || tags['addr:town'] || 'Tanauan City',
      tags['addr:province'] || tags['addr:state'] || 'Batangas',
    ].filter(Boolean);
    const hasAddress = Boolean(tags['addr:street'] || tags['addr:suburb'] || tags['addr:city']);
    const equipment = recommendWirelessEquipment(distanceKm);

    results.push({
      id: `osm-${element.type}-${element.id}`,
      externalId: `${element.type}/${element.id}`,
      name,
      address: addressParts.length ? addressParts.join(', ') : 'Tanauan City, Batangas, Philippines',
      lat,
      lng,
      distanceKm: Math.round(distanceKm * 100) / 100,
      distanceMeters: Math.round(distanceKm * 1000),
      bearingDeg: Math.round(calculateBearingDeg(central.lat, central.lng, lat, lng)),
      category: classifyOsmSchool(name, tags),
      withinRadius: true,
      verificationStatus: hasAddress || element.type !== 'node' ? 'verified' : 'unverified',
      verificationReason: hasAddress || element.type !== 'node'
        ? 'OpenStreetMap educational facility with address or mapped campus geometry'
        : 'OpenStreetMap school node; confirm exact campus location',
      source: 'openstreetmap-overpass',
      ...equipment,
    });
  }

  return deduplicateSchools(results);
}

interface NominatimItem {
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  class?: string;
  type?: string;
  address?: Record<string, string | undefined>;
}

async function queryNominatimSchools(
  central: CentralSchoolAnchor,
  searchRadiusKm: number
): Promise<DiscoveredSchool[]> {
  const latDelta = searchRadiusKm / 111.32;
  const lngDelta = searchRadiusKm / (111.32 * Math.cos(toRadians(central.lat)));
  const viewbox = [
    (central.lng - lngDelta).toFixed(5),
    (central.lat + latDelta).toFixed(5),
    (central.lng + lngDelta).toFixed(5),
    (central.lat - latDelta).toFixed(5),
  ].join(',');

  const searchTerms = [
    'school',
    'elementary school',
    'high school',
    'college',
    'academy',
    'kindergarten',
    'university',
  ];

  const responses = await Promise.allSettled(
    searchTerms.map(async (q) => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q
      )}&format=json&viewbox=${viewbox}&bounded=1&limit=50&addressdetails=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'NetPulse-NOC/1.0 (School-Network-Planner)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return [] as NominatimItem[];
      const data = (await res.json()) as NominatimItem[];
      return Array.isArray(data) ? data : [];
    })
  );

  const items: NominatimItem[] = [];
  for (const r of responses) {
    if (r.status === 'fulfilled') items.push(...r.value);
  }

  const results: DiscoveredSchool[] = [];
  for (const item of items) {
    const cls = (item.class || '').toLowerCase();
    const typ = (item.type || '').toLowerCase();
    const isEduAmenity =
      cls === 'amenity' &&
      ['school', 'college', 'university', 'kindergarten'].includes(typ);
    const isEduBuilding = cls === 'building' && typ === 'school';
    if (!isEduAmenity && !isEduBuilding) continue;

    const rawName = (item.name || item.display_name?.split(',')[0] || '').trim();
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!rawName || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const distKm = haversineDistanceKm(central.lat, central.lng, lat, lng);
    if (normalizeSchoolName(rawName).includes('tanauan south central') && distKm < 0.25) {
      continue;
    }

    const addrObj = item.address || {};
    const addressParts = [
      addrObj.road,
      addrObj.suburb || addrObj.quarter || addrObj.village || addrObj.neighbourhood,
      addrObj.city || addrObj.town || addrObj.municipality || 'Tanauan City',
      addrObj.state || addrObj.province || 'Batangas',
    ].filter(Boolean);

    const hasStructuredMetadata = Boolean(
      addrObj.road ||
        addrObj.suburb ||
        addrObj.quarter ||
        addrObj.village ||
        item.osm_type === 'way' ||
        item.osm_type === 'relation'
    );

    const eq = recommendWirelessEquipment(distKm);
    results.push({
      id: `osm-${item.osm_type || 'node'}-${item.osm_id || `${lat}-${lng}`}`,
      externalId: `${item.osm_type || 'node'}/${item.osm_id || ''}`,
      name: rawName,
      address:
        addressParts.length > 0
          ? addressParts.join(', ')
          : item.display_name || 'Tanauan City / Vicinity, Batangas',
      lat,
      lng,
      distanceKm: Math.round(distKm * 100) / 100,
      distanceMeters: Math.round(distKm * 1000),
      bearingDeg: Math.round(calculateBearingDeg(central.lat, central.lng, lat, lng)),
      category: classifyOsmSchool(rawName, { amenity: typ }),
      withinRadius: true, // re-evaluated against exact requested radiusKm downstream
      verificationStatus: hasStructuredMetadata ? 'verified' : 'unverified',
      verificationReason: hasStructuredMetadata
        ? 'Verified OpenStreetMap educational facility with street/barangay or campus polygon metadata'
        : 'Crowdsourced OSM node without street/polygon metadata — confirm campus location on survey',
      source: 'openstreetmap-overpass',
      ...eq,
    });
  }
  return results;
}

interface PhotonFeature {
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

async function queryPhotonSchools(
  central: CentralSchoolAnchor,
  maxDistKm: number
): Promise<DiscoveredSchool[]> {
  const tags = ['amenity:school', 'amenity:college', 'amenity:university', 'amenity:kindergarten'];
  const responses = await Promise.allSettled(
    tags.map(async (tag) => {
      const url = `https://photon.komoot.io/api/?q=Tanauan&osm_tag=${encodeURIComponent(
        tag
      )}&lat=${central.lat}&lon=${central.lng}&limit=45`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NetPulse-NOC/1.0 (School-Network-Planner)' },
        signal: AbortSignal.timeout(5500),
      });
      if (!res.ok) return [] as PhotonFeature[];
      const payload = (await res.json()) as { features?: PhotonFeature[] };
      return Array.isArray(payload.features) ? payload.features : [];
    })
  );

  const features: PhotonFeature[] = [];
  for (const r of responses) {
    if (r.status === 'fulfilled') features.push(...r.value);
  }

  const results: DiscoveredSchool[] = [];
  for (const f of features) {
    const props = f.properties || {};
    const coords = f.geometry?.coordinates;
    if (!props.name || !coords || coords.length < 2) continue;
    const [lng, lat] = coords;
    const distKm = haversineDistanceKm(central.lat, central.lng, lat, lng);
    if (distKm > maxDistKm) continue;
    if (normalizeSchoolName(props.name).includes('tanauan south central') && distKm < 0.25) {
      continue;
    }

    const addressParts = [
      props.street,
      props.locality || props.district,
      props.city || 'Tanauan City',
      props.state || 'Batangas',
    ].filter(Boolean);

    const hasStructuredMetadata = Boolean(
      props.street || props.locality || props.district || props.osm_type === 'W' || props.osm_type === 'R'
    );

    const osmTypeMap: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };
    const osmType = osmTypeMap[props.osm_type || 'N'] || 'node';
    const eq = recommendWirelessEquipment(distKm);

    results.push({
      id: `osm-${osmType}-${props.osm_id || `${lat}-${lng}`}`,
      externalId: `${osmType}/${props.osm_id || ''}`,
      name: props.name.trim(),
      address:
        addressParts.length > 0
          ? addressParts.join(', ')
          : 'Tanauan City / Vicinity, Batangas',
      lat,
      lng,
      distanceKm: Math.round(distKm * 100) / 100,
      distanceMeters: Math.round(distKm * 1000),
      bearingDeg: Math.round(calculateBearingDeg(central.lat, central.lng, lat, lng)),
      category: classifyOsmSchool(props.name, { amenity: props.osm_value || 'school' }),
      withinRadius: true,
      verificationStatus: hasStructuredMetadata ? 'verified' : 'unverified',
      verificationReason: hasStructuredMetadata
        ? 'Verified OpenStreetMap educational facility with street/barangay or campus polygon metadata'
        : 'Crowdsourced OSM point record without street metadata — confirm campus location on survey',
      source: 'openstreetmap-overpass',
      ...eq,
    });
  }
  return results;
}

interface TargetSchoolSpec {
  canonicalName: string;
  queries: string[];
  category: SchoolCategory;
}

const TARGET_REMOTE_SCHOOLS: TargetSchoolSpec[] = [
  {
    canonicalName: 'Tanauan North Central School',
    queries: ['Tanauan North Central School'],
    category: 'Public Elementary',
  },
  {
    canonicalName: 'Tanauan City Integrated High School',
    queries: ['Tanauan City Integrated High School', 'Tanauan City High School'],
    category: 'Public High School',
  },
  {
    canonicalName: 'Tapia Elementary School',
    queries: ['Tapia Elementary School', 'Judge Ladisla Tapia Sr. Elementary School'],
    category: 'Public Elementary',
  },
  {
    canonicalName: 'Sambat Elementary School',
    queries: ['Sambat Elementary School'],
    category: 'Public Elementary',
  },
  {
    canonicalName: 'Bagumbayan Elementary School',
    queries: ['Bagumbayan Elementary School'],
    category: 'Public Elementary',
  },
  {
    canonicalName: 'Bernardo Lirio Memorial National High School',
    queries: ['Bernardo Lirio Memorial National High School'],
    category: 'Public High School',
  },
  {
    canonicalName: 'Hidalgo Elementary School',
    queries: ['Hidalgo Elementary School'],
    category: 'Public Elementary',
  },
  {
    canonicalName: 'Pagaspas Elementary School',
    queries: ['Pagaspas Elementary School'],
    category: 'Public Elementary',
  },
];

async function resolveTargetSchoolViaNominatim(
  spec: TargetSchoolSpec,
  central: CentralSchoolAnchor,
  radiusKm: number
): Promise<DiscoveredSchool | null> {
  for (const query of spec.queries) {
    // Public Nominatim policy requires requests to be limited to at most 1 per second.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        `${query}, Tanauan, Batangas, Philippines`
      )}&format=json&limit=5&addressdetails=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'NetPulse-NOC/1.0 (School-Network-Planner)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const items = (await res.json()) as NominatimItem[];
      if (!Array.isArray(items) || items.length === 0) continue;

      const nearby = items
        .map((item) => {
          const lat = Number(item.lat);
          const lng = Number(item.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const distKm = haversineDistanceKm(central.lat, central.lng, lat, lng);
          return { item, lat, lng, distKm };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x && x.distKm <= 15));

      if (nearby.length === 0) continue;

      const eduMatch =
        nearby.find((x) => {
          const cls = (x.item.class || '').toLowerCase();
          const typ = (x.item.type || '').toLowerCase();
          return (
            (cls === 'amenity' &&
              ['school', 'college', 'university', 'kindergarten'].includes(typ)) ||
            (cls === 'building' && typ === 'school')
          );
        }) || nearby[0];

      const { item, lat, lng, distKm } = eduMatch;
      const rawName = (item.name || item.display_name?.split(',')[0] || spec.canonicalName).trim();
      const addrObj = item.address || {};
      const addressParts = [
        addrObj.road,
        addrObj.suburb || addrObj.quarter || addrObj.village || addrObj.neighbourhood,
        addrObj.city || addrObj.town || addrObj.municipality || 'Tanauan City',
        addrObj.state || addrObj.province || 'Batangas',
      ].filter(Boolean);

      const hasStructuredMetadata = Boolean(
        addrObj.road ||
          addrObj.suburb ||
          addrObj.quarter ||
          addrObj.village ||
          addrObj.neighbourhood ||
          item.osm_type === 'way' ||
          item.osm_type === 'relation' ||
          item.class === 'amenity'
      );

      const aliasNote =
        normalizeSchoolName(rawName) !== normalizeSchoolName(spec.canonicalName)
          ? ` (matched OSM record "${rawName}")`
          : '';

      const eq = recommendWirelessEquipment(distKm);
      return {
        id: `osm-${item.osm_type || 'node'}-${item.osm_id || normalizeSchoolName(spec.canonicalName).replace(/\s+/g, '-')}`,
        externalId: `${item.osm_type || 'node'}/${item.osm_id || ''}`,
        name: spec.canonicalName,
        address:
          addressParts.length > 0
            ? addressParts.join(', ')
            : item.display_name || 'Tanauan City, Batangas, Philippines',
        lat,
        lng,
        distanceKm: Math.round(distKm * 100) / 100,
        distanceMeters: Math.round(distKm * 1000),
        bearingDeg: Math.round(calculateBearingDeg(central.lat, central.lng, lat, lng)),
        category: spec.category,
        withinRadius: distKm <= radiusKm,
        verificationStatus: hasStructuredMetadata ? 'verified' : 'unverified',
        verificationReason: hasStructuredMetadata
          ? `Verified OpenStreetMap educational facility${aliasNote}`
          : `OpenStreetMap coordinate record without street/polygon metadata${aliasNote}`,
        source: 'openstreetmap-overpass',
        ...eq,
      };
    } catch {
      // Try alternate query for this school
    }
  }
  return null;
}

async function discoverViaGooglePlaces(
  apiKey: string,
  radiusKm: number
): Promise<SchoolDiscoveryResponse> {
  // 1. Resolve Tanauan South Central School via Places API (New) searchText
  let central: CentralSchoolAnchor = {
    ...DEFAULT_CENTRAL_COORDS,
    source: 'google-places',
    verificationStatus: 'verified',
  };

  const textRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: 'Tanauan South Central School, Tanauan City, Batangas, Philippines',
      maxResultCount: 1,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (textRes.ok) {
    const textJson = (await textRes.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      }>;
    };
    const top = textJson.places?.[0];
    if (top?.location?.latitude && top?.location?.longitude) {
      central = {
        name: top.displayName?.text || DEFAULT_CENTRAL_COORDS.name,
        address: top.formattedAddress || DEFAULT_CENTRAL_COORDS.address,
        lat: top.location.latitude,
        lng: top.location.longitude,
        source: 'google-places',
        verificationStatus: 'verified',
      };
    }
  }

  // 2. Query Places API (New) searchText specifically for the 8 requested target schools
  const fieldMask =
    'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus,places.googleMapsUri';

  type GooglePlaceItem = {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    types?: string[];
    businessStatus?: string;
    googleMapsUri?: string;
  };

  const resolvedSchools: Array<DiscoveredSchool | null> = [];
  for (const spec of TARGET_REMOTE_SCHOOLS) {
    const resolvedSchool: DiscoveredSchool | null = await (async () => {
      for (const query of spec.queries) {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
          body: JSON.stringify({
            textQuery: `${query}, Tanauan City, Batangas, Philippines`,
            maxResultCount: 3,
            locationBias: {
              circle: {
                center: { latitude: central.lat, longitude: central.lng },
                radius: 15000,
              },
            },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          let errMessage = `HTTP ${res.status}`;
          try {
            const parsedErr = JSON.parse(errBody) as {
              error?: { message?: string; status?: string };
            };
            if (parsedErr.error?.message) {
              errMessage = `${parsedErr.error.status || res.status}: ${parsedErr.error.message}`;
            }
          } catch {
            if (errBody) errMessage = errBody.slice(0, 180);
          }
          throw new Error(`Google Places API (New) failed (${errMessage})`);
        }

        const json = (await res.json()) as { places?: GooglePlaceItem[] };
        const candidates = (json.places || []).filter((p) => {
          const lat = p.location?.latitude;
          const lng = p.location?.longitude;
          if (typeof lat !== 'number' || typeof lng !== 'number') return false;
          const d = haversineDistanceKm(central.lat, central.lng, lat, lng);
          return d <= 15 && !(normalizeSchoolName(p.displayName?.text || '').includes('tanauan south central') && d < 0.25);
        });

        if (candidates.length === 0) continue;

        const eduCandidate =
          candidates.find((p) =>
            (p.types || []).some((t) =>
              ['school', 'primary_school', 'secondary_school', 'university', 'preschool'].includes(t)
            )
          ) || candidates[0];

        const lat = eduCandidate.location!.latitude!;
        const lng = eduCandidate.location!.longitude!;
        const distKm = haversineDistanceKm(central.lat, central.lng, lat, lng);
        const rawName = eduCandidate.displayName?.text?.trim() || spec.canonicalName;
        const types = eduCandidate.types || [];
        const verified =
          Boolean(eduCandidate.formattedAddress) &&
          eduCandidate.businessStatus === 'OPERATIONAL' &&
          types.some((t) =>
            ['school', 'primary_school', 'secondary_school', 'university', 'preschool'].includes(t)
          );
        const aliasNote =
          normalizeSchoolName(rawName) !== normalizeSchoolName(spec.canonicalName)
            ? ` (matched Google Places record "${rawName}")`
            : '';

        const eq = recommendWirelessEquipment(distKm);
        return {
          id: `gmp-${eduCandidate.id}`,
          externalId: eduCandidate.id,
          name: spec.canonicalName,
          address: eduCandidate.formattedAddress || 'Tanauan City, Batangas, Philippines',
          lat,
          lng,
          distanceKm: Math.round(distKm * 100) / 100,
          distanceMeters: Math.round(distKm * 1000),
          bearingDeg: Math.round(calculateBearingDeg(central.lat, central.lng, lat, lng)),
          category: spec.category || classifyGoogleSchool(spec.canonicalName, types),
          withinRadius: distKm <= radiusKm,
          verificationStatus: verified ? 'verified' : 'unverified',
          verificationReason: verified
            ? `Verified operational educational institution via Google Places API (New)${aliasNote}`
            : `Partial Google Places record — confirm campus status & coordinates${aliasNote}`,
          source: 'google-places',
          placeUri: eduCandidate.googleMapsUri,
          ...eq,
        };
      }

      return null;
    })();
    resolvedSchools.push(resolvedSchool);
  }

  // Fill schools not found by Google Places using sequential Nominatim lookups.
  for (let i = 0; i < resolvedSchools.length; i++) {
    if (resolvedSchools[i] !== null) continue;
    resolvedSchools[i] = await resolveTargetSchoolViaNominatim(
      TARGET_REMOTE_SCHOOLS[i],
      central,
      radiusKm
    );
  }

  const deduped = deduplicateSchools(
    resolvedSchools.filter((s): s is DiscoveredSchool => s !== null)
  );
  return {
    centralSchool: central,
    radiusKm,
    provider: 'google-places',
    googleMapsEnabled: true,
    schoolsInRadius: deduped.filter((s) => s.withinRadius),
    schoolsOutsideRadius: deduped.filter((s) => !s.withinRadius),
    fetchedAt: new Date().toISOString(),
  };
}

async function discoverViaOverpass(
  radiusKm: number,
  googleMapsEnabled: boolean
): Promise<SchoolDiscoveryResponse> {
  const central = await resolveCentralSchoolViaNominatim();

  // First, discover all mapped educational facilities inside the requested radius.
  let rawSchools = await discoverSchoolsViaOverpass(central, radiusKm);
  console.log(`Overpass discovered ${rawSchools.length} school records`);

  // Supplement Overpass results with the configured target schools that were not found.
  // This is sequential because the public Nominatim service has a strict usage policy.
  const foundNames = new Set(rawSchools.map((school) => normalizeSchoolName(school.name)));
  for (const spec of TARGET_REMOTE_SCHOOLS) {
    const alreadyFound = [...foundNames].some((name) =>
      name.includes(normalizeSchoolName(spec.canonicalName)) ||
      normalizeSchoolName(spec.canonicalName).includes(name)
    );
    if (alreadyFound) continue;

    const targetSchool = await resolveTargetSchoolViaNominatim(spec, central, radiusKm);
    if (targetSchool) {
      rawSchools.push(targetSchool);
      foundNames.add(normalizeSchoolName(targetSchool.name));
    }
  }

  const deduped = deduplicateSchools(rawSchools);
  if (deduped.length === 0) {
    throw new Error(
      'School discovery failed: Overpass and Nominatim returned no usable school records. Check the Render logs for upstream API errors.'
    );
  }

  return {
    centralSchool: central,
    radiusKm,
    provider: 'openstreetmap-overpass',
    googleMapsEnabled,
    schoolsInRadius: deduped.filter((school) => school.withinRadius),
    schoolsOutsideRadius: deduped.filter((school) => !school.withinRadius),
    fetchedAt: new Date().toISOString(),
  };
}

export async function discoverNearbySchools(
  radiusKm: number,
  forceRefresh = false
): Promise<SchoolDiscoveryResponse> {
  const safeRadius = Math.max(1, Math.min(20, Number(radiusKm) || 5));
  const serverMapsKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || '';

  const cacheKey = `v2-target9:${safeRadius.toFixed(1)}:${
    serverMapsKey ? `gmp-${serverMapsKey.slice(-6)}` : 'osm'
  }`;
  if (!forceRefresh) {
    const cached = discoveryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  let result: SchoolDiscoveryResponse;
  if (serverMapsKey) {
    try {
      result = await discoverViaGooglePlaces(serverMapsKey, safeRadius);
    } catch {
      result = await discoverViaOverpass(safeRadius, false);
    }
  } else {
    result = await discoverViaOverpass(safeRadius, false);
  }

  discoveryCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data: result,
  });
  return result;
}

export function loadSavedSchoolTopologies(): SchoolTopologyProject[] {
  try {
    if (fs.existsSync(SCHOOL_TOPOLOGIES_FILE)) {
      const raw = fs.readFileSync(SCHOOL_TOPOLOGIES_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as SchoolTopologyProject[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Could not read saved school topologies:', err);
  }
  return [];
}

export function saveSchoolTopologyProject(
  project: SchoolTopologyProject
): SchoolTopologyProject[] {
  const list = loadSavedSchoolTopologies();
  const idx = list.findIndex((p) => p.id === project.id);
  const updated: SchoolTopologyProject = {
    ...project,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    list[idx] = updated;
  } else {
    list.unshift(updated);
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(SCHOOL_TOPOLOGIES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  return list;
}

export function deleteSchoolTopologyProject(id: string): SchoolTopologyProject[] {
  const next = loadSavedSchoolTopologies().filter((p) => p.id !== id);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(SCHOOL_TOPOLOGIES_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

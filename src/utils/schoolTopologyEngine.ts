import { jsPDF } from 'jspdf';
import type {
  BuilderLayoutMode,
  CentralSchoolAnchor,
  DiscoveredSchool,
  SchoolTopologyLink,
  SchoolTopologyNode,
  SchoolTopologyProject,
  SchoolWirelessProfile,
} from '../types/schoolTopology';

export interface IpValidationIssue {
  nodeId: string;
  hostname: string;
  severity: 'error' | 'warning';
  message: string;
}

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isValidIpv4(ip: string): boolean {
  return IPV4_REGEX.test(ip.trim());
}

export function isValidSubnetMask(mask: string): boolean {
  if (!isValidIpv4(mask)) return false;
  const parts = mask.trim().split('.').map(Number);
  const num = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  if (num === 0) return false;
  const inv = (~num) >>> 0;
  return ((inv + 1) & inv) === 0;
}

function ipToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

export function sameSubnet(ipA: string, ipB: string, mask: string): boolean {
  if (!isValidIpv4(ipA) || !isValidIpv4(ipB) || !isValidSubnetMask(mask)) return false;
  const m = ipToInt(mask);
  return (ipToInt(ipA) & m) === (ipToInt(ipB) & m);
}

function makeShortCode(name: string, idx: number): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    const initials = words
      .slice(0, 4)
      .map((w) => w[0].toUpperCase())
      .join('');
    return `${initials}-${String(idx).padStart(2, '0')}`;
  }
  return `SCH-${String(idx).padStart(2, '0')}`;
}

export function generateStarTopologyFromSchools(params: {
  centralSchool: CentralSchoolAnchor;
  selectedSchools: DiscoveredSchool[];
  radiusKm: number;
  includeEndDevices?: boolean;
  layoutMode?: BuilderLayoutMode;
  projectName?: string;
}): SchoolTopologyProject {
  const {
    centralSchool,
    selectedSchools,
    radiusKm,
    includeEndDevices = true,
    layoutMode = 'star',
    projectName,
  } = params;

  const nowIso = new Date().toISOString();
  const nodes: SchoolTopologyNode[] = [];
  const links: SchoolTopologyLink[] = [];
  const schoolProfiles: SchoolWirelessProfile[] = [];

  // Central Hub: Tanauan South Central School (10.10.0.0/24)
  nodes.push(
    {
      id: 'hub-central-server',
      type: 'central-server',
      label: 'Central Server (TSCS)',
      hostname: 'TSCS-SRV-01',
      schoolId: 'central-hub',
      schoolName: centralSchool.name,
      isCentral: true,
      ipAddress: '10.10.0.10',
      subnetMask: '255.255.255.0',
      defaultGateway: '10.10.0.1',
      vlanId: 10,
      dhcpEnabled: false,
      routingMode: 'Default Gateway',
      model: 'Dell PowerEdge R540 (Central LMS & SIS)',
      position: { x: 0, y: 0 },
      interfaces: [
        {
          name: 'eno1',
          ipAddress: '10.10.0.10',
          subnetMask: '255.255.255.0',
          vlanId: 10,
          mode: 'static',
          description: 'Central Server Trunk to Core Switch',
        },
      ],
    },
    {
      id: 'hub-core-switch',
      type: 'core-switch',
      label: 'Core Switch (TSCS)',
      hostname: 'TSCS-CSW-01',
      schoolId: 'central-hub',
      schoolName: centralSchool.name,
      isCentral: true,
      ipAddress: '10.10.0.2',
      subnetMask: '255.255.255.0',
      defaultGateway: '10.10.0.1',
      vlanId: 10,
      dhcpEnabled: false,
      routingMode: 'Default Gateway',
      model: 'Cisco Catalyst 9300-24P',
      position: { x: 0, y: 0 },
      interfaces: [
        {
          name: 'Gi1/0/1',
          ipAddress: '10.10.0.2',
          subnetMask: '255.255.255.0',
          vlanId: 10,
          mode: 'trunk',
          description: 'Uplink to Core Router',
        },
        {
          name: 'Gi1/0/2',
          ipAddress: '10.10.0.2',
          subnetMask: '255.255.255.0',
          vlanId: 10,
          mode: 'static',
          description: 'Downlink to Central Server',
        },
      ],
    },
    {
      id: 'hub-core-router',
      type: 'core-router',
      label: 'Core Router (TSCS)',
      hostname: 'TSCS-RTR-01',
      schoolId: 'central-hub',
      schoolName: centralSchool.name,
      isCentral: true,
      ipAddress: '10.10.0.1',
      subnetMask: '255.255.255.0',
      defaultGateway: '203.177.40.1',
      vlanId: 10,
      dhcpEnabled: true,
      dhcpRangeStart: '10.10.0.100',
      dhcpRangeEnd: '10.10.0.200',
      routingMode: 'OSPF Area 0',
      model: 'Cisco ISR 4331/K9',
      position: { x: 0, y: 0 },
      interfaces: [
        {
          name: 'Gi0/0/0',
          ipAddress: '10.10.0.1',
          subnetMask: '255.255.255.0',
          vlanId: 10,
          mode: 'static',
          description: 'LAN Gateway for Tanauan South Central School',
        },
        {
          name: 'Gi0/0/1',
          ipAddress: '10.20.0.1',
          subnetMask: '255.255.255.0',
          vlanId: 99,
          mode: 'wireless-ptmp',
          description: 'Transit Link to Main Wireless Tower',
        },
      ],
    },
    {
      id: 'hub-main-tower',
      type: 'central-tower',
      label: 'Main Wireless Tower',
      hostname: 'TSCS-TOWER-01',
      schoolId: 'central-hub',
      schoolName: centralSchool.name,
      isCentral: true,
      ipAddress: '10.20.0.2',
      subnetMask: '255.255.255.0',
      defaultGateway: '10.20.0.1',
      vlanId: 99,
      dhcpEnabled: false,
      routingMode: 'Default Gateway',
      model: 'Ubiquiti Rocket Prism 5AC + 3x 120° Sector Array',
      wirelessMode: 'PtMP Base Station Hub (AP)',
      wirelessSsid: 'TSCS-DIVNET-5G',
      wirelessFrequency: '5.8 GHz (UNII-3)',
      wirelessEquipment: '30m Guyed Mast · Rocket Prism 5AC + 120° Titanium Sectors',
      losRequirement: '360° Rooftop / Tower clearance >= 25m AGL',
      losValidated: false,
      wirelessStatus: 'Proposed',
      position: { x: 0, y: 0 },
      interfaces: [
        {
          name: 'eth0',
          ipAddress: '10.20.0.2',
          subnetMask: '255.255.255.0',
          vlanId: 99,
          mode: 'trunk',
          description: 'Shielded Cat6A Uplink to Core Router',
        },
        {
          name: 'wlan0-ptmp',
          ipAddress: '10.20.0.2',
          subnetMask: '255.255.255.0',
          vlanId: 99,
          mode: 'wireless-ptmp',
          description: 'Point-to-Multipoint Wireless Distribution Radio',
        },
      ],
    }
  );

  links.push(
    {
      id: 'lnk-hub-srv-csw',
      source: 'hub-central-server',
      target: 'hub-core-switch',
      medium: 'wired-fiber',
      label: '10G Fiber',
      bandwidthMbps: 10000,
    },
    {
      id: 'lnk-hub-csw-rtr',
      source: 'hub-core-switch',
      target: 'hub-core-router',
      medium: 'wired-fiber',
      label: '1G Trunk',
      bandwidthMbps: 1000,
    },
    {
      id: 'lnk-hub-rtr-twr',
      source: 'hub-core-router',
      target: 'hub-main-tower',
      medium: 'wired-utp',
      label: 'Cat6A PoE+ Trunk',
      bandwidthMbps: 1000,
    }
  );

  // Remote School Spokes
  selectedSchools.forEach((school, index) => {
    const idx = index + 1;
    const code = makeShortCode(school.name, idx);
    const vlanId = 10 + idx * 10;
    const schoolSubnet = `10.10.${idx}`;
    const wirelessIp = `10.20.0.${10 + idx}`;

    schoolProfiles.push({
      schoolId: school.id,
      schoolName: school.name,
      address: school.address,
      lat: school.lat,
      lng: school.lng,
      distanceKm: school.distanceKm,
      category: school.category,
      verificationStatus: school.verificationStatus,
      proposedConnection: school.proposedConnectionType,
      losRequirement: school.losRequirement,
      suggestedEquipment: school.suggestedEquipment,
      connectionStatus: 'Proposed',
      losValidated: false,
      subnetCidr: `${schoolSubnet}.0/24`,
      vlanId,
    });

    const bridgeId = `sch-${idx}-bridge`;
    const routerId = `sch-${idx}-router`;
    const switchId = `sch-${idx}-switch`;
    const endDeviceId = `sch-${idx}-end`;

    nodes.push(
      {
        id: bridgeId,
        type: 'remote-tower',
        label: `Wireless Bridge · ${school.name}`,
        hostname: `${code}-CPE-01`,
        schoolId: school.id,
        schoolName: school.name,
        isCentral: false,
        ipAddress: wirelessIp,
        subnetMask: '255.255.255.0',
        defaultGateway: '10.20.0.1',
        vlanId: 99,
        dhcpEnabled: false,
        routingMode: 'Default Gateway',
        model: school.distanceKm > 3 ? 'PowerBeam 5AC-500 Bridge' : 'NanoBeam 5AC Gen2 Bridge',
        distanceKm: school.distanceKm,
        wirelessMode: school.proposedConnectionType,
        wirelessSsid: 'TSCS-DIVNET-5G',
        wirelessFrequency: '5.8 GHz (UNII-3)',
        wirelessEquipment: school.suggestedEquipment,
        losRequirement: school.losRequirement,
        losValidated: false,
        wirelessStatus: 'Proposed',
        position: { x: 0, y: 0 },
        interfaces: [
          {
            name: 'wlan0',
            ipAddress: wirelessIp,
            subnetMask: '255.255.255.0',
            vlanId: 99,
            mode: 'wireless-ptp',
            description: `Wireless link to TSCS-TOWER-01 (${school.distanceKm} km)`,
          },
          {
            name: 'eth0',
            ipAddress: `${schoolSubnet}.254`,
            subnetMask: '255.255.255.0',
            vlanId,
            mode: 'static',
            description: 'Downlink to School Router WAN',
          },
        ],
      },
      {
        id: routerId,
        type: 'school-router',
        label: `School Router · ${school.name}`,
        hostname: `${code}-RTR-01`,
        schoolId: school.id,
        schoolName: school.name,
        isCentral: false,
        ipAddress: `${schoolSubnet}.1`,
        subnetMask: '255.255.255.0',
        defaultGateway: '10.20.0.1',
        vlanId,
        dhcpEnabled: true,
        dhcpRangeStart: `${schoolSubnet}.50`,
        dhcpRangeEnd: `${schoolSubnet}.200`,
        routingMode: 'OSPF Area 0',
        model: 'Cisco ISR 1100-4G / MikroTik RB4011',
        position: { x: 0, y: 0 },
        interfaces: [
          {
            name: 'Gi0/0/0',
            ipAddress: wirelessIp,
            subnetMask: '255.255.255.0',
            vlanId: 99,
            mode: 'static',
            description: 'WAN Uplink via Outdoor Wireless Bridge',
          },
          {
            name: `Gi0/0/1.${vlanId}`,
            ipAddress: `${schoolSubnet}.1`,
            subnetMask: '255.255.255.0',
            vlanId,
            mode: 'trunk',
            description: `${school.name} LAN Gateway`,
          },
        ],
      },
      {
        id: switchId,
        type: 'access-switch',
        label: `Access Switch · ${school.name}`,
        hostname: `${code}-ASW-01`,
        schoolId: school.id,
        schoolName: school.name,
        isCentral: false,
        ipAddress: `${schoolSubnet}.2`,
        subnetMask: '255.255.255.0',
        defaultGateway: `${schoolSubnet}.1`,
        vlanId,
        dhcpEnabled: false,
        routingMode: 'Default Gateway',
        model: 'Cisco Catalyst 2960X-24PS',
        position: { x: 0, y: 0 },
        interfaces: [
          {
            name: 'Gi1/0/24',
            ipAddress: `${schoolSubnet}.2`,
            subnetMask: '255.255.255.0',
            vlanId,
            mode: 'trunk',
            description: 'Uplink to School Router',
          },
          {
            name: 'Gi1/0/1-12',
            ipAddress: `${schoolSubnet}.2`,
            subnetMask: '255.255.255.0',
            vlanId,
            mode: 'dhcp',
            description: 'Faculty & Computer Lab Ports',
          },
        ],
      }
    );

    links.push(
      {
        id: `lnk-twr-sch-${idx}`,
        source: 'hub-main-tower',
        target: bridgeId,
        medium: 'wireless',
        label: `${school.distanceKm.toFixed(2)} km · Proposed Wireless`,
        bandwidthMbps: school.distanceKm > 3 ? 300 : 450,
        distanceKm: school.distanceKm,
        wirelessStatus: 'Proposed',
        losValidated: false,
      },
      {
        id: `lnk-sch-${idx}-br-rtr`,
        source: bridgeId,
        target: routerId,
        medium: 'wired-utp',
        label: 'Cat6A LAN',
        bandwidthMbps: 1000,
      },
      {
        id: `lnk-sch-${idx}-rtr-sw`,
        source: routerId,
        target: switchId,
        medium: 'wired-utp',
        label: `VLAN ${vlanId}`,
        bandwidthMbps: 1000,
      }
    );

    if (includeEndDevices) {
      nodes.push({
        id: endDeviceId,
        type: 'end-device',
        label: `End Devices · ${school.name}`,
        hostname: `${code}-LAB-01`,
        schoolId: school.id,
        schoolName: school.name,
        isCentral: false,
        ipAddress: `${schoolSubnet}.50`,
        subnetMask: '255.255.255.0',
        defaultGateway: `${schoolSubnet}.1`,
        vlanId,
        dhcpEnabled: true,
        routingMode: 'Default Gateway',
        model: 'School Lab PCs + Admin Terminals + Wi-Fi AP',
        position: { x: 0, y: 0 },
        interfaces: [
          {
            name: 'eth0',
            ipAddress: `${schoolSubnet}.50`,
            subnetMask: '255.255.255.0',
            vlanId,
            mode: 'dhcp',
            description: 'DHCP Client Pool (.50–.200)',
          },
        ],
      });
      links.push({
        id: `lnk-sch-${idx}-sw-end`,
        source: switchId,
        target: endDeviceId,
        medium: 'wired-utp',
        label: '1G Access',
        bandwidthMbps: 1000,
      });
    }
  });

  const arrangedNodes = autoArrangeNodes(nodes, links, layoutMode);

  return {
    id: `sch-topo-${Date.now()}`,
    name:
      projectName?.trim() ||
      `Tanauan School Wireless Star (${selectedSchools.length} Schools · ${radiusKm} km)`,
    centralSchool,
    radiusKm,
    layoutMode,
    includeEndDevices,
    createdAt: nowIso,
    updatedAt: nowIso,
    schools: schoolProfiles,
    nodes: arrangedNodes,
    links,
  };
}

export function autoArrangeNodes(
  nodes: SchoolTopologyNode[],
  _links: SchoolTopologyLink[],
  layoutMode: BuilderLayoutMode
): SchoolTopologyNode[] {
  const updated = nodes.map((n) => ({ ...n, position: { ...n.position } }));

  const hubServer = updated.find((n) => n.id === 'hub-central-server' || n.type === 'central-server');
  const hubSwitch = updated.find((n) => n.id === 'hub-core-switch' || n.type === 'core-switch');
  const hubRouter = updated.find((n) => n.id === 'hub-core-router' || n.type === 'core-router');
  const hubTower = updated.find((n) => n.id === 'hub-main-tower' || n.type === 'central-tower');

  const schoolGroups: string[] = [];
  for (const n of updated) {
    if (!n.isCentral && n.schoolId && !schoolGroups.includes(n.schoolId)) {
      schoolGroups.push(n.schoolId);
    }
  }

  if (layoutMode === 'radial') {
    const cx = 900;
    const cy = 620;
    if (hubTower) hubTower.position = { x: cx, y: cy };
    if (hubRouter) hubRouter.position = { x: cx, y: cy - 135 };
    if (hubSwitch) hubSwitch.position = { x: cx - 250, y: cy - 135 };
    if (hubServer) hubServer.position = { x: cx - 250, y: cy - 270 };

    const count = Math.max(1, schoolGroups.length);
    const radius1 = Math.max(360, count * 42);
    schoolGroups.forEach((sid, idx) => {
      const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const groupNodes = updated.filter((n) => n.schoolId === sid);
      const order: SchoolTopologyNode['type'][] = [
        'remote-tower',
        'school-router',
        'access-switch',
        'end-device',
      ];
      groupNodes.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
      groupNodes.forEach((node, step) => {
        const r = radius1 + step * 155;
        node.position = {
          x: Math.round(cx + cos * r),
          y: Math.round(cy + sin * r),
        };
      });
    });

    // Any manually added custom nodes without known group
    let extraIdx = 0;
    for (const node of updated) {
      if (node.position.x === 0 && node.position.y === 0 && node.id !== 'hub-main-tower') {
        node.position = { x: 80 + (extraIdx % 4) * 250, y: 80 + Math.floor(extraIdx / 4) * 140 };
        extraIdx++;
      }
    }
    return updated;
  }

  if (layoutMode === 'hierarchical') {
    const colWidth = 265;
    const totalCols = Math.max(4, schoolGroups.length);
    const totalSpan = (totalCols - 1) * colWidth;
    const centerX = Math.max(520, totalSpan / 2 + 60);

    if (hubServer) hubServer.position = { x: centerX - 300, y: 40 };
    if (hubSwitch) hubSwitch.position = { x: centerX - 100, y: 175 };
    if (hubRouter) hubRouter.position = { x: centerX + 100, y: 175 };
    if (hubTower) hubTower.position = { x: centerX, y: 315 };

    const startX = centerX - ((schoolGroups.length - 1) * colWidth) / 2;
    schoolGroups.forEach((sid, idx) => {
      const x = Math.round(startX + idx * colWidth);
      const bridge = updated.find((n) => n.schoolId === sid && n.type === 'remote-tower');
      const router = updated.find((n) => n.schoolId === sid && n.type === 'school-router');
      const sw = updated.find((n) => n.schoolId === sid && n.type === 'access-switch');
      const end = updated.find((n) => n.schoolId === sid && n.type === 'end-device');

      if (bridge) bridge.position = { x, y: 500 };
      if (router) router.position = { x, y: 645 };
      if (sw) sw.position = { x, y: 790 };
      if (end) end.position = { x, y: 935 };
    });

    let extraIdx = 0;
    for (const node of updated) {
      if (
        !node.isCentral &&
        !['remote-tower', 'school-router', 'access-switch', 'end-device'].includes(node.type)
      ) {
        node.position = { x: 40 + extraIdx * 250, y: 40 };
        extraIdx++;
      }
    }
    return updated;
  }

  // Default: Symmetric Left-Right Star Topology centered around Tanauan South Central School Hub
  const leftCount = Math.ceil(schoolGroups.length / 2);
  const rightCount = schoolGroups.length - leftCount;
  const maxSide = Math.max(1, leftCount, rightCount);
  const rowStep = 148;
  const totalHeight = Math.max(480, (maxSide - 1) * rowStep + 240);
  const centerY = Math.round(totalHeight / 2);
  const centerX = 1120;

  if (hubServer) hubServer.position = { x: centerX, y: centerY - 290 };
  if (hubSwitch) hubSwitch.position = { x: centerX, y: centerY - 150 };
  if (hubRouter) hubRouter.position = { x: centerX, y: centerY - 10 };
  if (hubTower) hubTower.position = { x: centerX, y: centerY + 135 };

  const leftStartY = centerY - ((leftCount - 1) * rowStep) / 2;
  const rightStartY = centerY - ((rightCount - 1) * rowStep) / 2;

  schoolGroups.forEach((sid, idx) => {
    const isLeft = idx < leftCount;
    const localIdx = isLeft ? idx : idx - leftCount;
    const y = Math.round(isLeft ? leftStartY + localIdx * rowStep : rightStartY + localIdx * rowStep);

    const bridge = updated.find((n) => n.schoolId === sid && n.type === 'remote-tower');
    const router = updated.find((n) => n.schoolId === sid && n.type === 'school-router');
    const sw = updated.find((n) => n.schoolId === sid && n.type === 'access-switch');
    const end = updated.find((n) => n.schoolId === sid && n.type === 'end-device');

    if (isLeft) {
      if (bridge) bridge.position = { x: centerX - 340, y };
      if (router) router.position = { x: centerX - 600, y };
      if (sw) sw.position = { x: centerX - 860, y };
      if (end) end.position = { x: centerX - 1120, y };
    } else {
      if (bridge) bridge.position = { x: centerX + 340, y };
      if (router) router.position = { x: centerX + 600, y };
      if (sw) sw.position = { x: centerX + 860, y };
      if (end) end.position = { x: centerX + 1120, y };
    }
  });

  return updated;
}

export function generateIpAddressingPlan(
  nodes: SchoolTopologyNode[],
  schools: SchoolWirelessProfile[]
): { nodes: SchoolTopologyNode[]; schools: SchoolWirelessProfile[] } {
  const schoolIndexMap = new Map<string, number>();
  let nextIdx = 1;
  for (const node of nodes) {
    if (!node.isCentral && node.schoolId && !schoolIndexMap.has(node.schoolId)) {
      schoolIndexMap.set(node.schoolId, nextIdx++);
    }
  }

  let extraCustomOctet = 200;

  const updatedNodes = nodes.map((node) => {
    if (node.isCentral) {
      if (node.type === 'central-server') {
        return {
          ...node,
          ipAddress: '10.10.0.10',
          subnetMask: '255.255.255.0',
          defaultGateway: '10.10.0.1',
          vlanId: 10,
        };
      }
      if (node.type === 'core-switch') {
        return {
          ...node,
          ipAddress: '10.10.0.2',
          subnetMask: '255.255.255.0',
          defaultGateway: '10.10.0.1',
          vlanId: 10,
        };
      }
      if (node.type === 'core-router') {
        return {
          ...node,
          ipAddress: '10.10.0.1',
          subnetMask: '255.255.255.0',
          defaultGateway: '203.177.40.1',
          vlanId: 10,
          dhcpEnabled: true,
          dhcpRangeStart: '10.10.0.100',
          dhcpRangeEnd: '10.10.0.200',
        };
      }
      if (node.type === 'central-tower') {
        return {
          ...node,
          ipAddress: '10.20.0.2',
          subnetMask: '255.255.255.0',
          defaultGateway: '10.20.0.1',
          vlanId: 99,
        };
      }
    }

    const sIdx = schoolIndexMap.get(node.schoolId);
    if (typeof sIdx === 'number') {
      const vlanId = 10 + sIdx * 10;
      const subnet = `10.10.${sIdx}`;
      if (node.type === 'remote-tower') {
        return {
          ...node,
          ipAddress: `10.20.0.${10 + sIdx}`,
          subnetMask: '255.255.255.0',
          defaultGateway: '10.20.0.1',
          vlanId: 99,
        };
      }
      if (node.type === 'school-router') {
        return {
          ...node,
          ipAddress: `${subnet}.1`,
          subnetMask: '255.255.255.0',
          defaultGateway: '10.20.0.1',
          vlanId,
          dhcpEnabled: true,
          dhcpRangeStart: `${subnet}.50`,
          dhcpRangeEnd: `${subnet}.200`,
        };
      }
      if (node.type === 'access-switch') {
        return {
          ...node,
          ipAddress: `${subnet}.2`,
          subnetMask: '255.255.255.0',
          defaultGateway: `${subnet}.1`,
          vlanId,
        };
      }
      if (node.type === 'end-device') {
        return {
          ...node,
          ipAddress: `${subnet}.50`,
          subnetMask: '255.255.255.0',
          defaultGateway: `${subnet}.1`,
          vlanId,
          dhcpEnabled: true,
        };
      }
    }

    const hostOctet = extraCustomOctet++;
    return {
      ...node,
      ipAddress: `10.10.250.${Math.min(254, hostOctet)}`,
      subnetMask: '255.255.255.0',
      defaultGateway: '10.10.250.1',
    };
  });

  const updatedSchools = schools.map((s) => {
    const sIdx = schoolIndexMap.get(s.schoolId);
    if (typeof sIdx !== 'number') return s;
    return {
      ...s,
      subnetCidr: `10.10.${sIdx}.0/24`,
      vlanId: 10 + sIdx * 10,
    };
  });

  return { nodes: updatedNodes, schools: updatedSchools };
}

export function validateTopologyNetwork(nodes: SchoolTopologyNode[]): IpValidationIssue[] {
  const issues: IpValidationIssue[] = [];
  const ipOwners = new Map<string, SchoolTopologyNode[]>();

  for (const node of nodes) {
    const ip = node.ipAddress.trim();
    if (!isValidIpv4(ip)) {
      issues.push({
        nodeId: node.id,
        hostname: node.hostname,
        severity: 'error',
        message: `Invalid IPv4 address "${node.ipAddress}"`,
      });
    } else {
      const list = ipOwners.get(ip) || [];
      list.push(node);
      ipOwners.set(ip, list);
    }

    if (!isValidSubnetMask(node.subnetMask)) {
      issues.push({
        nodeId: node.id,
        hostname: node.hostname,
        severity: 'error',
        message: `Invalid subnet mask "${node.subnetMask}"`,
      });
    }

    if (node.defaultGateway.trim() && !isValidIpv4(node.defaultGateway)) {
      issues.push({
        nodeId: node.id,
        hostname: node.hostname,
        severity: 'error',
        message: `Invalid default gateway "${node.defaultGateway}"`,
      });
    }

    if (
      node.type === 'access-switch' ||
      node.type === 'end-device' ||
      node.type === 'central-server' ||
      node.type === 'core-switch'
    ) {
      if (
        isValidIpv4(ip) &&
        isValidIpv4(node.defaultGateway) &&
        isValidSubnetMask(node.subnetMask) &&
        !sameSubnet(ip, node.defaultGateway, node.subnetMask)
      ) {
        issues.push({
          nodeId: node.id,
          hostname: node.hostname,
          severity: 'warning',
          message: `Gateway ${node.defaultGateway} is outside local subnet ${ip}/${node.subnetMask}`,
        });
      }
    }

    if (node.vlanId < 1 || node.vlanId > 4094) {
      issues.push({
        nodeId: node.id,
        hostname: node.hostname,
        severity: 'error',
        message: `VLAN ID ${node.vlanId} must be between 1 and 4094`,
      });
    }
  }

  for (const [ip, owners] of ipOwners.entries()) {
    if (owners.length > 1) {
      for (const owner of owners) {
        issues.push({
          nodeId: owner.id,
          hostname: owner.hostname,
          severity: 'error',
          message: `Duplicate IP address ${ip} shared with ${owners
            .filter((o) => o.id !== owner.id)
            .map((o) => o.hostname)
            .join(', ')}`,
        });
      }
    }
  }

  return issues;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildStandaloneTopologySvg(project: SchoolTopologyProject): string {
  const nodeW = 200;
  const nodeH = 74;
  const pad = 70;

  if (project.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"></svg>`;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of project.nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + nodeW);
    maxY = Math.max(maxY, n.position.y + nodeH);
  }

  const width = Math.max(960, Math.round(maxX - minX + pad * 2));
  const height = Math.max(600, Math.round(maxY - minY + pad * 2 + 50));
  const offsetX = pad - minX;
  const offsetY = pad + 42 - minY;

  const nodeMap = new Map(project.nodes.map((n) => [n.id, n]));

  const linkElements = project.links
    .map((lnk) => {
      const src = nodeMap.get(lnk.source);
      const tgt = nodeMap.get(lnk.target);
      if (!src || !tgt) return '';
      const x1 = Math.round(src.position.x + offsetX + nodeW / 2);
      const y1 = Math.round(src.position.y + offsetY + nodeH / 2);
      const x2 = Math.round(tgt.position.x + offsetX + nodeW / 2);
      const y2 = Math.round(tgt.position.y + offsetY + nodeH / 2);
      const mx = Math.round((x1 + x2) / 2);
      const my = Math.round((y1 + y2) / 2);

      const isWireless = lnk.medium === 'wireless';
      const stroke = isWireless
        ? lnk.wirelessStatus === 'Validated'
          ? '#10B981'
          : lnk.wirelessStatus === 'Configured'
          ? '#F59E0B'
          : '#22D3EE'
        : '#38BDF8';
      const dash = isWireless ? 'stroke-dasharray="7 5"' : '';
      return `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${
        isWireless ? 2.5 : 1.75
      }" ${dash} />
        <rect x="${mx - 58}" y="${my - 10}" width="116" height="20" rx="4" fill="#0B1222" stroke="${stroke}" stroke-opacity="0.6" />
        <text x="${mx}" y="${my + 3}" text-anchor="middle" fill="#E2E8F0" font-family="monospace" font-size="9">${escapeXml(
        lnk.label
      )}</text>
      `;
    })
    .join('\n');

  const nodeElements = project.nodes
    .map((n) => {
      const x = Math.round(n.position.x + offsetX);
      const y = Math.round(n.position.y + offsetY);
      const border = n.isCentral ? '#22D3EE' : n.type === 'remote-tower' ? '#38BDF8' : '#334155';
      const bg = n.isCentral ? '#0B172C' : '#0B1222';
      return `
        <g transform="translate(${x}, ${y})">
          <rect width="${nodeW}" height="${nodeH}" rx="10" fill="${bg}" stroke="${border}" stroke-width="1.5" />
          <text x="12" y="22" fill="#F1F5F9" font-family="sans-serif" font-size="11" font-weight="600">${escapeXml(
            n.label.slice(0, 28)
          )}</text>
          <text x="12" y="38" fill="#94A3B8" font-family="monospace" font-size="10">${escapeXml(
            `${n.hostname} · ${n.ipAddress}`
          )}</text>
          <text x="12" y="56" fill="#22D3EE" font-family="monospace" font-size="9">${escapeXml(
            `VLAN ${n.vlanId} · ${n.schoolName.slice(0, 24)}`
          )}</text>
        </g>
      `;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#060B17" />
  <text x="24" y="32" fill="#F8FAFC" font-family="sans-serif" font-size="16" font-weight="700">${escapeXml(
    project.name
  )}</text>
  <text x="24" y="50" fill="#94A3B8" font-family="sans-serif" font-size="11">${escapeXml(
    `Central Hub: ${project.centralSchool.name} (${project.centralSchool.lat.toFixed(
      5
    )}, ${project.centralSchool.lng.toFixed(5)}) · Planning Radius: ${project.radiusKm} km · ${
      project.schools.length
    } Selected Schools`
  )}</text>
  ${linkElements}
  ${nodeElements}
</svg>`;
}

export function exportTopologyAsSvg(project: SchoolTopologyProject): void {
  const svg = buildStandaloneTopologySvg(project);
  downloadBlob(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
    `${project.id}-topology.svg`
  );
}

export async function exportTopologyAsPng(project: SchoolTopologyProject): Promise<void> {
  const svgString = buildStandaloneTopologySvg(project);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to rasterize topology SVG'));
      image.src = url;
    });

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#060B17';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    );
    if (!pngBlob) throw new Error('Failed to encode PNG');
    downloadBlob(pngBlob, `${project.id}-topology.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function csvCell(val: string | number | boolean | undefined): string {
  const str = val === undefined ? '' : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export function exportSchoolsCsv(project: SchoolTopologyProject): void {
  const headers = [
    'School Name',
    'Category',
    'Verification Status',
    'Address',
    'Latitude',
    'Longitude',
    'Geodesic Distance (km)',
    'Proposed Wireless Link',
    'Suggested Equipment',
    'LOS Requirement',
    'LOS Validated',
    'Connection Status',
    'LAN Subnet',
    'VLAN ID',
  ];
  const rows = project.schools.map((s) =>
    [
      csvCell(s.schoolName),
      csvCell(s.category),
      csvCell(s.verificationStatus),
      csvCell(s.address),
      csvCell(s.lat.toFixed(6)),
      csvCell(s.lng.toFixed(6)),
      csvCell(s.distanceKm.toFixed(2)),
      csvCell(s.proposedConnection),
      csvCell(s.suggestedEquipment),
      csvCell(s.losRequirement),
      csvCell(s.losValidated ? 'Yes' : 'No (Warning: Unvalidated)'),
      csvCell(s.connectionStatus),
      csvCell(s.subnetCidr),
      csvCell(s.vlanId),
    ].join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${project.id}-school-connectivity.csv`
  );
}

export function exportIpPlanCsv(project: SchoolTopologyProject): void {
  const headers = [
    'School / Site',
    'Device Label',
    'Hostname',
    'Role',
    'Model',
    'IP Address',
    'Subnet Mask',
    'Default Gateway',
    'VLAN ID',
    'DHCP Enabled',
    'DHCP Pool',
    'Routing Mode',
  ];
  const rows = project.nodes.map((n) =>
    [
      csvCell(n.schoolName),
      csvCell(n.label),
      csvCell(n.hostname),
      csvCell(n.type),
      csvCell(n.model),
      csvCell(n.ipAddress),
      csvCell(n.subnetMask),
      csvCell(n.defaultGateway),
      csvCell(n.vlanId),
      csvCell(n.dhcpEnabled ? 'Yes' : 'No'),
      csvCell(n.dhcpEnabled && n.dhcpRangeStart ? `${n.dhcpRangeStart} - ${n.dhcpRangeEnd}` : 'N/A'),
      csvCell(n.routingMode),
    ].join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${project.id}-ip-addressing-plan.csv`
  );
}

export function exportNetworkDesignPdf(project: SchoolTopologyProject): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 16;

  const ensurePage = (needed = 12) => {
    if (y + needed > 280) {
      doc.addPage();
      y = 16;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('NetPulse NOC · School Network Design Documentation', 14, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Project: ${project.name}`, 14, y);
  y += 5;
  doc.text(
    `Central Hub: ${project.centralSchool.name} (${project.centralSchool.lat.toFixed(
      6
    )}, ${project.centralSchool.lng.toFixed(6)})`,
    14,
    y
  );
  y += 5;
  doc.text(
    `Architecture: Star Topology · Planning Radius: ${project.radiusKm} km · Generated: ${new Date(
      project.updatedAt
    ).toLocaleString()}`,
    14,
    y
  );
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(
    'PLANNING NOTICE: The 5 km radius is an initial planning boundary only. Actual wireless connectivity requires',
    14,
    y
  );
  y += 4;
  doc.text(
    'site line-of-sight (LOS), Fresnel zone clearance, and RF link budget validation before field deployment.',
    14,
    y
  );
  y += 8;

  doc.setFontSize(11);
  doc.text(`1. Selected Schools & Wireless Links (${project.schools.length})`, 14, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const s of project.schools) {
    ensurePage(16);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `• ${s.schoolName} [${s.distanceKm.toFixed(2)} km · ${s.verificationStatus.toUpperCase()}]`,
      14,
      y
    );
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text(
      `  Link: ${s.proposedConnection} | Status: ${s.connectionStatus} | LOS Validated: ${
        s.losValidated ? 'Yes' : 'No'
      }`,
      14,
      y
    );
    y += 4;
    doc.text(`  Subnet: ${s.subnetCidr} (VLAN ${s.vlanId}) | Equipment: ${s.suggestedEquipment}`, 14, y);
    y += 5;
  }

  y += 4;
  ensurePage(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`2. IP Addressing & VLAN Plan (${project.nodes.length} Devices)`, 14, y);
  y += 6;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  for (const n of project.nodes) {
    ensurePage(6);
    const line = `${n.hostname.padEnd(16)} ${n.ipAddress.padEnd(16)} ${n.subnetMask.padEnd(
      16
    )} GW:${n.defaultGateway.padEnd(15)} VLAN:${String(n.vlanId).padEnd(5)} ${n.label}`;
    doc.text(line.slice(0, 108), 14, y);
    y += 4.2;
  }

  doc.save(`${project.id}-network-design.pdf`);
}

export function exportDeviceConfigsAndPacketTracerGuide(project: SchoolTopologyProject): void {
  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push('NETPULSE NOC - DEVICE CONFIGURATIONS & PACKET TRACER IMPLEMENTATION GUIDE');
  lines.push('================================================================================');
  lines.push(`Project Name : ${project.name}`);
  lines.push(`Central Hub  : ${project.centralSchool.name} (${project.centralSchool.lat}, ${project.centralSchool.lng})`);
  lines.push(`Radius       : ${project.radiusKm} km (Initial Planning Boundary)`);
  lines.push(`Generated At : ${new Date().toISOString()}`);
  lines.push('');
  lines.push('NOTE ON CISCO PACKET TRACER (.pkt):');
  lines.push('Native binary .pkt files are proprietary to Cisco Packet Tracer and are NOT');
  lines.push('generated directly by this web application. Follow the exact device list, port');
  lines.push('cabling map, and IOS CLI commands below to assemble and verify this topology in');
  lines.push('Cisco Packet Tracer.');
  lines.push('');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('SECTION 1: PACKET TRACER DEVICE & PORT CABLING MAP');
  lines.push('--------------------------------------------------------------------------------');

  const nodeMap = new Map(project.nodes.map((n) => [n.id, n]));
  for (const lnk of project.links) {
    const src = nodeMap.get(lnk.source);
    const tgt = nodeMap.get(lnk.target);
    if (!src || !tgt) continue;
    lines.push(
      `[LINK] ${src.hostname} (${src.ipAddress}) <== [${lnk.medium.toUpperCase()} : ${lnk.label}] ==> ${tgt.hostname} (${tgt.ipAddress})`
    );
  }

  lines.push('');
  lines.push('--------------------------------------------------------------------------------');
  lines.push('SECTION 2: DEVICE CONFIGURATIONS & IOS CLI COMMANDS');
  lines.push('--------------------------------------------------------------------------------');

  for (const n of project.nodes) {
    lines.push('');
    lines.push(`### ${n.hostname} — ${n.label}`);
    lines.push(`Role/Model   : ${n.type} (${n.model})`);
    lines.push(`School Site  : ${n.schoolName}`);
    lines.push(`IP / Mask    : ${n.ipAddress} / ${n.subnetMask} (VLAN ${n.vlanId})`);
    lines.push(`Gateway      : ${n.defaultGateway}`);
    lines.push(`Routing      : ${n.routingMode}`);
    if (n.type === 'core-router' || n.type === 'school-router') {
      lines.push('! --- Cisco IOS Configuration Snippet ---');
      lines.push(`hostname ${n.hostname}`);
      lines.push('!');
      if (n.dhcpEnabled && n.dhcpRangeStart && n.dhcpRangeEnd) {
        const prefix = n.ipAddress.split('.').slice(0, 3).join('.');
        lines.push(`ip dhcp excluded-address ${prefix}.1 ${prefix}.49`);
        lines.push(`ip dhcp pool POOL_VLAN_${n.vlanId}`);
        lines.push(` network ${prefix}.0 ${n.subnetMask}`);
        lines.push(` default-router ${n.ipAddress}`);
        lines.push(' dns-server 10.10.0.10 8.8.8.8');
        lines.push('!');
      }
      for (const iface of n.interfaces) {
        lines.push(`interface ${iface.name}`);
        lines.push(` description ${iface.description}`);
        lines.push(` ip address ${iface.ipAddress} ${iface.subnetMask}`);
        lines.push(' no shutdown');
        lines.push('!');
      }
      if (n.routingMode === 'OSPF Area 0') {
        const netPrefix = n.ipAddress.split('.').slice(0, 3).join('.');
        lines.push('router ospf 1');
        lines.push(` network ${netPrefix}.0 0.0.0.255 area 0`);
        lines.push(' network 10.20.0.0 0.0.0.255 area 0');
      } else {
        lines.push(`ip route 0.0.0.0 0.0.0.0 ${n.defaultGateway}`);
      }
      lines.push('end');
      lines.push('write memory');
    } else if (n.type === 'core-switch' || n.type === 'access-switch') {
      lines.push('! --- Cisco Catalyst Switch Configuration Snippet ---');
      lines.push(`hostname ${n.hostname}`);
      lines.push(`vlan ${n.vlanId}`);
      lines.push(` name ${n.schoolName.replace(/\s+/g, '_').slice(0, 24)}`);
      lines.push(`interface vlan ${n.vlanId}`);
      lines.push(` ip address ${n.ipAddress} ${n.subnetMask}`);
      lines.push(' no shutdown');
      lines.push(`ip default-gateway ${n.defaultGateway}`);
      lines.push('end');
    } else if (n.type === 'central-tower' || n.type === 'remote-tower') {
      lines.push('! --- Outdoor Wireless Radio Configuration Summary ---');
      lines.push(`Radio Mode   : ${n.wirelessMode || 'PtMP Bridge'}`);
      lines.push(`SSID         : ${n.wirelessSsid || 'TSCS-DIVNET-5G'}`);
      lines.push(`Frequency    : ${n.wirelessFrequency || '5.8 GHz'}`);
      lines.push(`Equipment    : ${n.wirelessEquipment || n.model}`);
      lines.push(`LOS Status   : ${n.losValidated ? 'VALIDATED' : 'UNVALIDATED (Field survey required)'}`);
    }
  }

  downloadBlob(
    new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }),
    `${project.id}-configs-and-packet-tracer-guide.txt`
  );
}

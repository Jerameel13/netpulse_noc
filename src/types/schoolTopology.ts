export type SchoolCategory =
  | 'Public Elementary'
  | 'Public High School'
  | 'Private School'
  | 'College / University'
  | 'Preschool / Kindergarten'
  | 'Educational Institution';

export type VerificationStatus = 'verified' | 'unverified';

export type WirelessLinkStatus = 'Proposed' | 'Configured' | 'Validated';

export type SchoolLocationSource = 'google-places' | 'openstreetmap-overpass';

export interface DiscoveredSchool {
  id: string;
  externalId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  distanceMeters: number;
  bearingDeg: number;
  category: SchoolCategory;
  withinRadius: boolean;
  verificationStatus: VerificationStatus;
  verificationReason: string;
  source: SchoolLocationSource;
  placeUri?: string;
  proposedConnectionType: string;
  suggestedEquipment: string;
  losRequirement: string;
  selected?: boolean;
}

export interface CentralSchoolAnchor {
  name: string;
  address: string;
  lat: number;
  lng: number;
  source: SchoolLocationSource;
  verificationStatus: VerificationStatus;
}

export interface SchoolDiscoveryResponse {
  centralSchool: CentralSchoolAnchor;
  radiusKm: number;
  provider: SchoolLocationSource;
  googleMapsEnabled: boolean;
  schoolsInRadius: DiscoveredSchool[];
  schoolsOutsideRadius: DiscoveredSchool[];
  fetchedAt: string;
  warning?: string;
}

export type BuilderNodeType =
  | 'central-tower'
  | 'core-router'
  | 'core-switch'
  | 'central-server'
  | 'remote-tower'
  | 'school-router'
  | 'access-switch'
  | 'end-device';

export type BuilderLinkMedium = 'wireless' | 'wired-fiber' | 'wired-utp';

export type BuilderLayoutMode = 'star' | 'radial' | 'hierarchical';

export interface BuilderInterfaceConfig {
  name: string;
  ipAddress: string;
  subnetMask: string;
  vlanId?: number;
  mode: 'static' | 'dhcp' | 'trunk' | 'wireless-ptmp' | 'wireless-ptp';
  description: string;
}

export interface SchoolTopologyNode {
  id: string;
  type: BuilderNodeType;
  label: string;
  hostname: string;
  schoolId: string;
  schoolName: string;
  isCentral: boolean;
  ipAddress: string;
  subnetMask: string;
  defaultGateway: string;
  vlanId: number;
  dhcpEnabled: boolean;
  dhcpRangeStart?: string;
  dhcpRangeEnd?: string;
  routingMode: 'Static Route' | 'OSPF Area 0' | 'Default Gateway';
  model: string;
  position: { x: number; y: number };
  interfaces: BuilderInterfaceConfig[];
  // Wireless planning properties (applicable to central-tower & remote-tower)
  distanceKm?: number;
  wirelessMode?: string;
  wirelessSsid?: string;
  wirelessFrequency?: string;
  wirelessEquipment?: string;
  losRequirement?: string;
  losValidated?: boolean;
  wirelessStatus?: WirelessLinkStatus;
}

export interface SchoolTopologyLink {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  medium: BuilderLinkMedium;
  label: string;
  bandwidthMbps: number;
  distanceKm?: number;
  wirelessStatus?: WirelessLinkStatus;
  losValidated?: boolean;
}

export interface SchoolWirelessProfile {
  schoolId: string;
  schoolName: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  category: SchoolCategory;
  verificationStatus: VerificationStatus;
  proposedConnection: string;
  losRequirement: string;
  suggestedEquipment: string;
  connectionStatus: WirelessLinkStatus;
  losValidated: boolean;
  subnetCidr: string;
  vlanId: number;
}

export interface SchoolTopologyProject {
  id: string;
  name: string;
  centralSchool: CentralSchoolAnchor;
  radiusKm: number;
  layoutMode: BuilderLayoutMode;
  includeEndDevices: boolean;
  createdAt: string;
  updatedAt: string;
  schools: SchoolWirelessProfile[];
  nodes: SchoolTopologyNode[];
  links: SchoolTopologyLink[];
}

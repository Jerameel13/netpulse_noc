import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SchoolDiscoveryResponse,
  SchoolTopologyProject,
} from '../types/schoolTopology';
import { generateStarTopologyFromSchools } from '../utils/schoolTopologyEngine';

export function useSchoolNetworkPlanner() {
  const [discovery, setDiscovery] = useState<SchoolDiscoveryResponse | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);

  const [project, setProject] = useState<SchoolTopologyProject | null>(null);
  const [originalGeneratedProject, setOriginalGeneratedProject] =
    useState<SchoolTopologyProject | null>(null);
  const [savedProjects, setSavedProjects] = useState<SchoolTopologyProject[]>([]);
  const [saving, setSaving] = useState(false);

  const hasAutoDiscoveredRef = useRef(false);
  const hasAutoSelectedInitialRef = useRef(false);

  const fetchSchools = useCallback(async (targetRadiusKm: number, refresh = false) => {
    setDiscoverLoading(true);
    setDiscoverError(null);
    try {
      const res = await fetch(
        `/api/schools/discover?radiusKm=${encodeURIComponent(targetRadiusKm)}&refresh=${
          refresh ? 'true' : 'false'
        }`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SchoolDiscoveryResponse;
      setDiscovery(data);

      const validIds = data.schoolsInRadius.map((s) => s.id);
      const validIdSet = new Set(validIds);
      if (!hasAutoSelectedInitialRef.current && validIds.length > 0) {
        hasAutoSelectedInitialRef.current = true;
        setSelectedSchoolIds(validIds);
      } else {
        // Keep only previously selected schools that remain inside the new radius
        setSelectedSchoolIds((prev) => prev.filter((id) => validIdSet.has(id)));
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Unable to discover schools');
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  const fetchSavedTopologies = useCallback(async () => {
    try {
      const res = await fetch('/api/school-topologies');
      if (res.ok) {
        const list = (await res.json()) as SchoolTopologyProject[];
        setSavedProjects(list);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    void fetchSavedTopologies();
  }, [fetchSavedTopologies]);

  const ensureInitialized = useCallback(() => {
    if (!hasAutoDiscoveredRef.current) {
      hasAutoDiscoveredRef.current = true;
      void fetchSchools(radiusKm, false);
    }
  }, [fetchSchools, radiusKm]);

  const changeRadius = useCallback(
    (nextRadius: number) => {
      setRadiusKm(nextRadius);
      void fetchSchools(nextRadius, false);
    },
    [fetchSchools]
  );

  const toggleSchool = useCallback((schoolId: string) => {
    setSelectedSchoolIds((prev) =>
      prev.includes(schoolId) ? prev.filter((id) => id !== schoolId) : [...prev, schoolId]
    );
  }, []);

  const selectAllInRadius = useCallback((ids: string[]) => {
    setSelectedSchoolIds(ids);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedSchoolIds([]);
  }, []);

  const generateTopology = useCallback(
    (includeEndDevices = true) => {
      if (!discovery) return null;
      const selectedSet = new Set(selectedSchoolIds);
      const selectedSchools = discovery.schoolsInRadius.filter((s) => selectedSet.has(s.id));
      if (selectedSchools.length === 0) return null;

      const generated = generateStarTopologyFromSchools({
        centralSchool: discovery.centralSchool,
        selectedSchools,
        radiusKm: discovery.radiusKm,
        includeEndDevices,
        layoutMode: 'star',
      });
      setProject(generated);
      setOriginalGeneratedProject(generated);
      return generated;
    },
    [discovery, selectedSchoolIds]
  );

  const toggleEndDevices = useCallback(
    (includeEndDevices: boolean) => {
      if (!discovery || !project) return;
      const selectedIds = new Set(project.schools.map((s) => s.schoolId));
      const matched = discovery.schoolsInRadius.filter((s) => selectedIds.has(s.id));
      if (matched.length === 0) {
        setProject({ ...project, includeEndDevices });
        return;
      }
      const regenerated = generateStarTopologyFromSchools({
        centralSchool: project.centralSchool,
        selectedSchools: matched,
        radiusKm: project.radiusKm,
        includeEndDevices,
        layoutMode: project.layoutMode,
        projectName: project.name,
      });
      setProject(regenerated);
      setOriginalGeneratedProject(regenerated);
    },
    [discovery, project]
  );

  const resetToOriginalGenerated = useCallback(() => {
    if (originalGeneratedProject) {
      setProject(originalGeneratedProject);
    }
  }, [originalGeneratedProject]);

  const saveProject = useCallback(async (toSave: SchoolTopologyProject) => {
    setSaving(true);
    try {
      const res = await fetch('/api/school-topologies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      });
      if (res.ok) {
        const list = (await res.json()) as SchoolTopologyProject[];
        setSavedProjects(list);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const loadSavedProject = useCallback((loaded: SchoolTopologyProject) => {
    setProject(loaded);
    setOriginalGeneratedProject(loaded);
  }, []);

  const deleteSavedProject = useCallback(async (projectId: string) => {
    const res = await fetch(`/api/school-topologies/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const list = (await res.json()) as SchoolTopologyProject[];
      setSavedProjects(list);
    }
  }, []);

  return {
    discovery,
    discoverLoading,
    discoverError,
    radiusKm,
    selectedSchoolIds,
    project,
    savedProjects,
    saving,
    ensureInitialized,
    fetchSchools,
    changeRadius,
    toggleSchool,
    selectAllInRadius,
    clearSelection,
    generateTopology,
    setProject,
    resetToOriginalGenerated,
    saveProject,
    loadSavedProject,
    deleteSavedProject,
    toggleEndDevices,
  };
}

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Stage } from '../renderers/konva/Stage';
import { Scene3D } from '../renderers/three/Scene3D';
import { useStore } from '../state/store';
import { fileStorage } from '../services/file-storage';
import { DEFAULT_ZOOM_SCALE } from '../core/constants';
import { HeaderBar } from '../ui/chrome/HeaderBar';
import { Sidebar } from '../ui/panels/Sidebar';
import { WallProperties } from '../ui/panels/WallProperties';
import { FixtureProperties } from '../ui/panels/FixtureProperties';
import { ViewModeToggle } from '../ui/chrome/ViewModeToggle';
import { DebugOverlay } from '../ui/debug/DebugOverlay';

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastProjectIdRef = useRef<string | null>(null);

  const setViewport = useStore((state) => state.setViewport);
  const setScene = useStore((state) => state.setScene);
  const setCurrentProject = useStore((state) => state.setCurrentProject);
  const setLastSavedAt = useStore((state) => state.setLastSavedAt);
  const setIsSaving = useStore((state) => state.setIsSaving);
  const resetProject = useStore((state) => state.resetProject);
  const scene = useStore((state) => state.scene);
  const currentProject = useStore((state) => state.currentProject);
  const viewMode = useStore((state) => state.viewMode);

  const saveTimeoutRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const unmountSaveRef = useRef(false);

  // Save function
  const saveScene = useCallback(async () => {
    if (!projectId || !currentProject || isSavingRef.current) return;

    try {
      isSavingRef.current = true;
      setIsSaving(true);
      
      await fileStorage.saveScene(projectId, scene);
      
      setLastSavedAt(Date.now());
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [projectId, currentProject, scene, setLastSavedAt, setIsSaving]);

  // Load project function
  const loadProject = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);

      const [project, loadedScene] = await Promise.all([
        fileStorage.getProject(projectId),
        fileStorage.loadScene(projectId),
      ]);

      if (!project) {
        setError('Project not found');
        return;
      }

      setCurrentProject(project);

      // Always set scene - either loaded or empty
      if (loadedScene) {
        // ✅ Migrate scene to ensure fixtures map exists (backward compatibility)
        const migratedScene = {
          ...loadedScene,
          fixtures: loadedScene.fixtures || new Map(),
        };
        setScene(migratedScene);
      } else {
        // ✅ Initialize with empty fixtures map
        setScene({ 
          nodes: new Map(), 
          walls: new Map(), 
          rooms: new Map(),
          fixtures: new Map(),
        });
      }

      setLastSavedAt(project.updatedAt);

      // Initialize viewport
      setViewport({
        centerX: window.innerWidth / 2,
        centerY: (window.innerHeight - 48) / 2,
        scale: DEFAULT_ZOOM_SCALE,
      });
    } catch (err) {
      console.error('Failed to load project:', err);
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId, setCurrentProject, setScene, setLastSavedAt, setViewport]);

  // Load project when projectId changes
  useEffect(() => {
    if (!projectId) {
      navigate('/projects');
      return;
    }

    // Only reset and reload if projectId actually changed
    if (lastProjectIdRef.current !== projectId) {
      lastProjectIdRef.current = projectId;
      unmountSaveRef.current = false;
      
      // Reset state before loading new project
      resetProject();
      loadProject();
    }
  }, [projectId, navigate, resetProject, loadProject]);

  // Auto-save on scene changes (debounced)
  useEffect(() => {
    if (!projectId || !currentProject) return;

    // Clear existing timeout
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout
    saveTimeoutRef.current = window.setTimeout(() => {
      saveScene();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [scene, projectId, currentProject, saveScene]);

  // Save on unmount (navigation away) - only once
  useEffect(() => {
    return () => {
      // Only save if we haven't already
      if (!unmountSaveRef.current && projectId && currentProject && scene) {
        unmountSaveRef.current = true;
        fileStorage.saveScene(projectId, scene).catch((err) => {
          console.error('Failed to save on navigation:', err);
        });
      }
    };
  }, [projectId, currentProject, scene]);

  // Handle browser close/refresh - only once
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!unmountSaveRef.current && projectId && currentProject && scene) {
        unmountSaveRef.current = true;
        // Note: This is best-effort, browser may not wait for async operation
        fileStorage.saveScene(projectId, scene).catch((err) => {
          console.error('Failed to save on unload:', err);
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [projectId, currentProject, scene]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading project...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50">
        <div className="text-red-600 mb-4">{error}</div>
        <button
          onClick={() => navigate('/projects')}
          className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 m-0 p-0 bg-gray-50">
      <HeaderBar />
      <Sidebar />
      <WallProperties />
      <ViewModeToggle />
      <DebugOverlay />
      
      <div className="absolute top-12 left-0 right-0 bottom-0">
        {viewMode === '2D' ? <Stage /> : <Scene3D />}
      </div>
    </div>
  );
}
import { create } from 'zustand';
import type { Viewport } from '../renderers/konva/viewport';
import type { Scene } from '../core/domain/types';
import type { ProjectMeta } from '../services/file-storage';
import { DEFAULT_ZOOM_SCALE } from '../core/constants';
import type { Vec2 } from '../core/math/vec';

type WallParams = {
  thicknessMm: number;
  heightMm: number;
  raiseFromFloorMm: number;
};

type DragState = {
  mode: 'wall' | 'node-a' | 'node-b' | null;
  startWorldMm: Vec2 | null;
  offsetAMm: Vec2 | null;
  offsetBMm: Vec2 | null;
  originalSceneSnapshot: Scene | null;
};

type UIState = {
  viewport: Viewport;
  activeTool: 'select' | 'wall' | 'room';
  wallParams: WallParams;
  scene: Scene;
  currentProject: ProjectMeta | null;
  lastSavedAt: number | null;
  isSaving: boolean;
  selectedWallId: string | null;
  hoveredWallId: string | null;
  dragState: DragState;
  snapCandidateA: any | null;
  snapCandidateB: any | null;
  setViewport: (viewport: Viewport) => void;
  setActiveTool: (tool: 'select' | 'wall' | 'room') => void;
  setWallParams: (params: WallParams) => void;
  setScene: (scene: Scene) => void;
  setCurrentProject: (project: ProjectMeta | null) => void;
  setLastSavedAt: (timestamp: number) => void;
  setIsSaving: (saving: boolean) => void;
  resetProject: () => void;
  setSelectedWallId: (id: string | null) => void;
  setHoveredWallId: (id: string | null) => void;
  setDragState: (state: Partial<DragState>) => void;
  setSnapCandidateA: (candidate: any | null) => void;
  setSnapCandidateB: (candidate: any | null) => void;
};

const getEmptyScene = (): Scene => ({
  nodes: new Map(),
  walls: new Map(),
});

const getEmptyDragState = (): DragState => ({
  mode: null,
  startWorldMm: null,
  offsetAMm: null,
  offsetBMm: null,
  originalSceneSnapshot: null,
});

export const useStore = create<UIState>((set, get) => ({
  viewport: {
    centerX: 0,
    centerY: 0,
    scale: DEFAULT_ZOOM_SCALE,
  },
  activeTool: 'wall',
  wallParams: {
    thicknessMm: 150,
    heightMm: 3000,
    raiseFromFloorMm: 0,
  },
  scene: getEmptyScene(),
  currentProject: null,
  lastSavedAt: null,
  isSaving: false,
  selectedWallId: null,
  hoveredWallId: null,
  dragState: getEmptyDragState(),
  snapCandidateA: null,
  snapCandidateB: null,
  setViewport: (viewport) => set({ viewport }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setWallParams: (params) => set({ wallParams: params }),
  setScene: (scene) => set({ scene }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setLastSavedAt: (timestamp) => set({ lastSavedAt: timestamp }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  resetProject: () => set({ 
    scene: getEmptyScene(),
    currentProject: null,
    lastSavedAt: null,
    isSaving: false,
    selectedWallId: null,
    hoveredWallId: null,
    dragState: getEmptyDragState(),
    snapCandidateA: null,
    snapCandidateB: null,
  }),
  setSelectedWallId: (id) => set({ selectedWallId: id }),
  setHoveredWallId: (id) => set({ hoveredWallId: id }),
  setDragState: (newState) => set({ 
    dragState: { ...get().dragState, ...newState } 
  }),
  setSnapCandidateA: (candidate) => set({ snapCandidateA: candidate }),
  setSnapCandidateB: (candidate) => set({ snapCandidateB: candidate }),
}));
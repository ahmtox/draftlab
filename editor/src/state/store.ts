import { create } from 'zustand';
import type { Viewport } from '../renderers/konva/viewport';
import type { Scene } from '../core/domain/types';
import type { ProjectMeta } from '../services/file-storage';
import { DEFAULT_ZOOM_SCALE } from '../core/constants';
import type { Vec2 } from '../core/math/vec';
import { History } from '../core/commands/history';

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
  history: History;
  
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
  undo: () => void;
  redo: () => void;
};

export const useStore = create<UIState>((set, get) => ({
  viewport: {
    centerX: 0,
    centerY: 0,
    scale: DEFAULT_ZOOM_SCALE,
  },
  activeTool: 'select',
  wallParams: {
    thicknessMm: 200,
    heightMm: 2400,
    raiseFromFloorMm: 0,
  },
  scene: {
    nodes: new Map(),
    walls: new Map(),
  },
  currentProject: null,
  lastSavedAt: null,
  isSaving: false,
  selectedWallId: null,
  hoveredWallId: null,
  dragState: {
    mode: null,
    startWorldMm: null,
    offsetAMm: null,
    offsetBMm: null,
    originalSceneSnapshot: null,
  },
  snapCandidateA: null,
  snapCandidateB: null,
  history: new History(),

  setViewport: (viewport) => set({ viewport }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setWallParams: (params) => set({ wallParams: params }),
  setScene: (scene) => set({ scene }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setLastSavedAt: (timestamp) => set({ lastSavedAt: timestamp }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  setSelectedWallId: (id) => set({ selectedWallId: id }),
  setHoveredWallId: (id) => set({ hoveredWallId: id }),
  setDragState: (state) => set((prev) => ({ 
    dragState: { ...prev.dragState, ...state } 
  })),
  setSnapCandidateA: (candidate) => set({ snapCandidateA: candidate }),
  setSnapCandidateB: (candidate) => set({ snapCandidateB: candidate }),

  resetProject: () => set({
    scene: {
      nodes: new Map(),
      walls: new Map(),
    },
    selectedWallId: null,
    hoveredWallId: null,
    dragState: {
      mode: null,
      startWorldMm: null,
      offsetAMm: null,
      offsetBMm: null,
      originalSceneSnapshot: null,
    },
    snapCandidateA: null,
    snapCandidateB: null,
    history: new History(),
  }),

  undo: () => {
    const history = get().history;
    const result = history.undo();
    if (!result.ok) {
      console.error('Undo failed:', result.error);
    }
  },

  redo: () => {
    const history = get().history;
    const result = history.redo();
    if (!result.ok) {
      console.error('Redo failed:', result.error);
    }
  },
}));
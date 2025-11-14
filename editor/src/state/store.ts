import { create } from 'zustand';
import type { Viewport } from '../renderers/konva/viewport';
import type { Scene } from '../core/domain/types';
import type { ProjectMeta } from '../services/file-storage';
import { DEFAULT_ZOOM_SCALE } from '../core/constants';
import type { Vec2 } from '../core/math/vec';
import { History } from '../core/commands/history';
import { detectRooms } from '../core/topology/room-detect';

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
  activeTool: 'select' | 'wall' | 'room' | 'measure';
  wallParams: WallParams;
  scene: Scene;
  currentProject: ProjectMeta | null;
  lastSavedAt: number | null;
  isSaving: boolean;
  selectedWallIds: Set<string>;
  selectedRoomId: string | null;
  hoveredWallId: string | null;
  dragState: DragState;
  snapCandidateA: any | null;
  snapCandidateB: any | null;
  viewMode: '2D' | '3D';
  history: History;
  
  setViewport: (viewport: Viewport) => void;
  setActiveTool: (tool: 'select' | 'wall' | 'room' | 'measure') => void;
  setWallParams: (params: WallParams) => void;
  setScene: (scene: Scene) => void;
  setCurrentProject: (project: ProjectMeta | null) => void;
  setLastSavedAt: (timestamp: number) => void;
  setIsSaving: (saving: boolean) => void;
  resetProject: () => void;
  setSelectedWallIds: (ids: Set<string>) => void;
  setSelectedRoomId: (id: string | null) => void;
  setHoveredWallId: (id: string | null) => void;
  setDragState: (state: Partial<DragState>) => void;
  setSnapCandidateA: (candidate: any | null) => void;
  setSnapCandidateB: (candidate: any | null) => void;
  setViewMode: (mode: '2D' | '3D') => void;
  undo: () => void;
  redo: () => void;
  detectAndUpdateRooms: () => void;
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
    rooms: new Map(),
  },
  currentProject: null,
  lastSavedAt: null,
  isSaving: false,
  selectedWallIds: new Set(),
  selectedRoomId: null,
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
  viewMode: '2D',
  history: new History(),

  setViewport: (viewport) => set({ viewport }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setWallParams: (params) => set({ wallParams: params }),
  
  setScene: (scene) => {
    const currentScene = get().scene;
    
    // ✅ Check if walls or nodes actually changed
    const wallsChanged = currentScene.walls !== scene.walls;
    const nodesChanged = currentScene.nodes !== scene.nodes;
    
    // ✅ Only re-detect rooms if wall/node topology changed
    if (wallsChanged || nodesChanged) {
      const currentRooms = currentScene.rooms;
      
      // Auto-detect rooms based on new topology
      const detectedRooms = detectRooms(scene);
      
      // Build a map of boundary signatures to existing rooms for matching
      const boundaryToRoom = new Map<string, typeof currentRooms extends Map<any, infer R> ? R : never>();
      for (const room of currentRooms.values()) {
        const signature = [...room.boundary].sort().join(',');
        boundaryToRoom.set(signature, room);
      }
      
      // Preserve custom label positions from existing rooms
      const roomsMap = new Map(
        detectedRooms.map(detectedRoom => {
          const signature = [...detectedRoom.boundary].sort().join(',');
          const existingRoom = boundaryToRoom.get(signature);

          // If found, preserve the ID, room number, and custom label position
          if (existingRoom) {
            return [existingRoom.id, {
              ...detectedRoom,
              id: existingRoom.id,
              roomNumber: existingRoom.roomNumber,
              labelPositionMm: existingRoom.labelPositionMm, // ✅ Preserve custom position
            }];
          }

          // New room - use detected values
          return [detectedRoom.id, detectedRoom];
        })
      );
      
      set({ 
        scene: {
          ...scene,
          rooms: roomsMap,
        }
      });
    } else {
      // ✅ Walls/nodes didn't change - just update scene directly (preserves room changes)
      set({ scene });
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),
  setLastSavedAt: (timestamp) => set({ lastSavedAt: timestamp }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  setSelectedWallIds: (ids) => set({ selectedWallIds: ids }),
  setSelectedRoomId: (id) => set({ selectedRoomId: id }),
  setHoveredWallId: (id) => set({ hoveredWallId: id }),
  setDragState: (state) => set((prev) => ({ 
    dragState: { ...prev.dragState, ...state } 
  })),
  setSnapCandidateA: (candidate) => set({ snapCandidateA: candidate }),
  setSnapCandidateB: (candidate) => set({ snapCandidateB: candidate }),
  setViewMode: (mode) => set({ viewMode: mode }),

  resetProject: () => set({
    scene: {
      nodes: new Map(),
      walls: new Map(),
      rooms: new Map(),
    },
    selectedWallIds: new Set(),
    selectedRoomId: null,
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

  detectAndUpdateRooms: () => {
    const scene = get().scene;
    const detectedRooms = detectRooms(scene);
    const roomsMap = new Map(detectedRooms.map(r => [r.id, r]));
    
    set({
      scene: {
        ...scene,
        rooms: roomsMap,
      }
    });
  },
}));
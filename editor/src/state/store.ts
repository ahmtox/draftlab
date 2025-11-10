import { create } from 'zustand';
import type { Viewport } from '../renderers/konva/viewport';
import type { Scene } from '../core/domain/types';
import { DEFAULT_ZOOM_SCALE } from '../core/constants';

type WallParams = {
  thicknessMm: number;
  heightMm: number;
  raiseFromFloorMm: number;
};

type UIState = {
  viewport: Viewport;
  activeTool: 'select' | 'wall' | 'room';
  wallParams: WallParams;
  scene: Scene;
  setViewport: (viewport: Viewport) => void;
  setActiveTool: (tool: 'select' | 'wall' | 'room') => void;
  setWallParams: (params: WallParams) => void;
  setScene: (scene: Scene) => void;
};

export const useStore = create<UIState>((set) => ({
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
  scene: {
    nodes: new Map(),
    walls: new Map(),
  },
  setViewport: (viewport) => set({ viewport }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setWallParams: (params) => set({ wallParams: params }),
  setScene: (scene) => set({ scene }),
}));
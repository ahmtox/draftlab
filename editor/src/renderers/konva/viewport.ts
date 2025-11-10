import type { Vec2 } from '../../core/math/vec';

export type Viewport = {
  centerX: number;
  centerY: number;
  scale: number; // pixels per mm
};

export function worldToScreen(worldMm: Vec2, viewport: Viewport): Vec2 {
  return {
    x: viewport.centerX + worldMm.x * viewport.scale,
    y: viewport.centerY - worldMm.y * viewport.scale,
  };
}

export function screenToWorld(screenPx: Vec2, viewport: Viewport): Vec2 {
  return {
    x: (screenPx.x - viewport.centerX) / viewport.scale,
    y: (viewport.centerY - screenPx.y) / viewport.scale,
  };
}
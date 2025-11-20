import type { Vec2 } from '../../core/math/vec';
import type { Scene } from '../../core/domain/types';
import type { Viewport } from '../../renderers/konva/viewport';
import { worldToScreen } from '../../renderers/konva/viewport';
import { MIN_DRAG_DISTANCE_PX } from './types';
import type { SelectToolState, SelectToolCallbacks } from './types';
import {
  getMarqueeBox,
  isPointInBox,
  lineSegmentIntersectsRect,
} from './geometry';

export function handleMarqueePending(
  screenPx: Vec2,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): void {
  const startScreen = state.context.marqueeStart!;
  const dx = screenPx.x - startScreen.x;
  const dy = screenPx.y - startScreen.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > MIN_DRAG_DISTANCE_PX) {
    state.context = {
      ...state.context,
      state: 'marquee',
      marqueeCurrent: { x: screenPx.x, y: screenPx.y },
    };
    callbacks.onStateChange(state.context);
  }
}

export function handleMarqueeMove(
  screenPx: Vec2,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): void {
  state.context = {
    ...state.context,
    marqueeCurrent: { x: screenPx.x, y: screenPx.y },
  };
  callbacks.onStateChange(state.context);
}

export function handleMarqueeCommit(
  scene: Scene,
  viewport: Viewport,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): boolean {
  const marqueeBox = getMarqueeBox(
    state.context.marqueeStart,
    state.context.marqueeCurrent
  );

  if (!marqueeBox) {
    return false;
  }

  const selectedWalls = new Set<string>();

  for (const wall of scene.walls.values()) {
    const nodeA = scene.nodes.get(wall.nodeAId);
    const nodeB = scene.nodes.get(wall.nodeBId);
    if (!nodeA || !nodeB) continue;

    const screenA = worldToScreen(nodeA, viewport);
    const screenB = worldToScreen(nodeB, viewport);

    if (
      isPointInBox(screenA, marqueeBox) ||
      isPointInBox(screenB, marqueeBox) ||
      lineSegmentIntersectsRect(screenA, screenB, marqueeBox)
    ) {
      selectedWalls.add(wall.id);
    }
  }

  const newSelection = new Set([
    ...state.context.selectedWallIds,
    ...selectedWalls,
  ]);

  state.context = {
    ...state.context,
    state: 'idle',
    selectedWallIds: newSelection,
    dragMode: null,
    marqueeStart: null,
    marqueeCurrent: null,
  };

  callbacks.onStateChange(state.context);
  return true;
}
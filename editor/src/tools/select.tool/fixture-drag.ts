import type { Vec2 } from '../../core/math/vec';
import type { Scene } from '../../core/domain/types';
import type { Viewport } from '../../renderers/konva/viewport';
import { screenToWorld, worldToScreen } from '../../renderers/konva/viewport';
import { findSnapCandidate } from '../../core/geometry/snapping';
import { hitTestFixtures } from '../../core/geometry/hit-testing';
import * as vec from '../../core/math/vec';
import { NODE_RADIUS_MM } from '../../core/constants';
import type { SelectToolState, SelectToolCallbacks } from './types';

export function handleFixturePointerDown(
  screenPx: Vec2,
  scene: Scene,
  viewport: Viewport,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): boolean {
  const worldPos = screenToWorld(screenPx, viewport);
  const selectedFixtureId = state.getSelectedFixtureId(); // ✅ Use getter function

  if (!selectedFixtureId) return false;

  const fixture = scene.fixtures?.get(selectedFixtureId);
  if (!fixture || !fixture.position) return false;

  const fixtureHit = hitTestFixtures(worldPos, scene, NODE_RADIUS_MM);
  if (fixtureHit !== selectedFixtureId) return false;

  // Start dragging the fixture
  state.draggingFixtureId = selectedFixtureId;
  state.originalFixturePosition = {
    x: fixture.position.x,
    y: fixture.position.y,
  };

  state.context = {
    ...state.context,
    state: 'dragging',
    dragMode: 'fixture',
    dragStartMm: worldPos,
    dragCurrentMm: worldPos,
    snapCandidates: [],
  };

  callbacks.onStateChange(state.context);
  return true;
}

export function handleFixtureDragMove(
  screenPx: Vec2,
  scene: Scene,
  viewport: Viewport,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): void {
  if (
    !state.draggingFixtureId ||
    !state.originalFixturePosition ||
    !state.context.dragStartMm
  ) {
    return;
  }

  const worldPos = screenToWorld(screenPx, viewport);
  const delta = vec.sub(worldPos, state.context.dragStartMm);
  const newPosition = vec.add(state.originalFixturePosition, delta);

  // Apply snapping
  const snapResult = findSnapCandidate(
    worldToScreen(newPosition, viewport),
    scene,
    viewport,
    {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: false,
      snapToAngles: false,
      snapToGuidelines: true,
    }
  );

  const finalPosition = snapResult.snapped ? snapResult.point : newPosition;

  state.context = {
    ...state.context,
    dragCurrentMm: worldPos,
    snapCandidates: snapResult.candidate ? [snapResult.candidate] : [],
  };

  callbacks.onFixtureDragUpdate(state.draggingFixtureId, finalPosition);
  callbacks.onStateChange(state.context);
}

export function handleFixtureDragCommit(
  screenPx: Vec2,
  scene: Scene,
  viewport: Viewport,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): boolean {
  if (
    !state.draggingFixtureId ||
    !state.originalFixturePosition ||
    !state.context.dragStartMm
  ) {
    return false;
  }

  const worldPos = screenToWorld(screenPx, viewport);
  const delta = vec.sub(worldPos, state.context.dragStartMm);
  const newPosition = vec.add(state.originalFixturePosition, delta);

  // Apply final snapping
  const snapResult = findSnapCandidate(
    worldToScreen(newPosition, viewport),
    scene,
    viewport,
    {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: false,
      snapToAngles: false,
      snapToGuidelines: true,
    }
  );

  const finalPosition = snapResult.snapped ? snapResult.point : newPosition;

  callbacks.onFixtureDragCommit(
    state.draggingFixtureId,
    state.originalFixturePosition,
    finalPosition
  );

  state.context = {
    ...state.context,
    state: 'idle',
    dragMode: null,
    dragStartMm: null,
    dragCurrentMm: null,
    snapCandidates: [],
  };

  state.originalFixturePosition = null;
  state.draggingFixtureId = null;

  callbacks.onStateChange(state.context);
  return true;
}
import type { Vec2 } from '../../core/math/vec';
import type { Scene } from '../../core/domain/types';
import type { Viewport } from '../../renderers/konva/viewport';
import { worldToScreen } from '../../renderers/konva/viewport';
import {
  findSnapCandidate,
  findAllSnapCandidates,
} from '../../core/geometry/snapping';
import * as vec from '../../core/math/vec';
import type { SelectToolState, SelectToolCallbacks, DragMode } from './types';
import {
  filterSnapCandidatesForDisplay,
  findRigidBodySnapDelta,
} from './snapping';

export function getExcludedNodeIds(
  scene: Scene,
  selectedWallIds: Set<string>
): Set<string> {
  const excluded = new Set<string>();

  for (const wallId of selectedWallIds) {
    const wall = scene.walls.get(wallId);
    if (!wall) continue;

    excluded.add(wall.nodeAId);
    excluded.add(wall.nodeBId);
  }

  return excluded;
}

export function getExcludedWallIds(
  scene: Scene,
  selectedWallIds: Set<string>
): Set<string> {
  const excluded = new Set<string>(selectedWallIds);

  const selectedNodeIds = new Set<string>();
  for (const wallId of selectedWallIds) {
    const wall = scene.walls.get(wallId);
    if (!wall) continue;
    selectedNodeIds.add(wall.nodeAId);
    selectedNodeIds.add(wall.nodeBId);
  }

  for (const wall of scene.walls.values()) {
    if (
      selectedNodeIds.has(wall.nodeAId) ||
      selectedNodeIds.has(wall.nodeBId)
    ) {
      excluded.add(wall.id);
    }
  }

  return excluded;
}

export function startMultiWallDrag(
  triggerWallId: string,
  hitMode: DragMode,
  worldPos: Vec2,
  scene: Scene,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): void {
  state.originalSceneSnapshot = {
    nodes: new Map(scene.nodes),
    walls: new Map(scene.walls),
    rooms: scene.rooms,
    fixtures: scene.fixtures,
  };

  state.originalNodePositions.clear();

  for (const wallId of state.context.selectedWallIds) {
    const wall = scene.walls.get(wallId);
    if (!wall) continue;

    const nodeA = scene.nodes.get(wall.nodeAId)!;
    const nodeB = scene.nodes.get(wall.nodeBId)!;

    if (!state.originalNodePositions.has(wall.nodeAId)) {
      state.originalNodePositions.set(wall.nodeAId, {
        x: nodeA.x,
        y: nodeA.y,
      });
    }
    if (!state.originalNodePositions.has(wall.nodeBId)) {
      state.originalNodePositions.set(wall.nodeBId, {
        x: nodeB.x,
        y: nodeB.y,
      });
    }
  }

  state.context = {
    ...state.context,
    state: 'dragging',
    dragMode: hitMode,
    dragStartMm: { x: worldPos.x, y: worldPos.y },
    activeSnaps: new Map(),
    snapCandidates: [],
  };

  callbacks.onStateChange(state.context);
}

export function handleSingleNodeDragMove(
  worldPos: Vec2,
  scene: Scene,
  viewport: Viewport,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): boolean {
  if (
    state.context.dragMode !== 'node-a' &&
    state.context.dragMode !== 'node-b'
  ) {
    return false;
  }

  const singleWallId = Array.from(state.context.selectedWallIds)[0];
  const wall = scene.walls.get(singleWallId);
  if (!wall) return false;

  const dragNodeId =
    state.context.dragMode === 'node-a' ? wall.nodeAId : wall.nodeBId;
  const anchorNodeId =
    state.context.dragMode === 'node-a' ? wall.nodeBId : wall.nodeAId;

  const anchorNode = scene.nodes.get(anchorNodeId)!;
  const originalDragPos = state.originalNodePositions.get(dragNodeId)!;

  const delta = vec.sub(worldPos, state.context.dragStartMm!);
  const tentativePos = vec.add(originalDragPos, delta);
  const tentativeScreenPx = worldToScreen(tentativePos, viewport);

  const excludedNodeIds = new Set([dragNodeId]);
  const excludedWallIds = getExcludedWallIds(
    scene,
    state.context.selectedWallIds
  );

  const filteredScene: Scene = {
    nodes: scene.nodes,
    walls: new Map(
      Array.from(scene.walls.entries()).filter(
        ([wallId]) => !excludedWallIds.has(wallId)
      )
    ),
    rooms: scene.rooms,
    fixtures: scene.fixtures,
  };

  const snapResult = findSnapCandidate(tentativeScreenPx, filteredScene, viewport, {
    snapToGrid: true,
    snapToNodes: true,
    snapToEdges: true,
    snapToAngles: state.shiftKeyHeld,
    snapToGuidelines: true,
    angleOrigin: anchorNode,
    guidelineOrigin: anchorNode,
    excludeNodeIds: excludedNodeIds,
  });

  const finalDragPos = snapResult.snapped ? snapResult.point : tentativePos;

  const allSnapResults = [
    ...findAllSnapCandidates(
      worldToScreen(finalDragPos, viewport),
      filteredScene,
      viewport,
      {
        snapToGrid: true,
        snapToNodes: true,
        snapToEdges: true,
        snapToAngles: state.shiftKeyHeld,
        snapToGuidelines: true,
        angleOrigin: anchorNode,
        guidelineOrigin: anchorNode,
        excludeNodeIds: excludedNodeIds,
      }
    ),
    ...findAllSnapCandidates(
      worldToScreen(
        state.originalNodePositions.get(anchorNodeId)!,
        viewport
      ),
      filteredScene,
      viewport,
      {
        snapToGrid: false,
        snapToNodes: false,
        snapToEdges: false,
        snapToAngles: false,
        snapToGuidelines: true,
        excludeNodeIds: new Set([anchorNodeId]),
      }
    ),
  ];

  const filteredCandidates =
    filterSnapCandidatesForDisplay(allSnapResults);
  const activeSnaps = new Map<string, string>();

  for (const candidate of filteredCandidates) {
    if (candidate.type === 'node' && candidate.entityId) {
      activeSnaps.set(dragNodeId, candidate.entityId);
    }
  }

  const finalPositions = new Map<string, Vec2>();
  finalPositions.set(dragNodeId, finalDragPos);
  finalPositions.set(
    anchorNodeId,
    state.originalNodePositions.get(anchorNodeId)!
  );

  state.context = {
    ...state.context,
    dragCurrentMm: worldPos,
    activeSnaps,
    snapCandidates: filteredCandidates,
  };

  callbacks.onDragUpdate(state.context.selectedWallIds, finalPositions);
  callbacks.onStateChange(state.context);

  return true;
}

export function handleMultiNodeDragMove(
  worldPos: Vec2,
  scene: Scene,
  viewport: Viewport,
  state: SelectToolState,
  callbacks: SelectToolCallbacks
): void {
  const delta = vec.sub(worldPos, state.context.dragStartMm!);
  const excludedNodeIds = getExcludedNodeIds(
    scene,
    state.context.selectedWallIds
  );
  const excludedWallIds = getExcludedWallIds(
    scene,
    state.context.selectedWallIds
  );

  const filteredScene: Scene = {
    nodes: scene.nodes,
    walls: new Map(
      Array.from(scene.walls.entries()).filter(
        ([wallId]) => !excludedWallIds.has(wallId)
      )
    ),
    rooms: scene.rooms,
    fixtures: scene.fixtures,
  };

  const snapTargets = new Map<
    string,
    { snapPoint: Vec2; candidate: any }[]
  >();

  for (const [nodeId, originalPos] of state.originalNodePositions) {
    const tentativePos = vec.add(originalPos, delta);
    const tentativeScreenPx = worldToScreen(tentativePos, viewport);

    const snapResult = findSnapCandidate(
      tentativeScreenPx,
      filteredScene,
      viewport,
      {
        snapToGrid: true,
        snapToNodes: true,
        snapToEdges: true,
        snapToGuidelines: true,
        excludeNodeIds: excludedNodeIds,
      }
    );

    if (snapResult.snapped && snapResult.candidate) {
      snapTargets.set(nodeId, [
        { snapPoint: snapResult.point, candidate: snapResult.candidate },
      ]);
    }
  }

  const snapResult = findRigidBodySnapDelta(
    state.originalNodePositions,
    delta,
    snapTargets
  );

  const newNodePositions = new Map<string, Vec2>();
  const activeSnaps = new Map<string, string>();
  let snapCandidates: any[] = [];

  if (snapResult) {
    const allCandidates: any[] = [];

    for (const [nodeId, originalPos] of state.originalNodePositions) {
      const finalPos = vec.add(originalPos, snapResult.delta);
      newNodePositions.set(nodeId, finalPos);

      const candidatesAtNode = findAllSnapCandidates(
        worldToScreen(finalPos, viewport),
        filteredScene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToGuidelines: true,
          excludeNodeIds: excludedNodeIds,
        }
      );

      for (const candidate of candidatesAtNode) {
        if (candidate.type === 'node' && candidate.entityId) {
          activeSnaps.set(nodeId, candidate.entityId);
        }
        allCandidates.push(candidate);
      }
    }

    snapCandidates = filterSnapCandidatesForDisplay(allCandidates);
  } else {
    for (const [nodeId, originalPos] of state.originalNodePositions) {
      const finalPos = vec.add(originalPos, delta);
      newNodePositions.set(nodeId, finalPos);
    }
  }

  state.context = {
    ...state.context,
    dragCurrentMm: worldPos,
    activeSnaps,
    snapCandidates,
  };

  callbacks.onDragUpdate(state.context.selectedWallIds, newNodePositions);
  callbacks.onStateChange(state.context);
}
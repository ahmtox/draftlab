import type { Vec2 } from '../../core/math/vec';
import type { Scene } from '../../core/domain/types';
import type { Viewport } from '../../renderers/konva/viewport';
import { screenToWorld, worldToScreen } from '../../renderers/konva/viewport';
import { hitTestWallNode, hitTestWalls } from '../../core/geometry/hit-testing';
import { findSnapCandidate } from '../../core/geometry/snapping';
import * as vec from '../../core/math/vec';
import { NODE_RADIUS_MM } from '../../core/constants';

import type {
  SelectToolContext,
  SelectToolCallbacks,
  SelectToolState,
} from './types';

import {
  handleFixturePointerDown,
  handleFixtureDragMove,
  handleFixtureDragCommit,
} from './fixture-drag';

import {
  getExcludedNodeIds,
  getExcludedWallIds,
  startMultiWallDrag,
  handleSingleNodeDragMove,
  handleMultiNodeDragMove,
} from './wall-drag';

import {
  handleMarqueePending,
  handleMarqueeMove,
  handleMarqueeCommit,
} from './marquee';

import {
  findRigidBodySnapDelta,
} from './snapping';

export type { SelectToolContext } from './types';

export class SelectTool {
  private state: SelectToolState;
  private callbacks: SelectToolCallbacks;

  constructor(
    onStateChange: (ctx: SelectToolContext) => void,
    onDragUpdate: (wallIds: Set<string>, nodePositions: Map<string, Vec2>) => void,
    onDragCommit: (
      nodePositions: Map<string, { original: Vec2; final: Vec2 }>,
      mergeTargets: Map<string, string>
    ) => void,
    onFixtureDragUpdate: (fixtureId: string, position: Vec2) => void,
    onFixtureDragCommit: (fixtureId: string, originalPos: Vec2, finalPos: Vec2) => void,
    getSelectedFixtureId: () => string | null // ✅ NEW: Getter function parameter
  ) {
    this.state = {
      context: {
        state: 'idle',
        selectedWallIds: new Set(),
        hoveredWallId: null,
        dragMode: null,
        dragStartMm: null,
        dragCurrentMm: null,
        offsetAMm: null,
        offsetBMm: null,
        snapCandidateA: null,
        snapCandidateB: null,
        marqueeStart: null,
        marqueeCurrent: null,
        activeSnaps: new Map(),
        snapCandidates: [],
      },
      originalSceneSnapshot: null,
      originalNodePositions: new Map(),
      originalFixturePosition: null,
      draggingFixtureId: null,
      shiftKeyHeld: false,
      getSelectedFixtureId, // ✅ Store the getter function
    };

    this.callbacks = {
      onStateChange,
      onDragUpdate,
      onDragCommit,
      onFixtureDragUpdate,
      onFixtureDragCommit,
    };
  }

  handlePointerDown(
    screenPx: Vec2,
    scene: Scene,
    viewport: Viewport,
    modifiers: { ctrlKey: boolean; shiftKey: boolean }
  ): void {
    this.state.shiftKeyHeld = modifiers.shiftKey;
    const worldPos = screenToWorld(screenPx, viewport);

    const nodeRadiusMm = NODE_RADIUS_MM;
    const wallHitRadiusMm = 20 / viewport.scale;

    // Check fixture first
    if (
      handleFixturePointerDown(
        screenPx,
        scene,
        viewport,
        this.state,
        this.callbacks
      )
    ) {
      return;
    }

    // Check for node hits on selected walls
    for (const wallId of this.state.context.selectedWallIds) {
      const wall = scene.walls.get(wallId);
      if (!wall) continue;

      const hitResult = hitTestWallNode(worldPos, wallId, scene, nodeRadiusMm);

      if (hitResult === 'node-a' || hitResult === 'node-b') {
        if (this.state.context.selectedWallIds.size === 1) {
          const nodeA = scene.nodes.get(wall.nodeAId)!;
          const nodeB = scene.nodes.get(wall.nodeBId)!;
          const draggedNode = hitResult === 'node-a' ? nodeA : nodeB;

          this.state.originalSceneSnapshot = {
            nodes: new Map(scene.nodes),
            walls: new Map(scene.walls),
            rooms: scene.rooms,
            fixtures: scene.fixtures,
          };

          this.state.originalNodePositions.clear();
          this.state.originalNodePositions.set(wall.nodeAId, {
            x: nodeA.x,
            y: nodeA.y,
          });
          this.state.originalNodePositions.set(wall.nodeBId, {
            x: nodeB.x,
            y: nodeB.y,
          });

          this.state.context = {
            ...this.state.context,
            state: 'dragging',
            dragMode: hitResult,
            dragStartMm: { x: draggedNode.x, y: draggedNode.y },
            activeSnaps: new Map(),
            snapCandidates: [],
          };

          this.callbacks.onStateChange(this.state.context);
          return;
        }

        startMultiWallDrag(
          wallId,
          'wall',
          worldPos,
          scene,
          this.state,
          this.callbacks
        );
        return;
      }
    }

    const hitWallId = hitTestWalls(worldPos, scene, wallHitRadiusMm);

    if (hitWallId) {
      const isSelectedWall = this.state.context.selectedWallIds.has(hitWallId);

      if (isSelectedWall) {
        startMultiWallDrag(
          hitWallId,
          'wall',
          worldPos,
          scene,
          this.state,
          this.callbacks
        );
        return;
      }

      if (modifiers.ctrlKey || modifiers.shiftKey) {
        const newSelection = new Set(this.state.context.selectedWallIds);
        newSelection.add(hitWallId);

        this.state.context = {
          ...this.state.context,
          selectedWallIds: newSelection,
        };
        this.callbacks.onStateChange(this.state.context);
      } else {
        const wall = scene.walls.get(hitWallId)!;
        const nodeA = scene.nodes.get(wall.nodeAId)!;
        const nodeB = scene.nodes.get(wall.nodeBId)!;

        const hitResult = hitTestWallNode(
          worldPos,
          hitWallId,
          scene,
          nodeRadiusMm
        );
        const dragMode =
          hitResult === 'node-a' || hitResult === 'node-b'
            ? hitResult
            : 'wall';

        let dragStart = worldPos;
        if (dragMode === 'node-a') {
          dragStart = { x: nodeA.x, y: nodeA.y };
        } else if (dragMode === 'node-b') {
          dragStart = { x: nodeB.x, y: nodeB.y };
        }

        this.state.originalSceneSnapshot = {
          nodes: new Map(scene.nodes),
          walls: new Map(scene.walls),
          rooms: scene.rooms,
          fixtures: scene.fixtures,
        };

        this.state.originalNodePositions.clear();
        this.state.originalNodePositions.set(wall.nodeAId, {
          x: nodeA.x,
          y: nodeA.y,
        });
        this.state.originalNodePositions.set(wall.nodeBId, {
          x: nodeB.x,
          y: nodeB.y,
        });

        this.state.context = {
          ...this.state.context,
          state: 'dragging',
          selectedWallIds: new Set([hitWallId]),
          dragMode,
          dragStartMm: dragStart,
          offsetAMm: vec.sub(nodeA, worldPos),
          offsetBMm: vec.sub(nodeB, worldPos),
        };

        this.callbacks.onStateChange(this.state.context);
      }
    } else {
      const shouldClearSelection =
        !modifiers.ctrlKey && !modifiers.shiftKey;

      this.state.context = {
        ...this.state.context,
        state: 'marquee-pending',
        dragMode: null,
        marqueeStart: { x: screenPx.x, y: screenPx.y },
        marqueeCurrent: { x: screenPx.x, y: screenPx.y },
        hoveredWallId: null,
        selectedWallIds: shouldClearSelection
          ? new Set()
          : this.state.context.selectedWallIds,
      };

      this.callbacks.onStateChange(this.state.context);
    }
  }

  handlePointerMove(
    screenPx: Vec2,
    scene: Scene,
    viewport: Viewport
  ): void {
    const worldPos = screenToWorld(screenPx, viewport);

    if (this.state.context.state === 'marquee-pending') {
      handleMarqueePending(screenPx, this.state, this.callbacks);
    } else if (this.state.context.state === 'marquee') {
      handleMarqueeMove(screenPx, this.state, this.callbacks);
    } else if (
      this.state.context.state === 'dragging' &&
      this.state.context.dragMode === 'fixture'
    ) {
      handleFixtureDragMove(
        screenPx,
        scene,
        viewport,
        this.state,
        this.callbacks
      );
    } else if (
      this.state.context.state === 'dragging' &&
      this.state.context.selectedWallIds.size > 0
    ) {
      // Handle single node drag
      if (
        handleSingleNodeDragMove(
          worldPos,
          scene,
          viewport,
          this.state,
          this.callbacks
        )
      ) {
        return;
      }

      // Handle multi-node drag
      handleMultiNodeDragMove(
        worldPos,
        scene,
        viewport,
        this.state,
        this.callbacks
      );
    } else if (this.state.context.state === 'idle') {
      const hitRadiusMm = 20 / viewport.scale;
      const hoveredWallId = hitTestWalls(worldPos, scene, hitRadiusMm);

      if (hoveredWallId !== this.state.context.hoveredWallId) {
        this.state.context = {
          ...this.state.context,
          hoveredWallId,
        };
        this.callbacks.onStateChange(this.state.context);
      }
    }
  }

  handlePointerUp(
    screenPx: Vec2,
    scene: Scene,
    viewport: Viewport
  ): void {
    if (this.state.context.state === 'marquee-pending') {
      this.state.context = {
        ...this.state.context,
        state: 'idle',
        dragMode: null,
        marqueeStart: null,
        marqueeCurrent: null,
      };

      this.callbacks.onStateChange(this.state.context);
      return;
    }

    if (this.state.context.state === 'marquee') {
      if (
        handleMarqueeCommit(scene, viewport, this.state, this.callbacks)
      ) {
        return;
      } else {
        this.reset();
        return;
      }
    }

    if (
      this.state.context.state === 'dragging' &&
      this.state.context.dragMode === 'fixture'
    ) {
      if (
        handleFixtureDragCommit(
          screenPx,
          scene,
          viewport,
          this.state,
          this.callbacks
        )
      ) {
        return;
      } else {
        this.reset();
        return;
      }
    }

    if (
      this.state.context.state === 'dragging' &&
      this.state.context.selectedWallIds.size > 0
    ) {
      this.handleWallDragCommit(screenPx, scene, viewport);
    }
  }

  private handleWallDragCommit(
    screenPx: Vec2,
    scene: Scene,
    viewport: Viewport
  ): void {
    const worldPos = screenToWorld(screenPx, viewport);
    const delta = vec.sub(worldPos, this.state.context.dragStartMm!);

    const nodePositions = new Map<string, { original: Vec2; final: Vec2 }>();
    const mergeTargets = new Map<string, string>();

    const excludedWallIds = getExcludedWallIds(
      scene,
      this.state.context.selectedWallIds
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

    // Single-node drag commit
    if (
      this.state.context.dragMode === 'node-a' ||
      this.state.context.dragMode === 'node-b'
    ) {
      const singleWallId = Array.from(this.state.context.selectedWallIds)[0];
      const wall = scene.walls.get(singleWallId);

      if (wall) {
        const dragNodeId =
          this.state.context.dragMode === 'node-a'
            ? wall.nodeAId
            : wall.nodeBId;
        const anchorNodeId =
          this.state.context.dragMode === 'node-a'
            ? wall.nodeBId
            : wall.nodeAId;
        const anchorNode = scene.nodes.get(anchorNodeId)!;
        const originalDragPos =
          this.state.originalNodePositions.get(dragNodeId)!;

        const tentativePos = vec.add(originalDragPos, delta);
        const tentativeScreenPx = worldToScreen(tentativePos, viewport);

        const excludedNodeIds = new Set([dragNodeId]);

        const snapResult = findSnapCandidate(
          tentativeScreenPx,
          filteredScene,
          viewport,
          {
            snapToGrid: true,
            snapToNodes: true,
            snapToEdges: true,
            snapToAngles: this.state.shiftKeyHeld,
            snapToGuidelines: true,
            angleOrigin: anchorNode,
            guidelineOrigin: anchorNode,
            excludeNodeIds: excludedNodeIds,
          }
        );

        let finalPos = tentativePos;

        if (
          snapResult.snapped &&
          snapResult.candidate?.type === 'node' &&
          snapResult.candidate.entityId
        ) {
          const targetNodeId = snapResult.candidate.entityId;

          if (
            !excludedNodeIds.has(targetNodeId) &&
            targetNodeId !== dragNodeId
          ) {
            mergeTargets.set(dragNodeId, targetNodeId);
            finalPos = snapResult.point;
          } else {
            finalPos = snapResult.point;
          }
        } else if (snapResult.snapped) {
          finalPos = snapResult.point;
        }

        nodePositions.set(dragNodeId, {
          original: originalDragPos,
          final: finalPos,
        });
      }
    } else {
      // Multi-wall rigid body drag commit
      const excludedNodeIds = getExcludedNodeIds(
        scene,
        this.state.context.selectedWallIds
      );

      const snapTargets = new Map<
        string,
        { snapPoint: Vec2; candidate: any }[]
      >();

      for (const [nodeId, originalPos] of this.state.originalNodePositions) {
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
        this.state.originalNodePositions,
        delta,
        snapTargets
      );

      if (snapResult) {
        for (const [nodeId, originalPos] of this.state.originalNodePositions) {
          const finalPos = vec.add(originalPos, snapResult.delta);
          nodePositions.set(nodeId, { original: originalPos, final: finalPos });
        }

        for (const [nodeId, snapInfo] of snapResult.snappedNodes) {
          if (
            snapInfo.candidate.type === 'node' &&
            snapInfo.candidate.entityId
          ) {
            const targetNodeId = snapInfo.candidate.entityId;

            if (
              !excludedNodeIds.has(targetNodeId) &&
              targetNodeId !== nodeId
            ) {
              mergeTargets.set(nodeId, targetNodeId);
            }
          }
        }
      } else {
        for (const [nodeId, originalPos] of this.state.originalNodePositions) {
          const finalPos = vec.add(originalPos, delta);
          nodePositions.set(nodeId, { original: originalPos, final: finalPos });
        }
      }
    }

    this.callbacks.onDragCommit(nodePositions, mergeTargets);

    this.state.context = {
      ...this.state.context,
      state: 'idle',
      dragMode: null,
      dragStartMm: null,
      dragCurrentMm: null,
      offsetAMm: null,
      offsetBMm: null,
      snapCandidateA: null,
      snapCandidateB: null,
      activeSnaps: new Map(),
      snapCandidates: [],
    };

    this.state.originalSceneSnapshot = null;
    this.state.originalNodePositions.clear();

    this.callbacks.onStateChange(this.state.context);
  }

  handleKeyDown(key: string): void {
    if (key === 'Shift') {
      this.state.shiftKeyHeld = true;
    }
  }

  handleKeyUp(key: string): void {
    if (key === 'Shift') {
      this.state.shiftKeyHeld = false;
    }
  }

  reset(): void {
    const getSelectedFixtureId = this.state.getSelectedFixtureId; // ✅ Preserve getter
    
    this.state = {
      context: {
        state: 'idle',
        selectedWallIds: new Set(),
        hoveredWallId: null,
        dragMode: null,
        dragStartMm: null,
        dragCurrentMm: null,
        offsetAMm: null,
        offsetBMm: null,
        snapCandidateA: null,
        snapCandidateB: null,
        marqueeStart: null,
        marqueeCurrent: null,
        activeSnaps: new Map(),
        snapCandidates: [],
      },
      originalSceneSnapshot: null,
      originalNodePositions: new Map(),
      originalFixturePosition: null,
      draggingFixtureId: null,
      shiftKeyHeld: false,
      getSelectedFixtureId, // ✅ Restore getter
    };
    this.callbacks.onStateChange(this.state.context);
  }

  getContext(): SelectToolContext {
    return this.state.context;
  }
}
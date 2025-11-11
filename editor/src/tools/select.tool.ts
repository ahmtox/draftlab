import type { Vec2 } from '../core/math/vec';
import type { Scene } from '../core/domain/types';
import type { Viewport } from '../renderers/konva/viewport';
import type { SnapCandidate } from '../core/geometry/snapping';
import { screenToWorld, worldToScreen } from '../renderers/konva/viewport';
import { findSnapCandidate } from '../core/geometry/snapping';
import { hitTestWallNode, hitTestWalls } from '../core/geometry/hit-testing';
import * as vec from '../core/math/vec';

const NODE_RADIUS_MM = 8;

type DragMode = 'wall' | 'node-a' | 'node-b';

export type SelectToolContext = {
  state: 'idle' | 'dragging';
  selectedWallId: string | null;
  hoveredWallId: string | null;
  dragMode: DragMode | null;
  dragStartMm: Vec2 | null;
  offsetAMm: Vec2 | null;
  offsetBMm: Vec2 | null;
  snapCandidateA: SnapCandidate | null;
  snapCandidateB: SnapCandidate | null;
};

export class SelectTool {
  private context: SelectToolContext = {
    state: 'idle',
    selectedWallId: null,
    hoveredWallId: null,
    dragMode: null,
    dragStartMm: null,
    offsetAMm: null,
    offsetBMm: null,
    snapCandidateA: null,
    snapCandidateB: null,
  };

  private originalSceneSnapshot: Scene | null = null;
  private originalNodeAPos: Vec2 | null = null;
  private originalNodeBPos: Vec2 | null = null;

  constructor(
    private onStateChange: (ctx: SelectToolContext) => void,
    private onDragUpdate: (wallId: string, nodeAPos: Vec2, nodeBPos: Vec2) => void,
    private onDragCommit: (
      nodeAId: string,
      nodeBId: string,
      finalNodeAPos: Vec2, 
      finalNodeBPos: Vec2, 
      originalNodeAPos: Vec2,
      originalNodeBPos: Vec2,
      mergeAToNodeId: string | null, 
      mergeBToNodeId: string | null
    ) => void
  ) {}

  handlePointerDown(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    const worldPos = screenToWorld(screenPx, viewport);
    const nodeRadiusMm = NODE_RADIUS_MM;
    const hitRadiusMm = 20 / viewport.scale;

    // Hit test selected wall's nodes first
    if (this.context.selectedWallId) {
      const hitResult = hitTestWallNode(worldPos, this.context.selectedWallId, scene, nodeRadiusMm);
      
      if (hitResult === 'node-a' || hitResult === 'node-b' || hitResult === 'wall') {
        const wall = scene.walls.get(this.context.selectedWallId)!;
        const nodeA = scene.nodes.get(wall.nodeAId)!;
        const nodeB = scene.nodes.get(wall.nodeBId)!;
        
        this.originalSceneSnapshot = {
          nodes: new Map(scene.nodes),
          walls: new Map(scene.walls),
        };

        // Store original positions for MoveNodeCommand
        this.originalNodeAPos = { x: nodeA.x, y: nodeA.y };
        this.originalNodeBPos = { x: nodeB.x, y: nodeB.y };

        this.context = {
          ...this.context,
          state: 'dragging',
          dragMode: hitResult as DragMode,
          dragStartMm: worldPos,
          offsetAMm: hitResult !== 'node-b' ? vec.sub(nodeA, worldPos) : null,
          offsetBMm: hitResult !== 'node-a' ? vec.sub(nodeB, worldPos) : null,
        };

        this.onStateChange(this.context);
        return;
      }
    }

    // Hit test any wall
    const hitWallId = hitTestWalls(worldPos, scene, hitRadiusMm);

    if (hitWallId) {
      const wall = scene.walls.get(hitWallId)!;
      const nodeA = scene.nodes.get(wall.nodeAId)!;
      const nodeB = scene.nodes.get(wall.nodeBId)!;

      this.originalSceneSnapshot = {
        nodes: new Map(scene.nodes),
        walls: new Map(scene.walls),
      };

      // Store original positions
      this.originalNodeAPos = { x: nodeA.x, y: nodeA.y };
      this.originalNodeBPos = { x: nodeB.x, y: nodeB.y };

      this.context = {
        ...this.context,
        state: 'dragging',
        selectedWallId: hitWallId,
        dragMode: 'wall',
        dragStartMm: worldPos,
        offsetAMm: vec.sub(nodeA, worldPos),
        offsetBMm: vec.sub(nodeB, worldPos),
      };
    } else {
      this.context = {
        ...this.context,
        selectedWallId: null,
        dragMode: null,
      };
    }

    this.onStateChange(this.context);
  }

  handlePointerMove(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    const worldPos = screenToWorld(screenPx, viewport);

    if (this.context.state === 'dragging' && this.context.selectedWallId) {
      const wall = scene.walls.get(this.context.selectedWallId);
      if (!wall) return;

      const originalNodeA = this.originalSceneSnapshot!.nodes.get(wall.nodeAId)!;
      const originalNodeB = this.originalSceneSnapshot!.nodes.get(wall.nodeBId)!;

      // Determine if nodes can snap (not shared with other walls)
      const connectedToA = Array.from(this.originalSceneSnapshot!.walls.values())
        .filter(w => w.id !== wall.id && (w.nodeAId === wall.nodeAId || w.nodeBId === wall.nodeAId));
      const connectedToB = Array.from(this.originalSceneSnapshot!.walls.values())
        .filter(w => w.id !== wall.id && (w.nodeAId === wall.nodeBId || w.nodeBId === wall.nodeBId));

      const canSnapA = this.context.dragMode === 'node-a' || (this.context.dragMode === 'wall' && connectedToA.length === 0);
      const canSnapB = this.context.dragMode === 'node-b' || (this.context.dragMode === 'wall' && connectedToB.length === 0);

      // Compute new positions and snap candidates
      const { finalNodeAPos, finalNodeBPos, snapA, snapB } = this.computeDragPositions(
        worldPos,
        screenPx,
        originalNodeA,
        originalNodeB,
        wall,
        canSnapA,
        canSnapB,
        viewport
      );

      this.context.snapCandidateA = snapA;
      this.context.snapCandidateB = snapB;
      this.onStateChange(this.context);

      // Notify drag update (live preview)
      this.onDragUpdate(this.context.selectedWallId, finalNodeAPos, finalNodeBPos);
    } else if (this.context.state === 'idle') {
      const hitRadiusMm = 20 / viewport.scale;
      const hoveredWallId = hitTestWalls(worldPos, scene, hitRadiusMm);
      
      if (hoveredWallId !== this.context.hoveredWallId) {
        this.context.hoveredWallId = hoveredWallId;
        this.onStateChange(this.context);
      }
    }
  }

  handlePointerUp(scene: Scene): void {
    if (this.context.state === 'dragging' && this.context.selectedWallId) {
      const wall = scene.walls.get(this.context.selectedWallId);
      if (!wall || !this.originalNodeAPos || !this.originalNodeBPos) {
        this.reset();
        return;
      }

      // Get final node positions
      const finalNodeA = scene.nodes.get(wall.nodeAId)!;
      const finalNodeB = scene.nodes.get(wall.nodeBId)!;

      // Determine merge targets (snap to nodes only, not edges/grid)
      const mergeAToNodeId = this.context.snapCandidateA?.type === 'node' ? this.context.snapCandidateA.entityId || null : null;
      const mergeBToNodeId = this.context.snapCandidateB?.type === 'node' ? this.context.snapCandidateB.entityId || null : null;

      this.onDragCommit(
        wall.nodeAId,
        wall.nodeBId,
        { x: finalNodeA.x, y: finalNodeA.y },
        { x: finalNodeB.x, y: finalNodeB.y },
        this.originalNodeAPos,
        this.originalNodeBPos,
        mergeAToNodeId,
        mergeBToNodeId
      );
    }

    this.reset();
  }

  private computeDragPositions(
    worldPos: Vec2,
    screenPx: Vec2,
    originalNodeA: Vec2,
    originalNodeB: Vec2,
    wall: any,
    canSnapA: boolean,
    canSnapB: boolean,
    viewport: Viewport
  ): { finalNodeAPos: Vec2; finalNodeBPos: Vec2; snapA: SnapCandidate | null; snapB: SnapCandidate | null } {
    let finalNodeAPos = originalNodeA;
    let finalNodeBPos = originalNodeB;
    let snapA: SnapCandidate | null = null;
    let snapB: SnapCandidate | null = null;

    // Build snap scene (exclude selected wall from snapping targets)
    const snapScene = {
      nodes: new Map(this.originalSceneSnapshot!.nodes),
      walls: new Map(this.originalSceneSnapshot!.walls),
    };
    snapScene.walls.delete(this.context.selectedWallId!);

    if (this.context.dragMode === 'wall') {
      // Dragging entire wall - both nodes move together
      const delta = vec.sub(worldPos, this.context.dragStartMm!);
      const newNodeAPos = vec.add(originalNodeA, delta);
      const newNodeBPos = vec.add(originalNodeB, delta);

      // Try to snap node A if allowed
      if (canSnapA) {
        const nodeAScreenPos = worldToScreen(newNodeAPos, viewport);
        const snapResultA = findSnapCandidate(
          nodeAScreenPos,
          snapScene,
          viewport,
          {
            snapToGrid: true,
            snapToNodes: true,
            snapToEdges: true,
            excludeNodeIds: new Set([wall.nodeAId, wall.nodeBId]),
          }
        );

        if (snapResultA.snapped && snapResultA.candidate) {
          const snapDelta = vec.sub(snapResultA.point, originalNodeA);
          finalNodeAPos = snapResultA.point;
          finalNodeBPos = vec.add(originalNodeB, snapDelta);
          snapA = snapResultA.candidate;
        } else {
          finalNodeAPos = newNodeAPos;
          finalNodeBPos = newNodeBPos;
        }
      } else {
        finalNodeAPos = newNodeAPos;
        finalNodeBPos = newNodeBPos;
      }

      // Try to snap node B if allowed (independent of node A)
      if (canSnapB) {
        const nodeBScreenPos = worldToScreen(finalNodeBPos, viewport);
        const snapResultB = findSnapCandidate(
          nodeBScreenPos,
          snapScene,
          viewport,
          {
            snapToGrid: true,
            snapToNodes: true,
            snapToEdges: true,
            excludeNodeIds: new Set([wall.nodeAId, wall.nodeBId]),
          }
        );

        if (snapResultB.snapped && snapResultB.candidate) {
          // If node B also snaps, only apply if node A didn't snap
          if (!snapA) {
            const snapDelta = vec.sub(snapResultB.point, originalNodeB);
            finalNodeBPos = snapResultB.point;
            finalNodeAPos = vec.add(originalNodeA, snapDelta);
            snapB = snapResultB.candidate;
          } else {
            // Node A already snapped, just show guide for node B potential snap
            snapB = snapResultB.candidate;
          }
        }
      }
    } else if (this.context.dragMode === 'node-a') {
      // Dragging node A only
      const newNodeAPos = vec.add(worldPos, this.context.offsetAMm!);

      if (canSnapA) {
        const nodeAScreenPos = worldToScreen(newNodeAPos, viewport);
        const snapResultA = findSnapCandidate(
          nodeAScreenPos,
          snapScene,
          viewport,
          {
            snapToGrid: true,
            snapToNodes: true,
            snapToEdges: true,
            excludeNodeIds: new Set([wall.nodeAId, wall.nodeBId]),
          }
        );

        if (snapResultA.snapped && snapResultA.candidate) {
          finalNodeAPos = snapResultA.point;
          snapA = snapResultA.candidate;
        } else {
          finalNodeAPos = newNodeAPos;
        }
      } else {
        finalNodeAPos = newNodeAPos;
      }

      finalNodeBPos = originalNodeB;
    } else if (this.context.dragMode === 'node-b') {
      // Dragging node B only
      const newNodeBPos = vec.add(worldPos, this.context.offsetBMm!);

      if (canSnapB) {
        const nodeBScreenPos = worldToScreen(newNodeBPos, viewport);
        const snapResultB = findSnapCandidate(
          nodeBScreenPos,
          snapScene,
          viewport,
          {
            snapToGrid: true,
            snapToNodes: true,
            snapToEdges: true,
            excludeNodeIds: new Set([wall.nodeAId, wall.nodeBId]),
          }
        );

        if (snapResultB.snapped && snapResultB.candidate) {
          finalNodeBPos = snapResultB.point;
          snapB = snapResultB.candidate;
        } else {
          finalNodeBPos = newNodeBPos;
        }
      } else {
        finalNodeBPos = newNodeBPos;
      }

      finalNodeAPos = originalNodeA;
    }

    return { finalNodeAPos, finalNodeBPos, snapA, snapB };
  }

  reset(): void {
    this.context = {
      state: 'idle',
      selectedWallId: null,
      hoveredWallId: null,
      dragMode: null,
      dragStartMm: null,
      offsetAMm: null,
      offsetBMm: null,
      snapCandidateA: null,
      snapCandidateB: null,
    };
    this.originalSceneSnapshot = null;
    this.originalNodeAPos = null;
    this.originalNodeBPos = null;
    this.onStateChange(this.context);
  }

  getContext(): SelectToolContext {
    return this.context;
  }
}
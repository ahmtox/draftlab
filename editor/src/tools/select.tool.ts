import type { Vec2 } from '../core/math/vec';
import type { Scene } from '../core/domain/types';
import type { Viewport } from '../renderers/konva/viewport';
import type { SnapCandidate } from '../core/geometry/snapping';
import { screenToWorld, worldToScreen } from '../renderers/konva/viewport';
import { findSnapCandidate } from '../core/geometry/snapping';
import { hitTestWallNode, hitTestWalls } from '../core/geometry/hit-testing';
import * as vec from '../core/math/vec';

const NODE_RADIUS_MM = 8;
const MIN_MARQUEE_SIZE_PX = 5;
const MIN_DRAG_DISTANCE_PX = 3;

type DragMode = 'wall' | 'node-a' | 'node-b' | 'marquee';

export type SelectToolContext = {
  state: 'idle' | 'dragging' | 'marquee' | 'marquee-pending';
  selectedWallIds: Set<string>;
  hoveredWallId: string | null;
  dragMode: DragMode | null;
  dragStartMm: Vec2 | null;
  dragCurrentMm: Vec2 | null;
  offsetAMm: Vec2 | null;
  offsetBMm: Vec2 | null;
  snapCandidateA: SnapCandidate | null;
  snapCandidateB: SnapCandidate | null;
  marqueeStart: Vec2 | null;
  marqueeCurrent: Vec2 | null;
  // Map of nodeId -> snap target nodeId for visual feedback
  activeSnaps: Map<string, string>;
  // Array of snap candidates for visual guides
  snapCandidates: SnapCandidate[];
};

export class SelectTool {
  private context: SelectToolContext = {
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
  };

  private originalSceneSnapshot: Scene | null = null;
  private originalNodePositions: Map<string, Vec2> = new Map();

  constructor(
    private onStateChange: (ctx: SelectToolContext) => void,
    private onDragUpdate: (wallIds: Set<string>, nodePositions: Map<string, Vec2>) => void,
    private onDragCommit: (
      nodePositions: Map<string, { original: Vec2; final: Vec2 }>,
      mergeTargets: Map<string, string>
    ) => void
  ) {}

  handlePointerDown(screenPx: Vec2, scene: Scene, viewport: Viewport, modifiers: { ctrlKey: boolean; shiftKey: boolean }): void {
    const worldPos = screenToWorld(screenPx, viewport);
    const nodeRadiusMm = NODE_RADIUS_MM;
    const hitRadiusMm = 20 / viewport.scale;

    const hitWallId = hitTestWalls(worldPos, scene, hitRadiusMm);

    if (hitWallId) {
      const isSelectedWall = this.context.selectedWallIds.has(hitWallId);

      if (isSelectedWall) {
        const hitResult = hitTestWallNode(worldPos, hitWallId, scene, nodeRadiusMm);
        const dragMode = (hitResult === 'node-a' || hitResult === 'node-b' || hitResult === 'wall') 
          ? hitResult as DragMode 
          : 'wall';
        
        this.startMultiWallDrag(hitWallId, dragMode, worldPos, scene);
        return;
      }

      if (modifiers.ctrlKey || modifiers.shiftKey) {
        const newSelection = new Set(this.context.selectedWallIds);
        newSelection.add(hitWallId);
        
        this.context = {
          ...this.context,
          selectedWallIds: newSelection,
        };
        this.onStateChange(this.context);
      } else {
        const wall = scene.walls.get(hitWallId)!;
        const nodeA = scene.nodes.get(wall.nodeAId)!;
        const nodeB = scene.nodes.get(wall.nodeBId)!;

        this.originalSceneSnapshot = {
          nodes: new Map(scene.nodes),
          walls: new Map(scene.walls),
        };

        this.originalNodePositions.clear();
        this.originalNodePositions.set(wall.nodeAId, { x: nodeA.x, y: nodeA.y });
        this.originalNodePositions.set(wall.nodeBId, { x: nodeB.x, y: nodeB.y });

        this.context = {
          ...this.context,
          state: 'dragging',
          selectedWallIds: new Set([hitWallId]),
          dragMode: 'wall',
          dragStartMm: { x: worldPos.x, y: worldPos.y },
          offsetAMm: vec.sub(nodeA, worldPos),
          offsetBMm: vec.sub(nodeB, worldPos),
        };
        
        this.onStateChange(this.context);
      }
    } else {
      // Clicked on empty space
      const shouldClearSelection = !modifiers.ctrlKey && !modifiers.shiftKey;

      this.context = {
        ...this.context,
        state: 'marquee-pending',
        dragMode: null,
        marqueeStart: { x: screenPx.x, y: screenPx.y },
        marqueeCurrent: { x: screenPx.x, y: screenPx.y },
        hoveredWallId: null,
        selectedWallIds: shouldClearSelection ? new Set() : this.context.selectedWallIds,
      };

      this.onStateChange(this.context);
    }
  }

  private startMultiWallDrag(triggerWallId: string, hitMode: DragMode, worldPos: Vec2, scene: Scene): void {
    this.originalSceneSnapshot = {
      nodes: new Map(scene.nodes),
      walls: new Map(scene.walls),
    };

    this.originalNodePositions.clear();

    for (const wallId of this.context.selectedWallIds) {
      const wall = scene.walls.get(wallId);
      if (!wall) continue;

      const nodeA = scene.nodes.get(wall.nodeAId)!;
      const nodeB = scene.nodes.get(wall.nodeBId)!;

      if (!this.originalNodePositions.has(wall.nodeAId)) {
        this.originalNodePositions.set(wall.nodeAId, { x: nodeA.x, y: nodeA.y });
      }
      if (!this.originalNodePositions.has(wall.nodeBId)) {
        this.originalNodePositions.set(wall.nodeBId, { x: nodeB.x, y: nodeB.y });
      }
    }

    this.context = {
      ...this.context,
      state: 'dragging',
      dragMode: hitMode,
      dragStartMm: { x: worldPos.x, y: worldPos.y },
      activeSnaps: new Map(),
      snapCandidates: [],
    };

    this.onStateChange(this.context);
  }

  handlePointerMove(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    const worldPos = screenToWorld(screenPx, viewport);

    if (this.context.state === 'marquee-pending') {
      if (!this.context.marqueeStart) return;

      const dragDistance = Math.sqrt(
        Math.pow(screenPx.x - this.context.marqueeStart.x, 2) +
        Math.pow(screenPx.y - this.context.marqueeStart.y, 2)
      );

      if (dragDistance >= MIN_DRAG_DISTANCE_PX) {
        this.context = {
          ...this.context,
          state: 'marquee',
          marqueeCurrent: { x: screenPx.x, y: screenPx.y },
        };
        this.onStateChange(this.context);
      }
    } else if (this.context.state === 'marquee') {
      this.context = {
        ...this.context,
        marqueeCurrent: { x: screenPx.x, y: screenPx.y },
      };
      
      this.onStateChange(this.context);
    } else if (this.context.state === 'dragging' && this.context.selectedWallIds.size > 0) {
      const delta = vec.sub(worldPos, this.context.dragStartMm!);
      const newNodePositions = new Map<string, Vec2>();
      const activeSnaps = new Map<string, string>();
      const snapCandidates: SnapCandidate[] = [];

      // Get set of all selected node IDs (to exclude from snapping)
      const selectedNodeIds = new Set(this.originalNodePositions.keys());

      // Calculate new positions with snapping
      for (const [nodeId, originalPos] of this.originalNodePositions) {
        const tentativePos = vec.add(originalPos, delta);

        // Use findSnapCandidate with ALL snap types enabled
        const tentativeScreenPx = worldToScreen(tentativePos, viewport);
        
        const snapResult = findSnapCandidate(
          tentativeScreenPx,
          scene,
          viewport,
          {
            snapToGrid: true,      // ✅ ENABLED - Snap to 1m grid
            snapToNodes: true,     // ✅ ENABLED - Snap to other nodes
            snapToEdges: true,     // ✅ ENABLED - Snap to wall centerlines and midpoints
            excludeNodeIds: selectedNodeIds, // Exclude selected nodes
          }
        );

        if (snapResult.snapped && snapResult.candidate) {
          // Use snapped position (works for ALL snap types)
          newNodePositions.set(nodeId, snapResult.point);
          
          // Track node merges ONLY for node-to-node snaps
          if (snapResult.candidate.type === 'node' && snapResult.candidate.entityId) {
            activeSnaps.set(nodeId, snapResult.candidate.entityId);
          }

          // Add snap candidate for visual feedback (all types)
          snapCandidates.push({
            point: snapResult.point,
            type: snapResult.candidate.type,
            entityId: snapResult.candidate.entityId,
            priority: snapResult.candidate.priority,
            distancePx: snapResult.candidate.distancePx,
          });
        } else {
          // No snap, use tentative position
          newNodePositions.set(nodeId, tentativePos);
        }
      }

      // Update context with active snaps and snap candidates
      this.context = {
        ...this.context,
        activeSnaps,
        snapCandidates,
      };

      // Live preview
      this.onDragUpdate(this.context.selectedWallIds, newNodePositions);
      this.onStateChange(this.context);
    } else if (this.context.state === 'idle') {
      const hitRadiusMm = 20 / viewport.scale;
      const hoveredWallId = hitTestWalls(worldPos, scene, hitRadiusMm);
      
      if (hoveredWallId !== this.context.hoveredWallId) {
        this.context = {
          ...this.context,
          hoveredWallId,
        };
        this.onStateChange(this.context);
      }
    }
  }

  handlePointerUp(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    if (this.context.state === 'marquee-pending') {
      this.context = {
        ...this.context,
        state: 'idle',
        dragMode: null,
        marqueeStart: null,
        marqueeCurrent: null,
      };
      
      this.onStateChange(this.context);
      return;
    }

    if (this.context.state === 'marquee') {
      const marqueeBox = this.getMarqueeBox();
      
      if (!marqueeBox) {
        this.reset();
        return;
      }

      const selectedWalls = new Set<string>();
      for (const wall of scene.walls.values()) {
        const nodeA = scene.nodes.get(wall.nodeAId);
        const nodeB = scene.nodes.get(wall.nodeBId);
        if (!nodeA || !nodeB) continue;

        const screenA = worldToScreen(nodeA, viewport);
        const screenB = worldToScreen(nodeB, viewport);

        if (this.isPointInBox(screenA, marqueeBox) || 
            this.isPointInBox(screenB, marqueeBox) ||
            this.lineSegmentIntersectsRect(screenA, screenB, marqueeBox)) {
          selectedWalls.add(wall.id);
        }
      }

      const newSelection = new Set([...this.context.selectedWallIds, ...selectedWalls]);

      this.context = {
        ...this.context,
        state: 'idle',
        selectedWallIds: newSelection,
        dragMode: null,
        marqueeStart: null,
        marqueeCurrent: null,
      };

      this.onStateChange(this.context);
    } else if (this.context.state === 'dragging' && this.context.selectedWallIds.size > 0) {
      const worldPos = screenToWorld(screenPx, viewport);
      const delta = vec.sub(worldPos, this.context.dragStartMm!);

      const nodePositions = new Map<string, { original: Vec2; final: Vec2 }>();
      const mergeTargets = new Map<string, string>();

      // Get set of all selected node IDs
      const selectedNodeIds = new Set(this.originalNodePositions.keys());

      // Calculate final positions and detect merges
      for (const [nodeId, originalPos] of this.originalNodePositions) {
        const tentativePos = vec.add(originalPos, delta);

        // Use findSnapCandidate for final merge detection with ALL snap types
        const tentativeScreenPx = worldToScreen(tentativePos, viewport);
        
        const snapResult = findSnapCandidate(
          tentativeScreenPx,
          scene,
          viewport,
          {
            snapToGrid: true,      // ✅ ENABLED
            snapToNodes: true,     // ✅ ENABLED
            snapToEdges: true,     // ✅ ENABLED
            excludeNodeIds: selectedNodeIds,
          }
        );

        if (snapResult.snapped && snapResult.candidate) {
          // Use snapped position
          nodePositions.set(nodeId, {
            original: originalPos,
            final: snapResult.point,
          });
          
          // Only merge if snapped to another node
          if (snapResult.candidate.type === 'node' && snapResult.candidate.entityId) {
            mergeTargets.set(nodeId, snapResult.candidate.entityId);
          }
        } else {
          // No snap, just move
          nodePositions.set(nodeId, {
            original: originalPos,
            final: tentativePos,
          });
        }
      }

      this.onDragCommit(nodePositions, mergeTargets);

      this.context = {
        ...this.context,
        state: 'idle',
        dragMode: null,
        activeSnaps: new Map(),
        snapCandidates: [],
      };
      this.onStateChange(this.context);
    } else {
      this.reset();
    }
  }

  private getMarqueeBox(): { x: number; y: number; width: number; height: number } | null {
    if (!this.context.marqueeStart || !this.context.marqueeCurrent) return null;

    const x = Math.min(this.context.marqueeStart.x, this.context.marqueeCurrent.x);
    const y = Math.min(this.context.marqueeStart.y, this.context.marqueeCurrent.y);
    const width = Math.abs(this.context.marqueeCurrent.x - this.context.marqueeStart.x);
    const height = Math.abs(this.context.marqueeCurrent.y - this.context.marqueeStart.y); // ✅ FIXED

    return { x, y, width, height };
  }

  private isPointInBox(point: Vec2, box: { x: number; y: number; width: number; height: number }): boolean {
    return point.x >= box.x && point.x <= box.x + box.width &&
           point.y >= box.y && point.y <= box.y + box.height;
  }

  private lineSegmentIntersectsRect(
    p1: Vec2,
    p2: Vec2,
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    const lineMinX = Math.min(p1.x, p2.x);
    const lineMaxX = Math.max(p1.x, p2.x);
    const lineMinY = Math.min(p1.y, p2.y);
    const lineMaxY = Math.max(p1.y, p2.y);

    const rectMaxX = rect.x + rect.width;
    const rectMaxY = rect.y + rect.height;

    if (lineMaxX < rect.x || lineMinX > rectMaxX || 
        lineMaxY < rect.y || lineMinY > rectMaxY) {
      return false;
    }

    const edges = [
      { start: { x: rect.x, y: rect.y }, end: { x: rectMaxX, y: rect.y } },
      { start: { x: rectMaxX, y: rect.y }, end: { x: rectMaxX, y: rectMaxY } },
      { start: { x: rectMaxX, y: rectMaxY }, end: { x: rect.x, y: rectMaxY } },
      { start: { x: rect.x, y: rectMaxY }, end: { x: rect.x, y: rect.y } },
    ];

    for (const edge of edges) {
      if (this.lineSegmentsIntersect(p1, p2, edge.start, edge.end)) {
        return true;
      }
    }

    return false;
  }

  private lineSegmentsIntersect(
    p1: Vec2,
    p2: Vec2,
    p3: Vec2,
    p4: Vec2
  ): boolean {
    const d1 = this.direction(p3, p4, p1);
    const d2 = this.direction(p3, p4, p2);
    const d3 = this.direction(p1, p2, p3);
    const d4 = this.direction(p1, p2, p4);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }

    if (d1 === 0 && this.onSegment(p3, p1, p4)) return true;
    if (d2 === 0 && this.onSegment(p3, p2, p4)) return true;
    if (d3 === 0 && this.onSegment(p1, p3, p2)) return true;
    if (d4 === 0 && this.onSegment(p1, p4, p2)) return true;

    return false;
  }

  private direction(p1: Vec2, p2: Vec2, p3: Vec2): number {
    return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
  }

  private onSegment(p: Vec2, q: Vec2, r: Vec2): boolean {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
           q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  }

  reset(): void {
    this.context = {
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
    };
    this.originalSceneSnapshot = null;
    this.originalNodePositions.clear();
    this.onStateChange(this.context);
  }

  getContext(): SelectToolContext {
    return this.context;
  }
}
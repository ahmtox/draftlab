import type { Vec2 } from '../core/math/vec';
import type { Scene } from '../core/domain/types';
import type { Viewport } from '../renderers/konva/viewport';
import type { SnapCandidate } from '../core/geometry/snapping';
import { screenToWorld, worldToScreen } from '../renderers/konva/viewport';
import { findSnapCandidate } from '../core/geometry/snapping';
import { hitTestWallNode, hitTestWalls } from '../core/geometry/hit-testing';
import * as vec from '../core/math/vec';
import { NODE_RADIUS_MM } from '../core/constants';

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
  activeSnaps: Map<string, string>;
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
    const wallHitRadiusMm = 20 / viewport.scale;

    const hitWallId = hitTestWalls(worldPos, scene, wallHitRadiusMm);

    if (hitWallId) {
      const isSelectedWall = this.context.selectedWallIds.has(hitWallId);

      if (isSelectedWall) {
        const hitResult = hitTestWallNode(worldPos, hitWallId, scene, nodeRadiusMm);
        
        if (this.context.selectedWallIds.size === 1 && (hitResult === 'node-a' || hitResult === 'node-b')) {
          const wall = scene.walls.get(hitWallId)!;
          const nodeA = scene.nodes.get(wall.nodeAId)!;
          const nodeB = scene.nodes.get(wall.nodeBId)!;

          const draggedNode = hitResult === 'node-a' ? nodeA : nodeB;

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
            dragMode: hitResult as DragMode,
            dragStartMm: { x: draggedNode.x, y: draggedNode.y },
            activeSnaps: new Map(),
            snapCandidates: [],
          };

          this.onStateChange(this.context);
          return;
        }

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

        const hitResult = hitTestWallNode(worldPos, hitWallId, scene, nodeRadiusMm);
        const dragMode = (hitResult === 'node-a' || hitResult === 'node-b') ? hitResult as DragMode : 'wall';

        let dragStart = worldPos;
        if (dragMode === 'node-a') {
          dragStart = { x: nodeA.x, y: nodeA.y };
        } else if (dragMode === 'node-b') {
          dragStart = { x: nodeB.x, y: nodeB.y };
        }

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
          dragMode,
          dragStartMm: dragStart,
          offsetAMm: vec.sub(nodeA, worldPos),
          offsetBMm: vec.sub(nodeB, worldPos),
        };
        
        this.onStateChange(this.context);
      }
    } else {
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

  private getExcludedNodeIds(scene: Scene): Set<string> {
    const excluded = new Set<string>();

    for (const wallId of this.context.selectedWallIds) {
      const wall = scene.walls.get(wallId);
      if (!wall) continue;

      excluded.add(wall.nodeAId);
      excluded.add(wall.nodeBId);
    }

    const connectedNodeIds = new Set(excluded);
    for (const nodeId of connectedNodeIds) {
      for (const wall of scene.walls.values()) {
        if (wall.nodeAId === nodeId || wall.nodeBId === nodeId) {
          excluded.add(wall.nodeAId);
          excluded.add(wall.nodeBId);
        }
      }
    }

    return excluded;
  }

  private getExcludedWallIds(scene: Scene): Set<string> {
    const excluded = new Set<string>(this.context.selectedWallIds);

    const selectedNodeIds = new Set<string>();
    for (const wallId of this.context.selectedWallIds) {
      const wall = scene.walls.get(wallId);
      if (!wall) continue;
      selectedNodeIds.add(wall.nodeAId);
      selectedNodeIds.add(wall.nodeBId);
    }

    for (const wall of scene.walls.values()) {
      if (selectedNodeIds.has(wall.nodeAId) || selectedNodeIds.has(wall.nodeBId)) {
        excluded.add(wall.id);
      }
    }

    return excluded;
  }

  handlePointerMove(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    const worldPos = screenToWorld(screenPx, viewport);

    if (this.context.state === 'marquee-pending') {
      const startScreen = this.context.marqueeStart!;
      const dx = screenPx.x - startScreen.x;
      const dy = screenPx.y - startScreen.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > MIN_DRAG_DISTANCE_PX) {
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

      const excludedNodeIds = this.getExcludedNodeIds(scene);
      const excludedWallIds = this.getExcludedWallIds(scene);

      const filteredScene: Scene = {
        nodes: scene.nodes,
        walls: new Map(
          Array.from(scene.walls.entries()).filter(([wallId]) => !excludedWallIds.has(wallId))
        ),
      };

      if (this.context.dragMode === 'node-a' || this.context.dragMode === 'node-b') {
        const singleWallId = Array.from(this.context.selectedWallIds)[0];
        const wall = scene.walls.get(singleWallId);
        
        if (wall) {
          const dragNodeId = this.context.dragMode === 'node-a' ? wall.nodeAId : wall.nodeBId;
          const anchorNodeId = this.context.dragMode === 'node-a' ? wall.nodeBId : wall.nodeAId;
          
          const originalDragPos = this.originalNodePositions.get(dragNodeId)!;
          const tentativePos = vec.add(originalDragPos, delta);
          const tentativeScreenPx = worldToScreen(tentativePos, viewport);
          
          const snapResult = findSnapCandidate(
            tentativeScreenPx,
            filteredScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              snapToGuidelines: true, // ✅ Enable guideline snapping
              excludeNodeIds: excludedNodeIds,
            }
          );

          const finalDragPos = snapResult.snapped ? snapResult.point : tentativePos;

          if (snapResult.snapped && snapResult.candidate) {
            if (snapResult.candidate.type === 'node' && snapResult.candidate.entityId) {
              activeSnaps.set(dragNodeId, snapResult.candidate.entityId);
            }
            snapCandidates.push(snapResult.candidate);
          }

          const finalPositions = new Map<string, Vec2>();
          finalPositions.set(dragNodeId, finalDragPos);
          finalPositions.set(anchorNodeId, this.originalNodePositions.get(anchorNodeId)!);
          
          this.context = {
            ...this.context,
            dragCurrentMm: worldPos,
            activeSnaps,
            snapCandidates,
          };

          this.onDragUpdate(this.context.selectedWallIds, finalPositions);
          this.onStateChange(this.context);
          return;
        }
      }

      for (const [nodeId, originalPos] of this.originalNodePositions) {
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
            snapToGuidelines: true, // ✅ Enable guideline snapping
            excludeNodeIds: excludedNodeIds,
          }
        );

        if (snapResult.snapped && snapResult.candidate) {
          newNodePositions.set(nodeId, snapResult.point);
          
          if (snapResult.candidate.type === 'node' && snapResult.candidate.entityId) {
            activeSnaps.set(nodeId, snapResult.candidate.entityId);
          }
          
          snapCandidates.push(snapResult.candidate);
        } else {
          newNodePositions.set(nodeId, tentativePos);
        }
      }

      this.context = {
        ...this.context,
        dragCurrentMm: worldPos,
        activeSnaps,
        snapCandidates,
      };

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

      const excludedNodeIds = this.getExcludedNodeIds(scene);
      const excludedWallIds = this.getExcludedWallIds(scene);

      const filteredScene: Scene = {
        nodes: scene.nodes,
        walls: new Map(
          Array.from(scene.walls.entries()).filter(([wallId]) => !excludedWallIds.has(wallId))
        ),
      };

      if (this.context.dragMode === 'node-a' || this.context.dragMode === 'node-b') {
        const singleWallId = Array.from(this.context.selectedWallIds)[0];
        const wall = scene.walls.get(singleWallId);
        
        if (wall) {
          const dragNodeId = this.context.dragMode === 'node-a' ? wall.nodeAId : wall.nodeBId;
          const originalDragPos = this.originalNodePositions.get(dragNodeId)!;
          
          const tentativePos = vec.add(originalDragPos, delta);
          const tentativeScreenPx = worldToScreen(tentativePos, viewport);
          
          const snapResult = findSnapCandidate(
            tentativeScreenPx,
            filteredScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              snapToGuidelines: true, // ✅ Enable guideline snapping
              excludeNodeIds: excludedNodeIds,
            }
          );

          let finalPos = tentativePos;

          if (snapResult.snapped && snapResult.candidate?.type === 'node' && snapResult.candidate.entityId) {
            const targetNodeId = snapResult.candidate.entityId;
            
            if (!excludedNodeIds.has(targetNodeId) && targetNodeId !== dragNodeId) {
              mergeTargets.set(dragNodeId, targetNodeId);
              finalPos = snapResult.point;
            } else {
              finalPos = snapResult.point;
            }
          } else if (snapResult.snapped) {
            finalPos = snapResult.point;
          }

          nodePositions.set(dragNodeId, { original: originalDragPos, final: finalPos });
        }
      } else {
        for (const [nodeId, originalPos] of this.originalNodePositions) {
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
              snapToGuidelines: true, // ✅ Enable guideline snapping
              excludeNodeIds: excludedNodeIds,
            }
          );

          let finalPos = tentativePos;

          if (snapResult.snapped && snapResult.candidate?.type === 'node' && snapResult.candidate.entityId) {
            const targetNodeId = snapResult.candidate.entityId;
            
            if (!excludedNodeIds.has(targetNodeId) && targetNodeId !== nodeId) {
              mergeTargets.set(nodeId, targetNodeId);
              finalPos = snapResult.point;
            } else {
              finalPos = snapResult.point;
            }
          } else if (snapResult.snapped) {
            finalPos = snapResult.point;
          }

          nodePositions.set(nodeId, { original: originalPos, final: finalPos });
        }
      }

      this.onDragCommit(nodePositions, mergeTargets);

      this.context = {
        ...this.context,
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

      this.originalSceneSnapshot = null;
      this.originalNodePositions.clear();

      this.onStateChange(this.context);
    }
  }

  private getMarqueeBox(): { x: number; y: number; width: number; height: number } | null {
    if (!this.context.marqueeStart || !this.context.marqueeCurrent) return null;

    const start = this.context.marqueeStart;
    const current = this.context.marqueeCurrent;

    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);

    if (width < MIN_MARQUEE_SIZE_PX || height < MIN_MARQUEE_SIZE_PX) {
      return null;
    }

    return { x, y, width, height };
  }

  private isPointInBox(point: Vec2, box: { x: number; y: number; width: number; height: number }): boolean {
    return point.x >= box.x && 
           point.x <= box.x + box.width && 
           point.y >= box.y && 
           point.y <= box.y + box.height;
  }

  private lineSegmentIntersectsRect(
    a: Vec2,
    b: Vec2,
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    const rectLeft = rect.x;
    const rectRight = rect.x + rect.width;
    const rectTop = rect.y;
    const rectBottom = rect.y + rect.height;

    const lineSegmentIntersectsLine = (
      p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2
    ): boolean => {
      const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
      if (Math.abs(denominator) < 1e-10) return false;

      const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denominator;
      const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denominator;

      return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    };

    const topLeft = { x: rectLeft, y: rectTop };
    const topRight = { x: rectRight, y: rectTop };
    const bottomLeft = { x: rectLeft, y: rectBottom };
    const bottomRight = { x: rectRight, y: rectBottom };

    return (
      lineSegmentIntersectsLine(a, b, topLeft, topRight) ||
      lineSegmentIntersectsLine(a, b, topRight, bottomRight) ||
      lineSegmentIntersectsLine(a, b, bottomRight, bottomLeft) ||
      lineSegmentIntersectsLine(a, b, bottomLeft, topLeft)
    );
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
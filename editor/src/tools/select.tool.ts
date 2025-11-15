import type { Vec2 } from '../core/math/vec';
import type { Scene } from '../core/domain/types';
import type { Viewport } from '../renderers/konva/viewport';
import type { SnapCandidate } from '../core/geometry/snapping';
import { screenToWorld, worldToScreen } from '../renderers/konva/viewport';
import { findSnapCandidate, findAllSnapCandidates } from '../core/geometry/snapping';
import { hitTestWallNode, hitTestWalls } from '../core/geometry/hit-testing';
import * as vec from '../core/math/vec';
import { NODE_RADIUS_MM, DEFAULT_TOL } from '../core/constants';

const MIN_MARQUEE_SIZE_PX = 5;
const MIN_DRAG_DISTANCE_PX = 10;
const RIGID_BODY_SNAP_TOLERANCE_MM = 0.5;
const SAME_POSITION_TOLERANCE_MM = 1.0; // Tolerance for considering two snaps at "same position"

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
  private shiftKeyHeld: boolean = false;

  constructor(
    private onStateChange: (ctx: SelectToolContext) => void,
    private onDragUpdate: (wallIds: Set<string>, nodePositions: Map<string, Vec2>) => void,
    private onDragCommit: (
      nodePositions: Map<string, { original: Vec2; final: Vec2 }>,
      mergeTargets: Map<string, string>
    ) => void
  ) {}

  handlePointerDown(screenPx: Vec2, scene: Scene, viewport: Viewport, modifiers: { ctrlKey: boolean; shiftKey: boolean }): void {
    this.shiftKeyHeld = modifiers.shiftKey;
    const worldPos = screenToWorld(screenPx, viewport);
    
    const nodeRadiusMm = NODE_RADIUS_MM;
    const wallHitRadiusMm = 20 / viewport.scale;

    // ✅ PRIORITY FIX: Check for node hits on selected walls FIRST
    // This ensures nodes are "above" walls in the hit-testing hierarchy
    for (const wallId of this.context.selectedWallIds) {
      const wall = scene.walls.get(wallId);
      if (!wall) continue;

      const hitResult = hitTestWallNode(worldPos, wallId, scene, nodeRadiusMm);
      
      // If we hit a node on a selected wall, handle it immediately
      if (hitResult === 'node-a' || hitResult === 'node-b') {
        // Single wall selected + node hit = single-node drag mode
        if (this.context.selectedWallIds.size === 1) {
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

        // Multi-wall selected + node hit = rigid body drag (no individual node snapping)
        this.startMultiWallDrag(wallId, 'wall', worldPos, scene);
        return;
      }
    }

    // Check for wall hits only after checking selected wall nodes
    const hitWallId = hitTestWalls(worldPos, scene, wallHitRadiusMm);

    if (hitWallId) {
      const isSelectedWall = this.context.selectedWallIds.has(hitWallId);

      if (isSelectedWall) {
        // Selected wall hit - always treat as wall body drag (rigid motion)
        this.startMultiWallDrag(hitWallId, 'wall', worldPos, scene);
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

    // Only exclude nodes that are part of selected walls
    for (const wallId of this.context.selectedWallIds) {
      const wall = scene.walls.get(wallId);
      if (!wall) continue;

      excluded.add(wall.nodeAId);
      excluded.add(wall.nodeBId);
    }

    // Don't exclude connected nodes - we want their guidelines
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

  /**
   * ✅ FIXED: Filter snap candidates to show only the highest priority guide at each position
   * 
   * Algorithm:
   * 1. Group candidates by position (within tolerance)
   * 2. For each position group, keep ONLY the highest priority candidate
   * 3. Special case: If highest priority is guideline-intersection, also render component guidelines BUT suppress their text labels
   * 
   * Priority hierarchy:
   * - 9: Node (highest - actual geometry) → WINS over intersection
   * - 8: Guideline intersection
   * - 7: Midpoint
   * - 6: Edge
   * - 5: Grid
   * - 4: Single guideline (lowest - just visual alignment)
   */
  private filterSnapCandidatesForDisplay(candidates: SnapCandidate[]): SnapCandidate[] {
    if (candidates.length === 0) return [];

    // Group candidates by position (within tolerance)
    const positionGroups: SnapCandidate[][] = [];

    for (const candidate of candidates) {
      // Find existing group at this position
      let foundGroup = false;
      
      for (const group of positionGroups) {
        const groupPosition = group[0].point;
        const distance = vec.distance(candidate.point, groupPosition);
        
        if (distance < SAME_POSITION_TOLERANCE_MM) {
          group.push(candidate);
          foundGroup = true;
          break;
        }
      }
      
      // Create new group if no existing group found
      if (!foundGroup) {
        positionGroups.push([candidate]);
      }
    }

    // For each position group, keep only the highest priority candidate
    const filtered: SnapCandidate[] = [];

    for (const group of positionGroups) {
      // Sort by priority (descending)
      group.sort((a, b) => b.priority - a.priority);
      
      // Keep ONLY the highest priority candidate
      const best = group[0];
      filtered.push(best);
      
      // ✅ SPECIAL CASE: If the winner is a guideline intersection, ALSO render its component guidelines
      // BUT mark them as visual-only (no text label) by setting a special entityId prefix
      if (best.type === 'guideline-intersection' && best.guidelines) {
        // Create visual guideline candidates (for rendering lines only, no text)
        for (const guideline of best.guidelines) {
          filtered.push({
            point: best.point,
            type: 'guideline',
            entityId: `__visual_only__${guideline.nodeId}`, // ✅ Special prefix to suppress text
            priority: 4, // Low priority (won't affect sorting)
            distancePx: best.distancePx,
            guideline: guideline,
          });
        }
      }
    }

    return filtered;
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
      let snapCandidates: SnapCandidate[] = [];

      const excludedWallIds = this.getExcludedWallIds(scene);

      const filteredScene: Scene = {
        nodes: scene.nodes,
        walls: new Map(
          Array.from(scene.walls.entries()).filter(([wallId]) => !excludedWallIds.has(wallId))
        ),
      };

      // ✅ SINGLE-NODE DRAG: Only allow individual snapping for single wall + specific node
      if (this.context.dragMode === 'node-a' || this.context.dragMode === 'node-b') {
        const singleWallId = Array.from(this.context.selectedWallIds)[0];
        const wall = scene.walls.get(singleWallId);
        
        if (wall) {
          const dragNodeId = this.context.dragMode === 'node-a' ? wall.nodeAId : wall.nodeBId;
          const anchorNodeId = this.context.dragMode === 'node-a' ? wall.nodeBId : wall.nodeAId;
          
          const anchorNode = scene.nodes.get(anchorNodeId)!;
          const originalDragPos = this.originalNodePositions.get(dragNodeId)!;
          const tentativePos = vec.add(originalDragPos, delta);
          const tentativeScreenPx = worldToScreen(tentativePos, viewport);
          
          // Only exclude the node being dragged for guideline generation
          const excludedNodeIds = new Set([dragNodeId]);
          
          // Get the primary snap for positioning
          const snapResult = findSnapCandidate(
            tentativeScreenPx,
            filteredScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              snapToAngles: this.shiftKeyHeld,
              snapToGuidelines: true,
              angleOrigin: anchorNode,
              guidelineOrigin: anchorNode,
              excludeNodeIds: excludedNodeIds,
            }
          );

          const finalDragPos = snapResult.snapped ? snapResult.point : tentativePos;

          // ✅ NEW: Collect candidates at BOTH the dragged node AND the anchor node positions
          const allSnapResults: SnapCandidate[] = [];

          // Candidates at dragged node position
          const draggedNodeCandidates = findAllSnapCandidates(
            worldToScreen(finalDragPos, viewport),
            filteredScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              snapToAngles: this.shiftKeyHeld,
              snapToGuidelines: true,
              angleOrigin: anchorNode,
              guidelineOrigin: anchorNode,
              excludeNodeIds: excludedNodeIds,
            }
          );
          allSnapResults.push(...draggedNodeCandidates);

          // ✅ NEW: Also get candidates at anchor node position for guideline visualization
          const anchorPos = this.originalNodePositions.get(anchorNodeId)!;
          const anchorCandidates = findAllSnapCandidates(
            worldToScreen(anchorPos, viewport),
            filteredScene,
            viewport,
            {
              snapToGrid: false, // Don't show grid at anchor (already locked)
              snapToNodes: false, // Don't show nodes at anchor
              snapToEdges: false,
              snapToAngles: false,
              snapToGuidelines: true, // Only show guidelines at anchor
              excludeNodeIds: new Set([anchorNodeId]), // Exclude anchor node itself
            }
          );
          allSnapResults.push(...anchorCandidates);

          // ✅ Filter candidates to show highest priority at each position
          const filteredCandidates = this.filterSnapCandidatesForDisplay(allSnapResults);

          // Track all snap candidates for visual guides
          for (const candidate of filteredCandidates) {
            if (candidate.type === 'node' && candidate.entityId) {
              activeSnaps.set(dragNodeId, candidate.entityId);
            }
            snapCandidates.push(candidate);
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

      // ✅ RIGID BODY DRAG WITH INTELLIGENT SNAP DELTA CALCULATION
      const excludedNodeIds = this.getExcludedNodeIds(scene);
      
      // Find all potential snap targets for each node
      const snapTargets = new Map<string, { snapPoint: Vec2; candidate: SnapCandidate }[]>();
      
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
            snapToGuidelines: true,
            excludeNodeIds: excludedNodeIds,
          }
        );

        if (snapResult.snapped && snapResult.candidate) {
          snapTargets.set(nodeId, [{ snapPoint: snapResult.point, candidate: snapResult.candidate }]);
        }
      }

      // Try to find a snap delta that maintains rigid body constraint
      const snapResult = this.findRigidBodySnapDelta(
        this.originalNodePositions,
        delta,
        snapTargets
      );

      if (snapResult) {
        // Apply snap delta to all nodes
        for (const [nodeId, originalPos] of this.originalNodePositions) {
          const finalPos = vec.add(originalPos, snapResult.delta);
          newNodePositions.set(nodeId, finalPos);
        }
        
        // ✅ NEW: Collect candidates at ALL node positions (both snapped and non-snapped)
        const allCandidates: SnapCandidate[] = [];
        
        for (const [nodeId, originalPos] of this.originalNodePositions) {
          const finalPos = vec.add(originalPos, snapResult.delta);
          
          // Get all candidates at this node's position
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

          // Track node merges
          for (const candidate of candidatesAtNode) {
            if (candidate.type === 'node' && candidate.entityId) {
              activeSnaps.set(nodeId, candidate.entityId);
            }
            allCandidates.push(candidate);
          }
        }

        // ✅ Filter candidates to show highest priority at each position
        snapCandidates = this.filterSnapCandidatesForDisplay(allCandidates);
      } else {
        // No valid snap - use original delta
        for (const [nodeId, originalPos] of this.originalNodePositions) {
          const finalPos = vec.add(originalPos, delta);
          newNodePositions.set(nodeId, finalPos);
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

  /**
   * ✅ NEW: Find a translation delta that allows snapping while maintaining rigid body constraint
   * 
   * Algorithm:
   * 1. For each node with snap targets, compute what delta would be needed to reach that snap point
   * 2. For each candidate delta, check if ALL pairwise distances are preserved
   * 3. Return the first valid snap delta found (prioritized by snap priority)
   */
  private findRigidBodySnapDelta(
    originalPositions: Map<string, Vec2>,
    baseDelta: Vec2,
    snapTargets: Map<string, { snapPoint: Vec2; candidate: SnapCandidate }[]>
  ): { delta: Vec2; snappedNodes: Map<string, { snapPoint: Vec2; candidate: SnapCandidate }> } | null {
    
    // Collect all candidate deltas from snap targets
    const candidateDeltas: Array<{
      delta: Vec2;
      nodeId: string;
      snapPoint: Vec2;
      candidate: SnapCandidate;
    }> = [];

    for (const [nodeId, targets] of snapTargets) {
      const originalPos = originalPositions.get(nodeId)!;
      
      for (const target of targets) {
        const snapDelta = vec.sub(target.snapPoint, originalPos);
        candidateDeltas.push({
          delta: snapDelta,
          nodeId,
          snapPoint: target.snapPoint,
          candidate: target.candidate,
        });
      }
    }

    // Sort by snap priority (higher priority first)
    candidateDeltas.sort((a, b) => b.candidate.priority - a.candidate.priority);

    // Try each candidate delta
    for (const candidate of candidateDeltas) {
      const testDelta = candidate.delta;
      
      // Check if this delta preserves all pairwise distances
      if (this.validateRigidBodyDelta(originalPositions, testDelta)) {
        // This delta works! Collect all nodes that snap with this delta
        const snappedNodes = new Map<string, { snapPoint: Vec2; candidate: SnapCandidate }>();
        snappedNodes.set(candidate.nodeId, {
          snapPoint: candidate.snapPoint,
          candidate: candidate.candidate,
        });

        // Check if any other nodes also snap with this delta
        for (const [otherNodeId, targets] of snapTargets) {
          if (otherNodeId === candidate.nodeId) continue;
          
          const otherOriginalPos = originalPositions.get(otherNodeId)!;
          const otherFinalPos = vec.add(otherOriginalPos, testDelta);
          
          // Check if this node's final position matches any of its snap targets
          for (const target of targets) {
            const distanceToSnap = vec.distance(otherFinalPos, target.snapPoint);
            if (distanceToSnap < RIGID_BODY_SNAP_TOLERANCE_MM) {
              snappedNodes.set(otherNodeId, {
                snapPoint: target.snapPoint,
                candidate: target.candidate,
              });
              break;
            }
          }
        }

        return { delta: testDelta, snappedNodes };
      }
    }

    // No valid snap delta found
    return null;
  }

  /**
   * ✅ IMPROVED: Validate that a translation delta preserves ALL pairwise distances
   */
  private validateRigidBodyDelta(
    originalPositions: Map<string, Vec2>,
    delta: Vec2
  ): boolean {
    const nodeIds = Array.from(originalPositions.keys());
    
    // Check all pairwise distances
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const nodeAId = nodeIds[i];
        const nodeBId = nodeIds[j];
        
        const originalA = originalPositions.get(nodeAId)!;
        const originalB = originalPositions.get(nodeBId)!;
        const originalDistance = vec.distance(originalA, originalB);
        
        const translatedA = vec.add(originalA, delta);
        const translatedB = vec.add(originalB, delta);
        const translatedDistance = vec.distance(translatedA, translatedB);
        
        const distanceDeviation = Math.abs(translatedDistance - originalDistance);
        
        if (distanceDeviation > RIGID_BODY_SNAP_TOLERANCE_MM) {
          return false;
        }
      }
    }

    return true;
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

      const excludedWallIds = this.getExcludedWallIds(scene);

      const filteredScene: Scene = {
        nodes: scene.nodes,
        walls: new Map(
          Array.from(scene.walls.entries()).filter(([wallId]) => !excludedWallIds.has(wallId))
        ),
      };

      // ✅ SINGLE-NODE DRAG: Only allow individual snapping + merging for single wall + specific node
      if (this.context.dragMode === 'node-a' || this.context.dragMode === 'node-b') {
        const singleWallId = Array.from(this.context.selectedWallIds)[0];
        const wall = scene.walls.get(singleWallId);
        
        if (wall) {
          const dragNodeId = this.context.dragMode === 'node-a' ? wall.nodeAId : wall.nodeBId;
          const anchorNodeId = this.context.dragMode === 'node-a' ? wall.nodeBId : wall.nodeAId;
          const anchorNode = scene.nodes.get(anchorNodeId)!;
          const originalDragPos = this.originalNodePositions.get(dragNodeId)!;
          
          const tentativePos = vec.add(originalDragPos, delta);
          const tentativeScreenPx = worldToScreen(tentativePos, viewport);
          
          // Only exclude the node being dragged for guideline generation
          const excludedNodeIds = new Set([dragNodeId]);
          
          const snapResult = findSnapCandidate(
            tentativeScreenPx,
            filteredScene,
            viewport,
            {
              snapToGrid: true,
              snapToNodes: true,
              snapToEdges: true,
              snapToAngles: this.shiftKeyHeld,
              snapToGuidelines: true,
              angleOrigin: anchorNode,
              guidelineOrigin: anchorNode,
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
        // ✅ RIGID BODY DRAG COMMIT WITH INTELLIGENT SNAP DELTA
        
        const excludedNodeIds = this.getExcludedNodeIds(scene);
        
        // Find all potential snap targets for each node
        const snapTargets = new Map<string, { snapPoint: Vec2; candidate: SnapCandidate }[]>();
        
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
              snapToGuidelines: true,
              excludeNodeIds: excludedNodeIds,
            }
          );

          if (snapResult.snapped && snapResult.candidate) {
            snapTargets.set(nodeId, [{ snapPoint: snapResult.point, candidate: snapResult.candidate }]);
          }
        }

        // Try to find a snap delta that maintains rigid body constraint
        const snapResult = this.findRigidBodySnapDelta(
          this.originalNodePositions,
          delta,
          snapTargets
        );

        if (snapResult) {
          // Apply snap delta to all nodes
          for (const [nodeId, originalPos] of this.originalNodePositions) {
            const finalPos = vec.add(originalPos, snapResult.delta);
            nodePositions.set(nodeId, { original: originalPos, final: finalPos });
          }
          
          // Check for node merges
          for (const [nodeId, snapInfo] of snapResult.snappedNodes) {
            if (snapInfo.candidate.type === 'node' && snapInfo.candidate.entityId) {
              const targetNodeId = snapInfo.candidate.entityId;
              
              if (!excludedNodeIds.has(targetNodeId) && targetNodeId !== nodeId) {
                mergeTargets.set(nodeId, targetNodeId);
              }
            }
          }
        } else {
          // No valid snap - use original delta
          for (const [nodeId, originalPos] of this.originalNodePositions) {
            const finalPos = vec.add(originalPos, delta);
            nodePositions.set(nodeId, { original: originalPos, final: finalPos });
          }
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

  handleKeyDown(key: string): void {
    if (key === 'Shift') {
      this.shiftKeyHeld = true;
    }
  }

  handleKeyUp(key: string): void {
    if (key === 'Shift') {
      this.shiftKeyHeld = false;
    }
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
    this.shiftKeyHeld = false;
    this.onStateChange(this.context);
  }

  getContext(): SelectToolContext {
    return this.context;
  }
}
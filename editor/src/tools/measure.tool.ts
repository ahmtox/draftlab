import type { Vec2 } from '../core/math/vec';
import type { Scene } from '../core/domain/types';
import type { Viewport } from '../renderers/konva/viewport';
import { screenToWorld } from '../renderers/konva/viewport';
import { hitTestWalls, hitTestNodes } from '../core/geometry/hit-testing';
import { buildWallPolygon } from '../core/geometry/miter';
import { findSnapCandidate, type SnapCandidate } from '../core/geometry/snapping';
import * as vec from '../core/math/vec';
import { NODE_RADIUS_MM } from '../core/constants';

export type MeasureType = 
  | 'node-to-node' 
  | 'wall-centerline' 
  | 'wall-edge' 
  | 'parallel-distance'
  | 'closest-distance'
  | 'farthest-distance'
  | 'collinear-distance'
  | 'point-to-line';

export type Measurement = {
  type: MeasureType;
  startMm: Vec2;
  endMm: Vec2;
  lengthMm: number;
  wallId?: string;
  edgeIndex?: number;
  nodeAId?: string;
  nodeBId?: string;
  edge1?: { 
    wallId: string; 
    edgeIndex?: number; // undefined for centerlines
    startMm: Vec2;
    endMm: Vec2;
    lengthMm: number;
    isCenterline?: boolean;
  };
  edge2?: { 
    wallId: string; 
    edgeIndex?: number; // undefined for centerlines
    startMm: Vec2;
    endMm: Vec2;
    lengthMm: number;
    isCenterline?: boolean;
  };
  minHorizontal?: {
    startMm: Vec2;
    endMm: Vec2;
    lengthMm: number;
  };
  maxHorizontal?: {
    startMm: Vec2;
    endMm: Vec2;
    lengthMm: number;
  };
  minVertical?: {
    startMm: Vec2;
    endMm: Vec2;
    lengthMm: number;
  };
  maxVertical?: {
    startMm: Vec2;
    endMm: Vec2;
    lengthMm: number;
  };
  hasSharedNode?: boolean; // True if lines share a node
};

export type MeasureToolContext = {
  state: 'idle' | 'measuring' | 'click-pending' | 'complete';
  measurement: Measurement | null;
  hoverTarget: { type: 'node' | 'wall' | 'edge'; id: string; edgeIndex?: number } | null;
  previewStartMm: Vec2 | null;
  previewEndMm: Vec2 | null;
  firstSelection: { type: 'node' | 'edge' | 'centerline'; id: string; edgeIndex?: number; position?: Vec2 } | null;
  snapCandidate: SnapCandidate | null;
};

const CONNECTION_TOLERANCE_MM = 50; // Tolerance for considering nodes as "connected"
const MIN_DRAG_DISTANCE_PX = 5; // Minimum screen-space distance to consider it a drag

export class MeasureTool {
  private context: MeasureToolContext = {
    state: 'idle',
    measurement: null,
    hoverTarget: null,
    previewStartMm: null,
    previewEndMm: null,
    firstSelection: null,
    snapCandidate: null,
  };

  private mouseDownScreenPos: Vec2 | null = null;

  constructor(
    private onStateChange: (ctx: MeasureToolContext) => void
  ) {}

  handlePointerDown(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    const worldMm = screenToWorld(screenPx, viewport);
    
    if (this.context.state === 'idle' && !this.context.firstSelection) {
      // First selection - prioritize edges, centerlines, and nodes
      const nodeRadiusMm = NODE_RADIUS_MM;
      const wallHitRadiusMm = 20 / viewport.scale;
      const edgeHitRadiusMm = 15 / viewport.scale;
      
      const hitNodeId = hitTestNodes(worldMm, scene, nodeRadiusMm);
      
      if (hitNodeId) {
        // First node selection - enter click-pending state
        const node = scene.nodes.get(hitNodeId)!;
        this.mouseDownScreenPos = { x: screenPx.x, y: screenPx.y };
        
        this.context = {
          state: 'click-pending',
          measurement: null,
          hoverTarget: null,
          previewStartMm: { x: node.x, y: node.y },
          previewEndMm: { x: node.x, y: node.y },
          firstSelection: { type: 'node', id: hitNodeId, position: { x: node.x, y: node.y } },
          snapCandidate: null,
        };
        this.onStateChange(this.context);
        return;
      }
      
      // Check for edge hit (first selection)
      const edgeHit = this.hitTestEdges(worldMm, scene, edgeHitRadiusMm);
      if (edgeHit) {
        // First edge selection - measure it immediately and stay in idle waiting for second edge
        const polygon = buildWallPolygon(edgeHit.wall, scene);
        const startVertex = polygon[edgeHit.edgeIndex];
        const endVertex = polygon[(edgeHit.edgeIndex + 1) % polygon.length];
        const lengthMm = vec.distance(startVertex, endVertex);
        
        this.context = {
          state: 'idle',
          measurement: {
            type: 'wall-edge',
            startMm: startVertex,
            endMm: endVertex,
            lengthMm,
            wallId: edgeHit.wall.id,
            edgeIndex: edgeHit.edgeIndex,
            edge1: {
              wallId: edgeHit.wall.id,
              edgeIndex: edgeHit.edgeIndex,
              startMm: startVertex,
              endMm: endVertex,
              lengthMm,
            },
          },
          hoverTarget: null,
          previewStartMm: null,
          previewEndMm: null,
          firstSelection: { 
            type: 'edge', 
            id: edgeHit.wall.id, 
            edgeIndex: edgeHit.edgeIndex 
          },
          snapCandidate: null,
        };
        this.onStateChange(this.context);
        return;
      }
      
      // Fall back to wall centerline (single click measurement)
      const hitWallId = hitTestWalls(worldMm, scene, wallHitRadiusMm);
      if (hitWallId) {
        const wall = scene.walls.get(hitWallId)!;
        const nodeA = scene.nodes.get(wall.nodeAId)!;
        const nodeB = scene.nodes.get(wall.nodeBId)!;
        const lengthMm = vec.distance(nodeA, nodeB);
        
        this.context = {
          state: 'idle',
          measurement: {
            type: 'wall-centerline',
            startMm: { x: nodeA.x, y: nodeA.y },
            endMm: { x: nodeB.x, y: nodeB.y },
            lengthMm,
            wallId: hitWallId,
            nodeAId: wall.nodeAId,
            nodeBId: wall.nodeBId,
            edge1: {
              wallId: hitWallId,
              startMm: { x: nodeA.x, y: nodeA.y },
              endMm: { x: nodeB.x, y: nodeB.y },
              lengthMm,
              isCenterline: true,
            },
          },
          hoverTarget: null,
          previewStartMm: null,
          previewEndMm: null,
          firstSelection: { 
            type: 'centerline', 
            id: hitWallId 
          },
          snapCandidate: null,
        };
        this.onStateChange(this.context);
      }
    } else if (this.context.state === 'idle' && this.context.firstSelection) {
      // Second selection
      const edgeHitRadiusMm = 15 / viewport.scale;
      const wallHitRadiusMm = 20 / viewport.scale;
      
      const edgeHit = this.hitTestEdges(worldMm, scene, edgeHitRadiusMm);
      const wallHit = edgeHit ? null : hitTestWalls(worldMm, scene, wallHitRadiusMm);
      
      if (edgeHit) {
        // Check if clicking same edge
        if (this.context.firstSelection.type === 'edge' &&
            edgeHit.wall.id === this.context.firstSelection.id && 
            edgeHit.edgeIndex === this.context.firstSelection.edgeIndex) {
          return; // Same edge, do nothing
        }
        
        // Different edge - calculate measurement
        if (this.context.firstSelection.type === 'edge') {
          const measurement = this.calculateEdgeToEdgeMeasurement(
            this.context.firstSelection.id,
            this.context.firstSelection.edgeIndex!,
            edgeHit.wall.id,
            edgeHit.edgeIndex,
            scene
          );
          
          if (measurement) {
            this.context = {
              state: 'complete',
              measurement,
              hoverTarget: null,
              previewStartMm: null,
              previewEndMm: null,
              firstSelection: null,
              snapCandidate: null,
            };
            this.onStateChange(this.context);
          }
        } else if (this.context.firstSelection.type === 'centerline') {
          // Centerline to edge
          const measurement = this.calculateCenterlineToEdgeMeasurement(
            this.context.firstSelection.id,
            edgeHit.wall.id,
            edgeHit.edgeIndex,
            scene
          );
          
          if (measurement) {
            this.context = {
              state: 'complete',
              measurement,
              hoverTarget: null,
              previewStartMm: null,
              previewEndMm: null,
              firstSelection: null,
              snapCandidate: null,
            };
            this.onStateChange(this.context);
          }
        }
      } else if (wallHit) {
        // Check if clicking same wall
        if (wallHit === this.context.firstSelection.id) {
          return; // Same wall, do nothing
        }
        
        // Handle different cases based on first selection type
        if (this.context.firstSelection.type === 'node') {
          // Point-to-centerline measurement
          const measurement = this.calculatePointToLineMeasurement(
            this.context.firstSelection.id,
            wallHit,
            scene
          );
          
          if (measurement) {
            this.context = {
              state: 'complete',
              measurement,
              hoverTarget: null,
              previewStartMm: null,
              previewEndMm: null,
              firstSelection: null,
              snapCandidate: null,
            };
            this.onStateChange(this.context);
          }
          return;
        }
        
        // Different wall - calculate centerline to centerline
        const measurement = this.calculateCenterlineToCenterlineMeasurement(
          this.context.firstSelection.id,
          wallHit,
          scene
        );
        
        if (measurement) {
          this.context = {
            state: 'complete',
            measurement,
            hoverTarget: null,
            previewStartMm: null,
            previewEndMm: null,
            firstSelection: null,
            snapCandidate: null,
          };
          this.onStateChange(this.context);
        }
      } else {
        // Clicked away - reset
        this.reset();
      }
    } else if (this.context.state === 'measuring') {
      // Second click while measuring (node-to-node) - commit measurement
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToGuidelines: true,
        }
      );
      
      const endPoint = snapResult.snapped ? snapResult.point : worldMm;
      const startNode = scene.nodes.get(this.context.firstSelection!.id)!;
      const lengthMm = vec.distance(startNode, endPoint);
      
      // Check minimum distance
      if (lengthMm > 10) { // At least 10mm
        const hitNodeId = hitTestNodes(worldMm, scene, NODE_RADIUS_MM);
        
        this.context = {
          state: 'complete',
          measurement: {
            type: 'node-to-node',
            startMm: { x: startNode.x, y: startNode.y },
            endMm: endPoint,
            lengthMm,
            nodeAId: this.context.firstSelection!.id,
            nodeBId: hitNodeId || undefined,
          },
          hoverTarget: null,
          previewStartMm: null,
          previewEndMm: null,
          firstSelection: null,
          snapCandidate: null,
        };
        this.onStateChange(this.context);
      } else {
        // Too short, cancel
        this.reset();
      }
    } else if (this.context.state === 'complete') {
      // Click away to deselect or start new measurement
      const nodeRadiusMm = NODE_RADIUS_MM;
      const wallHitRadiusMm = 20 / viewport.scale;
      const edgeHitRadiusMm = 15 / viewport.scale;
      
      const hitNodeId = hitTestNodes(worldMm, scene, nodeRadiusMm);
      const edgeHit = this.hitTestEdges(worldMm, scene, edgeHitRadiusMm);
      const hitWallId = hitTestWalls(worldMm, scene, wallHitRadiusMm);
      
      // If clicking away from any measurable target, reset
      if (!hitNodeId && !edgeHit && !hitWallId) {
        this.reset();
      }
    }
  }

  handlePointerMove(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    const worldMm = screenToWorld(screenPx, viewport);
    
    if (this.context.state === 'idle' && !this.context.firstSelection) {
      // Show hover target when nothing is selected
      const nodeRadiusMm = NODE_RADIUS_MM;
      const wallHitRadiusMm = 20 / viewport.scale;
      const edgeHitRadiusMm = 15 / viewport.scale;
      
      const hitNodeId = hitTestNodes(worldMm, scene, nodeRadiusMm);
      
      if (hitNodeId) {
        const newHoverTarget = { type: 'node' as const, id: hitNodeId };
        if (newHoverTarget.id !== this.context.hoverTarget?.id) {
          this.context = {
            ...this.context,
            hoverTarget: newHoverTarget,
          };
          this.onStateChange(this.context);
        }
        return;
      }
      
      const edgeHit = this.hitTestEdges(worldMm, scene, edgeHitRadiusMm);
      if (edgeHit) {
        const newHoverTarget = { 
          type: 'edge' as const, 
          id: edgeHit.wall.id,
          edgeIndex: edgeHit.edgeIndex 
        };
        
        if (newHoverTarget.id !== this.context.hoverTarget?.id || 
            newHoverTarget.edgeIndex !== this.context.hoverTarget?.edgeIndex) {
          this.context = {
            ...this.context,
            hoverTarget: newHoverTarget,
          };
          this.onStateChange(this.context);
        }
        return;
      }
      
      const hitWallId = hitTestWalls(worldMm, scene, wallHitRadiusMm);
      const newHoverTarget = hitWallId ? { type: 'wall' as const, id: hitWallId } : null;
      
      if (newHoverTarget?.id !== this.context.hoverTarget?.id) {
        this.context = {
          ...this.context,
          hoverTarget: newHoverTarget,
        };
        this.onStateChange(this.context);
      }
    } else if (this.context.state === 'idle' && this.context.firstSelection) {
      // Hovering with a selection - show preview for second target
      const edgeHitRadiusMm = 15 / viewport.scale;
      const wallHitRadiusMm = 20 / viewport.scale;
      
      const edgeHit = this.hitTestEdges(worldMm, scene, edgeHitRadiusMm);
      const wallHit = edgeHit ? null : hitTestWalls(worldMm, scene, wallHitRadiusMm);
      
      if (edgeHit) {
        const newHoverTarget = { 
          type: 'edge' as const, 
          id: edgeHit.wall.id,
          edgeIndex: edgeHit.edgeIndex 
        };
        
        this.context = {
          ...this.context,
          hoverTarget: newHoverTarget,
        };
        this.onStateChange(this.context);
      } else if (wallHit) {
        const newHoverTarget = { type: 'wall' as const, id: wallHit };
        
        this.context = {
          ...this.context,
          hoverTarget: newHoverTarget,
        };
        this.onStateChange(this.context);
      } else {
        this.context = {
          ...this.context,
          hoverTarget: null,
        };
        this.onStateChange(this.context);
      }
    } else if (this.context.state === 'click-pending') {
      // Check if mouse has moved far enough to be considered a drag
      if (this.mouseDownScreenPos) {
        const dx = screenPx.x - this.mouseDownScreenPos.x;
        const dy = screenPx.y - this.mouseDownScreenPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > MIN_DRAG_DISTANCE_PX) {
          // Transition to measuring (dragging) mode
          this.context = {
            ...this.context,
            state: 'measuring',
          };
          this.mouseDownScreenPos = null;
        }
      }

      // Update preview with snapping for node-to-node measurement
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToGuidelines: true,
          guidelineOrigin: this.context.previewStartMm || undefined,
        }
      );
      
      this.context = {
        ...this.context,
        previewEndMm: snapResult.snapped ? snapResult.point : worldMm,
        snapCandidate: snapResult.candidate || null,
      };
      this.onStateChange(this.context);
    } else if (this.context.state === 'measuring') {
      // Update preview with snapping for node-to-node measurement
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToGuidelines: true,
          guidelineOrigin: this.context.previewStartMm || undefined,
        }
      );
      
      this.context = {
        ...this.context,
        previewEndMm: snapResult.snapped ? snapResult.point : worldMm,
        snapCandidate: snapResult.candidate || null,
      };
      this.onStateChange(this.context);
    }
  }

  handlePointerUp(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    const worldMm = screenToWorld(screenPx, viewport);
    
    if (this.context.state === 'click-pending') {
      // Mouse up without dragging - commit first point and wait for second click
      this.mouseDownScreenPos = null;
      
      this.context = {
        ...this.context,
        state: 'measuring',
      };
      this.onStateChange(this.context);
      return;
    }
    
    if (this.context.state === 'measuring' && this.context.firstSelection?.type === 'node') {
      // Complete node-to-node measurement (drag release)
      const nodeRadiusMm = NODE_RADIUS_MM;
      const hitNodeId = hitTestNodes(worldMm, scene, nodeRadiusMm);
      
      // Use snapped position if available
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToGuidelines: true,
        }
      );
      
      const endPoint = snapResult.snapped ? snapResult.point : worldMm;
      const startNode = scene.nodes.get(this.context.firstSelection.id)!;
      const lengthMm = vec.distance(startNode, endPoint);
      
      // Only commit if length is reasonable
      if (lengthMm > 10) { // At least 10mm
        this.context = {
          state: 'complete',
          measurement: {
            type: 'node-to-node',
            startMm: { x: startNode.x, y: startNode.y },
            endMm: endPoint,
            lengthMm,
            nodeAId: this.context.firstSelection.id,
            nodeBId: hitNodeId || undefined,
          },
          hoverTarget: null,
          previewStartMm: null,
          previewEndMm: null,
          firstSelection: null,
          snapCandidate: null,
        };
        this.onStateChange(this.context);
      } else {
        // Too short, cancel
        this.reset();
      }
    }
  }

  /**
   * Calculate perpendicular distance from point to line (centerline)
   */
  private calculatePointToLineMeasurement(
    nodeId: string,
    wallId: string,
    scene: Scene
  ): Measurement | null {
    const node = scene.nodes.get(nodeId)!;
    const wall = scene.walls.get(wallId)!;
    const wallNodeA = scene.nodes.get(wall.nodeAId)!;
    const wallNodeB = scene.nodes.get(wall.nodeBId)!;
    
    // Project point onto line segment
    const projected = this.projectOntoSegment(node, wallNodeA, wallNodeB);
    const distance = vec.distance(node, projected);
    
    return {
      type: 'point-to-line',
      startMm: { x: node.x, y: node.y },
      endMm: projected,
      lengthMm: distance,
      nodeAId: nodeId,
      wallId: wallId,
      edge1: {
        wallId: wallId,
        startMm: wallNodeA,
        endMm: wallNodeB,
        lengthMm: vec.distance(wallNodeA, wallNodeB),
        isCenterline: true,
      },
    };
  }

  /**
   * Calculate measurement between centerline and edge
   */
  private calculateCenterlineToEdgeMeasurement(
    centerlineWallId: string,
    edgeWallId: string,
    edgeIndex: number,
    scene: Scene
  ): Measurement | null {
    const centerlineWall = scene.walls.get(centerlineWallId)!;
    const centerlineNodeA = scene.nodes.get(centerlineWall.nodeAId)!;
    const centerlineNodeB = scene.nodes.get(centerlineWall.nodeBId)!;
    
    const polygon = buildWallPolygon(scene.walls.get(edgeWallId)!, scene);
    const edgeStart = polygon[edgeIndex];
    const edgeEnd = polygon[(edgeIndex + 1) % polygon.length];
    
    return this.calculateLineMeasurements(
      centerlineNodeA, centerlineNodeB,
      edgeStart, edgeEnd,
      {
        wallId: centerlineWallId,
        startMm: centerlineNodeA,
        endMm: centerlineNodeB,
        lengthMm: vec.distance(centerlineNodeA, centerlineNodeB),
        isCenterline: true,
      },
      {
        wallId: edgeWallId,
        edgeIndex,
        startMm: edgeStart,
        endMm: edgeEnd,
        lengthMm: vec.distance(edgeStart, edgeEnd),
      },
      scene
    );
  }

  /**
   * Calculate measurement between two centerlines
   */
  private calculateCenterlineToCenterlineMeasurement(
    wallId1: string,
    wallId2: string,
    scene: Scene
  ): Measurement | null {
    const wall1 = scene.walls.get(wallId1)!;
    const wall1NodeA = scene.nodes.get(wall1.nodeAId)!;
    const wall1NodeB = scene.nodes.get(wall1.nodeBId)!;
    
    const wall2 = scene.walls.get(wallId2)!;
    const wall2NodeA = scene.nodes.get(wall2.nodeAId)!;
    const wall2NodeB = scene.nodes.get(wall2.nodeBId)!;
    
    return this.calculateLineMeasurements(
      wall1NodeA, wall1NodeB,
      wall2NodeA, wall2NodeB,
      {
        wallId: wallId1,
        startMm: wall1NodeA,
        endMm: wall1NodeB,
        lengthMm: vec.distance(wall1NodeA, wall1NodeB),
        isCenterline: true,
      },
      {
        wallId: wallId2,
        startMm: wall2NodeA,
        endMm: wall2NodeB,
        lengthMm: vec.distance(wall2NodeA, wall2NodeB),
        isCenterline: true,
      },
      scene
    );
  }

  /**
   * Calculate measurement between two edges
   */
  private calculateEdgeToEdgeMeasurement(
    wallId1: string,
    edgeIndex1: number,
    wallId2: string,
    edgeIndex2: number,
    scene: Scene
  ): Measurement | null {
    const polygon1 = buildWallPolygon(scene.walls.get(wallId1)!, scene);
    const polygon2 = buildWallPolygon(scene.walls.get(wallId2)!, scene);
    
    const edge1Start = polygon1[edgeIndex1];
    const edge1End = polygon1[(edgeIndex1 + 1) % polygon1.length];
    const edge2Start = polygon2[edgeIndex2];
    const edge2End = polygon2[(edgeIndex2 + 1) % polygon2.length];
    
    return this.calculateLineMeasurements(
      edge1Start, edge1End,
      edge2Start, edge2End,
      {
        wallId: wallId1,
        edgeIndex: edgeIndex1,
        startMm: edge1Start,
        endMm: edge1End,
        lengthMm: vec.distance(edge1Start, edge1End),
      },
      {
        wallId: wallId2,
        edgeIndex: edgeIndex2,
        startMm: edge2Start,
        endMm: edge2End,
        lengthMm: vec.distance(edge2Start, edge2End),
      },
      scene
    );
  }

  /**
   * Generic line measurement calculation with horizontal/vertical distances
   */
  private calculateLineMeasurements(
    a1: Vec2, a2: Vec2,
    b1: Vec2, b2: Vec2,
    edge1Info: any,
    edge2Info: any,
    scene: Scene
  ): Measurement {
    // Check if lines share a node
    const hasSharedNode = 
      vec.distance(a1, b1) < CONNECTION_TOLERANCE_MM ||
      vec.distance(a1, b2) < CONNECTION_TOLERANCE_MM ||
      vec.distance(a2, b1) < CONNECTION_TOLERANCE_MM ||
      vec.distance(a2, b2) < CONNECTION_TOLERANCE_MM;

    const dir1 = vec.normalize(vec.sub(a2, a1));
    const dir2 = vec.normalize(vec.sub(b2, b1));
    
    const dotProduct = vec.dot(dir1, dir2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
    
    const PARALLEL_THRESHOLD = 0.087; // ~5 degrees
    const COLLINEAR_THRESHOLD = 0.017; // ~1 degree
    
    // ❌ REMOVE these console.log statements
    // console.log('🔍 Line Measurement Analysis:', { ... });
    
    // Check if parallel (includes opposite directions)
    if (angle < PARALLEL_THRESHOLD || Math.abs(angle - Math.PI) < PARALLEL_THRESHOLD) {
      // ❌ REMOVE: console.log('✅ Detected as PARALLEL');
      
      // Check if truly collinear (on the same line) vs just parallel (same slope, different lines)
      const ab = vec.sub(a2, a1);
      const ap = vec.sub(b1, a1);
      const t = vec.dot(ap, ab) / vec.dot(ab, ab);
      const projected = vec.add(a1, vec.scale(ab, t));
      const perpDistance = vec.distance(b1, projected);
      
      // ❌ REMOVE: console.log('🔍 Collinearity check:', { ... });
      
      // If perpendicular distance is very small, they're on the same line (collinear)
      if (perpDistance < 1.0) { // 1mm tolerance
        // ❌ REMOVE: console.log('✅ Lines are COLLINEAR (on same line)');
        return {
          type: 'collinear-distance',
          startMm: a1,
          endMm: a2,
          lengthMm: 0,
          edge1: edge1Info,
          edge2: edge2Info,
          hasSharedNode,
        };
      }
      
      // Otherwise they're parallel but on different lines
      // ❌ REMOVE: console.log('✅ Lines are PARALLEL (different lines)');
      
      // Use first line's start point as perpendicular origin
      const perpDist = this.calculatePerpendicularDistanceFromPoint(a1, b1, b2);
      
      // ❌ REMOVE: console.log('🔵 Parallel Distance Calculation:', { ... });
      
      const result = {
        type: 'parallel-distance' as const,
        startMm: a1,
        endMm: perpDist.endMm,
        lengthMm: perpDist.lengthMm,
        edge1: edge1Info,
        edge2: edge2Info,
        minHorizontal: hasSharedNode ? undefined : this.calculateHorizontalDistance(a1, a2, b1, b2, true),
        minVertical: hasSharedNode ? undefined : this.calculateVerticalDistance(a1, a2, b1, b2, true),
        hasSharedNode,
      };
      
      // ❌ REMOVE: console.log('📦 Returning parallel measurement:', result);
      return result;
    }
    
    // ❌ REMOVE: console.log('✅ Detected as NON-PARALLEL');
    
    // Non-parallel lines
    const { minH, maxH } = this.calculateHorizontalExtremes(a1, a2, b1, b2);
    const { minV, maxV } = this.calculateVerticalExtremes(a1, a2, b1, b2);
    
    return {
      type: 'closest-distance',
      startMm: a1,
      endMm: a2,
      lengthMm: vec.distance(a1, b1),
      edge1: edge1Info,
      edge2: edge2Info,
      minHorizontal: hasSharedNode ? undefined : minH,
      maxHorizontal: maxH,
      minVertical: hasSharedNode ? undefined : minV,
      maxVertical: maxV,
      hasSharedNode,
    };
  }
      
  /**
   * Calculate perpendicular distance from a point to a line segment
   */
  private calculatePerpendicularDistanceFromPoint(
    point: Vec2,
    lineStart: Vec2,
    lineEnd: Vec2
  ): { startMm: Vec2; endMm: Vec2; lengthMm: number } {
    // Project point onto line segment
    const ab = vec.sub(lineEnd, lineStart);
    const ap = vec.sub(point, lineStart);
    const t = vec.dot(ap, ab) / vec.dot(ab, ab);
    
    // Clamp to segment bounds [0, 1]
    const tClamped = Math.max(0, Math.min(1, t));
    const projected = vec.add(lineStart, vec.scale(ab, tClamped));
    
    return {
      startMm: point,
      endMm: projected,
      lengthMm: vec.distance(point, projected),
    };
  }

  /**
   * Calculate perpendicular distance between parallel lines (LEGACY - kept for reference)
   * Returns perpendicular from line 1's start point (a1) to line 2
   */
  private calculatePerpendicularDistance(
    a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2
  ): { startMm: Vec2; endMm: Vec2; lengthMm: number } {
    // Project a1 onto line 2
    const ab = vec.sub(b2, b1);
    const ap = vec.sub(a1, b1);
    const t = vec.dot(ap, ab) / vec.dot(ab, ab);
    const projected = vec.add(b1, vec.scale(ab, t));
    
    return {
      startMm: a1,
      endMm: projected,
      lengthMm: vec.distance(a1, projected),
    };
  }

  /**
   * Calculate horizontal distance (minimum or maximum)
   */
  private calculateHorizontalDistance(
    a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2, minimum: boolean
  ): { startMm: Vec2; endMm: Vec2; lengthMm: number } {
    const points = [
      { point: a1, other: b1, dx: Math.abs(a1.x - b1.x) },
      { point: a1, other: b2, dx: Math.abs(a1.x - b2.x) },
      { point: a2, other: b1, dx: Math.abs(a2.x - b1.x) },
      { point: a2, other: b2, dx: Math.abs(a2.x - b2.x) },
    ];
    
    points.sort((p1, p2) => minimum ? p1.dx - p2.dx : p2.dx - p1.dx);
    const best = points[0];
    
    // Create horizontal line
    const start = { x: best.point.x, y: best.point.y };
    const end = { x: best.other.x, y: best.point.y };
    
    return {
      startMm: start,
      endMm: end,
      lengthMm: Math.abs(end.x - start.x),
    };
  }

  /**
   * Calculate vertical distance (minimum or maximum)
   */
  private calculateVerticalDistance(
    a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2, minimum: boolean
  ): { startMm: Vec2; endMm: Vec2; lengthMm: number } {
    const points = [
      { point: a1, other: b1, dy: Math.abs(a1.y - b1.y) },
      { point: a1, other: b2, dy: Math.abs(a1.y - b2.y) },
      { point: a2, other: b1, dy: Math.abs(a2.y - b1.y) },
      { point: a2, other: b2, dy: Math.abs(a2.y - b2.y) },
    ];
    
    points.sort((p1, p2) => minimum ? p1.dy - p2.dy : p2.dy - p1.dy);
    const best = points[0];
    
    // Create vertical line
    const start = { x: best.point.x, y: best.point.y };
    const end = { x: best.point.x, y: best.other.y };
    
    return {
      startMm: start,
      endMm: end,
      lengthMm: Math.abs(end.y - start.y),
    };
  }

  /**
   * Calculate horizontal extremes (min and max)
   */
  private calculateHorizontalExtremes(
    a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2
  ): { minH: { startMm: Vec2; endMm: Vec2; lengthMm: number }; 
       maxH: { startMm: Vec2; endMm: Vec2; lengthMm: number } } {
    return {
      minH: this.calculateHorizontalDistance(a1, a2, b1, b2, true),
      maxH: this.calculateHorizontalDistance(a1, a2, b1, b2, false),
    };
  }

  /**
   * Calculate vertical extremes (min and max)
   */
  private calculateVerticalExtremes(
    a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2
  ): { minV: { startMm: Vec2; endMm: Vec2; lengthMm: number }; 
       maxV: { startMm: Vec2; endMm: Vec2; lengthMm: number } } {
    return {
      minV: this.calculateVerticalDistance(a1, a2, b1, b2, true),
      maxV: this.calculateVerticalDistance(a1, a2, b1, b2, false),
    };
  }

  /**
   * Project point onto line defined by two points
   */
  private projectOntoLine(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
    const ab = vec.sub(lineEnd, lineStart);
    const ap = vec.sub(point, lineStart);
    return vec.dot(ap, ab) / vec.dot(ab, ab);
  }

  /**
   * Project point onto segment and clamp to segment bounds
   */
  private projectOntoSegment(point: Vec2, segStart: Vec2, segEnd: Vec2): Vec2 {
    const ab = vec.sub(segEnd, segStart);
    const ap = vec.sub(point, segStart);
    let t = vec.dot(ap, ab) / vec.dot(ab, ab);
    t = Math.max(0, Math.min(1, t));
    return vec.add(segStart, vec.scale(ab, t));
  }

  /**
   * Hit test wall polygon edges (post-miter)
   */
  private hitTestEdges(
    worldMm: Vec2, 
    scene: Scene, 
    hitRadiusMm: number
  ): { wall: any; edgeIndex: number } | null {
    let closestEdge: { wall: any; edgeIndex: number } | null = null;
    let closestDistance = hitRadiusMm;

    for (const wall of scene.walls.values()) {
      const polygon = buildWallPolygon(wall, scene);
      
      for (let i = 0; i < polygon.length; i++) {
        const start = polygon[i];
        const end = polygon[(i + 1) % polygon.length];
        
        const edge = vec.sub(end, start);
        const pointToStart = vec.sub(worldMm, start);
        
        const edgeLengthSq = vec.dot(edge, edge);
        if (edgeLengthSq === 0) continue;
        
        let t = vec.dot(pointToStart, edge) / edgeLengthSq;
        t = Math.max(0, Math.min(1, t));
        
        const projected = vec.add(start, vec.scale(edge, t));
        const distance = vec.distance(worldMm, projected);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEdge = { wall, edgeIndex: i };
        }
      }
    }

    return closestEdge;
  }

  reset(): void {
    this.context = {
      state: 'idle',
      measurement: null,
      hoverTarget: null,
      previewStartMm: null,
      previewEndMm: null,
      firstSelection: null,
      snapCandidate: null,
    };
    this.mouseDownScreenPos = null;
    this.onStateChange(this.context);
  }

  getContext(): MeasureToolContext {
    return this.context;
  }
}
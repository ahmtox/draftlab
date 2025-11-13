import type { Vec2 } from '../math/vec';
import * as vec from '../math/vec';
import type { Node, Scene } from '../domain/types';
import type { Viewport } from '../../renderers/konva/viewport';
import { screenToWorld } from '../../renderers/konva/viewport';
import { DEFAULT_TOL } from '../constants';
import { generateNodeGuidelines, findClosestGuideline, type Guideline } from './guides';

export type SnapType = 'node' | 'grid' | 'edge' | 'midpoint' | 'angle' | 'guideline';

export type SnapCandidate = {
  point: Vec2;          // mm world coords
  type: SnapType;
  entityId?: string;    // for node/edge snaps
  priority: number;     // higher = stronger
  distancePx: number;   // screen-space distance for display
  guideline?: Guideline; // for guideline snaps
};

export type SnapResult = {
  snapped: boolean;
  point: Vec2;          // mm world coords
  candidate?: SnapCandidate;
};

/**
 * Find the best snap candidate near a screen-space cursor position
 */
export function findSnapCandidate(
  cursorScreenPx: Vec2,
  scene: Scene,
  viewport: Viewport,
  options: {
    snapToGrid?: boolean;
    snapToNodes?: boolean;
    snapToEdges?: boolean;
    snapToAngles?: boolean;
    snapToGuidelines?: boolean;
    angleOrigin?: Vec2;
    excludeNodeIds?: Set<string>;
    guidelineOrigin?: Vec2; // Origin point for filtering redundant guidelines
  } = {}
): SnapResult {
  const {
    snapToGrid = true,
    snapToNodes = true,
    snapToEdges = true,
    snapToAngles = false,
    snapToGuidelines = false,
    angleOrigin = null,
    excludeNodeIds = new Set(),
    guidelineOrigin = null,
  } = options;

  const cursorWorldMm = screenToWorld(cursorScreenPx, viewport);
  const candidates: SnapCandidate[] = [];

  // Convert snap radius from screen pixels to world mm
  const snapRadiusMm = DEFAULT_TOL.snapPx / viewport.scale;

  // If angle snapping is active, compute the snapped angle first
  let snappedAngleRad: number | null = null;
  let angleDirection: Vec2 | null = null;

  if (snapToAngles && angleOrigin) {
    const ANGLE_INCREMENT_DEG = 15;
    const ANGLE_INCREMENT_RAD = (ANGLE_INCREMENT_DEG * Math.PI) / 180;

    const delta = vec.sub(cursorWorldMm, angleOrigin);
    const distance = vec.length(delta);

    if (distance >= 1) {
      const currentAngle = Math.atan2(delta.y, delta.x);
      snappedAngleRad = Math.round(currentAngle / ANGLE_INCREMENT_RAD) * ANGLE_INCREMENT_RAD;
      angleDirection = {
        x: Math.cos(snappedAngleRad),
        y: Math.sin(snappedAngleRad),
      };
    }
  }

  // Collect all snap candidates within snap radius
  // (we'll filter by angle line later if angle snapping is active)

  // Guideline snapping (priority 1 - lowest, just alignment aids)
  if (snapToGuidelines) {
    const GUIDELINE_TOLERANCE_MM = 50; // Keep at 50mm always
    
    // Pass guidelineOrigin to filter redundant guidelines
    const guidelines = generateNodeGuidelines(scene, excludeNodeIds, guidelineOrigin);
    const guidelineSnap = findClosestGuideline(cursorWorldMm, guidelines, GUIDELINE_TOLERANCE_MM);

    if (guidelineSnap) {
      const distanceMm = vec.distance(cursorWorldMm, guidelineSnap.snapPoint);
      const distancePx = distanceMm * viewport.scale;

      candidates.push({
        point: guidelineSnap.snapPoint,
        type: 'guideline',
        entityId: guidelineSnap.guideline.nodeId,
        priority: 1, // Lowest priority - just visual alignment
        distancePx,
        guideline: guidelineSnap.guideline,
      });
    }
  }

  // Grid snapping (priority 2 - slightly above guidelines)
  if (snapToGrid) {
    const gridCandidate = snapToGridPoint(cursorWorldMm, viewport);
    if (gridCandidate && gridCandidate.distancePx <= DEFAULT_TOL.snapPx) {
      candidates.push(gridCandidate);
    }
  }

  // Edge snapping (priority 3)
  if (snapToEdges) {
    for (const wall of scene.walls.values()) {
      const nodeA = scene.nodes.get(wall.nodeAId);
      const nodeB = scene.nodes.get(wall.nodeBId);

      if (!nodeA || !nodeB) continue;

      const projected = projectPointToSegment(cursorWorldMm, nodeA, nodeB);
      const distanceMm = vec.distance(cursorWorldMm, projected.point);
      const distancePx = distanceMm * viewport.scale;

      if (distancePx <= DEFAULT_TOL.snapPx && projected.t > 0.05 && projected.t < 0.95) {
        candidates.push({
          point: projected.point,
          type: 'edge',
          entityId: wall.id,
          priority: 3,
          distancePx,
        });
      }
    }
  }

  // Midpoint snapping (priority 4)
  if (snapToEdges) {
    for (const wall of scene.walls.values()) {
      const nodeA = scene.nodes.get(wall.nodeAId);
      const nodeB = scene.nodes.get(wall.nodeBId);

      if (!nodeA || !nodeB) continue;

      const midpoint = {
        x: (nodeA.x + nodeB.x) / 2,
        y: (nodeA.y + nodeB.y) / 2,
      };

      const distanceMm = vec.distance(cursorWorldMm, midpoint);
      const distancePx = distanceMm * viewport.scale;

      if (distancePx <= DEFAULT_TOL.snapPx) {
        candidates.push({
          point: midpoint,
          type: 'midpoint',
          entityId: wall.id,
          priority: 4,
          distancePx,
        });
      }
    }
  }

  // Node snapping (priority 5 - highest for geometry)
  if (snapToNodes) {
    for (const node of scene.nodes.values()) {
      if (excludeNodeIds.has(node.id)) continue;

      const distanceMm = vec.distance(cursorWorldMm, node);
      const distancePx = distanceMm * viewport.scale;

      if (distancePx <= DEFAULT_TOL.snapPx) {
        candidates.push({
          point: { x: node.x, y: node.y },
          type: 'node',
          entityId: node.id,
          priority: 5,
          distancePx,
        });
      }
    }
  }

  // If angle snapping is active, handle guideline intersections specially
  if (snapToAngles && angleOrigin && angleDirection) {
    // Check if cursor is near any guideline
    if (snapToGuidelines) {
      const GUIDELINE_PROXIMITY_MM = 50; // Distance to activate guideline snap
      const guidelines = generateNodeGuidelines(scene, excludeNodeIds, guidelineOrigin);

      // For each guideline, compute intersection with angle line
      for (const guideline of guidelines) {
        const intersection = intersectAngleLineWithGuideline(
          angleOrigin,
          angleDirection,
          guideline
        );

        if (!intersection) continue;

        // Check if cursor is close enough to the guideline to activate snap
        const distanceToGuideline = guideline.type === 'horizontal'
          ? Math.abs(cursorWorldMm.y - guideline.value)
          : Math.abs(cursorWorldMm.x - guideline.value);

        if (distanceToGuideline <= GUIDELINE_PROXIMITY_MM) {
          // Snap to the intersection point (locked, no drag)
          const distanceMm = vec.distance(cursorWorldMm, intersection);
          const distancePx = distanceMm * viewport.scale;

          return {
            snapped: true,
            point: intersection,
            candidate: {
              point: intersection,
              type: 'guideline',
              entityId: guideline.nodeId,
              priority: 11, // Boosted priority (guideline on angle line)
              distancePx,
              guideline,
            },
          };
        }
      }
    }

    // No guideline intersection - filter other candidates by angle line
    const filteredCandidates = candidates.filter((candidate) => {
      // Skip guidelines here (handled above)
      if (candidate.type === 'guideline') return false;

      // Use tight tolerance for geometry snaps
      const tolerance = 1.0; // 1mm for nodes, edges, midpoints, grid
      return isPointOnAngleLine(candidate.point, angleOrigin, angleDirection, tolerance);
    });

    // If we found candidates on the angle line, use them (they have higher priority)
    if (filteredCandidates.length > 0) {
      // Boost priority of angle-aligned candidates
      filteredCandidates.forEach(c => c.priority += 10);
      
      // Sort and return best
      filteredCandidates.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.distancePx - b.distancePx;
      });

      return {
        snapped: true,
        point: filteredCandidates[0].point,
        candidate: filteredCandidates[0],
      };
    }

    // No candidates on angle line - snap to angle-constrained cursor position
    const delta = vec.sub(cursorWorldMm, angleOrigin);
    const distance = vec.length(delta);

    if (distance >= 1) {
      const angleSnappedPoint = {
        x: angleOrigin.x + distance * angleDirection.x,
        y: angleOrigin.y + distance * angleDirection.y,
      };

      const distanceMm = vec.distance(cursorWorldMm, angleSnappedPoint);
      const distancePx = distanceMm * viewport.scale;

      return {
        snapped: true,
        point: angleSnappedPoint,
        candidate: {
          point: angleSnappedPoint,
          type: 'angle',
          priority: 9,
          distancePx,
        },
      };
    }
  }

  // No angle snapping - use normal priority sorting
  if (candidates.length === 0) {
    return {
      snapped: false,
      point: cursorWorldMm,
    };
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // higher priority first
    }
    return a.distancePx - b.distancePx; // closer distance first
  });

  const best = candidates[0];

  return {
    snapped: true,
    point: best.point,
    candidate: best,
  };
}

/**
 * Intersect angle line with a guideline
 * Returns the intersection point where the angle line crosses the guideline
 */
function intersectAngleLineWithGuideline(
  angleOrigin: Vec2,
  angleDirection: Vec2,
  guideline: Guideline
): Vec2 | null {
  if (guideline.type === 'horizontal') {
    // Horizontal guideline: y = constant
    // Angle line: origin + t * direction
    // Solve: origin.y + t * direction.y = guideline.value
    
    if (Math.abs(angleDirection.y) < 1e-9) {
      // Angle line is horizontal, no intersection unless they're the same line
      return null;
    }

    const t = (guideline.value - angleOrigin.y) / angleDirection.y;
    
    // Only return intersection if it's in the positive direction from origin
    if (t < 0) return null;

    return {
      x: angleOrigin.x + t * angleDirection.x,
      y: guideline.value,
    };
  } else {
    // Vertical guideline: x = constant
    // Solve: origin.x + t * direction.x = guideline.value
    
    if (Math.abs(angleDirection.x) < 1e-9) {
      // Angle line is vertical, no intersection
      return null;
    }

    const t = (guideline.value - angleOrigin.x) / angleDirection.x;
    
    // Only return intersection if it's in the positive direction from origin
    if (t < 0) return null;

    return {
      x: guideline.value,
      y: angleOrigin.y + t * angleDirection.y,
    };
  }
}

/**
 * Check if a point lies on an angle line (with tolerance)
 */
function isPointOnAngleLine(
  point: Vec2,
  lineOrigin: Vec2,
  lineDirection: Vec2,
  toleranceMm: number = 1.0
): boolean {
  // Vector from origin to point
  const toPoint = vec.sub(point, lineOrigin);
  
  // Project onto the line direction
  const projection = vec.dot(toPoint, lineDirection);
  
  // Point on the line at the projection distance
  const projectedPoint = vec.add(lineOrigin, vec.scale(lineDirection, projection));
  
  // Perpendicular distance from point to line
  const perpDistance = vec.distance(point, projectedPoint);
  
  return perpDistance < toleranceMm;
}

/**
 * Snap to nearest grid point
 */
function snapToGridPoint(worldMm: Vec2, viewport: Viewport): SnapCandidate | null {
  const GRID_SPACING_MM = 1000; // from constants

  const snappedX = Math.round(worldMm.x / GRID_SPACING_MM) * GRID_SPACING_MM;
  const snappedY = Math.round(worldMm.y / GRID_SPACING_MM) * GRID_SPACING_MM;

  const snappedPoint = { x: snappedX, y: snappedY };
  const distanceMm = vec.distance(worldMm, snappedPoint);
  const distancePx = distanceMm * viewport.scale;

  return {
    point: snappedPoint,
    type: 'grid',
    priority: 2, // Just above guidelines
    distancePx,
  };
}

/**
 * Project point onto line segment
 */
function projectPointToSegment(
  point: Vec2,
  segmentA: Vec2,
  segmentB: Vec2
): { point: Vec2; t: number } {
  const ab = vec.sub(segmentB, segmentA);
  const ap = vec.sub(point, segmentA);

  const abLengthSq = vec.dot(ab, ab);

  if (abLengthSq === 0) {
    // Segment is a point
    return { point: segmentA, t: 0 };
  }

  let t = vec.dot(ap, ab) / abLengthSq;
  t = Math.max(0, Math.min(1, t)); // clamp to [0, 1]

  const projected = vec.add(segmentA, vec.scale(ab, t));

  return { point: projected, t };
}
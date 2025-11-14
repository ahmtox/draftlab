import type { Vec2 } from '../math/vec';
import * as vec from '../math/vec';
import type { Node, Scene } from '../domain/types';
import type { Viewport } from '../../renderers/konva/viewport';
import { screenToWorld } from '../../renderers/konva/viewport';
import { DEFAULT_TOL } from '../constants';
import { generateNodeGuidelines, findClosestGuideline, type Guideline } from './guides';

export type SnapType = 'node' | 'grid' | 'edge' | 'midpoint' | 'angle' | 'guideline' | 'guideline-intersection';

export type SnapCandidate = {
  point: Vec2;          // mm world coords
  type: SnapType;
  entityId?: string;    // for node/edge snaps
  priority: number;     // higher = stronger
  distancePx: number;   // screen-space distance for display
  guideline?: Guideline; // for guideline snaps
  guidelines?: Guideline[]; // for guideline intersection snaps
};

export type SnapResult = {
  snapped: boolean;
  point: Vec2;          // mm world coords
  candidate?: SnapCandidate;
};

/**
 * Priority hierarchy (higher = stronger):
 * 
 * Without angle snapping:
 * - 9: Node (highest - actual geometry)
 * - 8: Guideline intersection
 * - 7: Midpoint
 * - 6: Edge
 * - 5: Grid
 * - 4: Single guideline (lowest - just visual alignment)
 * 
 * With angle snapping (add +10 to base priority):
 * - 19: Node on angle line (highest)
 * - 18: Guideline intersection on angle line
 * - 17: Midpoint on angle line
 * - 16: Edge intersection with angle line
 * - 15: Grid on angle line
 * - 14: Single guideline on angle line
 * - 13: Angle-constrained cursor (fallback when no other snaps)
 */

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

  // Guideline snapping (priority 4 - lowest, just alignment aids)
  // Guideline intersection snapping (priority 8 - below nodes)
  if (snapToGuidelines) {
    const GUIDELINE_TOLERANCE_MM = 50; // Keep at 50mm always
    const INTERSECTION_TOLERANCE_MM = 50; // Distance to activate intersection snap
    
    // Pass guidelineOrigin to filter redundant guidelines
    const guidelines = generateNodeGuidelines(scene, excludeNodeIds, guidelineOrigin);
    
    // Check for guideline intersections (horizontal + vertical pairs)
    const horizontalGuidelines = guidelines.filter(g => g.type === 'horizontal');
    const verticalGuidelines = guidelines.filter(g => g.type === 'vertical');
    
    for (const hGuideline of horizontalGuidelines) {
      for (const vGuideline of verticalGuidelines) {
        // Intersection point is simply (vGuideline.value, hGuideline.value)
        const intersection: Vec2 = {
          x: vGuideline.value,
          y: hGuideline.value,
        };
        
        // Check if cursor is close to this intersection
        const distanceMm = vec.distance(cursorWorldMm, intersection);
        const distancePx = distanceMm * viewport.scale;
        
        if (distanceMm <= INTERSECTION_TOLERANCE_MM) {
          candidates.push({
            point: intersection,
            type: 'guideline-intersection',
            entityId: `${hGuideline.nodeId}-${vGuideline.nodeId}`,
            priority: 8, // Below nodes (9) but above midpoint (7)
            distancePx,
            guidelines: [hGuideline, vGuideline],
          });
        }
      }
    }
    
    // Single guideline snapping (if no intersection nearby)
    const guidelineSnap = findClosestGuideline(cursorWorldMm, guidelines, GUIDELINE_TOLERANCE_MM);

    if (guidelineSnap) {
      const distanceMm = vec.distance(cursorWorldMm, guidelineSnap.snapPoint);
      const distancePx = distanceMm * viewport.scale;

      candidates.push({
        point: guidelineSnap.snapPoint,
        type: 'guideline',
        entityId: guidelineSnap.guideline.nodeId,
        priority: 4, // Lowest priority - just visual alignment
        distancePx,
        guideline: guidelineSnap.guideline,
      });
    }
  }

  // Grid snapping (priority 5)
  if (snapToGrid) {
    const gridCandidate = snapToGridPoint(cursorWorldMm, viewport);
    if (gridCandidate && gridCandidate.distancePx <= DEFAULT_TOL.snapPx) {
      candidates.push(gridCandidate);
    }
  }

  // Edge snapping (priority 6)
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
          priority: 6,
          distancePx,
        });
      }
    }
  }

  // Midpoint snapping (priority 7)
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
          priority: 7,
          distancePx,
        });
      }
    }
  }

  // Node snapping (priority 9 - highest for geometry)
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
          priority: 9, // Highest priority - actual geometry merge points
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

      // Check for multiple guideline intersections on the angle line
      const intersectionsOnAngleLine: Array<{ intersection: Vec2; guidelines: Guideline[] }> = [];
      
      // Find all guideline intersections with the angle line
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
          intersectionsOnAngleLine.push({
            intersection,
            guidelines: [guideline],
          });
        }
      }

      // If we found multiple intersections, check if any are at the same point
      // (this would be a guideline intersection on the angle line)
      if (intersectionsOnAngleLine.length > 1) {
        const SAME_POINT_TOLERANCE = 1.0; // 1mm tolerance
        
        for (let i = 0; i < intersectionsOnAngleLine.length; i++) {
          for (let j = i + 1; j < intersectionsOnAngleLine.length; j++) {
            const pointA = intersectionsOnAngleLine[i].intersection;
            const pointB = intersectionsOnAngleLine[j].intersection;
            
            if (vec.distance(pointA, pointB) < SAME_POINT_TOLERANCE) {
              // These guidelines intersect at the same point on the angle line
              const intersection = pointA; // Use first point
              const combinedGuidelines = [
                ...intersectionsOnAngleLine[i].guidelines,
                ...intersectionsOnAngleLine[j].guidelines,
              ];
              
              const distanceMm = vec.distance(cursorWorldMm, intersection);
              const distancePx = distanceMm * viewport.scale;

              return {
                snapped: true,
                point: intersection,
                candidate: {
                  point: intersection,
                  type: 'guideline-intersection',
                  entityId: combinedGuidelines.map(g => g.nodeId).join('-'),
                  priority: 18, // 8 + 10 (below node on angle line which is 19)
                  distancePx,
                  guidelines: combinedGuidelines,
                },
              };
            }
          }
        }
      }

      // Single guideline intersection with angle line
      if (intersectionsOnAngleLine.length > 0) {
        // Use the closest intersection to cursor
        intersectionsOnAngleLine.sort((a, b) => {
          const distA = vec.distance(cursorWorldMm, a.intersection);
          const distB = vec.distance(cursorWorldMm, b.intersection);
          return distA - distB;
        });

        const closest = intersectionsOnAngleLine[0];
        const distanceMm = vec.distance(cursorWorldMm, closest.intersection);
        const distancePx = distanceMm * viewport.scale;

        return {
          snapped: true,
          point: closest.intersection,
          candidate: {
            point: closest.intersection,
            type: 'guideline',
            entityId: closest.guidelines[0].nodeId,
            priority: 14, // 4 + 10 (boosted priority for guideline on angle line)
            distancePx,
            guideline: closest.guidelines[0],
          },
        };
      }
    }

    // Filter candidates by angle line (including edges that intersect it)
    const filteredCandidates = candidates.filter((candidate) => {
      // Skip guidelines here (handled above)
      if (candidate.type === 'guideline' || candidate.type === 'guideline-intersection') return false;

      // For edges, check if the angle line intersects the edge segment
      if (candidate.type === 'edge') {
        // Get the wall's endpoints
        const wallId = candidate.entityId!;
        const wall = scene.walls.get(wallId);
        if (!wall) return false;

        const nodeA = scene.nodes.get(wall.nodeAId);
        const nodeB = scene.nodes.get(wall.nodeBId);
        if (!nodeA || !nodeB) return false;

        // Check if angle line intersects with the edge segment
        const intersection = intersectAngleLineWithSegment(
          angleOrigin,
          angleDirection,
          nodeA,
          nodeB
        );

        if (!intersection) return false;

        // Update candidate point to the intersection
        candidate.point = intersection;
        
        // Recalculate distance for proper sorting
        const distanceMm = vec.distance(cursorWorldMm, intersection);
        candidate.distancePx = distanceMm * viewport.scale;

        return true;
      }

      // For other types (node, grid, midpoint), check if they lie on the angle line
      const tolerance = 1.0; // 1mm for nodes, grid, midpoints
      return isPointOnAngleLine(candidate.point, angleOrigin, angleDirection, tolerance);
    });

    // If we found candidates on the angle line, use them (they have higher priority)
    if (filteredCandidates.length > 0) {
      // Boost priority of angle-aligned candidates by +10
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
          priority: 13, // Fallback when no geometry snaps exist
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
 * Intersect angle line with a line segment
 * Returns the intersection point if it exists within the segment bounds
 */
function intersectAngleLineWithSegment(
  angleOrigin: Vec2,
  angleDirection: Vec2,
  segmentA: Vec2,
  segmentB: Vec2
): Vec2 | null {
  // Segment direction
  const segmentDir = vec.sub(segmentB, segmentA);
  const segmentLength = vec.length(segmentDir);
  
  if (segmentLength < 1e-9) return null; // Degenerate segment

  // Solve for intersection:
  // angleOrigin + t * angleDirection = segmentA + s * segmentDir
  // 
  // This gives us two equations:
  // angleOrigin.x + t * angleDirection.x = segmentA.x + s * segmentDir.x
  // angleOrigin.y + t * angleDirection.y = segmentA.y + s * segmentDir.y
  //
  // Rearranging:
  // t * angleDirection.x - s * segmentDir.x = segmentA.x - angleOrigin.x
  // t * angleDirection.y - s * segmentDir.y = segmentA.y - angleOrigin.y

  const dx = segmentA.x - angleOrigin.x;
  const dy = segmentA.y - angleOrigin.y;

  const denominator = angleDirection.x * segmentDir.y - angleDirection.y * segmentDir.x;

  if (Math.abs(denominator) < 1e-9) {
    // Lines are parallel
    return null;
  }

  const t = (dx * segmentDir.y - dy * segmentDir.x) / denominator;
  const s = (dx * angleDirection.y - dy * angleDirection.x) / denominator;

  // Check if intersection is forward from angle origin
  if (t < 0) return null;

  // Check if intersection is within segment bounds
  if (s < 0 || s > 1) return null;

  // Calculate intersection point
  return {
    x: angleOrigin.x + t * angleDirection.x,
    y: angleOrigin.y + t * angleDirection.y,
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
    priority: 5,
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
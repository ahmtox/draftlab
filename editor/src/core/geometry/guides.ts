import type { Vec2 } from '../math/vec';
import type { Scene, Node } from '../domain/types';
import * as vec from '../math/vec';

export type GuidelineType = 'horizontal' | 'vertical';

export type Guideline = {
  type: GuidelineType;
  origin: Vec2;        // The node this guideline originates from (mm)
  value: number;       // X value for vertical, Y value for horizontal (mm)
  nodeId: string;      // ID of the node this guideline belongs to
};

/**
 * Generate all horizontal and vertical guidelines from wall nodes
 * Each node gets one horizontal and one vertical guideline through it
 * 
 * @param scene - Current scene
 * @param excludeNodeIds - Node IDs to exclude from guidelines
 * @param originPoint - Optional origin point to filter redundant guidelines (e.g., wall start point)
 */
export function generateNodeGuidelines(
  scene: Scene, 
  excludeNodeIds: Set<string> = new Set(),
  originPoint: Vec2 | null = null
): Guideline[] {
  const guidelines: Guideline[] = [];
  const REDUNDANCY_TOLERANCE_MM = 1.0; // 1mm tolerance for same X/Y values

  for (const node of scene.nodes.values()) {
    if (excludeNodeIds.has(node.id)) continue;

    // If origin point is provided, skip nodes that create redundant guidelines
    if (originPoint) {
      const sameX = Math.abs(node.x - originPoint.x) < REDUNDANCY_TOLERANCE_MM;
      const sameY = Math.abs(node.y - originPoint.y) < REDUNDANCY_TOLERANCE_MM;

      // Skip horizontal guideline if node has same Y as origin
      if (!sameY) {
        guidelines.push({
          type: 'horizontal',
          origin: { x: node.x, y: node.y },
          value: node.y,
          nodeId: node.id,
        });
      }

      // Skip vertical guideline if node has same X as origin
      if (!sameX) {
        guidelines.push({
          type: 'vertical',
          origin: { x: node.x, y: node.y },
          value: node.x,
          nodeId: node.id,
        });
      }
    } else {
      // No origin point - add both guidelines
      guidelines.push({
        type: 'horizontal',
        origin: { x: node.x, y: node.y },
        value: node.y,
        nodeId: node.id,
      });

      guidelines.push({
        type: 'vertical',
        origin: { x: node.x, y: node.y },
        value: node.x,
        nodeId: node.id,
      });
    }
  }

  return guidelines;
}

/**
 * Find the closest guideline to a point within tolerance
 * Returns null if no guideline is within tolerance
 */
export function findClosestGuideline(
  point: Vec2,
  guidelines: Guideline[],
  toleranceMm: number
): { guideline: Guideline; snapPoint: Vec2 } | null {
  let closestGuideline: Guideline | null = null;
  let closestDistance = Infinity;
  let closestSnapPoint: Vec2 | null = null;

  for (const guideline of guidelines) {
    let distance: number;
    let snapPoint: Vec2;

    if (guideline.type === 'horizontal') {
      // Distance to horizontal line (constant Y)
      distance = Math.abs(point.y - guideline.value);
      snapPoint = { x: point.x, y: guideline.value };
    } else {
      // Distance to vertical line (constant X)
      distance = Math.abs(point.x - guideline.value);
      snapPoint = { x: guideline.value, y: point.y };
    }

    if (distance < closestDistance && distance <= toleranceMm) {
      closestDistance = distance;
      closestGuideline = guideline;
      closestSnapPoint = snapPoint;
    }
  }

  if (closestGuideline && closestSnapPoint) {
    return {
      guideline: closestGuideline,
      snapPoint: closestSnapPoint,
    };
  }

  return null;
}

/**
 * Get visible bounds for a guideline in viewport coordinates
 * Returns null if guideline is outside visible area
 */
export function getGuidelineVisibleBounds(
  guideline: Guideline,
  viewportBounds: { minX: number; maxX: number; minY: number; maxY: number }
): { start: Vec2; end: Vec2 } | null {
  if (guideline.type === 'horizontal') {
    // Horizontal line extends across entire viewport width
    return {
      start: { x: viewportBounds.minX, y: guideline.value },
      end: { x: viewportBounds.maxX, y: guideline.value },
    };
  } else {
    // Vertical line extends across entire viewport height
    return {
      start: { x: guideline.value, y: viewportBounds.minY },
      end: { x: guideline.value, y: viewportBounds.maxY },
    };
  }
}
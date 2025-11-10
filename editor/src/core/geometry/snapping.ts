import type { Vec2 } from '../math/vec';
import * as vec from '../math/vec';
import type { Node, Scene } from '../domain/types';
import type { Viewport } from '../../renderers/konva/viewport';
import { screenToWorld } from '../../renderers/konva/viewport';
import { DEFAULT_TOL } from '../constants';

export type SnapType = 'node' | 'grid' | 'edge' | 'midpoint';

export type SnapCandidate = {
  point: Vec2;          // mm world coords
  type: SnapType;
  entityId?: string;    // for node/edge snaps
  priority: number;     // higher = stronger
  distancePx: number;   // screen-space distance for display
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
    excludeNodeIds?: Set<string>;
  } = {}
): SnapResult {
  const {
    snapToGrid = true,
    snapToNodes = true,
    snapToEdges = true,
    excludeNodeIds = new Set(),
  } = options;

  const cursorWorldMm = screenToWorld(cursorScreenPx, viewport);
  const candidates: SnapCandidate[] = [];

  // Convert snap radius from screen pixels to world mm
  const snapRadiusMm = DEFAULT_TOL.snapPx / viewport.scale;

  // Grid snapping (priority 1)
  if (snapToGrid) {
    const gridCandidate = snapToGridPoint(cursorWorldMm, viewport);
    if (gridCandidate && gridCandidate.distancePx <= DEFAULT_TOL.snapPx) {
      candidates.push(gridCandidate);
    }
  }

  // Node snapping (priority 5)
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

  // Edge snapping (priority 3) - snap to wall centerlines
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

  // Select best candidate: highest priority, then closest distance
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
    priority: 1,
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
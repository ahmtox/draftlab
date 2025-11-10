import type { Vec2 } from '../math/vec';
import type { Scene } from '../domain/types';
import * as vec from '../math/vec';
import { DEFAULT_TOL } from '../constants';

/**
 * Hit test a point against walls
 * Returns the closest wall within hit radius
 */
export function hitTestWalls(
  worldMm: Vec2,
  scene: Scene,
  hitRadiusMm: number
): string | null {
  let closestWallId: string | null = null;
  let closestDistance = hitRadiusMm;

  for (const wall of scene.walls.values()) {
    const nodeA = scene.nodes.get(wall.nodeAId);
    const nodeB = scene.nodes.get(wall.nodeBId);

    if (!nodeA || !nodeB) continue;

    // Project point onto wall centerline
    const ab = vec.sub(nodeB, nodeA);
    const ap = vec.sub(worldMm, nodeA);

    const abLengthSq = vec.dot(ab, ab);
    if (abLengthSq === 0) continue; // Degenerate wall

    let t = vec.dot(ap, ab) / abLengthSq;
    t = Math.max(0, Math.min(1, t)); // Clamp to segment

    const projected = vec.add(nodeA, vec.scale(ab, t));
    const distance = vec.distance(worldMm, projected);

    // Check if within wall thickness plus hit radius
    const effectiveRadius = wall.thicknessMm / 2 + hitRadiusMm;

    if (distance <= effectiveRadius && distance < closestDistance) {
      closestDistance = distance;
      closestWallId = wall.id;
    }
  }

  return closestWallId;
}

/**
 * Hit test a point against nodes
 * Returns the closest node within hit radius
 */
export function hitTestNodes(
  worldMm: Vec2,
  scene: Scene,
  hitRadiusMm: number
): string | null {
  let closestNodeId: string | null = null;
  let closestDistance = hitRadiusMm;

  for (const node of scene.nodes.values()) {
    const distance = vec.distance(worldMm, node);

    if (distance <= hitRadiusMm && distance < closestDistance) {
      closestDistance = distance;
      closestNodeId = node.id;
    }
  }

  return closestNodeId;
}
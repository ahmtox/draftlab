import type { Vec2 } from '../math/vec';
import type { Scene } from '../domain/types';
import * as vec from '../math/vec';
import { getFixture } from '../fixtures/library';

/**
 * Hit test result for nodes on a wall
 */
export type NodeHitResult = 'node-a' | 'node-b' | 'wall' | null;

/**
 * Hit test a wall to determine if clicking node A, node B, or the wall body
 */
export function hitTestWallNode(
  worldMm: Vec2,
  wallId: string,
  scene: Scene,
  nodeRadiusMm: number
): NodeHitResult {
  const wall = scene.walls.get(wallId);
  if (!wall) return null;

  const nodeA = scene.nodes.get(wall.nodeAId);
  const nodeB = scene.nodes.get(wall.nodeBId);

  if (!nodeA || !nodeB) return null;

  // Test node A first (higher priority)
  const distToA = vec.distance(worldMm, nodeA);
  if (distToA <= nodeRadiusMm) {
    return 'node-a';
  }

  // Test node B
  const distToB = vec.distance(worldMm, nodeB);
  if (distToB <= nodeRadiusMm) {
    return 'node-b';
  }

  // If not on a node, test wall body
  const hitWall = hitTestWalls(worldMm, scene, nodeRadiusMm);
  if (hitWall === wallId) {
    return 'wall';
  }

  return null;
}

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

/**
 * Get all walls connected to a node (excluding a specific wall)
 */
export function getConnectedWalls(
  nodeId: string,
  excludeWallId: string | null,
  scene: Scene
): string[] {
  const connected: string[] = [];

  for (const wall of scene.walls.values()) {
    if (wall.id === excludeWallId) continue;
    
    if (wall.nodeAId === nodeId || wall.nodeBId === nodeId) {
      connected.push(wall.id);
    }
  }

  return connected;
}

/**
 * Hit-test fixtures
 * Returns fixture ID if hit, null otherwise
 */
export function hitTestFixtures(
  worldMm: Vec2,
  scene: Scene,
  radiusMm: number
): string | null {
  if (!scene.fixtures) return null;

  for (const [fixtureId, fixture] of scene.fixtures) {
    if (!fixture.position) continue;

    // Simple bounding box hit test
    // TODO: Use actual fixture bounds from schema params
    const schema = getFixture(fixture.kind);
    if (!schema) continue;

    // Get approximate bounds from params
    let width = 1000; // default
    let depth = 1000; // default

    if (fixture.params.width) width = fixture.params.width;
    if (fixture.params.length) depth = fixture.params.length;
    if (fixture.params.depth) depth = fixture.params.depth;

    // Apply rotation to bounds (simple AABB)
    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    // Transform point to fixture local space
    const dx = worldMm.x - fixture.position.x;
    const dy = worldMm.y - fixture.position.y;
    const rotation = fixture.rotation || 0;
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // Check if inside bounds
    if (
      Math.abs(localX) <= halfWidth + radiusMm &&
      Math.abs(localY) <= halfDepth + radiusMm
    ) {
      return fixtureId;
    }
  }

  return null;
}
/**
 * Wall mitering system for clean corner joins
 * 
 * Algorithm:
 * 1. At each node, sort incident walls by angle (CCW)
 * 2. For each adjacent pair (Wi → Wj), intersect Wi's left edge with Wj's right edge
 * 3. Assign intersection points as corners for each wall's polygon
 * 4. Optionally compute apex points for 3+ wall junctions
 */

import type { Vec2 } from '../math/vec';
import type { Scene, Wall, Node } from '../domain/types';
import * as vec from '../math/vec';

// ============================================================================
// Configuration
// ============================================================================

const DEBUG = true;
const EPSILON = 1e-9;
const MAX_MITER_LENGTH_RATIO = 10; // Prevent infinite spikes at shallow angles

// ============================================================================
// Logging Utilities
// ============================================================================

const log = {
  step: (stepNum: number, title: string, ...args: any[]) => {
    if (DEBUG) console.log(`\n[STEP ${stepNum}] ${title}`, ...args);
  },
  substep: (label: string, ...args: any[]) => {
    if (DEBUG) console.log(`  ├─ ${label}`, ...args);
  },
  result: (label: string, ...args: any[]) => {
    if (DEBUG) console.log(`  └─ ${label}`, ...args);
  },
  detail: (...args: any[]) => {
    if (DEBUG) console.log(`     │ `, ...args);
  },
  section: (title: string) => {
    if (DEBUG) console.log(`\n${'═'.repeat(80)}\n${title}\n${'═'.repeat(80)}`);
  },
};

const formatPoint = (p: Vec2 | null): string => {
  return p ? `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})` : 'null';
};

const formatWallId = (id: string): string => {
  return id.slice(-5);
};

const toDegrees = (radians: number): number => {
  return (radians * 180) / Math.PI;
};

// ============================================================================
// Math Utilities
// ============================================================================

/**
 * 2D cross product (returns z-component)
 */
function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Counter-clockwise perpendicular (90° left rotation)
 */
function perpCCW(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

/**
 * Check if two points are approximately equal
 */
function almostEqual(a: Vec2, b: Vec2, epsilon = 1e-6): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

// ============================================================================
// Wall Geometry
// ============================================================================

/**
 * Wall coordinate frame (A → B orientation)
 */
interface WallFrame {
  A: Node;
  B: Node;
  dirAB: Vec2;      // Unit vector from A to B
  leftOfAB: Vec2;   // Perpendicular to the left (CCW)
}

function getWallFrame(wall: Wall, scene: Scene): WallFrame {
  const A = scene.nodes.get(wall.nodeAId)!;
  const B = scene.nodes.get(wall.nodeBId)!;
  
  const dirAB = vec.normalize(vec.sub(B, A));
  const leftOfAB = perpCCW(dirAB);
  
  return { A, B, dirAB, leftOfAB };
}

/**
 * Get direction pointing away from node along wall
 */
function getAwayDirection(node: Node, wall: Wall, scene: Scene): Vec2 {
  const { dirAB } = getWallFrame(wall, scene);
  return node.id === wall.nodeAId ? dirAB : vec.scale(dirAB, -1);
}

/**
 * Get angle of wall direction pointing away from node (0 to 2π)
 */
function getAwayAngle(wall: Wall, node: Node, scene: Scene): number {
  const dir = getAwayDirection(node, wall, scene);
  const angle = Math.atan2(dir.y, dir.x);
  return angle < 0 ? angle + 2 * Math.PI : angle;
}

// ============================================================================
// Ray Intersection
// ============================================================================

/**
 * Half-infinite ray (origin + direction)
 */
interface Ray {
  origin: Vec2;
  direction: Vec2;
}

/**
 * Get offset ray for a wall at a node
 * @param side - 'left' for CCW side, 'right' for CW side
 */
function getOffsetRay(
  wall: Wall,
  node: Node,
  side: 'left' | 'right',
  scene: Scene
): Ray {
  const dir = getAwayDirection(node, wall, scene);
  const normal = side === 'left' ? perpCCW(dir) : vec.scale(perpCCW(dir), -1);
  const offset = wall.thicknessMm / 2;
  
  return {
    origin: vec.add(node, vec.scale(normal, offset)),
    direction: dir,
  };
}

/**
 * Intersect two rays (returns null if parallel or intersection is behind origins)
 */
function intersectRays(ray1: Ray, ray2: Ray): Vec2 | null {
  const denominator = cross(ray1.direction, ray2.direction);
  
  // Check if parallel
  if (Math.abs(denominator) < EPSILON) {
    return null;
  }
  
  const originDelta = vec.sub(ray2.origin, ray1.origin);
  const t = cross(originDelta, ray2.direction) / denominator;
  const u = cross(originDelta, ray1.direction) / denominator;
  
  // Reject if intersection is behind either ray origin
  if (t < 0 || u < 0) {
    return null;
  }
  
  return vec.add(ray1.origin, vec.scale(ray1.direction, t));
}

/**
 * Clamp miter point to prevent excessive spikes at shallow angles
 */
function clampMiterLength(
  node: Node,
  point: Vec2 | null,
  avgThickness: number
): Vec2 | null {
  if (!point) return null;
  
  const maxLength = avgThickness * MAX_MITER_LENGTH_RATIO;
  const distance = vec.distance(node, point);
  
  if (distance > maxLength) {
    log.detail(`Clamped: distance ${distance.toFixed(1)}mm > max ${maxLength.toFixed(1)}mm`);
    return null;
  }
  
  return point;
}

// ============================================================================
// Node Corner Computation
// ============================================================================

/**
 * Corner points for a wall at a node
 */
interface WallCorners {
  left: Vec2 | null;   // Intersection of this wall's left edge with next wall's right edge
  right: Vec2 | null;  // Intersection of previous wall's left edge with this wall's right edge
  apex: Vec2 | null;   // Optional apex between non-adjacent walls (3+ junction)
}

/**
 * Compute corner points for all walls meeting at a node
 */
function computeNodeCorners(node: Node, scene: Scene): Map<string, WallCorners> {
  log.section(`Computing Corners for Node ${formatWallId(node.id)}`);
  
  const result = new Map<string, WallCorners>();
  
  // ============================================================
  // STEP 1: Find incident walls
  // ============================================================
  log.step(1, 'Finding incident walls');
  
  const incidentWalls = [...scene.walls.values()].filter(
    wall => wall.nodeAId === node.id || wall.nodeBId === node.id
  );
  
  log.result(`Found ${incidentWalls.length} walls at node ${formatWallId(node.id)}`);
  
  if (incidentWalls.length === 0) {
    return result;
  }
  
  // ============================================================
  // STEP 2: Sort walls by angle (CCW)
  // ============================================================
  log.step(2, 'Sorting walls counter-clockwise by away angle');
  
  const wallsWithAngles = incidentWalls.map(wall => ({
    wall,
    angle: getAwayAngle(wall, node, scene),
  }));
  
  wallsWithAngles.sort((a, b) => a.angle - b.angle);
  const sortedWalls = wallsWithAngles.map(wa => wa.wall);
  
  if (DEBUG) {
    wallsWithAngles.forEach(({ wall, angle }, i) => {
      log.substep(
        `#${i + 1}: Wall ${formatWallId(wall.id)} @ ${toDegrees(angle).toFixed(1)}°`
      );
    });
  }
  
  log.result(`Sorted ${sortedWalls.length} walls by angle`);
  
  const wallCount = sortedWalls.length;
  
  // ============================================================
  // STEP 3: Compute offset rays
  // ============================================================
  log.step(3, 'Computing offset rays (left & right edges)');
  
  const leftRays: Ray[] = [];
  const rightRays: Ray[] = [];
  
  for (const wall of sortedWalls) {
    const leftRay = getOffsetRay(wall, node, 'left', scene);
    const rightRay = getOffsetRay(wall, node, 'right', scene);
    
    leftRays.push(leftRay);
    rightRays.push(rightRay);
    result.set(wall.id, { left: null, right: null, apex: null });
    
    log.substep(
      `Wall ${formatWallId(wall.id)}:`,
      `left origin ${formatPoint(leftRay.origin)},`,
      `right origin ${formatPoint(rightRay.origin)}`
    );
  }
  
  log.result(`Computed ${leftRays.length} left rays and ${rightRays.length} right rays`);
  
  // ============================================================
  // STEP 4: Compute inner corners (adjacent pairs)
  // ============================================================
  log.step(4, 'Computing inner corners (Wi.left ∩ Wj.right)');
  
  const innerCorners: (Vec2 | null)[] = [];
  
  for (let i = 0; i < wallCount; i++) {
    const nextIndex = (i + 1) % wallCount;
    const wall = sortedWalls[i];
    const nextWall = sortedWalls[nextIndex];
    
    // Intersect Wi's left edge with Wj's right edge
    const corner = intersectRays(leftRays[i], rightRays[nextIndex]);
    innerCorners.push(corner);
    
    log.substep(
      `Pair ${i} → ${nextIndex}:`,
      `(${formatWallId(wall.id)}) → (${formatWallId(nextWall.id)})`,
      `= ${formatPoint(corner)}`
    );
  }
  
  log.result(`Computed ${innerCorners.length} inner corner points`);
  
  // ============================================================
  // STEP 5: Assign corners to each wall
  // ============================================================
  log.step(5, 'Assigning corners and apex points to walls');
  
  for (let i = 0; i < wallCount; i++) {
    const wall = sortedWalls[i];
    const prevIndex = (i - 1 + wallCount) % wallCount;
    const nextIndex = (i + 1) % wallCount;
    
    const prevWall = sortedWalls[prevIndex];
    const nextWall = sortedWalls[nextIndex];
    
    log.substep(`Wall ${formatWallId(wall.id)} (index ${i})`);
    
    // This wall's left corner is the inner corner between this wall and next wall
    let leftCorner = innerCorners[i];
    log.detail(`Left corner (from pair ${i}→${nextIndex}): ${formatPoint(leftCorner)}`);
    
    // This wall's right corner is the inner corner between previous wall and this wall
    let rightCorner = innerCorners[prevIndex];
    log.detail(`Right corner (from pair ${prevIndex}→${i}): ${formatPoint(rightCorner)}`);
    
    // Optional apex between previous and next walls (for 3+ junctions)
    let apex = intersectRays(leftRays[prevIndex], rightRays[nextIndex]);
    log.detail(`Apex candidate (prev.left ∩ next.right): ${formatPoint(apex)}`);
    
    // Remove apex if it duplicates a corner
    if (apex && leftCorner && almostEqual(apex, leftCorner)) {
      log.detail(`Apex duplicates left corner, removing apex`);
      apex = null;
    }
    if (apex && rightCorner && almostEqual(apex, rightCorner)) {
      log.detail(`Apex duplicates right corner, removing apex`);
      apex = null;
    }
    
    // Clamp excessive miters
    const avgThicknessLeft = (wall.thicknessMm + nextWall.thicknessMm) / 2;
    const avgThicknessRight = (wall.thicknessMm + prevWall.thicknessMm) / 2;
    const avgThicknessApex = (prevWall.thicknessMm + nextWall.thicknessMm) / 2;
    
    leftCorner = clampMiterLength(node, leftCorner, avgThicknessLeft);
    rightCorner = clampMiterLength(node, rightCorner, avgThicknessRight);
    apex = clampMiterLength(node, apex, avgThicknessApex);
    
    result.set(wall.id, { 
      left: leftCorner, 
      right: rightCorner, 
      apex 
    });
    
    log.detail(
      `Final: left=${formatPoint(leftCorner)}, ` +
      `right=${formatPoint(rightCorner)}, ` +
      `apex=${formatPoint(apex)}`
    );
  }
  
  log.result(`Assigned corners to all ${wallCount} walls`);
  
  return result;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build closed polygon for a wall with mitered corners
 * 
 * Returns vertices in CCW order: [A_left, (A_apex?), A_right, B_right, (B_apex?), B_left]
 * 
 * Note: At node B, we swap left↔right because we're looking at the wall from the opposite direction
 */
export function buildWallPolygon(wall: Wall, scene: Scene): Vec2[] {
  log.section(`Building Polygon for Wall ${formatWallId(wall.id)}`);
  
  // ============================================================
  // STEP 1: Compute wall frame
  // ============================================================
  log.step(1, 'Computing wall coordinate frame');
  
  const { A, B, leftOfAB } = getWallFrame(wall, scene);
  const halfThickness = wall.thicknessMm / 2;
  
  log.substep(`Node A: ${formatPoint(A)}`);
  log.substep(`Node B: ${formatPoint(B)}`);
  log.substep(`Half thickness: ${halfThickness.toFixed(1)}mm`);
  log.result('Frame computed');
  
  // ============================================================
  // STEP 2: Compute fallback points (straight butt joint)
  // ============================================================
  log.step(2, 'Computing fallback points (no mitering)');
  
  const baseLeftA = vec.add(A, vec.scale(leftOfAB, halfThickness));
  const baseRightA = vec.sub(A, vec.scale(leftOfAB, halfThickness));
  const baseLeftB = vec.add(B, vec.scale(leftOfAB, halfThickness));
  const baseRightB = vec.sub(B, vec.scale(leftOfAB, halfThickness));
  
  log.substep(`A left (fallback): ${formatPoint(baseLeftA)}`);
  log.substep(`A right (fallback): ${formatPoint(baseRightA)}`);
  log.substep(`B left (fallback): ${formatPoint(baseLeftB)}`);
  log.substep(`B right (fallback): ${formatPoint(baseRightB)}`);
  log.result('Fallback points computed');
  
  // ============================================================
  // STEP 3: Get mitered corners
  // ============================================================
  log.step(3, 'Getting mitered corners from node junction solver');
  
  const cornersAtA = computeNodeCorners(A, scene).get(wall.id);
  const cornersAtB = computeNodeCorners(B, scene).get(wall.id);
  
  // ============================================================
  // STEP 4: Assign final corner points
  // ============================================================
  log.step(4, 'Assigning final corner points (miter or fallback)');
  
  // Node A corners (no swap needed - we're looking outward from A)
  const A_left = cornersAtA?.left ?? baseLeftA;
  const A_right = cornersAtA?.right ?? baseRightA;
  const A_apex = cornersAtA?.apex ?? null;
  
  log.substep(`Node A:`);
  log.detail(`left: ${formatPoint(A_left)} ${cornersAtA?.left ? '(mitered)' : '(fallback)'}`);
  log.detail(`right: ${formatPoint(A_right)} ${cornersAtA?.right ? '(mitered)' : '(fallback)'}`);
  log.detail(`apex: ${formatPoint(A_apex)} ${A_apex ? '(present)' : '(none)'}`);
  
  // Node B corners (swap left↔right because we're looking inward to B)
  const B_left = cornersAtB?.right ?? baseLeftB;
  const B_right = cornersAtB?.left ?? baseRightB;
  const B_apex = cornersAtB?.apex ?? null;
  
  log.substep(`Node B (swapped left↔right for inward view):`);
  log.detail(`left: ${formatPoint(B_left)} ${cornersAtB?.right ? '(mitered)' : '(fallback)'}`);
  log.detail(`right: ${formatPoint(B_right)} ${cornersAtB?.left ? '(mitered)' : '(fallback)'}`);
  log.detail(`apex: ${formatPoint(B_apex)} ${B_apex ? '(present)' : '(none)'}`);
  
  log.result('Final corners assigned');
  
  // ============================================================
  // STEP 5: Build polygon in CCW order
  // ============================================================
  log.step(5, 'Building polygon vertices in CCW order');
  
  const polygon: Vec2[] = [A_left];
  log.substep(`#1: A_left ${formatPoint(A_left)}`);
  
  if (A_apex) {
    polygon.push(A_apex);
    log.substep(`#${polygon.length}: A_apex ${formatPoint(A_apex)}`);
  }
  
  polygon.push(A_right);
  log.substep(`#${polygon.length}: A_right ${formatPoint(A_right)}`);
  
  polygon.push(B_right);
  log.substep(`#${polygon.length}: B_right ${formatPoint(B_right)}`);
  
  if (B_apex) {
    polygon.push(B_apex);
    log.substep(`#${polygon.length}: B_apex ${formatPoint(B_apex)}`);
  }
  
  polygon.push(B_left);
  log.substep(`#${polygon.length}: B_left ${formatPoint(B_left)}`);
  
  log.result(`Polygon complete with ${polygon.length} vertices`);
  log.section(`Finished Wall ${formatWallId(wall.id)}`);
  
  return polygon;
}
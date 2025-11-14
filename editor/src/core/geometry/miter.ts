/**
 * Wall mitering system for clean corner joins
 * 
 * New Algorithm (Segment-Intersection Based):
 * 1. For each node, find all incident walls and compute their offset edges
 * 2. Test finite segment intersections between offset edges
 * 3. For each edge, collect ALL intersections and choose the farthest valid one
 * 4. For edges that don't intersect, extend to infinite lines and find intersection
 * 5. Handle collinear wall apex points BEFORE Step 4 assigns intersections
 * 6. Create apex vertices when both edges of a wall intersect other walls
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
const COLLINEAR_ANGLE_THRESHOLD = 0.0001; // ~0.006° - extremely tight for true collinearity

// ============================================================================
// Caching System
// ============================================================================

/**
 * Cache for node corner computations
 * Key: nodeId, Value: Map of wallId -> WallCorners
 */
const nodeCornerCache = new Map<string, Map<string, WallCorners>>();

/**
 * Clear the miter cache (call when scene topology changes)
 */
export function clearMiterCache(): void {
  nodeCornerCache.clear();
}

// ============================================================================
// Logging Utilities
// ============================================================================

const log = {
  step: (stepNum: number | string, title: string, ...args: any[]) => {
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
  warn: (...args: any[]) => {
    if (DEBUG) console.warn(`  ⚠️ `, ...args);
  },
  success: (...args: any[]) => {
    if (DEBUG) console.log(`  ✅ `, ...args);
  },
  fail: (...args: any[]) => {
    if (DEBUG) console.log(`  ❌ `, ...args);
  },
};

const formatPoint = (p: Vec2 | null): string => {
  return p ? `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})` : 'null';
};

const formatWallId = (id: string): string => {
  return id.slice(-5);
};

const formatSegment = (seg: Segment): string => {
  return `[${formatPoint(seg.start)} → ${formatPoint(seg.end)}]`;
};

const formatLine = (line: Line): string => {
  return `{point: ${formatPoint(line.point)}, dir: (${line.direction.x.toFixed(3)}, ${line.direction.y.toFixed(3)})}`;
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

/**
 * Check if two walls are collinear (180° apart)
 */
function areWallsCollinear(wall1: Wall, wall2: Wall, node: Node, scene: Scene): boolean {
  const node1A = scene.nodes.get(wall1.nodeAId)!;
  const node1B = scene.nodes.get(wall1.nodeBId)!;
  const node2A = scene.nodes.get(wall2.nodeAId)!;
  const node2B = scene.nodes.get(wall2.nodeBId)!;

  // Get directions pointing AWAY from the shared node
  const dir1 = wall1.nodeAId === node.id 
    ? vec.normalize(vec.sub(node1B, node1A))
    : vec.normalize(vec.sub(node1A, node1B));
  
  const dir2 = wall2.nodeAId === node.id
    ? vec.normalize(vec.sub(node2B, node2A))
    : vec.normalize(vec.sub(node2A, node2B));

  // Check if directions are opposite (dot product ≈ -1)
  const dotProduct = vec.dot(dir1, dir2);
  const isOpposite = Math.abs(dotProduct + 1.0) < COLLINEAR_ANGLE_THRESHOLD;

  if (isOpposite && DEBUG) {
    log.detail(`Walls ${formatWallId(wall1.id)} and ${formatWallId(wall2.id)} are collinear (dot=${dotProduct.toFixed(4)})`);
  }

  return isOpposite;
}

/**
 * Find collinear wall pairs at a node
 */
function findCollinearPairs(
  wallEdges: WallEdges[],
  node: Node,
  scene: Scene
): Array<{ wall1: Wall; wall2: Wall }> {
  const pairs: Array<{ wall1: Wall; wall2: Wall }> = [];

  for (let i = 0; i < wallEdges.length; i++) {
    for (let j = i + 1; j < wallEdges.length; j++) {
      if (areWallsCollinear(wallEdges[i].wall, wallEdges[j].wall, node, scene)) {
        pairs.push({ wall1: wallEdges[i].wall, wall2: wallEdges[j].wall });
      }
    }
  }

  return pairs;
}

// ============================================================================
// Segment & Line Intersection
// ============================================================================

/**
 * Line segment with two endpoints
 */
interface Segment {
  start: Vec2;
  end: Vec2;
}

/**
 * Infinite line (point + direction)
 */
interface Line {
  point: Vec2;
  direction: Vec2;
}

/**
 * Intersect two finite line segments
 * Returns intersection point if segments intersect within their bounds
 */
function intersectSegments(seg1: Segment, seg2: Segment): Vec2 | null {
  const p1 = seg1.start;
  const p2 = seg1.end;
  const p3 = seg2.start;
  const p4 = seg2.end;

  const d1 = vec.sub(p2, p1);
  const d2 = vec.sub(p4, p3);

  const denominator = cross(d1, d2);

  log.detail(`Testing segment intersection:`);
  log.detail(`  seg1: ${formatSegment(seg1)}`);
  log.detail(`  seg2: ${formatSegment(seg2)}`);
  log.detail(`  d1: (${d1.x.toFixed(3)}, ${d1.y.toFixed(3)})`);
  log.detail(`  d2: (${d2.x.toFixed(3)}, ${d2.y.toFixed(3)})`);
  log.detail(`  denominator (cross product): ${denominator.toFixed(6)}`);

  // Parallel or coincident
  if (Math.abs(denominator) < EPSILON) {
    log.detail(`  → Segments are parallel/coincident (|denom| < ${EPSILON})`);
    return null;
  }

  const delta = vec.sub(p3, p1);
  const t1 = cross(delta, d2) / denominator;
  const t2 = cross(delta, d1) / denominator;

  log.detail(`  t1 (parameter for seg1): ${t1.toFixed(6)}`);
  log.detail(`  t2 (parameter for seg2): ${t2.toFixed(6)}`);

  // Check if intersection is within both segments [0, 1]
  if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
    const intersection = vec.add(p1, vec.scale(d1, t1));
    log.detail(`  → Intersection FOUND at ${formatPoint(intersection)}`);
    return intersection;
  }

  log.detail(`  → No intersection (parameters out of bounds [0,1])`);
  return null;
}

/**
 * Intersect two infinite lines
 * Returns intersection point or null if parallel
 */
function intersectLines(line1: Line, line2: Line): Vec2 | null {
  const denominator = cross(line1.direction, line2.direction);

  log.detail(`Testing infinite line intersection:`);
  log.detail(`  line1: ${formatLine(line1)}`);
  log.detail(`  line2: ${formatLine(line2)}`);
  log.detail(`  denominator (cross product): ${denominator.toFixed(6)}`);

  // Parallel
  if (Math.abs(denominator) < EPSILON) {
    log.detail(`  → Lines are parallel (|denom| < ${EPSILON})`);
    return null;
  }

  const delta = vec.sub(line2.point, line1.point);
  const t = cross(delta, line2.direction) / denominator;

  const intersection = vec.add(line1.point, vec.scale(line1.direction, t));
  log.detail(`  t (parameter): ${t.toFixed(6)}`);
  log.detail(`  → Intersection at ${formatPoint(intersection)}`);

  return intersection;
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

  log.detail(`Clamping miter point:`);
  log.detail(`  point: ${formatPoint(point)}`);
  log.detail(`  node: ${formatPoint(node)}`);
  log.detail(`  wall thickness: ${avgThickness.toFixed(1)}mm`);
  log.detail(`  distance from node: ${distance.toFixed(1)}mm`);
  log.detail(`  max allowed: ${maxLength.toFixed(1)}mm (${MAX_MITER_LENGTH_RATIO}x thickness)`);

  if (distance > maxLength) {
    log.fail(`Point REJECTED: distance ${distance.toFixed(1)}mm > max ${maxLength.toFixed(1)}mm`);
    return null;
  }

  log.success(`Point ACCEPTED: distance ${distance.toFixed(1)}mm <= max ${maxLength.toFixed(1)}mm`);
  return point;
}

// ============================================================================
// Wall Edge Geometry
// ============================================================================

/**
 * Offset edges for a wall
 */
interface WallEdges {
  wall: Wall;
  leftEdge: Segment;   // Left side of wall
  rightEdge: Segment;  // Right side of wall
}

/**
 * Get the two offset edges (left and right) for a wall at a specific node
 */
function getWallEdgesAtNode(wall: Wall, node: Node, scene: Scene): WallEdges {
  const nodeA = scene.nodes.get(wall.nodeAId)!;
  const nodeB = scene.nodes.get(wall.nodeBId)!;

  const isNodeA = node.id === wall.nodeAId;
  const startNode = isNodeA ? nodeA : nodeB;
  const endNode = isNodeA ? nodeB : nodeA;

  // Direction pointing AWAY from the node we're computing for
  const dir = vec.normalize(vec.sub(endNode, startNode));
  const perp = perpCCW(dir);
  const halfThickness = wall.thicknessMm / 2;

  log.detail(`Computing wall edges for ${formatWallId(wall.id)}:`);
  log.detail(`  thickness: ${wall.thicknessMm.toFixed(1)}mm (half: ${halfThickness.toFixed(1)}mm)`);
  log.detail(`  computing at node: ${formatWallId(node.id)}`);
  log.detail(`  isNodeA: ${isNodeA}`);
  log.detail(`  startNode: ${formatPoint(startNode)}`);
  log.detail(`  endNode: ${formatPoint(endNode)}`);
  log.detail(`  direction: (${dir.x.toFixed(3)}, ${dir.y.toFixed(3)})`);
  log.detail(`  perpendicular (left): (${perp.x.toFixed(3)}, ${perp.y.toFixed(3)})`);

  // Compute offset points at the node (start of the edge segments)
  const leftAtNode = vec.add(startNode, vec.scale(perp, halfThickness));
  const rightAtNode = vec.sub(startNode, vec.scale(perp, halfThickness));

  // Compute offset points at the opposite end (for segment bounds)
  const leftAtEnd = vec.add(endNode, vec.scale(perp, halfThickness));
  const rightAtEnd = vec.sub(endNode, vec.scale(perp, halfThickness));

  log.detail(`  leftEdge: ${formatSegment({ start: leftAtNode, end: leftAtEnd })}`);
  log.detail(`  rightEdge: ${formatSegment({ start: rightAtNode, end: rightAtEnd })}`);

  return {
    wall,
    leftEdge: { start: leftAtNode, end: leftAtEnd },
    rightEdge: { start: rightAtNode, end: rightAtEnd },
  };
}

// ============================================================================
// Node Corner Computation
// ============================================================================

/**
 * Edge intersection result with distance from node
 */
interface EdgeIntersection {
  wallId: string;
  edge: 'left' | 'right';
  point: Vec2;
  distanceFromNode: number;
}

/**
 * Compute corner points for all walls meeting at a node using segment intersection
 * FIXED: Proper collinear wall handling for 2-wall straight-through connections
 * FIXED: Non-collinear wall gets apex from collinear walls' non-intersecting edges
 * ✅ NEW: Cached results per node
 * ✅ NEW: Discount "wrong-side" intersections when walls have different thicknesses
 */
function computeNodeCornersSegmentBased(node: Node, scene: Scene): Map<string, WallCorners> {
  // ✅ Check cache first
  const cached = nodeCornerCache.get(node.id);
  if (cached) {
    log.detail(`Using cached corners for node ${formatWallId(node.id)}`);
    return cached;
  }

  log.section(`Computing Corners for Node ${formatWallId(node.id)} at ${formatPoint(node)}`);

  const result = new Map<string, WallCorners>();

  // ============================================================
  // STEP 1: Find incident walls and compute edges
  // ============================================================
  log.step(1, 'Finding incident walls and computing offset edges');

  const incidentWalls = [...scene.walls.values()].filter(
    wall => wall.nodeAId === node.id || wall.nodeBId === node.id
  );

  log.substep(`Found ${incidentWalls.length} incident wall(s)`);
  
  for (const wall of incidentWalls) {
    log.detail(`  - ${formatWallId(wall.id)}: thickness=${wall.thicknessMm.toFixed(1)}mm`);
  }

  if (incidentWalls.length === 0) {
    nodeCornerCache.set(node.id, result); // ✅ Cache empty result
    return result;
  }

  const wallEdges = incidentWalls.map(wall => getWallEdgesAtNode(wall, node, scene));

  log.result(`Found ${wallEdges.length} walls with offset edges`);

  // Initialize result map
  for (const { wall } of wallEdges) {
    result.set(wall.id, { left: null, right: null, apex: null });
  }

  // ============================================================
  // STEP 1.5: Detect collinear wall pairs
  // ============================================================
  log.step(1.5, 'Detecting collinear wall pairs (180° apart)');

  const collinearPairs = findCollinearPairs(wallEdges, node, scene);
  const collinearWallIds = new Set<string>();

  for (const { wall1, wall2 } of collinearPairs) {
    collinearWallIds.add(wall1.id);
    collinearWallIds.add(wall2.id);
    log.substep(`Collinear pair: ${formatWallId(wall1.id)} (${wall1.thicknessMm}mm) ↔ ${formatWallId(wall2.id)} (${wall2.thicknessMm}mm)`);
  }

  // ============================================================
  // SPECIAL CASE: EXACTLY 2 walls that are collinear = straight-through
  // ============================================================
  if (incidentWalls.length === 2 && collinearPairs.length === 1) {
    log.step('SPECIAL', 'Detected 2-wall straight-through (collinear) - using butt joint');
    
    // For straight-through walls, just use the base offset edges (butt joint)
    // Don't try to intersect anything - they pass through cleanly
    for (const { wall, leftEdge, rightEdge } of wallEdges) {
      result.set(wall.id, {
        left: leftEdge.start,
        right: rightEdge.start,
        apex: null,
      });
      log.substep(`${formatWallId(wall.id)} (${wall.thicknessMm}mm): left=${formatPoint(leftEdge.start)}, right=${formatPoint(rightEdge.start)}`);
    }

    log.result('Straight-through butt joints assigned');
    nodeCornerCache.set(node.id, result); // ✅ Cache result
    return result;
  }

  // ============================================================
  // STEP 2: Test ALL segment intersections and collect them
  // ============================================================
  log.step(2, 'Testing finite segment intersections (collecting all)');

  // Map to collect ALL intersections per edge: wallId -> edge -> [intersections]
  const allIntersections = new Map<string, { left: EdgeIntersection[]; right: EdgeIntersection[] }>();

  for (const { wall } of wallEdges) {
    allIntersections.set(wall.id, { left: [], right: [] });
  }

  // Test all pairs of walls
  let testCount = 0;
  let intersectionCount = 0;

  for (let i = 0; i < wallEdges.length; i++) {
    const wallA = wallEdges[i];

    for (let j = i + 1; j < wallEdges.length; j++) {
      const wallB = wallEdges[j];

      log.substep(`Testing walls ${formatWallId(wallA.wall.id)} (${wallA.wall.thicknessMm}mm) vs ${formatWallId(wallB.wall.id)} (${wallB.wall.thicknessMm}mm)`);

      // Skip if both walls are collinear (their edges won't meaningfully intersect)
      const bothCollinear = collinearWallIds.has(wallA.wall.id) && collinearWallIds.has(wallB.wall.id);
      if (bothCollinear && areWallsCollinear(wallA.wall, wallB.wall, node, scene)) {
        log.detail(`Skipping collinear pair`);
        continue;
      }

      // Test all four edge combinations and track results
      const intersectionResults: Array<{
        edgeA: 'left' | 'right';
        edgeB: 'left' | 'right';
        point: Vec2;
        distA: number;
        distB: number;
      }> = [];

      const tests = [
        { edgeA: wallA.leftEdge, sideA: 'left' as const, edgeB: wallB.leftEdge, sideB: 'left' as const },
        { edgeA: wallA.leftEdge, sideA: 'left' as const, edgeB: wallB.rightEdge, sideB: 'right' as const },
        { edgeA: wallA.rightEdge, sideA: 'right' as const, edgeB: wallB.leftEdge, sideB: 'left' as const },
        { edgeA: wallA.rightEdge, sideA: 'right' as const, edgeB: wallB.rightEdge, sideB: 'right' as const },
      ];

      for (const { edgeA, sideA, edgeB, sideB } of tests) {
        testCount++;
        log.detail(`\nTest ${testCount}: ${formatWallId(wallA.wall.id)}.${sideA} ∩ ${formatWallId(wallB.wall.id)}.${sideB}`);
        
        const intersection = intersectSegments(edgeA, edgeB);

        if (intersection) {
          const distA = vec.distance(node, intersection);
          const distB = vec.distance(node, intersection);

          intersectionResults.push({
            edgeA: sideA,
            edgeB: sideB,
            point: intersection,
            distA,
            distB,
          });

          log.detail(`  → Found intersection at ${formatPoint(intersection)} (distA: ${distA.toFixed(1)}mm, distB: ${distB.toFixed(1)}mm)`);
        }
      }

      // ✅ NEW: Filter out "wrong-side" intersections
      // Case 1: One edge of wall A intersects BOTH edges of wall B
      // Case 2: Both opposite edges intersect (A.left∩B.right AND A.right∩B.left)
      if (intersectionResults.length > 1) {
        log.detail(`\n  Filtering ${intersectionResults.length} intersections for wrong-side cases...`);

        // Group by which wall's edge is being tested
        const byWallAEdge = new Map<'left' | 'right', typeof intersectionResults>();
        const byWallBEdge = new Map<'left' | 'right', typeof intersectionResults>();

        for (const result of intersectionResults) {
          if (!byWallAEdge.has(result.edgeA)) byWallAEdge.set(result.edgeA, []);
          if (!byWallBEdge.has(result.edgeB)) byWallBEdge.set(result.edgeB, []);
          byWallAEdge.get(result.edgeA)!.push(result);
          byWallBEdge.get(result.edgeB)!.push(result);
        }

        const filtered: typeof intersectionResults = [];

        // Case 1: One edge of wall A hits both edges of wall B
        for (const [edgeA, results] of byWallAEdge.entries()) {
          if (results.length === 2) {
            // Wall A's edge hits both edges of wall B
            // Keep the intersection where Wall B's edge would naturally intersect Wall A
            // This means: if edgeA is 'left', prefer edgeB='right' (opposite sides meet)
            const preferredEdgeB = edgeA === 'left' ? 'right' : 'left';
            
            const preferred = results.find(r => r.edgeB === preferredEdgeB);
            const other = results.find(r => r.edgeB !== preferredEdgeB);
            
            if (preferred && other) {
              log.warn(`  Wall A edge ${edgeA} hits both edges of Wall B - keeping opposite-side intersection`);
              log.detail(`    KEEP: ${formatWallId(wallA.wall.id)}.${preferred.edgeA} ∩ ${formatWallId(wallB.wall.id)}.${preferred.edgeB} @ ${preferred.distA.toFixed(1)}mm`);
              log.warn(`    DISCARD: ${formatWallId(wallA.wall.id)}.${other.edgeA} ∩ ${formatWallId(wallB.wall.id)}.${other.edgeB} @ ${other.distA.toFixed(1)}mm`);
              
              filtered.push(preferred);
              continue;
            }
          }
          filtered.push(...results);
        }

        // Case 2: One edge of wall B hits both edges of wall A
        const alreadyFiltered = new Set(filtered);
        for (const [edgeB, results] of byWallBEdge.entries()) {
          if (results.length === 2) {
            const [int1, int2] = results;
            
            // Skip if already filtered by Case 1
            if (alreadyFiltered.has(int1) || alreadyFiltered.has(int2)) continue;
            
            // Wall B's edge hits both edges of wall A
            // Keep the intersection where Wall A's edge would naturally intersect Wall B
            const preferredEdgeA = edgeB === 'left' ? 'right' : 'left';
            
            const preferred = results.find(r => r.edgeA === preferredEdgeA);
            const other = results.find(r => r.edgeA !== preferredEdgeA);
            
            if (preferred && other) {
              log.warn(`  Wall B edge ${edgeB} hits both edges of Wall A - keeping opposite-side intersection`);
              log.detail(`    KEEP: ${formatWallId(wallA.wall.id)}.${preferred.edgeA} ∩ ${formatWallId(wallB.wall.id)}.${preferred.edgeB} @ ${preferred.distB.toFixed(1)}mm`);
              log.warn(`    DISCARD: ${formatWallId(wallA.wall.id)}.${other.edgeA} ∩ ${formatWallId(wallB.wall.id)}.${other.edgeB} @ ${other.distB.toFixed(1)}mm`);
              
              filtered.push(preferred);
            }
          }
        }

        // Remove duplicates and replace intersectionResults
        intersectionResults.length = 0;
        intersectionResults.push(...filtered);
      }
      // Add filtered intersections to the result lists
      for (const result of intersectionResults) {
        intersectionCount++;

        log.success(
          `INTERSECTION #${intersectionCount}: ${formatPoint(result.point)} (distA: ${result.distA.toFixed(1)}mm, distB: ${result.distB.toFixed(1)}mm)`
        );

        // Add to wall A's intersection list
        allIntersections.get(wallA.wall.id)![result.edgeA].push({
          wallId: wallA.wall.id,
          edge: result.edgeA,
          point: result.point,
          distanceFromNode: result.distA,
        });

        // Add to wall B's intersection list
        allIntersections.get(wallB.wall.id)![result.edgeB].push({
          wallId: wallB.wall.id,
          edge: result.edgeB,
          point: result.point,
          distanceFromNode: result.distB,
        });
      }
    }
  }

  log.result(`Tested ${testCount} edge pairs, found ${intersectionCount} valid intersections`);

  // ============================================================
  // STEP 3: Choose the FARTHEST valid intersection for each edge
  // ============================================================
  log.step(3, 'Selecting farthest valid intersection for each edge');

  for (const [wallId, intersections] of allIntersections) {
    const corners = result.get(wallId)!;
    const wall = scene.walls.get(wallId)!;

    log.substep(`Processing ${formatWallId(wallId)} (thickness: ${wall.thicknessMm}mm)`);
    log.detail(`  Left intersections: ${intersections.left.length}`);
    log.detail(`  Right intersections: ${intersections.right.length}`);

    // Process left edge intersections
    if (intersections.left.length > 0) {
      // Sort by distance from node (descending - farthest first)
      intersections.left.sort((a, b) => b.distanceFromNode - a.distanceFromNode);

      log.detail(`  Evaluating left edge candidates (farthest first):`);
      for (let idx = 0; idx < intersections.left.length; idx++) {
        const candidate = intersections.left[idx];
        log.detail(`    [${idx}] ${formatPoint(candidate.point)} @ ${candidate.distanceFromNode.toFixed(1)}mm`);
      }

      // Choose the farthest valid intersection
      for (const candidate of intersections.left) {
        const clamped = clampMiterLength(node, candidate.point, wall.thicknessMm);
        if (clamped) {
          corners.left = clamped;
          log.success(
            `${formatWallId(wallId)}.left: chose farthest @ ${candidate.distanceFromNode.toFixed(1)}mm = ${formatPoint(clamped)}`
          );
          break;
        }
      }

      if (!corners.left) {
        log.warn(`${formatWallId(wallId)}.left: NO valid intersection after clamping`);
      }
    } else {
      log.warn(`${formatWallId(wallId)}.left: NO intersections found`);
    }

    // Process right edge intersections
    if (intersections.right.length > 0) {
      // Sort by distance from node (descending - farthest first)
      intersections.right.sort((a, b) => b.distanceFromNode - a.distanceFromNode);

      log.detail(`  Evaluating right edge candidates (farthest first):`);
      for (let idx = 0; idx < intersections.right.length; idx++) {
        const candidate = intersections.right[idx];
        log.detail(`    [${idx}] ${formatPoint(candidate.point)} @ ${candidate.distanceFromNode.toFixed(1)}mm`);
      }

      // Choose the farthest valid intersection
      for (const candidate of intersections.right) {
        const clamped = clampMiterLength(node, candidate.point, wall.thicknessMm);
        if (clamped) {
          corners.right = clamped;
          log.success(
            `${formatWallId(wallId)}.right: chose farthest @ ${candidate.distanceFromNode.toFixed(1)}mm = ${formatPoint(clamped)}`
          );
          break;
        }
      }

      if (!corners.right) {
        log.warn(`${formatWallId(wallId)}.right: NO valid intersection after clamping`);
      }
    } else {
      log.warn(`${formatWallId(wallId)}.right: NO intersections found`);
    }
  }

  log.result('Farthest intersections selected');

  // ============================================================
  // STEP 3.5: Find non-intersecting edges (before Step 5 assigns them)
  // ============================================================
  log.step(3.5, 'Identifying non-intersecting edges');

  const nonIntersectingEdges: { wallId: string; edge: 'left' | 'right'; line: Line }[] = [];

  for (const { wall, leftEdge, rightEdge } of wallEdges) {
    const corners = result.get(wall.id)!;

    if (!corners.left) {
      const dir = vec.normalize(vec.sub(leftEdge.end, leftEdge.start));
      nonIntersectingEdges.push({
        wallId: wall.id,
        edge: 'left',
        line: { point: leftEdge.start, direction: dir },
      });
      log.substep(`${formatWallId(wall.id)}.left has no intersection (will extend to infinite line)`);
    }

    if (!corners.right) {
      const dir = vec.normalize(vec.sub(rightEdge.end, rightEdge.start));
      nonIntersectingEdges.push({
        wallId: wall.id,
        edge: 'right',
        line: { point: rightEdge.start, direction: dir },
      });
      log.substep(`${formatWallId(wall.id)}.right has no intersection (will extend to infinite line)`);
    }
  }

  log.result(`Found ${nonIntersectingEdges.length} non-intersecting edges`);

  // ============================================================
  // STEP 4: Collinear handling is SKIPPED (handled in Step SPECIAL above)
  // ============================================================
  log.step(4, 'Computing apex points for walls with collinear neighbors');
  log.substep(`Found ${collinearPairs.length} collinear pair(s) (already handled if only 2 walls)`);
  log.result('Collinear apex points computed (skipped for 2-wall case)');

  // ============================================================
  // STEP 5: Extend non-intersecting edges to infinite lines
  // ============================================================
  log.step(5, 'Extending remaining non-intersecting edges to infinite lines');

  let infiniteIntersectionCount = 0;

  // Try to intersect non-intersecting edges as infinite lines
  for (let i = 0; i < nonIntersectingEdges.length; i++) {
    for (let j = i + 1; j < nonIntersectingEdges.length; j++) {
      const edgeA = nonIntersectingEdges[i];
      const edgeB = nonIntersectingEdges[j];

      // Don't intersect two edges from the same wall
      if (edgeA.wallId === edgeB.wallId) continue;

      log.detail(`\nTrying infinite line intersection: ${formatWallId(edgeA.wallId)}.${edgeA.edge} ∩ ${formatWallId(edgeB.wallId)}.${edgeB.edge}`);

      const intersection = intersectLines(edgeA.line, edgeB.line);

      if (intersection) {
        infiniteIntersectionCount++;
        log.success(`Infinite intersection #${infiniteIntersectionCount}: ${formatPoint(intersection)}`);

        // Assign to both walls
        const cornersA = result.get(edgeA.wallId)!;
        const cornersB = result.get(edgeB.wallId)!;
        const wallA = scene.walls.get(edgeA.wallId)!;
        const wallB = scene.walls.get(edgeB.wallId)!;

        if (edgeA.edge === 'left' && !cornersA.left) {
          cornersA.left = clampMiterLength(node, intersection, wallA.thicknessMm);
          log.detail(`  Assigned to ${formatWallId(edgeA.wallId)}.left: ${formatPoint(cornersA.left)}`);
        } else if (edgeA.edge === 'right' && !cornersA.right) {
          cornersA.right = clampMiterLength(node, intersection, wallA.thicknessMm);
          log.detail(`  Assigned to ${formatWallId(edgeA.wallId)}.right: ${formatPoint(cornersA.right)}`);
        }

        if (edgeB.edge === 'left' && !cornersB.left) {
          cornersB.left = clampMiterLength(node, intersection, wallB.thicknessMm);
          log.detail(`  Assigned to ${formatWallId(edgeB.wallId)}.left: ${formatPoint(cornersB.left)}`);
        } else if (edgeB.edge === 'right' && !cornersB.right) {
          cornersB.right = clampMiterLength(node, intersection, wallB.thicknessMm);
          log.detail(`  Assigned to ${formatWallId(edgeB.wallId)}.right: ${formatPoint(cornersB.right)}`);
        }
      }
    }
  }

  log.result(`Found ${infiniteIntersectionCount} infinite line intersections`);

  // ============================================================
  // STEP 6: Create apex points for fully-intersected walls
  // ============================================================
  log.step(6, 'Creating apex points for remaining walls with both edges intersected');

  // Track which edges came from Step 5 (infinite line extensions)
  const edgesFromInfiniteExtension = new Set<string>();
  
  for (const edge of nonIntersectingEdges) {
    edgesFromInfiniteExtension.add(`${edge.wallId}.${edge.edge}`);
  }

  // Special case: Check if ALL walls are collinear (cross junction: 4 walls forming +)
  const allWallsCollinear = incidentWalls.length >= 4 && 
                            collinearWallIds.size === incidentWalls.length;

  if (allWallsCollinear) {
    log.substep(`✅ Cross junction detected: all ${incidentWalls.length} walls are collinear`);
    
    // Check if ALL walls have both edges intersected
    let allFullyIntersected = true;
    for (const { wall } of wallEdges) {
      const corners = result.get(wall.id)!;
      if (!corners.left || !corners.right) {
        allFullyIntersected = false;
        break;
      }
    }

    if (allFullyIntersected) {
      log.substep(`All walls have both edges intersected - assigning node apex to all`);
      
      // Give all walls the node center as apex
      for (const { wall } of wallEdges) {
        const corners = result.get(wall.id)!;
        if (!corners.apex) {
          corners.apex = { x: node.x, y: node.y };
          log.success(`${formatWallId(wall.id)}: apex = node center (cross junction) = ${formatPoint(corners.apex)}`);
        }
      }
    }
  }

  for (const [wallId, corners] of result) {
    // Skip if already has apex
    if (corners.apex) continue;

    // If both left and right are intersected, we need an apex
    if (corners.left && corners.right) {
      log.substep(`${formatWallId(wallId)}: has both corners, checking if apex needed`);
      
      // Check if BOTH edges came from finite segment intersections (not infinite extensions)
      const leftFromSegment = !edgesFromInfiniteExtension.has(`${wallId}.left`);
      const rightFromSegment = !edgesFromInfiniteExtension.has(`${wallId}.right`);

      log.detail(`  left from segment: ${leftFromSegment}`);
      log.detail(`  right from segment: ${rightFromSegment}`);

      if (!leftFromSegment || !rightFromSegment) {
        log.warn(`${formatWallId(wallId)}: at least one edge from infinite extension, skipping apex`);
        continue;
      }

      log.detail(`Both edges from finite segments, computing apex...`);

      // ✅ FIX: Look for apex from collinear walls' non-intersecting edges FIRST
      if (collinearWallIds.size > 0 && !collinearWallIds.has(wallId)) {
        log.detail(`Wall ${formatWallId(wallId)} is non-collinear, looking for collinear walls' non-intersecting edges`);
        
        // Get non-intersecting edges from collinear walls only
        const collinearNonIntersecting = nonIntersectingEdges.filter(e => collinearWallIds.has(e.wallId));
        
        log.detail(`Found ${collinearNonIntersecting.length} non-intersecting edges from collinear walls`);
        
        if (collinearNonIntersecting.length === 2) {
          const edge1 = collinearNonIntersecting[0];
          const edge2 = collinearNonIntersecting[1];
          
          log.detail(`Attempting to intersect collinear edges...`);
          
          if (almostEqual(edge1.line.point, edge2.line.point)) {
            log.success(`Both edges share the same origin!`);
            const apex = edge1.line.point;
            
            if (!almostEqual(apex, corners.left) && !almostEqual(apex, corners.right)) {
              const wall = scene.walls.get(wallId)!;
              const clampedApex = clampMiterLength(node, apex, wall.thicknessMm);
              
              corners.apex = clampedApex;
              log.success(`${formatWallId(wallId)}: apex from shared origin = ${formatPoint(corners.apex)}`);
              continue;
            }
          } else {
            const apex = intersectLines(edge1.line, edge2.line);
            
            if (apex && !almostEqual(apex, corners.left) && !almostEqual(apex, corners.right)) {
              const wall = scene.walls.get(wallId)!;
              const clampedApex = clampMiterLength(node, apex, wall.thicknessMm);
              
              corners.apex = clampedApex;
              log.success(`${formatWallId(wallId)}: apex from collinear edges = ${formatPoint(corners.apex)}`);
              continue;
            }
          }
        }
      }
      
      // Try to find apex from non-intersecting edges of OTHER walls (original logic)
      const otherNonIntersecting = nonIntersectingEdges.filter(e => e.wallId !== wallId);

      if (otherNonIntersecting.length >= 2) {
        log.detail(`Trying apex from ${otherNonIntersecting.length} other non-intersecting edges`);
        
        for (let i = 0; i < otherNonIntersecting.length; i++) {
          for (let j = i + 1; j < otherNonIntersecting.length; j++) {
            const edgeA = otherNonIntersecting[i];
            const edgeB = otherNonIntersecting[j];

            const apex = intersectLines(edgeA.line, edgeB.line);

            if (apex && !almostEqual(apex, corners.left) && !almostEqual(apex, corners.right)) {
              const wall = scene.walls.get(wallId)!;
              corners.apex = clampMiterLength(node, apex, wall.thicknessMm);
              log.success(`${formatWallId(wallId)}: apex from other edges = ${formatPoint(corners.apex)}`);
              break;
            }
          }
          if (corners.apex) break;
        }
      }

      // If no apex found and this is a multi-wall junction (3+ walls), use node center
      if (!corners.apex && incidentWalls.length >= 3) {
        log.detail(`Checking if all walls fully intersected via segments for node center apex`);
        
        let allFullyIntersectedViaSegments = true;
        for (const { wall } of wallEdges) {
          const c = result.get(wall.id)!;
          const leftSegment = c.left && !edgesFromInfiniteExtension.has(`${wall.id}.left`);
          const rightSegment = c.right && !edgesFromInfiniteExtension.has(`${wall.id}.right`);
          
          if (!leftSegment || !rightSegment) {
            allFullyIntersectedViaSegments = false;
            break;
          }
        }

        if (allFullyIntersectedViaSegments) {
          corners.apex = { x: node.x, y: node.y };
          log.success(`${formatWallId(wallId)}: apex = node center (all edges from segments) = ${formatPoint(corners.apex)}`);
        } else {
          log.warn(`${formatWallId(wallId)}: not all edges from segments, no node center apex`);
        }
      }
    } else {
      log.warn(`${formatWallId(wallId)}: missing corners (left: ${!!corners.left}, right: ${!!corners.right})`);
    }
  }

  log.result('Apex points computed');

  // ============================================================
  // FINAL: Log summary
  // ============================================================
  log.section(`Summary for Node ${formatWallId(node.id)}`);
  
  for (const [wallId, corners] of result) {
    const wall = scene.walls.get(wallId)!;
    log.substep(`${formatWallId(wallId)} (${wall.thicknessMm}mm):`);
    log.detail(`  left: ${formatPoint(corners.left)}`);
    log.detail(`  right: ${formatPoint(corners.right)}`);
    log.detail(`  apex: ${formatPoint(corners.apex)}`);
  }

  // ✅ Cache the result before returning
  nodeCornerCache.set(node.id, result);

  return result;
}

// ============================================================================
// Wall Corners Type
// ============================================================================

/**
 * Corner points for a wall at a node
 */
interface WallCorners {
  left: Vec2 | null;   // Left edge intersection
  right: Vec2 | null;  // Right edge intersection
  apex: Vec2 | null;   // Optional apex point
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
  log.section(`Building Polygon for Wall ${formatWallId(wall.id)} (thickness: ${wall.thicknessMm}mm)`);

  const nodeA = scene.nodes.get(wall.nodeAId)!;
  const nodeB = scene.nodes.get(wall.nodeBId)!;

  const dirAB = vec.normalize(vec.sub(nodeB, nodeA));
  const perpAB = perpCCW(dirAB);
  const halfThickness = wall.thicknessMm / 2;

  log.substep(`Wall runs from ${formatPoint(nodeA)} to ${formatPoint(nodeB)}`);
  log.substep(`Direction: (${dirAB.x.toFixed(3)}, ${dirAB.y.toFixed(3)})`);
  log.substep(`Half thickness: ${halfThickness.toFixed(1)}mm`);

  // Fallback points (straight butt joint)
  const baseLeftA = vec.add(nodeA, vec.scale(perpAB, halfThickness));
  const baseRightA = vec.sub(nodeA, vec.scale(perpAB, halfThickness));
  const baseLeftB = vec.add(nodeB, vec.scale(perpAB, halfThickness));
  const baseRightB = vec.sub(nodeB, vec.scale(perpAB, halfThickness));

  log.substep(`Fallback corners (no mitering):`);
  log.detail(`  A_left: ${formatPoint(baseLeftA)}`);
  log.detail(`  A_right: ${formatPoint(baseRightA)}`);
  log.detail(`  B_left: ${formatPoint(baseLeftB)}`);
  log.detail(`  B_right: ${formatPoint(baseRightB)}`);

  // Get mitered corners (uses cache)
  const cornersAtA = computeNodeCornersSegmentBased(nodeA, scene).get(wall.id);
  const cornersAtB = computeNodeCornersSegmentBased(nodeB, scene).get(wall.id);

  // Assign final corners (miter or fallback)
  const A_left = cornersAtA?.left ?? baseLeftA;
  const A_right = cornersAtA?.right ?? baseRightA;
  const A_apex = cornersAtA?.apex ?? null;

  // At node B, swap left↔right (we're looking from opposite direction)
  const B_left = cornersAtB?.right ?? baseLeftB;
  const B_right = cornersAtB?.left ?? baseRightB;
  const B_apex = cornersAtB?.apex ?? null;

  log.substep(`Final corners (with mitering):`);
  log.detail(`  A_left: ${formatPoint(A_left)} ${cornersAtA?.left ? '✅ mitered' : '⚠️ fallback'}`);
  log.detail(`  A_apex: ${formatPoint(A_apex)}`);
  log.detail(`  A_right: ${formatPoint(A_right)} ${cornersAtA?.right ? '✅ mitered' : '⚠️ fallback'}`);
  log.detail(`  B_right: ${formatPoint(B_right)} ${cornersAtB?.left ? '✅ mitered' : '⚠️ fallback'}`);
  log.detail(`  B_apex: ${formatPoint(B_apex)}`);
  log.detail(`  B_left: ${formatPoint(B_left)} ${cornersAtB?.right ? '✅ mitered' : '⚠️ fallback'}`);

  // Build polygon in CCW order
  const polygon: Vec2[] = [A_left];

  if (A_apex) {
    polygon.push(A_apex);
  }

  polygon.push(A_right);
  polygon.push(B_right);

  if (B_apex) {
    polygon.push(B_apex);
  }

  polygon.push(B_left);

  log.result(`Polygon complete with ${polygon.length} vertices`);
  log.section(`Finished Wall ${formatWallId(wall.id)}`);

  return polygon;
}
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

const DEBUG = false;
const EPSILON = 1e-9;
const MAX_MITER_LENGTH_RATIO = 10; // Prevent infinite spikes at shallow angles
const COLLINEAR_ANGLE_THRESHOLD = 0.0175; // ~1 degree in radians

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

  if (isOpposite) {
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

  // Parallel or coincident
  if (Math.abs(denominator) < EPSILON) {
    return null;
  }

  const delta = vec.sub(p3, p1);
  const t1 = cross(delta, d2) / denominator;
  const t2 = cross(delta, d1) / denominator;

  // Check if intersection is within both segments [0, 1]
  if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
    return vec.add(p1, vec.scale(d1, t1));
  }

  return null;
}

/**
 * Intersect two infinite lines
 * Returns intersection point or null if parallel
 */
function intersectLines(line1: Line, line2: Line): Vec2 | null {
  const denominator = cross(line1.direction, line2.direction);

  // Parallel
  if (Math.abs(denominator) < EPSILON) {
    return null;
  }

  const delta = vec.sub(line2.point, line1.point);
  const t = cross(delta, line2.direction) / denominator;

  return vec.add(line1.point, vec.scale(line1.direction, t));
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

  // Compute offset points at the node (start of the edge segments)
  const leftAtNode = vec.add(startNode, vec.scale(perp, halfThickness));
  const rightAtNode = vec.sub(startNode, vec.scale(perp, halfThickness));

  // Compute offset points at the opposite end (for segment bounds)
  const leftAtEnd = vec.add(endNode, vec.scale(perp, halfThickness));
  const rightAtEnd = vec.sub(endNode, vec.scale(perp, halfThickness));

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
 * FIXED: Now handles collinear walls (180° apart) properly
 */
function computeNodeCornersSegmentBased(node: Node, scene: Scene): Map<string, WallCorners> {
  log.section(`Computing Corners for Node ${formatWallId(node.id)}`);

  const result = new Map<string, WallCorners>();

  // ============================================================
  // STEP 1: Find incident walls and compute edges
  // ============================================================
  log.step(1, 'Finding incident walls and computing offset edges');

  const incidentWalls = [...scene.walls.values()].filter(
    wall => wall.nodeAId === node.id || wall.nodeBId === node.id
  );

  if (incidentWalls.length === 0) {
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
    log.substep(`Collinear pair: ${formatWallId(wall1.id)} ↔ ${formatWallId(wall2.id)}`);
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
  for (let i = 0; i < wallEdges.length; i++) {
    const wallA = wallEdges[i];

    for (let j = i + 1; j < wallEdges.length; j++) {
      const wallB = wallEdges[j];

      // Skip if both walls are collinear (their edges won't meaningfully intersect)
      const bothCollinear = collinearWallIds.has(wallA.wall.id) && collinearWallIds.has(wallB.wall.id);
      if (bothCollinear && areWallsCollinear(wallA.wall, wallB.wall, node, scene)) {
        log.detail(`Skipping collinear pair: ${formatWallId(wallA.wall.id)} ↔ ${formatWallId(wallB.wall.id)}`);
        continue;
      }

      // Test all four edge combinations
      const tests = [
        { edgeA: wallA.leftEdge, sideA: 'left' as const, edgeB: wallB.leftEdge, sideB: 'left' as const },
        { edgeA: wallA.leftEdge, sideA: 'left' as const, edgeB: wallB.rightEdge, sideB: 'right' as const },
        { edgeA: wallA.rightEdge, sideA: 'right' as const, edgeB: wallB.leftEdge, sideB: 'left' as const },
        { edgeA: wallA.rightEdge, sideA: 'right' as const, edgeB: wallB.rightEdge, sideB: 'right' as const },
      ];

      for (const { edgeA, sideA, edgeB, sideB } of tests) {
        const intersection = intersectSegments(edgeA, edgeB);

        if (intersection) {
          const distA = vec.distance(node, intersection);
          const distB = vec.distance(node, intersection);

          log.substep(
            `${formatWallId(wallA.wall.id)}.${sideA} ∩ ${formatWallId(wallB.wall.id)}.${sideB} = ${formatPoint(intersection)} (dist: ${distA.toFixed(1)}mm)`
          );

          // Add to wall A's intersection list
          allIntersections.get(wallA.wall.id)![sideA].push({
            wallId: wallA.wall.id,
            edge: sideA,
            point: intersection,
            distanceFromNode: distA,
          });

          // Add to wall B's intersection list
          allIntersections.get(wallB.wall.id)![sideB].push({
            wallId: wallB.wall.id,
            edge: sideB,
            point: intersection,
            distanceFromNode: distB,
          });
        }
      }
    }
  }

  log.result('All intersections collected');

  // ============================================================
  // STEP 3: Choose the FARTHEST valid intersection for each edge
  // ============================================================
  log.step(3, 'Selecting farthest valid intersection for each edge');

  for (const [wallId, intersections] of allIntersections) {
    const corners = result.get(wallId)!;
    const wall = scene.walls.get(wallId)!;

    // Process left edge intersections
    if (intersections.left.length > 0) {
      // Sort by distance from node (descending - farthest first)
      intersections.left.sort((a, b) => b.distanceFromNode - a.distanceFromNode);

      // Choose the farthest valid intersection
      for (const candidate of intersections.left) {
        const clamped = clampMiterLength(node, candidate.point, wall.thicknessMm);
        if (clamped) {
          corners.left = clamped;
          log.substep(
            `${formatWallId(wallId)}.left: chose farthest @ ${candidate.distanceFromNode.toFixed(1)}mm = ${formatPoint(clamped)}`
          );
          break;
        }
      }
    }

    // Process right edge intersections
    if (intersections.right.length > 0) {
      // Sort by distance from node (descending - farthest first)
      intersections.right.sort((a, b) => b.distanceFromNode - a.distanceFromNode);

      // Choose the farthest valid intersection
      for (const candidate of intersections.right) {
        const clamped = clampMiterLength(node, candidate.point, wall.thicknessMm);
        if (clamped) {
          corners.right = clamped;
          log.substep(
            `${formatWallId(wallId)}.right: chose farthest @ ${candidate.distanceFromNode.toFixed(1)}mm = ${formatPoint(clamped)}`
          );
          break;
        }
      }
    }
  }

  log.result('Farthest intersections selected');

  // ============================================================
  // STEP 3.5: Find non-intersecting edges (before Step 4 assigns them)
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
      log.substep(`${formatWallId(wall.id)}.left has no intersection`);
    }

    if (!corners.right) {
      const dir = vec.normalize(vec.sub(rightEdge.end, rightEdge.start));
      nonIntersectingEdges.push({
        wallId: wall.id,
        edge: 'right',
        line: { point: rightEdge.start, direction: dir },
      });
      log.substep(`${formatWallId(wall.id)}.right has no intersection`);
    }
  }

  log.result('Non-intersecting edges identified');
  // ============================================================
  // STEP 4: Handle collinear wall apex points (BEFORE Step 5)
  // ============================================================
  log.step(4, 'Computing apex points for walls with collinear neighbors');

  // Store collinear apex point for later use
  let collinearApex: Vec2 | null = null;

  if (collinearPairs.length > 0) {
    log.substep(`Found ${collinearPairs.length} collinear pair(s)`);
    
    // Find non-intersecting edges from collinear walls
    const collinearNonIntersecting = nonIntersectingEdges.filter(e => collinearWallIds.has(e.wallId));
    
    log.substep(`Non-intersecting edges from collinear walls: ${collinearNonIntersecting.length}`);
    for (const edge of collinearNonIntersecting) {
      log.detail(`  - ${formatWallId(edge.wallId)}.${edge.edge}`);
    }

    if (collinearNonIntersecting.length >= 2) {
      log.substep(`Attempting to intersect ${collinearNonIntersecting.length} collinear non-intersecting edges`);
      
      // Try to find apex by intersecting non-intersecting edges from collinear walls
      for (let i = 0; i < collinearNonIntersecting.length; i++) {
        for (let j = i + 1; j < collinearNonIntersecting.length; j++) {
          const edgeA = collinearNonIntersecting[i];
          const edgeB = collinearNonIntersecting[j];

          log.detail(`  Testing: ${formatWallId(edgeA.wallId)}.${edgeA.edge} vs ${formatWallId(edgeB.wallId)}.${edgeB.edge}`);

          // Only intersect edges from different walls
          if (edgeA.wallId === edgeB.wallId) {
            log.detail(`    ❌ Same wall, skipping`);
            continue;
          }

          // Check if the two edges are from collinear walls
          const wallA = scene.walls.get(edgeA.wallId)!;
          const wallB = scene.walls.get(edgeB.wallId)!;
          
          const isCollinear = areWallsCollinear(wallA, wallB, node, scene);
          log.detail(`    Collinearity check: ${isCollinear ? '✅ YES' : '❌ NO'}`);
          
          if (!isCollinear) continue;

          log.detail(`    Computing line intersection...`);
          log.detail(`      Line A: origin=${formatPoint(edgeA.line.point)}, dir=${formatPoint(edgeA.line.direction)}`);
          log.detail(`      Line B: origin=${formatPoint(edgeB.line.point)}, dir=${formatPoint(edgeB.line.direction)}`);

          const apex = intersectLines(edgeA.line, edgeB.line);

          log.detail(`    Intersection result: ${formatPoint(apex)}`);

          if (apex) {
            // Clamp using average thickness
            const avgThickness = (wallA.thicknessMm + wallB.thicknessMm) / 2;
            log.detail(`    Average thickness: ${avgThickness.toFixed(1)}mm`);
            
            const distance = vec.distance(node, apex);
            log.detail(`    Distance from node: ${distance.toFixed(1)}mm`);
            
            collinearApex = clampMiterLength(node, apex, avgThickness);
            
            log.detail(`    Clamped result: ${formatPoint(collinearApex)}`);
            
            if (collinearApex) {
              log.substep(
                `✅ Collinear apex found: ${formatWallId(edgeA.wallId)}.${edgeA.edge} ∩ ${formatWallId(edgeB.wallId)}.${edgeB.edge} = ${formatPoint(collinearApex)}`
              );

              // Update the collinear walls' missing corners
              const cornersA = result.get(edgeA.wallId)!;
              const cornersB = result.get(edgeB.wallId)!;

              if (edgeA.edge === 'left' && !cornersA.left) {
                cornersA.left = collinearApex;
                log.substep(`  └─ Updated ${formatWallId(edgeA.wallId)}.left = ${formatPoint(collinearApex)}`);
              } else if (edgeA.edge === 'right' && !cornersA.right) {
                cornersA.right = collinearApex;
                log.substep(`  └─ Updated ${formatWallId(edgeA.wallId)}.right = ${formatPoint(collinearApex)}`);
              }

              if (edgeB.edge === 'left' && !cornersB.left) {
                cornersB.left = collinearApex;
                log.substep(`  └─ Updated ${formatWallId(edgeB.wallId)}.left = ${formatPoint(collinearApex)}`);
              } else if (edgeB.edge === 'right' && !cornersB.right) {
                cornersB.right = collinearApex;
                log.substep(`  └─ Updated ${formatWallId(edgeB.wallId)}.right = ${formatPoint(collinearApex)}`);
              }

              break;
            } else {
              log.detail(`    ❌ Clamping rejected the point (too far from node)`);
            }
          } else {
            log.detail(`    ❌ Lines are parallel (collinear edges on same line)`);
            // For collinear walls, the non-intersecting edges are on the same line
            // Use the OFFSET EDGE origin as the apex point (not the centerline node)
            // This is where the thickened edges meet, maintaining proper wall thickness
            log.detail(`    Using offset edge origin as apex for collinear walls`);
            
            // Use the origin of one of the offset edges (they're the same point)
            collinearApex = { x: edgeA.line.point.x, y: edgeA.line.point.y };
            
            log.substep(
              `✅ Collinear apex at offset edge: ${formatWallId(edgeA.wallId)}.${edgeA.edge} & ${formatWallId(edgeB.wallId)}.${edgeB.edge} = ${formatPoint(collinearApex)}`
            );

            // Update the collinear walls' missing corners with offset edge origin
            const cornersA = result.get(edgeA.wallId)!;
            const cornersB = result.get(edgeB.wallId)!;

            if (edgeA.edge === 'left' && !cornersA.left) {
              cornersA.left = collinearApex;
              log.substep(`  └─ Updated ${formatWallId(edgeA.wallId)}.left = ${formatPoint(collinearApex)}`);
            } else if (edgeA.edge === 'right' && !cornersA.right) {
              cornersA.right = collinearApex;
              log.substep(`  └─ Updated ${formatWallId(edgeA.wallId)}.right = ${formatPoint(collinearApex)}`);
            }

            if (edgeB.edge === 'left' && !cornersB.left) {
              cornersB.left = collinearApex;
              log.substep(`  └─ Updated ${formatWallId(edgeB.wallId)}.left = ${formatPoint(collinearApex)}`);
            } else if (edgeB.edge === 'right' && !cornersB.right) {
              cornersB.right = collinearApex;
              log.substep(`  └─ Updated ${formatWallId(edgeB.wallId)}.right = ${formatPoint(collinearApex)}`);
            }

            break;
          }
        }
        if (collinearApex) break;
      }
    } else {
      log.substep(`❌ Not enough non-intersecting edges from collinear walls (need >= 2, have ${collinearNonIntersecting.length})`);
    }

    // Now assign apex to non-collinear walls that have both edges intersected
    if (collinearApex) {
      log.substep(`Assigning collinear apex to non-collinear walls...`);
      
      for (const { wall } of wallEdges) {
        if (collinearWallIds.has(wall.id)) {
          log.detail(`  Skipping ${formatWallId(wall.id)} (is collinear)`);
          continue;
        }

        const corners = result.get(wall.id)!;
        
        log.detail(`  Checking ${formatWallId(wall.id)}: left=${formatPoint(corners.left)}, right=${formatPoint(corners.right)}, apex=${formatPoint(corners.apex)}`);
        
        // If this wall has both edges intersected, give it the collinear apex
        if (corners.left && corners.right && !corners.apex) {
          corners.apex = collinearApex;
          log.substep(`  ✅ ${formatWallId(wall.id)}: apex = collinear intersection = ${formatPoint(collinearApex)}`);
        } else {
          if (!corners.left) log.detail(`    ❌ Missing left corner`);
          if (!corners.right) log.detail(`    ❌ Missing right corner`);
          if (corners.apex) log.detail(`    ❌ Already has apex`);
        }
      }
    } else {
      log.substep(`❌ No collinear apex found, cannot assign to non-collinear walls`);
    }
  } else {
    log.substep(`No collinear pairs found`);
  }

  log.result('Collinear apex points computed');

  // ============================================================
  // STEP 5: Extend non-intersecting edges to infinite lines
  // ============================================================
  log.step(5, 'Extending remaining non-intersecting edges to infinite lines');

  // Try to intersect non-intersecting edges as infinite lines (but skip collinear pairs already handled)
  for (let i = 0; i < nonIntersectingEdges.length; i++) {
    for (let j = i + 1; j < nonIntersectingEdges.length; j++) {
      const edgeA = nonIntersectingEdges[i];
      const edgeB = nonIntersectingEdges[j];

      // Don't intersect two edges from the same wall
      if (edgeA.wallId === edgeB.wallId) continue;

      // Skip if both are from collinear walls (already handled in Step 4)
      if (collinearWallIds.has(edgeA.wallId) && collinearWallIds.has(edgeB.wallId)) {
        const wallA = scene.walls.get(edgeA.wallId)!;
        const wallB = scene.walls.get(edgeB.wallId)!;
        if (areWallsCollinear(wallA, wallB, node, scene)) continue;
      }

      const intersection = intersectLines(edgeA.line, edgeB.line);

      if (intersection) {
        log.substep(
          `Extended: ${formatWallId(edgeA.wallId)}.${edgeA.edge} ∩ ${formatWallId(edgeB.wallId)}.${edgeB.edge} = ${formatPoint(intersection)}`
        );

        // Assign to both walls
        const cornersA = result.get(edgeA.wallId)!;
        const cornersB = result.get(edgeB.wallId)!;
        const wallA = scene.walls.get(edgeA.wallId)!;
        const wallB = scene.walls.get(edgeB.wallId)!;

        if (edgeA.edge === 'left' && !cornersA.left) {
          cornersA.left = clampMiterLength(node, intersection, wallA.thicknessMm);
        } else if (edgeA.edge === 'right' && !cornersA.right) {
          cornersA.right = clampMiterLength(node, intersection, wallA.thicknessMm);
        }

        if (edgeB.edge === 'left' && !cornersB.left) {
          cornersB.left = clampMiterLength(node, intersection, wallB.thicknessMm);
        } else if (edgeB.edge === 'right' && !cornersB.right) {
          cornersB.right = clampMiterLength(node, intersection, wallB.thicknessMm);
        }
      }
    }
  }

  log.result('Non-intersecting edges processed');

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
  // In this case, all collinear walls should get apex at node center
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
          log.substep(`  ✅ ${formatWallId(wall.id)}: apex = node center (cross junction) = ${formatPoint(corners.apex)}`);
        }
      }
    }
  }

  for (const [wallId, corners] of result) {
    // Skip if already has apex (assigned in cross junction case above)
    if (corners.apex) continue;

    // If both left and right are intersected, we need an apex
    if (corners.left && corners.right) {
      // Check if BOTH edges came from finite segment intersections (not infinite extensions)
      const leftFromSegment = !edgesFromInfiniteExtension.has(`${wallId}.left`);
      const rightFromSegment = !edgesFromInfiniteExtension.has(`${wallId}.right`);

      if (!leftFromSegment || !rightFromSegment) {
        log.substep(
          `${formatWallId(wallId)}: has both corners but at least one is from infinite extension (left: ${leftFromSegment ? 'segment' : 'infinite'}, right: ${rightFromSegment ? 'segment' : 'infinite'}), no apex`
        );
        continue;
      }

      log.substep(`${formatWallId(wallId)}: both edges intersected via segments, checking for apex`);

      // CASE 1: Try to find apex from non-intersecting edges of OTHER walls
      const otherNonIntersecting = nonIntersectingEdges.filter(e => e.wallId !== wallId);

      if (otherNonIntersecting.length >= 2) {
        // Try to find apex by intersecting two non-intersecting edges from other walls
        for (let i = 0; i < otherNonIntersecting.length; i++) {
          for (let j = i + 1; j < otherNonIntersecting.length; j++) {
            const edgeA = otherNonIntersecting[i];
            const edgeB = otherNonIntersecting[j];

            const apex = intersectLines(edgeA.line, edgeB.line);

            if (apex && !almostEqual(apex, corners.left) && !almostEqual(apex, corners.right)) {
              const wall = scene.walls.get(wallId)!;
              corners.apex = clampMiterLength(node, apex, wall.thicknessMm);
              log.substep(`${formatWallId(wallId)}: apex from other edges = ${formatPoint(corners.apex)}`);
              break;
            }
          }
          if (corners.apex) break;
        }
      }

      // CASE 2: If no apex found and this is a multi-wall junction (3+ walls),
      // use the shared node as the apex point
      if (!corners.apex && incidentWalls.length >= 3) {
        // Check if all walls at this node have both edges intersected VIA SEGMENTS (not extensions)
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
          log.substep(`${formatWallId(wallId)}: apex = node position (all edges intersected via segments) = ${formatPoint(corners.apex)}`);
        }
      }
    } else {
      // Wall doesn't have both edges intersected
      // Only log if it's collinear (for debugging purposes)
      if (collinearWallIds.has(wallId)) {
        log.substep(`${formatWallId(wallId)}: collinear wall without both edges intersected, no apex`);
      }
    }
  }

  log.result('Apex points computed');

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
  log.section(`Building Polygon for Wall ${formatWallId(wall.id)}`);

  const nodeA = scene.nodes.get(wall.nodeAId)!;
  const nodeB = scene.nodes.get(wall.nodeBId)!;

  const dirAB = vec.normalize(vec.sub(nodeB, nodeA));
  const perpAB = perpCCW(dirAB);
  const halfThickness = wall.thicknessMm / 2;

  // Fallback points (straight butt joint)
  const baseLeftA = vec.add(nodeA, vec.scale(perpAB, halfThickness));
  const baseRightA = vec.sub(nodeA, vec.scale(perpAB, halfThickness));
  const baseLeftB = vec.add(nodeB, vec.scale(perpAB, halfThickness));
  const baseRightB = vec.sub(nodeB, vec.scale(perpAB, halfThickness));

  // Get mitered corners (now works correctly for both nodeA and nodeB)
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
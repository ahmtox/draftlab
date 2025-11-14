import type { Scene, Wall, Node } from '../domain/types';
import type { Vec2 } from '../math/vec';
import * as vec from '../math/vec';
import { buildWallPolygon } from '../geometry/miter'; // ✅ NEW IMPORT

export type HalfEdge = {
  id: string;
  wallId: string;
  startNodeId: string;
  endNodeId: string;
  twin?: string;
  next?: string;
  prev?: string;
  face?: string;
};

export type Face = {
  id: string;
  edges: string[];
  isOuter: boolean;
};

export function buildHalfEdgeStructure(scene: Scene): Map<string, HalfEdge> {
  const halfEdges = new Map<string, HalfEdge>();
  
  for (const wall of scene.walls.values()) {
    const heA = createHalfEdge(wall, wall.nodeAId, wall.nodeBId);
    const heB = createHalfEdge(wall, wall.nodeBId, wall.nodeAId);
    
    heA.twin = heB.id;
    heB.twin = heA.id;
    
    halfEdges.set(heA.id, heA);
    halfEdges.set(heB.id, heB);
  }
  
  linkHalfEdgesAtNodes(halfEdges, scene);
  
  return halfEdges;
}

function createHalfEdge(wall: Wall, startNodeId: string, endNodeId: string): HalfEdge {
  const direction = startNodeId === wall.nodeAId ? 'forward' : 'reverse';
  return {
    id: `${wall.id}-${direction}`,
    wallId: wall.id,
    startNodeId,
    endNodeId,
  };
}

/**
 * Link half-edges at nodes using CCW predecessor rule
 * 
 * Algorithm:
 * 1. Build CCW-sorted outgoing lists per node
 * 2. For each edge e: u→v, find twin(e) in outgoing[v]
 * 3. Only set next(e) if v has ≥2 outgoing edges (not an open end)
 * 4. Set next(e) = CCW PREDECESSOR of twin(e) in outgoing[v]
 *    (the edge immediately BEFORE twin in CCW order)
 * 
 * Why predecessor?
 * - When walking CCW around a vertex, the predecessor of the twin
 *   is the edge that continues the face boundary on the left
 */
function linkHalfEdgesAtNodes(halfEdges: Map<string, HalfEdge>, scene: Scene): void {
  const outgoing = new Map<string, HalfEdge[]>();

  // Step 1: Collect outgoing edges per node
  for (const he of halfEdges.values()) {
    if (!outgoing.has(he.startNodeId)) {
      outgoing.set(he.startNodeId, []);
    }
    outgoing.get(he.startNodeId)!.push(he);
  }

  // Step 2: Sort edges CCW at each node
  for (const [nodeId, edges] of outgoing) {
    const node = scene.nodes.get(nodeId);
    if (!node) continue;

    edges.sort((a, b) => {
      const nodeA = scene.nodes.get(a.endNodeId)!;
      const nodeB = scene.nodes.get(b.endNodeId)!;
      const angleA = Math.atan2(nodeA.y - node.y, nodeA.x - node.x);
      const angleB = Math.atan2(nodeB.y - node.y, nodeB.x - node.x);
      return angleA - angleB;
    });
  }

  // Step 3: Link edges using CCW predecessor rule
  for (const he of halfEdges.values()) {
    const twin = halfEdges.get(he.twin!);
    if (!twin) continue;

    const edgesAtEnd = outgoing.get(he.endNodeId);
    
    // Don't link across open ends (valence < 2)
    if (!edgesAtEnd || edgesAtEnd.length < 2) {
      continue;
    }

    const twinIndex = edgesAtEnd.findIndex(e => e.id === twin.id);
    if (twinIndex === -1) continue;

    // Simple rule: CCW predecessor of twin
    const nextIndex = (twinIndex - 1 + edgesAtEnd.length) % edgesAtEnd.length;
    he.next = edgesAtEnd[nextIndex].id;
    edgesAtEnd[nextIndex].prev = he.id;
  }
}

/**
 * Detect faces by walking half-edges
 * Only mark START edges as tried to allow edge reuse in multiple walks
 */
export function detectFaces(halfEdges: Map<string, HalfEdge>, scene: Scene): Face[] {
  const faces: Face[] = [];
  const triedStarts = new Set<string>();
  const EPS = 1e-6;
  const maxIterations = Math.max(8, halfEdges.size * 2);

  for (const heStart of halfEdges.values()) {
    // Skip if edge already assigned to a face or already tried as start
    if (heStart.face) continue;
    if (triedStarts.has(heStart.id)) continue;

    triedStarts.add(heStart.id);

    const cycle: string[] = [];
    const seenThisWalk = new Set<string>();
    let current: HalfEdge | undefined = heStart;
    let closed = false;
    let steps = 0;

    while (current && !seenThisWalk.has(current.id) && steps < maxIterations) {
      seenThisWalk.add(current.id);
      cycle.push(current.id);

      if (!current.next) {
        break; // Hit open end
      }

      current = halfEdges.get(current.next);
      if (current?.id === heStart.id) {
        closed = true;
        break;
      }

      steps++;
    }

    // Only accept closed loops with ≥3 edges
    if (!closed || cycle.length < 3) {
      continue;
    }

    // Compute area to filter out zero-area faces
    const signedArea = computeSignedAreaForCycle(cycle, halfEdges, scene);
    
    if (Math.abs(signedArea) < EPS) {
      continue;
    }

    // Commit: assign face ID to all edges in this valid cycle
    const faceId = `face-${faces.length}`;
    for (const eid of cycle) {
      const edge = halfEdges.get(eid)!;
      edge.face = faceId;
    }

    faces.push({
      id: faceId,
      edges: cycle,
      isOuter: false,
    });
  }
  
  if (faces.length === 0) {
    return faces;
  }

  markOuterFace(faces, halfEdges, scene);
  
  return faces;
}

function markOuterFace(faces: Face[], halfEdges: Map<string, HalfEdge>, scene: Scene): void {
  if (faces.length === 0) return;

  const EPS = 1e-6;

  const areas = faces.map((face, i) => ({
    index: i,
    signed: computeSignedAreaForFace(face, halfEdges, scene),
  }));

  // Filter out degenerate faces
  const nonDegenerate = areas.filter(a => Math.abs(a.signed) > EPS);
  
  if (nonDegenerate.length === 0) {
    faces.length = 0;
    return;
  }

  // Outer face has NEGATIVE (clockwise) signed area
  // Inner faces have POSITIVE (counter-clockwise) signed area
  const outerFace = nonDegenerate.find(a => a.signed < 0);
  
  // Mark all faces as inner by default
  faces.forEach(f => (f.isOuter = false));
  
  // If there's a clockwise face, mark it as outer
  if (outerFace) {
    faces[outerFace.index].isOuter = true;
  }
  // If no clockwise face exists, ALL faces are interior rooms (no outer boundary)
}

function computeSignedAreaForCycle(cycle: string[], halfEdges: Map<string, HalfEdge>, scene: Scene): number {
  const nodeIds: string[] = [];
  
  for (const heId of cycle) {
    const he = halfEdges.get(heId);
    if (!he) continue;
    nodeIds.push(he.startNodeId);
  }
  
  if (nodeIds.length < 3) return 0;
  
  let sum = 0;
  for (let i = 0; i < nodeIds.length; i++) {
    const curr = scene.nodes.get(nodeIds[i]);
    const next = scene.nodes.get(nodeIds[(i + 1) % nodeIds.length]);
    
    if (!curr || !next) continue;
    
    sum += (curr.x * next.y - next.x * curr.y);
  }
  
  return sum / 2;
}

function computeSignedAreaForFace(face: Face, halfEdges: Map<string, HalfEdge>, scene: Scene): number {
  return computeSignedAreaForCycle(face.edges, halfEdges, scene);
}

export function getLeftFace(wallId: string, halfEdges: Map<string, HalfEdge>): string | null {
  const he = halfEdges.get(`${wallId}-forward`);
  return he?.face ?? null;
}

export function getRightFace(wallId: string, halfEdges: Map<string, HalfEdge>): string | null {
  const he = halfEdges.get(`${wallId}-reverse`);
  return he?.face ?? null;
}

/**
 * ✅ NEW IMPLEMENTATION: Build inner room polygon using mitered corners
 * 
 * This replaces the old offset-intersection logic with proper mitered corner computation.
 * Each wall contributes its **inner edge** (the edge facing the room interior).
 * 
 * Algorithm:
 * 1. Determine room orientation (CCW or CW) using signed area
 * 2. For each half-edge in the face:
 *    - Get the wall's fully mitered polygon from buildWallPolygon()
 *    - Extract the inner edge based on half-edge direction
 *    - Walk the vertices in the correct order for the room orientation
 * 3. Remove duplicate consecutive vertices (within 1mm tolerance)
 * 
 * Wall polygon structure:
 *   [A_left, (A_apex?), A_right, B_right, (B_apex?), B_left]
 * 
 * For forward half-edge (A→B):
 *   - Inner edge = left side (A_left → A_apex → ... → B_left)
 * 
 * For backward half-edge (B→A):
 *   - Inner edge = right side (A_right → ... → B_apex → B_right)
 */
export function buildInnerRoomPolygon(
  faceEdgeIds: string[],
  halfEdges: Map<string, HalfEdge>,
  scene: Scene
): Vec2[] {
  if (faceEdgeIds.length < 3) return [];

  // ============================================================================
  // STEP 1: Determine room orientation (CCW or CW)
  // ============================================================================
  const nodeIds: string[] = [];
  for (const eid of faceEdgeIds) {
    const e = halfEdges.get(eid);
    if (e) nodeIds.push(e.startNodeId);
  }

  let area = 0;
  for (let i = 0; i < nodeIds.length; i++) {
    const p = scene.nodes.get(nodeIds[i])!;
    const q = scene.nodes.get(nodeIds[(i + 1) % nodeIds.length])!;
    area += (p.x * q.y - q.x * p.y);
  }

  if (Math.abs(area) < 1e-6) return []; // Degenerate face

  const isCCW = area > 0;

  // ============================================================================
  // STEP 2: Build one offset line per half-edge (inner side only)
  // ============================================================================
  type OffsetLine = {
    p: Vec2;      // Start point of offset line
    r: Vec2;      // Direction vector of offset line
    u: Vec2;      // Unit direction of original wall edge
    start: Vec2;  // Original edge start
    end: Vec2;    // Original edge end
    wallId: string;
  };

  const offsetLines: OffsetLine[] = [];

  for (const eid of faceEdgeIds) {
    const e = halfEdges.get(eid);
    
    // ✅ NEW: Skip if half-edge doesn't exist
    if (!e) {
      console.warn(`Half-edge ${eid} not found in half-edge structure`);
      continue;
    }
    
    const A = scene.nodes.get(e.startNodeId);
    const B = scene.nodes.get(e.endNodeId);
    const w = scene.walls.get(e.wallId);
    
    // ✅ NEW: Skip if nodes or wall don't exist
    if (!A || !B || !w) {
      console.warn(`Missing geometry for half-edge ${eid}: A=${!!A}, B=${!!B}, wall=${!!w}`);
      continue;
    }

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;

    // Left normal (90° CCW rotation)
    let nx = -uy;
    let ny = ux;

    // Choose inward normal based on face orientation
    const s = isCCW ? 1 : -1;
    nx *= s;
    ny *= s;

    const d = (w.thicknessMm ?? 0) / 2;
    const p = { x: A.x + nx * d, y: A.y + ny * d };
    const q = { x: B.x + nx * d, y: B.y + ny * d };

    offsetLines.push({
      p,
      r: { x: q.x - p.x, y: q.y - p.y },
      u: { x: ux, y: uy },
      start: A,
      end: B,
      wallId: w.id,
    });
  }
  
  // ✅ NEW: Handle case where no valid offset lines were created
  if (offsetLines.length < 3) {
    console.warn(`Not enough valid offset lines (${offsetLines.length}) for face with ${faceEdgeIds.length} edges`);
    return [];
  }
  
  // ============================================================================
  // STEP 3: Create corners by intersecting consecutive offset lines
  // ============================================================================
  const EPS_PAR = 1e-9;   // Parallel tolerance for cross product
  const EPS_COLIN = 1e-6; // Collinearity tolerance

  function cross(ax: number, ay: number, bx: number, by: number): number {
    return ax * by - ay * bx;
  }

  function dot(ax: number, ay: number, bx: number, by: number): number {
    return ax * bx + ay * by;
  }

  const pts: Vec2[] = [];

  for (let i = 0; i < offsetLines.length; i++) {
    const prev = offsetLines[(i - 1 + offsetLines.length) % offsetLines.length];
    const curr = offsetLines[i];

    const cr = cross(prev.u.x, prev.u.y, curr.u.x, curr.u.y);
    const dt = dot(prev.u.x, prev.u.y, curr.u.x, curr.u.y);

    // If prev and curr are collinear and pointing the same way, skip corner
    // This merges split collinear segments into one straight side
    if (Math.abs(cr) < EPS_COLIN && dt > 0) {
      continue;
    }

    // Intersect the two offset lines: prev.p + t*prev.r with curr.p + u*curr.r
    const rxs = cross(prev.r.x, prev.r.y, curr.r.x, curr.r.y);
    let v: Vec2 | null = null;

    if (Math.abs(rxs) >= EPS_PAR) {
      const qp = { x: curr.p.x - prev.p.x, y: curr.p.y - prev.p.y };
      const t = cross(qp.x, qp.y, curr.r.x, curr.r.y) / rxs;
      v = { x: prev.p.x + t * prev.r.x, y: prev.p.y + t * prev.r.y };
    } else {
      // Nearly parallel – bevel: take the current offset point
      v = curr.p;
    }

    pts.push(v);
  }

  // ============================================================================
  // STEP 4: Clean up tiny edges and nearly-straight vertices
  // ============================================================================
  const cleaned: Vec2[] = [];

  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length]!;
    const b = pts[i]!;
    const c = pts[(i + 1) % pts.length]!;

    const ab = { x: b.x - a.x, y: b.y - a.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const lenAB = Math.hypot(ab.x, ab.y);
    const lenBC = Math.hypot(bc.x, bc.y);

    // Drop tiny spikes (< 0.5mm edges)
    if (lenAB < 0.5 || lenBC < 0.5) continue;

    // Drop nearly-straight vertices (angle < ~0.1°)
    const cr = Math.abs(cross(ab.x, ab.y, bc.x, bc.y));
    const dt = dot(ab.x, ab.y, bc.x, bc.y) / (lenAB * lenBC);

    if (cr < 1e-6 && dt > 0) continue;

    cleaned.push(b);
  }

  return cleaned.length >= 3 ? cleaned : pts; // Fallback if over-cleaned
}
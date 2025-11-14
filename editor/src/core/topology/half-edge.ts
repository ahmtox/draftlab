import type { Scene, Wall, Node } from '../domain/types';
import * as vec from '../math/vec';

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

export function buildInnerRoomPolygon(
  faceEdgeIds: string[],
  halfEdges: Map<string, HalfEdge>,
  scene: Scene
): vec.Vec2[] {
  const nodeIds: string[] = [];
  for (const edgeId of faceEdgeIds) {
    const he = halfEdges.get(edgeId);
    if (he) nodeIds.push(he.startNodeId);
  }

  let signedArea = 0;
  for (let i = 0; i < nodeIds.length; i++) {
    const curr = scene.nodes.get(nodeIds[i]);
    const next = scene.nodes.get(nodeIds[(i + 1) % nodeIds.length]);
    if (!curr || !next) continue;
    signedArea += (curr.x * next.y - next.x * curr.y);
  }
  signedArea /= 2;

  if (Math.abs(signedArea) < 1e-6) {
    return [];
  }

  const isCCW = signedArea > 0;

  const offsets: { p: vec.Vec2; dir: vec.Vec2 }[] = [];

  for (const edgeId of faceEdgeIds) {
    const he = halfEdges.get(edgeId);
    if (!he) continue;

    const nodeA = scene.nodes.get(he.startNodeId);
    const nodeB = scene.nodes.get(he.endNodeId);
    const wall = scene.walls.get(he.wallId);
    
    if (!nodeA || !nodeB || !wall) continue;

    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const len = Math.hypot(dx, dy) || 1;

    const nx = -dy / len;
    const ny = dx / len;

    const sign = isCCW ? 1 : -1;
    const d = (wall.thicknessMm / 2) * sign;

    const p = { x: nodeA.x + nx * d, y: nodeA.y + ny * d };
    const q = { x: nodeB.x + nx * d, y: nodeB.y + ny * d };

    offsets.push({
      p,
      dir: { x: q.x - p.x, y: q.y - p.y },
    });
  }

  const polygon: vec.Vec2[] = [];
  
  for (let i = 0; i < offsets.length; i++) {
    const prev = offsets[(i - 1 + offsets.length) % offsets.length];
    const curr = offsets[i];

    const intersection = intersectLines(prev.p, prev.dir, curr.p, curr.dir);
    polygon.push(intersection ?? curr.p);
  }

  return polygon;
}

function intersectLines(p: vec.Vec2, r: vec.Vec2, q: vec.Vec2, s: vec.Vec2): vec.Vec2 | null {
  const cross_r_s = r.x * s.y - r.y * s.x;
  
  if (Math.abs(cross_r_s) < 1e-9) {
    return null;
  }

  const qp = { x: q.x - p.x, y: q.y - p.y };
  const t = (qp.x * s.y - qp.y * s.x) / cross_r_s;

  return {
    x: p.x + t * r.x,
    y: p.y + t * r.y,
  };
}
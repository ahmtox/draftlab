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
 * ✅ FIXED: Link edges at END vertex using CCW successor of twin
 * 
 * Algorithm:
 * 1. Build CCW-sorted outgoing lists per node
 * 2. For each edge e: u→v, find twin(e) in outgoing[v]
 * 3. Set next(e) = CCW successor of twin(e) in outgoing[v]
 */
function linkHalfEdgesAtNodes(halfEdges: Map<string, HalfEdge>, scene: Scene): void {
  const outgoing = new Map<string, HalfEdge[]>();

  for (const he of halfEdges.values()) {
    if (!outgoing.has(he.startNodeId)) {
      outgoing.set(he.startNodeId, []);
    }
    outgoing.get(he.startNodeId)!.push(he);
  }

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

  for (const he of halfEdges.values()) {
    const twin = halfEdges.get(he.twin!);
    if (!twin) continue;

    const edgesAtEnd = outgoing.get(he.endNodeId);
    if (!edgesAtEnd) continue;

    const twinIndex = edgesAtEnd.findIndex(e => e.id === twin.id);
    if (twinIndex === -1) continue;

    const nextIndex = (twinIndex + 1) % edgesAtEnd.length;
    he.next = edgesAtEnd[nextIndex].id;
    edgesAtEnd[nextIndex].prev = he.id;
  }
}

/**
 * ✅ FIXED: Walk faces by following `next` pointers
 * Now assigns he.face for each edge in the cycle
 */
export function detectFaces(halfEdges: Map<string, HalfEdge>, scene: Scene): Face[] {
  const faces: Face[] = [];
  const visited = new Set<string>();
  
  for (const he of halfEdges.values()) {
    if (visited.has(he.id)) continue;
    
    const cycle: string[] = [];
    let current: HalfEdge | undefined = he;
    const maxIterations = halfEdges.size * 2;
    let iterations = 0;
    
    while (current && !visited.has(current.id) && iterations < maxIterations) {
      visited.add(current.id);
      cycle.push(current.id);
      
      if (current.next) {
        current = halfEdges.get(current.next);
      } else {
        break;
      }
      
      if (current?.id === he.id) {
        break;
      }
      
      iterations++;
    }
    
    if (cycle.length >= 3) {
      const faceId = `face-${faces.length}`;
      const face: Face = {
        id: faceId,
        edges: cycle,
        isOuter: false,
      };
      
      for (const edgeId of cycle) {
        const edge = halfEdges.get(edgeId);
        if (edge) {
          edge.face = faceId;
        }
      }
      
      faces.push(face);
    }
  }
  
  markOuterFace(faces, halfEdges, scene);
  
  return faces;
}

/**
 * ✅ FIXED: Mark outer face as the one with largest absolute area
 * 
 * The outer face (unbounded exterior) is the face with the largest |area|.
 * This is reliable regardless of winding direction or Y-axis orientation.
 */
function markOuterFace(faces: Face[], halfEdges: Map<string, HalfEdge>, scene: Scene): void {
  if (faces.length === 0) return;

  const EPS = 1e-6;

  const areas = faces.map((face, i) => ({
    index: i,
    signed: computeSignedAreaForFace(face, halfEdges, scene),
  }));

  console.log(`📐 Computing signed areas for ${faces.length} faces:`);
  areas.forEach((a) => {
    console.log(`   Face ${a.index}: ${a.signed.toFixed(0)}mm² (${faces[a.index].edges.length} edges)`);
  });

  const nonDegenerate = areas.filter(a => Math.abs(a.signed) > EPS);
  
  if (nonDegenerate.length === 0) {
    console.log('⚠️  No non-degenerate faces found');
    return;
  }

  const outerFace = nonDegenerate.reduce((best, curr) =>
    Math.abs(curr.signed) > Math.abs(best.signed) ? curr : best,
    nonDegenerate[0]
  );

  faces.forEach(f => (f.isOuter = false));
  
  faces[outerFace.index].isOuter = true;

  console.log(`🔍 Outer face: Face ${outerFace.index} (|area|=${Math.abs(outerFace.signed).toFixed(0)}mm²)`);
  console.log(`✅ Marked face ${outerFace.index} as outer`);
  
  faces.forEach((f, i) => {
    const area = areas.find(a => a.index === i)?.signed ?? 0;
    console.log(`   Face ${i}: ${f.edges.length} edges, area=${area.toFixed(0)}mm², isOuter=${f.isOuter}`);
  });
}

/**
 * Compute signed area using shoelace formula
 * Positive = CCW winding, Negative = CW winding
 */
function computeSignedAreaForFace(face: Face, halfEdges: Map<string, HalfEdge>, scene: Scene): number {
  const nodeIds: string[] = [];
  
  for (const heId of face.edges) {
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

export function getLeftFace(wallId: string, halfEdges: Map<string, HalfEdge>): string | null {
  const he = halfEdges.get(`${wallId}-forward`);
  return he?.face ?? null;
}

export function getRightFace(wallId: string, halfEdges: Map<string, HalfEdge>): string | null {
  const he = halfEdges.get(`${wallId}-reverse`);
  return he?.face ?? null;
}

/**
 * ✅ FIXED: Build thickness-aware inner room polygon
 * Offsets each edge INWARD by thickness/2 (toward room interior)
 * 
 * Algorithm:
 * 1. Compute signed area to determine winding (CCW = positive, CW = negative)
 * 2. For CCW winding: offset LEFT (perpendicular CCW)
 * 3. For CW winding: offset RIGHT (perpendicular CW)
 * 4. Intersect consecutive offset lines for mitered corners
 */
export function buildInnerRoomPolygon(
  faceEdgeIds: string[],
  halfEdges: Map<string, HalfEdge>,
  scene: Scene
): vec.Vec2[] {
  // ✅ Step 1: Determine room winding direction
  const nodeIds: string[] = [];
  for (const edgeId of faceEdgeIds) {
    const he = halfEdges.get(edgeId);
    if (he) nodeIds.push(he.startNodeId);
  }

  // Compute signed area (positive = CCW, negative = CW)
  let signedArea = 0;
  for (let i = 0; i < nodeIds.length; i++) {
    const curr = scene.nodes.get(nodeIds[i]);
    const next = scene.nodes.get(nodeIds[(i + 1) % nodeIds.length]);
    if (!curr || !next) continue;
    signedArea += (curr.x * next.y - next.x * curr.y);
  }
  signedArea /= 2;

  const isCCW = signedArea > 0;
  console.log(`🔄 Room winding: ${isCCW ? 'CCW' : 'CW'} (area=${signedArea.toFixed(0)}mm²)`);

  // ✅ Step 2: Compute offset lines (inward)
  const offsets: { p: vec.Vec2; dir: vec.Vec2 }[] = [];

  for (const edgeId of faceEdgeIds) {
    const he = halfEdges.get(edgeId);
    if (!he) continue;

    const nodeA = scene.nodes.get(he.startNodeId);
    const nodeB = scene.nodes.get(he.endNodeId);
    const wall = scene.walls.get(he.wallId);
    
    if (!nodeA || !nodeB || !wall) continue;

    // Edge direction
    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const len = Math.hypot(dx, dy) || 1;

    // Normal (perpendicular)
    const nx = -dy / len;
    const ny = dx / len;

    // ✅ Choose inward direction based on winding
    // CCW rooms: left normal points inward
    // CW rooms: right normal (negative left) points inward
    const sign = isCCW ? 1 : -1;
    const d = (wall.thicknessMm / 2) * sign;

    const p = { x: nodeA.x + nx * d, y: nodeA.y + ny * d };
    const q = { x: nodeB.x + nx * d, y: nodeB.y + ny * d };

    offsets.push({
      p,
      dir: { x: q.x - p.x, y: q.y - p.y },
    });
  }

  // ✅ Step 3: Intersect consecutive offset lines
  const polygon: vec.Vec2[] = [];
  
  for (let i = 0; i < offsets.length; i++) {
    const prev = offsets[(i - 1 + offsets.length) % offsets.length];
    const curr = offsets[i];

    const intersection = intersectLines(prev.p, prev.dir, curr.p, curr.dir);
    polygon.push(intersection ?? curr.p);
  }

  console.log(`✅ Built inner polygon with ${polygon.length} vertices`);
  return polygon;
}

/**
 * Intersect two infinite lines
 * Line 1: p + t * r
 * Line 2: q + u * s
 */
function intersectLines(p: vec.Vec2, r: vec.Vec2, q: vec.Vec2, s: vec.Vec2): vec.Vec2 | null {
  const cross_r_s = r.x * s.y - r.y * s.x;
  
  if (Math.abs(cross_r_s) < 1e-9) {
    return null; // Parallel
  }

  const qp = { x: q.x - p.x, y: q.y - p.y };
  const t = (qp.x * s.y - qp.y * s.x) / cross_r_s;

  return {
    x: p.x + t * r.x,
    y: p.y + t * r.y,
  };
}
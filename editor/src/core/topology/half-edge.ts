import type { Scene, Wall, Node } from '../domain/types';
import * as vec from '../math/vec';

/**
 * Half-edge data structure for wall topology
 * Each wall edge is split into two directed half-edges
 */
export type HalfEdge = {
  id: string;           // unique half-edge ID
  wallId: string;       // parent wall
  startNodeId: string;  // start node (direction matters)
  endNodeId: string;    // end node
  twin?: string;        // opposite half-edge ID (if exists)
  next?: string;        // next half-edge in face cycle
  prev?: string;        // previous half-edge in face cycle
  face?: string;        // face (room) on the left side of this edge
};

/**
 * Face (room) detected from half-edge cycles
 */
export type Face = {
  id: string;
  edges: string[];      // ordered half-edge IDs forming boundary (CCW)
  isOuter: boolean;     // true for unbounded exterior face
};

/**
 * Build half-edge structure from scene walls
 * Returns map of half-edge ID → HalfEdge
 */
export function buildHalfEdgeStructure(scene: Scene): Map<string, HalfEdge> {
  const halfEdges = new Map<string, HalfEdge>();
  
  // Create two half-edges for each wall
  for (const wall of scene.walls.values()) {
    const heA = createHalfEdge(wall, wall.nodeAId, wall.nodeBId);
    const heB = createHalfEdge(wall, wall.nodeBId, wall.nodeAId);
    
    // Link twins
    heA.twin = heB.id;
    heB.twin = heA.id;
    
    halfEdges.set(heA.id, heA);
    halfEdges.set(heB.id, heB);
  }
  
  // Link next/prev relationships at each node
  linkHalfEdgesAtNodes(halfEdges, scene);
  
  return halfEdges;
}

/**
 * Create a half-edge for a wall direction
 */
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
 * Link half-edges at each node by sorting them radially
 */
function linkHalfEdgesAtNodes(halfEdges: Map<string, HalfEdge>, scene: Scene): void {
  // Group half-edges by start node
  const edgesByNode = new Map<string, HalfEdge[]>();
  
  for (const he of halfEdges.values()) {
    if (!edgesByNode.has(he.startNodeId)) {
      edgesByNode.set(he.startNodeId, []);
    }
    edgesByNode.get(he.startNodeId)!.push(he);
  }
  
  // For each node, sort outgoing edges CCW and link them
  for (const [nodeId, edges] of edgesByNode) {
    if (edges.length < 2) continue;
    
    const node = scene.nodes.get(nodeId)!;
    
    // Sort edges by angle (CCW)
    const sortedEdges = edges.slice().sort((a, b) => {
      const nodeA = scene.nodes.get(a.endNodeId)!;
      const nodeB = scene.nodes.get(b.endNodeId)!;
      
      const angleA = Math.atan2(nodeA.y - node.y, nodeA.x - node.x);
      const angleB = Math.atan2(nodeB.y - node.y, nodeB.x - node.x);
      
      return angleA - angleB;
    });
    
    // Link next/prev (the "next" of an outgoing edge is the twin of the next outgoing edge)
    for (let i = 0; i < sortedEdges.length; i++) {
      const current = sortedEdges[i];
      const nextOutgoing = sortedEdges[(i + 1) % sortedEdges.length];
      
      // current.next = twin of nextOutgoing
      const twinId = nextOutgoing.twin;
      if (twinId) {
        current.next = twinId;
        const twin = halfEdges.get(twinId);
        if (twin) {
          twin.prev = current.id;
        }
      }
    }
  }
}

/**
 * Detect faces (rooms) from half-edge cycles
 */
export function detectFaces(halfEdges: Map<string, HalfEdge>): Face[] {
  const faces: Face[] = [];
  const visited = new Set<string>();
  
  for (const he of halfEdges.values()) {
    if (visited.has(he.id)) continue;
    
    // Walk the cycle
    const cycle: string[] = [];
    let current: HalfEdge | undefined = he;
    
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      cycle.push(current.id);
      
      // Follow next pointer
      if (current.next) {
        current = halfEdges.get(current.next);
      } else {
        break;
      }
      
      // Detect cycle completion
      if (current?.id === he.id) {
        break;
      }
    }
    
    // Only add closed cycles with 3+ edges
    if (cycle.length >= 3 && current?.id === he.id) {
      faces.push({
        id: `face-${faces.length}`,
        edges: cycle,
        isOuter: false, // will be determined by orientation/area
      });
    }
  }
  
  // Mark outer face (largest area or negative orientation)
  markOuterFace(faces, halfEdges);
  
  return faces;
}

/**
 * Mark the outer (unbounded) face
 */
function markOuterFace(faces: Face[], halfEdges: Map<string, HalfEdge>): void {
  if (faces.length === 0) return;
  
  // Compute signed area for each face
  const areas = faces.map(face => computeSignedArea(face, halfEdges));
  
  // Face with largest negative area is outer
  let outerIndex = 0;
  let minArea = areas[0];
  
  for (let i = 1; i < areas.length; i++) {
    if (areas[i] < minArea) {
      minArea = areas[i];
      outerIndex = i;
    }
  }
  
  faces[outerIndex].isOuter = true;
}

/**
 * Compute signed area of a face (negative = CCW, positive = CW)
 */
function computeSignedArea(face: Face, halfEdges: Map<string, HalfEdge>): number {
  // This is a placeholder - would need node coordinates
  // For now, just return 0
  return 0;
}

/**
 * Get the face (room) on the left side of a wall
 * Returns face ID or null
 */
export function getLeftFace(wallId: string, halfEdges: Map<string, HalfEdge>): string | null {
  const he = halfEdges.get(`${wallId}-forward`);
  return he?.face ?? null;
}

/**
 * Get the face (room) on the right side of a wall
 * Returns face ID or null
 */
export function getRightFace(wallId: string, halfEdges: Map<string, HalfEdge>): string | null {
  const he = halfEdges.get(`${wallId}-reverse`);
  return he?.face ?? null;
}
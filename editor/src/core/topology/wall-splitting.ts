import type { Scene, Wall, Node } from '../domain/types';
import type { Vec2 } from '../math/vec';
import * as vec from '../math/vec';

const INTERSECTION_TOLERANCE_MM = 1.0;
const SNAP_TO_NODE_TOLERANCE_MM = 1.0;
const DEDUPE_TOLERANCE_MM = 0.5; // For deduping intersection points

/**
 * Result of wall splitting preprocessing
 */
export type SplitScene = {
  nodes: Map<string, Node>;
  walls: Map<string, Wall>;
  virtualNodes: Set<string>;
};

/**
 * Preprocess scene by detecting wall intersections and splitting walls
 * This enables room detection even when walls don't share explicit nodes
 */
export function splitWallsAtIntersections(scene: Scene): SplitScene {
  const newNodes = new Map(scene.nodes);
  const newWalls = new Map<string, Wall>();
  const virtualNodes = new Set<string>();
  
  const wallArray = Array.from(scene.walls.values());
  
  // Step 1: Find all intersection points between wall centerlines
  const intersectionPoints = new Map<string, Vec2[]>();
  
  // ✅ Initialize all walls first
  for (const wall of wallArray) {
    intersectionPoints.set(wall.id, []);
  }
  
  // ✅ Only scan each unordered pair once (i, i+1...n) to avoid duplicates
  for (let i = 0; i < wallArray.length; i++) {
    for (let j = i + 1; j < wallArray.length; j++) { // ✅ j = i+1, not j = 0
      const wall1 = wallArray[i];
      const wall2 = wallArray[j];
      
      // ✅ Safety checks
      if (!wall1 || !wall2) continue;
      if (wallsShareNode(wall1, wall2)) continue;
      
      // ✅ Check that all nodes exist
      const hasAllNodes = 
        scene.nodes.has(wall1.nodeAId) &&
        scene.nodes.has(wall1.nodeBId) &&
        scene.nodes.has(wall2.nodeAId) &&
        scene.nodes.has(wall2.nodeBId);
      
      if (!hasAllNodes) continue;
      
      const intersection = intersectSegments(wall1, wall2, scene);
      
      if (intersection) {
        const isAtEndpoint1 = isNearEndpoint(intersection, wall1, scene);
        const isAtEndpoint2 = isNearEndpoint(intersection, wall2, scene);
        
        // ✅ Push unique intersections only
        if (!isAtEndpoint1) {
          pushUnique(intersectionPoints.get(wall1.id)!, intersection);
        }
        if (!isAtEndpoint2) {
          pushUnique(intersectionPoints.get(wall2.id)!, intersection);
        }
      }
    }
  }
  
  // Step 2: Split each wall at its intersection points
  for (const wall of scene.walls.values()) {
    const intersections = intersectionPoints.get(wall.id) || [];
    
    if (intersections.length === 0) {
      newWalls.set(wall.id, wall);
      continue;
    }
    
    // ✅ Safety check for nodes
    const nodeA = scene.nodes.get(wall.nodeAId);
    const nodeB = scene.nodes.get(wall.nodeBId);
    
    if (!nodeA || !nodeB) {
      newWalls.set(wall.id, wall);
      continue;
    }
    
    const wallDir = vec.sub(nodeB, nodeA);
    const wallLength = vec.length(wallDir);
    
    // ✅ Skip zero-length walls
    if (wallLength < 0.01) {
      newWalls.set(wall.id, wall);
      continue;
    }
    
    // ✅ Compute parametric t for each intersection
    const sortedIntersections = intersections
      .map(point => ({
        point,
        t: vec.dot(vec.sub(point, nodeA), wallDir) / (wallLength * wallLength)
      }))
      .filter(({ t }) => t > 1e-6 && t < 1 - 1e-6) // ✅ Absolute epsilon
      .sort((a, b) => a.t - b.t);
    
    // ✅ Dedupe by t value
    const deduped: Array<{ point: Vec2; t: number }> = [];
    for (const s of sortedIntersections) {
      if (deduped.length === 0 || Math.abs(s.t - deduped[deduped.length - 1].t) > 1e-6) {
        deduped.push(s);
      }
    }
    
    if (deduped.length === 0) {
      newWalls.set(wall.id, wall);
      continue;
    }
    
    // Create nodes at intersection points
    const segmentNodes: string[] = [wall.nodeAId];
    
    for (const { point } of deduped) {
      const existingNodeId = findNearbyNode(point, newNodes);
      
      if (existingNodeId) {
        segmentNodes.push(existingNodeId);
      } else {
        const virtualNodeId = `vnode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        newNodes.set(virtualNodeId, {
          id: virtualNodeId,
          x: point.x,
          y: point.y,
        });
        virtualNodes.add(virtualNodeId);
        segmentNodes.push(virtualNodeId);
      }
    }
    
    segmentNodes.push(wall.nodeBId);
    
    // Create wall segments
    for (let i = 0; i < segmentNodes.length - 1; i++) {
      const segmentId = i === 0 
        ? wall.id
        : `${wall.id}-split-${i}`;
      
      newWalls.set(segmentId, {
        ...wall,
        id: segmentId,
        nodeAId: segmentNodes[i],
        nodeBId: segmentNodes[i + 1],
      });
    }
  }
  
  return {
    nodes: newNodes,
    walls: newWalls,
    virtualNodes,
  };
}

/**
 * ✅ Push unique point (no duplicates within tolerance)
 */
function pushUnique(list: Vec2[], p: Vec2): void {
  for (const q of list) {
    if (vec.distance(p, q) <= DEDUPE_TOLERANCE_MM) return; // Already there
  }
  list.push(p);
}

/**
 * Find intersection point between two wall centerlines
 */
function intersectSegments(wall1: Wall, wall2: Wall, scene: Scene): Vec2 | null {
  const a1 = scene.nodes.get(wall1.nodeAId)!;
  const a2 = scene.nodes.get(wall1.nodeBId)!;
  const b1 = scene.nodes.get(wall2.nodeAId)!;
  const b2 = scene.nodes.get(wall2.nodeBId)!;
  
  const d1 = vec.sub(a2, a1);
  const d2 = vec.sub(b2, b1);
  
  const denominator = cross(d1, d2);
  
  if (Math.abs(denominator) < 1e-9) {
    return null;
  }
  
  const delta = vec.sub(b1, a1);
  const t1 = cross(delta, d2) / denominator;
  const t2 = cross(delta, d1) / denominator;
  
  if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
    return vec.add(a1, vec.scale(d1, t1));
  }
  
  return null;
}

/**
 * 2D cross product
 */
function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Check if two walls share a node
 */
function wallsShareNode(wall1: Wall, wall2: Wall): boolean {
  return wall1.nodeAId === wall2.nodeAId ||
         wall1.nodeAId === wall2.nodeBId ||
         wall1.nodeBId === wall2.nodeAId ||
         wall1.nodeBId === wall2.nodeBId;
}

/**
 * Check if point is near a wall endpoint
 */
function isNearEndpoint(point: Vec2, wall: Wall, scene: Scene): boolean {
  const nodeA = scene.nodes.get(wall.nodeAId)!;
  const nodeB = scene.nodes.get(wall.nodeBId)!;
  
  return vec.distance(point, nodeA) < INTERSECTION_TOLERANCE_MM ||
         vec.distance(point, nodeB) < INTERSECTION_TOLERANCE_MM;
}

/**
 * Find existing node near a point
 */
function findNearbyNode(point: Vec2, nodes: Map<string, Node>): string | null {
  for (const [nodeId, node] of nodes) {
    if (vec.distance(point, node) < SNAP_TO_NODE_TOLERANCE_MM) {
      return nodeId;
    }
  }
  return null;
}
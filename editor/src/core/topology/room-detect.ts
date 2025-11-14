import type { Scene, Room } from '../domain/types';
import { buildHalfEdgeStructure, detectFaces, buildInnerRoomPolygon } from './half-edge';
import { splitWallsAtIntersections } from './wall-splitting'; // ✅ NEW
import type { Vec2 } from '../math/vec';
import * as vec from '../math/vec';

export type DetectedRoom = {
  id: string;
  roomNumber: number;
  boundary: string[];
  halfEdges: string[];
  areaMm2: number;
  perimeterMm: number;
  raiseFromFloorMm: number;
  labelPositionMm?: { x: number; y: number };
};

/**
 * Detect rooms using half-edge structure
 * ✅ NEW: Preprocesses scene to split walls at intersections
 */
export function detectRooms(scene: Scene): DetectedRoom[] {
  if (scene.walls.size < 3) {
    return [];
  }

  // ✅ NEW: Split walls at intersections BEFORE building half-edge structure
  const splitScene = splitWallsAtIntersections(scene);
  
  // Build half-edge structure using split walls
  const halfEdges = buildHalfEdgeStructure({
    nodes: splitScene.nodes,
    walls: splitScene.walls,
    rooms: new Map(), // Unused during detection
  });

  // Detect faces
  const faces = detectFaces(halfEdges, {
    nodes: splitScene.nodes,
    walls: splitScene.walls,
    rooms: new Map(),
  });

  // Filter to interior faces
  const interiorFaces = faces.filter(face => !face.isOuter);

  if (interiorFaces.length === 0) {
    return [];
  }

  const candidateRooms: Array<{
    faceId: string;
    halfEdgeIds: string[];
    wallIds: string[];
    innerPolygon: Vec2[];
    area: number;
    perimeter: number;
  }> = [];

  for (const face of interiorFaces) {
    // ✅ Extract ORIGINAL wall IDs (before splitting)
    const originalWallIds = new Set<string>();
    
    for (const heId of face.edges) {
      const he = halfEdges.get(heId);
      if (!he) continue;
      
      // Extract base wall ID (strip -split-N suffix)
      const baseWallId = he.wallId.split('-split-')[0];
      originalWallIds.add(baseWallId);
    }

    const wallIds = Array.from(originalWallIds);
    
    if (wallIds.length < 3) {
      continue;
    }

    // Build thickness-aware inner polygon using split scene
    const innerPolygon = buildInnerRoomPolygon(
      face.edges, 
      halfEdges, 
      {
        nodes: splitScene.nodes,
        walls: splitScene.walls,
        rooms: new Map(),
      }
    );
    
    if (innerPolygon.length < 3) {
      continue;
    }

    // Compute thickness-aware area
    const area = computePolygonArea(innerPolygon);
    
    // Skip tiny faces (< 0.1 m²)
    if (area < 100_000) {
      continue;
    }

    const perimeter = computePolygonPerimeter(innerPolygon);

    candidateRooms.push({
      faceId: face.id,
      halfEdgeIds: face.edges,
      wallIds, // ✅ Use original wall IDs (not split IDs)
      innerPolygon,
      area,
      perimeter,
    });
  }

  // Sort by area (smallest first)
  candidateRooms.sort((a, b) => a.area - b.area);

  // Assign sequential room numbers and initialize label positions
  const rooms: DetectedRoom[] = candidateRooms.map((candidate, index) => {
    const roomId = `room-${Date.now()}-${index + 1}`;
    
    const centroid = computePolygonCentroid(candidate.innerPolygon);
    
    return {
      id: roomId,
      roomNumber: index + 1,
      boundary: candidate.wallIds,
      halfEdges: candidate.halfEdgeIds,
      areaMm2: candidate.area,
      perimeterMm: candidate.perimeter,
      raiseFromFloorMm: 100,
      labelPositionMm: centroid,
    };
  });

  return rooms;
}

/**
 * Compute polygon area using shoelace formula
 */
function computePolygonArea(polygon: Vec2[]): number {
  if (polygon.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    area += (curr.x * next.y - next.x * curr.y);
  }
  
  return Math.abs(area) / 2;
}

/**
 * Compute polygon perimeter
 */
function computePolygonPerimeter(polygon: Vec2[]): number {
  if (polygon.length < 2) return 0;
  
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    perimeter += vec.distance(curr, next);
  }
  
  return perimeter;
}

/**
 * ✅ NEW: Compute polygon centroid (geometric center)
 * Uses the correct formula for polygon centroid, not just averaging vertices
 */
function computePolygonCentroid(polygon: Vec2[]): { x: number; y: number } {
  if (polygon.length === 0) return { x: 0, y: 0 };
  if (polygon.length === 1) return { x: polygon[0].x, y: polygon[0].y };
  if (polygon.length === 2) {
    return {
      x: (polygon[0].x + polygon[1].x) / 2,
      y: (polygon[0].y + polygon[1].y) / 2,
    };
  }

  // For polygons with 3+ vertices, use proper centroid formula
  let cx = 0;
  let cy = 0;
  let signedArea = 0;

  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    
    const a = curr.x * next.y - next.x * curr.y;
    signedArea += a;
    cx += (curr.x + next.x) * a;
    cy += (curr.y + next.y) * a;
  }

  signedArea *= 0.5;
  
  // Avoid division by zero
  if (Math.abs(signedArea) < 1e-10) {
    // Fallback to simple average
    let sumX = 0;
    let sumY = 0;
    for (const point of polygon) {
      sumX += point.x;
      sumY += point.y;
    }
    return {
      x: sumX / polygon.length,
      y: sumY / polygon.length,
    };
  }

  cx /= (6 * signedArea);
  cy /= (6 * signedArea);

  return { x: cx, y: cy };
}

/**
 * Compute room centroid for label placement (legacy compatibility)
 * @deprecated Use computePolygonCentroid instead for more accurate results
 */
export function computeRoomCentroid(room: Room, scene: Scene): { x: number; y: number } {
  const nodeIds = new Set<string>();

  for (const wallId of room.boundary) {
    const wall = scene.walls.get(wallId);
    if (wall) {
      nodeIds.add(wall.nodeAId);
      nodeIds.add(wall.nodeBId);
    }
  }

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const nodeId of nodeIds) {
    const node = scene.nodes.get(nodeId);
    if (node) {
      sumX += node.x;
      sumY += node.y;
      count++;
    }
  }

  return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0, y: 0 };
}

/**
 * ✅ NEW: Check if a point is inside a polygon (ray casting algorithm)
 */
export function isPointInsidePolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}
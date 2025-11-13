import type { Scene, Room } from '../domain/types';
import { buildHalfEdgeStructure, detectFaces, buildInnerRoomPolygon } from './half-edge';
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
};

/**
 * ✅ FIXED: Detect rooms using corrected half-edge structure
 * Now includes thickness-aware area/perimeter calculation
 */
export function detectRooms(scene: Scene): DetectedRoom[] {
  if (scene.walls.size < 3) {
    console.log('⏭️  Not enough walls to form a room (need at least 3)');
    return [];
  }

  console.log(`\n🔍 Starting half-edge room detection with ${scene.walls.size} walls...`);

  // Build half-edge structure
  const halfEdges = buildHalfEdgeStructure(scene);
  console.log(`📊 Built ${halfEdges.size} half-edges`);

  // Detect faces
  const faces = detectFaces(halfEdges, scene);
  console.log(`📊 Found ${faces.length} faces`);

  // Filter to interior faces
  const interiorFaces = faces.filter(face => !face.isOuter);
  console.log(`✂️  Filtered to ${interiorFaces.length} interior faces`);

  if (interiorFaces.length === 0) {
    console.log('⏭️  No interior faces found');
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
    // Extract wall IDs
    const wallIds = Array.from(new Set(
      face.edges.map(heId => halfEdges.get(heId)?.wallId).filter(Boolean) as string[]
    ));

    if (wallIds.length < 3) {
      console.log(`⏭️  Skipping face with < 3 walls`);
      continue;
    }

    // ✅ Build thickness-aware inner polygon
    const innerPolygon = buildInnerRoomPolygon(face.edges, halfEdges, scene);
    
    if (innerPolygon.length < 3) {
      console.log(`⏭️  Skipping face with invalid inner polygon (${innerPolygon.length} points)`);
      continue;
    }

    // Compute thickness-aware area
    const area = computePolygonArea(innerPolygon);
    
    console.log(`🔍 Face with ${wallIds.length} walls:`);
    console.log(`   Walls: [${wallIds.map(w => w.slice(-5)).join(', ')}]`);
    console.log(`   Inner polygon points: ${innerPolygon.length}`);
    console.log(`   Area (with thickness): ${area.toFixed(0)}mm² (${(area / 1_000_000).toFixed(4)}m²)`);
    
    // Skip tiny faces (< 0.1 m²)
    if (area < 100_000) {
      console.log(`⏭️  Skipping tiny face: ${(area / 1_000_000).toFixed(4)}m²`);
      continue;
    }

    const perimeter = computePolygonPerimeter(innerPolygon);

    candidateRooms.push({
      faceId: face.id,
      halfEdgeIds: face.edges,
      wallIds,
      innerPolygon,
      area,
      perimeter,
    });

    console.log(`✅ Valid room candidate: ${(area / 1_000_000).toFixed(2)}m², ${wallIds.length} walls`);
  }

  // Sort by area (smallest first)
  candidateRooms.sort((a, b) => a.area - b.area);

  // Assign sequential room numbers
  const rooms: DetectedRoom[] = candidateRooms.map((candidate, index) => ({
    id: `room-${Date.now()}-${index + 1}`,
    roomNumber: index + 1,
    boundary: candidate.wallIds,
    halfEdges: candidate.halfEdgeIds,
    areaMm2: candidate.area,
    perimeterMm: candidate.perimeter,
    raiseFromFloorMm: 100,
  }));

  console.log(`\n✅ Detected ${rooms.length} valid rooms (sorted by area)`);
  rooms.forEach(r => {
    console.log(`   Room ${r.roomNumber}: ${(r.areaMm2 / 1_000_000).toFixed(2)}m² (${r.boundary.length} walls)`);
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
 * Compute room centroid for label placement
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
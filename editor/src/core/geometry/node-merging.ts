import type { Scene, Node } from '../domain/types';
import * as vec from '../math/vec';
import type { Vec2 } from '../math/vec';
import { DEFAULT_TOL } from '../constants';

/**
 * Check if two nodes should be merged (within merge tolerance)
 */
export function shouldMergeNodes(nodeA: Node, nodeB: Node): boolean {
  const distance = vec.distance(nodeA, nodeB);
  return distance < DEFAULT_TOL.mergeTol;
}

/**
 * Find a node at a specific position (within merge tolerance)
 * @param position - World position in millimeters
 * @param scene - Current scene
 * @param excludeIds - Set of node IDs to exclude from search (e.g., selected nodes during drag)
 * @returns Node ID if found within tolerance, null otherwise
 */
export function findNodeAtPosition(
  position: Vec2,
  scene: Scene,
  excludeIds: Set<string> = new Set()
): string | null {
  const mergeTolMm = DEFAULT_TOL.mergeTol; // 1mm tolerance
  let closestNodeId: string | null = null;
  let closestDistance = mergeTolMm;

  for (const node of scene.nodes.values()) {
    // Skip excluded nodes
    if (excludeIds.has(node.id)) continue;
    
    const distance = vec.distance(position, node);
    
    // Find closest node within tolerance
    if (distance < closestDistance) {
      closestDistance = distance;
      closestNodeId = node.id;
    }
  }
  
  return closestNodeId;
}

/**
 * Merge a node into another node (parametric connection)
 * Updates all walls that reference fromNodeId to use toNodeId
 * @param fromNodeId - Node to merge (will be deleted)
 * @param toNodeId - Target node to merge into (will remain)
 * @param scene - Current scene
 * @returns New scene with merged nodes
 */
export function mergeNodes(
  fromNodeId: string,
  toNodeId: string,
  scene: Scene
): Scene {
  const newNodes = new Map(scene.nodes);
  const newWalls = new Map(scene.walls);

  // Remove the source node
  newNodes.delete(fromNodeId);

  // Update all walls that reference fromNodeId
  for (const [wallId, wall] of scene.walls) {
    let updated = false;
    const newWall = { ...wall };

    if (wall.nodeAId === fromNodeId) {
      newWall.nodeAId = toNodeId;
      updated = true;
    }
    if (wall.nodeBId === fromNodeId) {
      newWall.nodeBId = toNodeId;
      updated = true;
    }

    if (updated) {
      // Prevent degenerate walls (both nodes the same)
      if (newWall.nodeAId === newWall.nodeBId) {
        newWalls.delete(wallId);
      } else {
        newWalls.set(wallId, newWall);
      }
    }
  }

  return { nodes: newNodes, walls: newWalls };
}

/**
 * Split a shared node into separate nodes for specific walls
 * Creates a new node at the same position but disconnects the specified walls
 * @param nodeId - Node to split
 * @param wallIdsToSplit - Wall IDs that should use the new node
 * @param scene - Current scene
 * @returns New scene and the new node ID
 */
export function splitNode(
  nodeId: string,
  wallIdsToSplit: string[],
  scene: Scene
): { scene: Scene; newNodeId: string } {
  const node = scene.nodes.get(nodeId);
  if (!node) {
    return { scene, newNodeId: nodeId };
  }

  // Create new node at same position
  const newNodeId = `node-${Date.now()}-split`;
  const newNode: Node = {
    id: newNodeId,
    x: node.x,
    y: node.y,
  };

  const newNodes = new Map(scene.nodes);
  const newWalls = new Map(scene.walls);

  newNodes.set(newNodeId, newNode);

  // Update walls to use new node
  for (const wallId of wallIdsToSplit) {
    const wall = scene.walls.get(wallId);
    if (!wall) continue;

    const updatedWall = { ...wall };
    if (wall.nodeAId === nodeId) {
      updatedWall.nodeAId = newNodeId;
    }
    if (wall.nodeBId === nodeId) {
      updatedWall.nodeBId = newNodeId;
    }
    newWalls.set(wallId, updatedWall);
  }

  return {
    scene: { nodes: newNodes, walls: newWalls },
    newNodeId,
  };
}

/**
 * Get all walls connected to a node
 * @param nodeId - Node ID to find connections for
 * @param scene - Current scene
 * @returns Array of wall IDs connected to the node
 */
export function getWallsAtNode(nodeId: string, scene: Scene): string[] {
  const wallIds: string[] = [];
  
  for (const wall of scene.walls.values()) {
    if (wall.nodeAId === nodeId || wall.nodeBId === nodeId) {
      wallIds.push(wall.id);
    }
  }
  
  return wallIds;
}
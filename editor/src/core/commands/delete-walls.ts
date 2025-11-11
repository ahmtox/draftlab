import type { ICommand, Diff } from './base-command';
import type { Result } from '../result';
import type { Scene, Node, Wall } from '../domain/types';
import { getWallsAtNode } from '../geometry/node-merging';

export class DeleteWallsCommand implements ICommand {
  private deletedWalls: Map<string, Wall> = new Map();
  private deletedNodes: Map<string, Node> = new Map();
  private affectedWalls: Map<string, Wall> = new Map();

  constructor(
    private wallIds: Set<string>,
    private getScene: () => Scene,
    private setScene: (scene: Scene) => void
  ) {}

  get label(): string {
    return this.wallIds.size === 1 ? 'Delete Wall' : `Delete ${this.wallIds.size} Walls`;
  }

  execute(): Result<Diff, Error> {
    try {
      const scene = this.getScene();
      const newNodes = new Map(scene.nodes);
      const newWalls = new Map(scene.walls);

      // Track nodes that will be orphaned (only connected to deleted walls)
      const nodeUsageCounts = new Map<string, number>();
      const deletedWallNodeIds = new Set<string>();

      // First pass: count how many walls use each node
      for (const wall of scene.walls.values()) {
        nodeUsageCounts.set(wall.nodeAId, (nodeUsageCounts.get(wall.nodeAId) || 0) + 1);
        nodeUsageCounts.set(wall.nodeBId, (nodeUsageCounts.get(wall.nodeBId) || 0) + 1);
      }

      // Second pass: identify nodes used by deleted walls
      for (const wallId of this.wallIds) {
        const wall = scene.walls.get(wallId);
        if (!wall) continue;

        deletedWallNodeIds.add(wall.nodeAId);
        deletedWallNodeIds.add(wall.nodeBId);
        
        // Store for undo
        this.deletedWalls.set(wallId, { ...wall });
      }

      // Third pass: delete walls and identify orphaned nodes
      for (const wallId of this.wallIds) {
        const wall = newWalls.get(wallId);
        if (!wall) continue;

        newWalls.delete(wallId);

        // Decrement usage counts
        nodeUsageCounts.set(wall.nodeAId, (nodeUsageCounts.get(wall.nodeAId) || 0) - 1);
        nodeUsageCounts.set(wall.nodeBId, (nodeUsageCounts.get(wall.nodeBId) || 0) - 1);
      }

      // Fourth pass: delete orphaned nodes (nodes with zero remaining walls)
      for (const nodeId of deletedWallNodeIds) {
        const usageCount = nodeUsageCounts.get(nodeId) || 0;
        if (usageCount === 0) {
          const node = newNodes.get(nodeId);
          if (node) {
            this.deletedNodes.set(nodeId, { ...node });
            newNodes.delete(nodeId);
          }
        }
      }

      this.setScene({ nodes: newNodes, walls: newWalls });

      // Build diff
      const diff: Diff = [
        ...Array.from(this.deletedWalls.keys()).map(id => ({
          op: 'remove' as const,
          key: ['wall', id] as const,
        })),
        ...Array.from(this.deletedNodes.keys()).map(id => ({
          op: 'remove' as const,
          key: ['node', id] as const,
        })),
      ];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  undo(): Result<Diff, Error> {
    try {
      const scene = this.getScene();
      const newNodes = new Map(scene.nodes);
      const newWalls = new Map(scene.walls);

      // Restore deleted nodes first
      for (const [nodeId, node] of this.deletedNodes) {
        newNodes.set(nodeId, node);
      }

      // Restore deleted walls
      for (const [wallId, wall] of this.deletedWalls) {
        newWalls.set(wallId, wall);
      }

      this.setScene({ nodes: newNodes, walls: newWalls });

      // Build diff
      const diff: Diff = [
        ...Array.from(this.deletedNodes.entries()).map(([id, node]) => ({
          op: 'add' as const,
          key: ['node', id] as const,
          value: node,
        })),
        ...Array.from(this.deletedWalls.entries()).map(([id, wall]) => ({
          op: 'add' as const,
          key: ['wall', id] as const,
          value: wall,
        })),
      ];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  canMergeWith(): boolean {
    // Don't merge delete commands
    return false;
  }
}
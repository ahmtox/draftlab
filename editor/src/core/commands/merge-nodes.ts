import type { ICommand, Diff } from './base-command';
import type { Result } from '../result';
import type { Scene, Node, Wall } from '../domain/types';
import { mergeNodes } from '../geometry/node-merging';

export class MergeNodesCommand implements ICommand {
  private fromNodeId: string;
  private toNodeId: string;
  private deletedWallIds: string[] = [];
  
  // Snapshot for undo
  private originalFromNode: Node | null = null;
  private originalWalls: Map<string, Wall> = new Map();

  constructor(
    fromNodeId: string,
    toNodeId: string,
    private getScene: () => Scene,
    private setScene: (scene: Scene) => void
  ) {
    this.fromNodeId = fromNodeId;
    this.toNodeId = toNodeId;
  }

  get label(): string {
    return 'Merge Nodes';
  }

  execute(): Result<Diff, Error> {
    try {
      const scene = this.getScene();
      
      // Snapshot original state for undo
      this.originalFromNode = scene.nodes.get(this.fromNodeId) || null;
      if (!this.originalFromNode) {
        return { ok: false, error: new Error(`Source node ${this.fromNodeId} not found`) };
      }

      // Snapshot walls that will be modified
      this.originalWalls.clear();
      for (const [wallId, wall] of scene.walls) {
        if (wall.nodeAId === this.fromNodeId || wall.nodeBId === this.fromNodeId) {
          this.originalWalls.set(wallId, { ...wall });
        }
      }

      const mergedScene = mergeNodes(this.fromNodeId, this.toNodeId, scene);

      // Track which walls were deleted (degenerate walls with same start/end)
      this.deletedWallIds = [];
      for (const wallId of scene.walls.keys()) {
        if (!mergedScene.walls.has(wallId)) {
          this.deletedWallIds.push(wallId);
        }
      }

      this.setScene(mergedScene);

      const diff: Diff = [
        { op: 'remove', key: ['node', this.fromNodeId] },
        ...this.deletedWallIds.map(id => ({ 
          op: 'remove' as const, 
          key: ['wall', id] as const 
        })),
        ...Array.from(mergedScene.walls.values())
          .filter(w => 
            this.originalWalls.has(w.id) && 
            (w.nodeAId === this.toNodeId || w.nodeBId === this.toNodeId)
          )
          .map(w => ({ 
            op: 'replace' as const, 
            key: ['wall', w.id] as const, 
            value: w 
          }))
      ];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  undo(): Result<Diff, Error> {
    try {
      if (!this.originalFromNode) {
        return { ok: false, error: new Error('No snapshot available for undo') };
      }

      const scene = this.getScene();
      const newNodes = new Map(scene.nodes);
      const newWalls = new Map(scene.walls);

      // Restore the deleted node
      newNodes.set(this.fromNodeId, this.originalFromNode);

      // Restore original wall connections
      for (const [wallId, originalWall] of this.originalWalls) {
        newWalls.set(wallId, originalWall);
      }

      // Remove any degenerate walls that were deleted
      for (const wallId of this.deletedWallIds) {
        newWalls.delete(wallId);
      }

      this.setScene({ nodes: newNodes, walls: newWalls });

      const diff: Diff = [
        { op: 'add', key: ['node', this.fromNodeId], value: this.originalFromNode },
        ...Array.from(this.originalWalls.values()).map(w => ({
          op: 'replace' as const,
          key: ['wall', w.id] as const,
          value: w
        })),
        ...this.deletedWallIds.map(id => ({
          op: 'remove' as const,
          key: ['wall', id] as const
        }))
      ];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  canMergeWith(): boolean {
    return false;
  }
}
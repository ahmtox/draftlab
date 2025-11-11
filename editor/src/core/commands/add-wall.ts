import type { ICommand, Diff } from './base-command';
import type { Result } from '../result';
import type { Scene } from '../domain/types';
import type { Vec2 } from '../math/vec';

export type WallParams = {
  thicknessMm: number;
  heightMm: number;
  raiseFromFloorMm: number;
};

export class AddWallCommand implements ICommand {
  private nodeAId: string;
  private nodeBId: string;
  private wallId: string;
  private createdNodeA: boolean = false;
  private createdNodeB: boolean = false;

  constructor(
    private startMm: Vec2,
    private endMm: Vec2,
    private params: WallParams,
    private getScene: () => Scene,
    private setScene: (scene: Scene) => void,
    private existingNodeAId: string | null = null,
    private existingNodeBId: string | null = null
  ) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    
    // Use existing node IDs or generate new ones
    this.nodeAId = existingNodeAId || `node-${timestamp}-${random}-a`;
    this.nodeBId = existingNodeBId || `node-${timestamp}-${random}-b`;
    this.wallId = `wall-${timestamp}-${random}`;
    
    this.createdNodeA = !existingNodeAId;
    this.createdNodeB = !existingNodeBId;
  }

  get label(): string {
    return 'Add Wall';
  }

  execute(): Result<Diff, Error> {
    try {
      const scene = this.getScene();
      
      const newNodes = new Map(scene.nodes);
      const newWalls = new Map(scene.walls);

      // Only create nodes if they don't exist
      if (this.createdNodeA) {
        newNodes.set(this.nodeAId, { 
          id: this.nodeAId, 
          x: this.startMm.x, 
          y: this.startMm.y 
        });
      }

      if (this.createdNodeB) {
        newNodes.set(this.nodeBId, { 
          id: this.nodeBId, 
          x: this.endMm.x, 
          y: this.endMm.y 
        });
      }

      // Add new wall
      newWalls.set(this.wallId, {
        id: this.wallId,
        nodeAId: this.nodeAId,
        nodeBId: this.nodeBId,
        ...this.params,
      });

      this.setScene({ nodes: newNodes, walls: newWalls });

      const diff: Diff = [
        ...(this.createdNodeA ? [{ op: 'add' as const, key: ['node', this.nodeAId] as const, value: newNodes.get(this.nodeAId) }] : []),
        ...(this.createdNodeB ? [{ op: 'add' as const, key: ['node', this.nodeBId] as const, value: newNodes.get(this.nodeBId) }] : []),
        { op: 'add', key: ['wall', this.wallId], value: newWalls.get(this.wallId) },
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

      // Only delete nodes we created
      if (this.createdNodeA) {
        newNodes.delete(this.nodeAId);
      }
      if (this.createdNodeB) {
        newNodes.delete(this.nodeBId);
      }
      newWalls.delete(this.wallId);

      this.setScene({ nodes: newNodes, walls: newWalls });

      const diff: Diff = [
        ...(this.createdNodeA ? [{ op: 'remove' as const, key: ['node', this.nodeAId] as const }] : []),
        ...(this.createdNodeB ? [{ op: 'remove' as const, key: ['node', this.nodeBId] as const }] : []),
        { op: 'remove', key: ['wall', this.wallId] },
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
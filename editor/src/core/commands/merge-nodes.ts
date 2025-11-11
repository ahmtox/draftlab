import type { ICommand, Diff } from './base-command';
import type { Result } from '../result';
import type { Scene } from '../domain/types';
import { mergeNodes } from '../geometry/node-merging';

export class MergeNodesCommand implements ICommand {
  private fromNodeId: string;
  private toNodeId: string;
  private deletedWallIds: string[] = [];

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
        ...this.deletedWallIds.map(id => ({ op: 'remove' as const, key: ['wall', id] as const })),
        ...Array.from(mergedScene.walls.values())
          .filter(w => w.nodeAId === this.toNodeId || w.nodeBId === this.toNodeId)
          .map(w => ({ op: 'replace' as const, key: ['wall', w.id] as const, value: w }))
      ];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  undo(): Result<Diff, Error> {
    try {
      console.warn('MergeNodesCommand.undo() not yet implemented');
      return { ok: false, error: new Error('Undo not implemented for merge') };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  canMergeWith(): boolean {
    return false;
  }
}
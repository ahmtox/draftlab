import type { ICommand, Diff } from './base-command';
import type { Result } from '../result';
import type { Scene } from '../domain/types';
import type { Vec2 } from '../math/vec';

export class MoveNodeCommand implements ICommand {
  constructor(
    private nodeId: string,
    private oldPosMm: Vec2,
    private newPosMm: Vec2,
    private getScene: () => Scene,
    private setScene: (scene: Scene) => void
  ) {}

  get label(): string {
    return 'Move Node';
  }

  execute(): Result<Diff, Error> {
    try {
      const scene = this.getScene();
      const node = scene.nodes.get(this.nodeId);

      if (!node) {
        return { ok: false, error: new Error(`Node ${this.nodeId} not found`) };
      }

      const newNodes = new Map(scene.nodes);
      newNodes.set(this.nodeId, {
        ...node,
        x: this.newPosMm.x,
        y: this.newPosMm.y,
      });

      this.setScene({ nodes: newNodes, walls: scene.walls });

      const diff: Diff = [{
        op: 'replace',
        key: ['node', this.nodeId],
        value: newNodes.get(this.nodeId),
      }];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  undo(): Result<Diff, Error> {
    try {
      const scene = this.getScene();
      const node = scene.nodes.get(this.nodeId);

      if (!node) {
        return { ok: false, error: new Error(`Node ${this.nodeId} not found`) };
      }

      const newNodes = new Map(scene.nodes);
      newNodes.set(this.nodeId, {
        ...node,
        x: this.oldPosMm.x,
        y: this.oldPosMm.y,
      });

      this.setScene({ nodes: newNodes, walls: scene.walls });

      const diff: Diff = [{
        op: 'replace',
        key: ['node', this.nodeId],
        value: newNodes.get(this.nodeId),
      }];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  canMergeWith(other: ICommand): boolean {
    return other instanceof MoveNodeCommand && other.nodeId === this.nodeId;
  }

  merge(other: ICommand): ICommand {
    if (other instanceof MoveNodeCommand && other.nodeId === this.nodeId) {
      // Keep original old position, use other's new position
      return new MoveNodeCommand(
        this.nodeId,
        this.oldPosMm,
        other.newPosMm,
        this.getScene,
        this.setScene
      );
    }
    return this;
  }
}
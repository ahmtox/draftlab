import type { ICommand } from './base-command';
import type { Scene } from '../domain/types';
import type { Vec2 } from '../math/vec';
import type { Diff } from './base-command';
import type { Result } from '../result';

export class MoveFixtureCommand implements ICommand {
  constructor(
    private fixtureId: string,
    private oldPosMm: Vec2,
    private newPosMm: Vec2,
    private getScene: () => Scene,
    private setScene: (scene: Scene) => void
  ) {}

  get label(): string {
    return 'Move Fixture';
  }

  execute(): Result<Diff, Error> {
    try {
      const scene = this.getScene();
      const fixture = scene.fixtures?.get(this.fixtureId);

      if (!fixture) {
        return { ok: false, error: new Error(`Fixture ${this.fixtureId} not found`) };
      }

      const newFixtures = new Map(scene.fixtures);
      newFixtures.set(this.fixtureId, {
        ...fixture,
        position: { x: this.newPosMm.x, y: this.newPosMm.y },
      });

      this.setScene({ 
        nodes: scene.nodes, 
        walls: scene.walls, 
        rooms: scene.rooms,
        fixtures: newFixtures 
      });

      const diff: Diff = [{
        op: 'replace',
        key: ['fixture', this.fixtureId],
        value: newFixtures.get(this.fixtureId),
      }];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  undo(): Result<Diff, Error> {
    try {
      const scene = this.getScene();
      const fixture = scene.fixtures?.get(this.fixtureId);

      if (!fixture) {
        return { ok: false, error: new Error(`Fixture ${this.fixtureId} not found`) };
      }

      const newFixtures = new Map(scene.fixtures);
      newFixtures.set(this.fixtureId, {
        ...fixture,
        position: { x: this.oldPosMm.x, y: this.oldPosMm.y },
      });

      this.setScene({ 
        nodes: scene.nodes, 
        walls: scene.walls, 
        rooms: scene.rooms,
        fixtures: newFixtures 
      });

      const diff: Diff = [{
        op: 'replace',
        key: ['fixture', this.fixtureId],
        value: newFixtures.get(this.fixtureId),
      }];

      return { ok: true, value: diff };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  canMergeWith(other: ICommand): boolean {
    return (
      other instanceof MoveFixtureCommand &&
      other.fixtureId === this.fixtureId
    );
  }

  merge(other: ICommand): ICommand {
    if (!(other instanceof MoveFixtureCommand)) {
      throw new Error('Cannot merge with non-MoveFixtureCommand');
    }

    return new MoveFixtureCommand(
      this.fixtureId,
      this.oldPosMm,
      other.newPosMm,
      this.getScene,
      this.setScene
    );
  }
}
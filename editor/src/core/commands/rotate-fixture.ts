import type { ICommand, Diff } from './base-command';
import type { Result } from '../result';
import type { Scene } from '../domain/types';

export class RotateFixtureCommand implements ICommand {
  constructor(
    private fixtureId: string,
    private oldRotation: number,
    private newRotation: number,
    private getScene: () => Scene,
    private setScene: (scene: Scene) => void
  ) {}

  get label(): string {
    return 'Rotate Fixture';
  }

  execute(): Result<Diff, Error> {
    const scene = this.getScene();
    const fixture = scene.fixtures?.get(this.fixtureId);
    
    if (!fixture) {
      return { ok: false, error: new Error('Fixture not found') };
    }

    const newFixtures = new Map(scene.fixtures);
    newFixtures.set(this.fixtureId, {
      ...fixture,
      rotation: this.newRotation,
    });

    this.setScene({
      ...scene,
      fixtures: newFixtures,
    });

    const diff: Diff = [
      { 
        op: 'replace', 
        key: ['fixture', this.fixtureId],
        path: ['rotation'],
        value: this.newRotation,
      },
    ];

    return { ok: true, value: diff };
  }

  undo(): Result<Diff, Error> {
    const scene = this.getScene();
    const fixture = scene.fixtures?.get(this.fixtureId);
    
    if (!fixture) {
      return { ok: false, error: new Error('Fixture not found') };
    }

    const newFixtures = new Map(scene.fixtures);
    newFixtures.set(this.fixtureId, {
      ...fixture,
      rotation: this.oldRotation,
    });

    this.setScene({
      ...scene,
      fixtures: newFixtures,
    });

    const diff: Diff = [
      { 
        op: 'replace', 
        key: ['fixture', this.fixtureId],
        path: ['rotation'],
        value: this.oldRotation,
      },
    ];

    return { ok: true, value: diff };
  }

  canMergeWith(other: ICommand): boolean {
    return false;
  }
}
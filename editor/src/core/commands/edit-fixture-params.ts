import type { ICommand, Diff } from './base-command';
import type { Result } from '../result';
import type { Scene } from '../domain/types';

export class EditFixtureParamsCommand implements ICommand {
  constructor(
    private fixtureId: string,
    private oldParams: Record<string, any>,
    private newParams: Record<string, any>,
    private getScene: () => Scene,
    private setScene: (scene: Scene) => void
  ) {}

  get label(): string {
    return 'Edit Fixture';
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
      params: { ...this.newParams },
    });

    this.setScene({
      ...scene,
      fixtures: newFixtures,
    });

    const diff: Diff = [
      { 
        op: 'replace', 
        key: ['fixture', this.fixtureId],
        path: ['params'],
        value: this.newParams,
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
      params: { ...this.oldParams },
    });

    this.setScene({
      ...scene,
      fixtures: newFixtures,
    });

    const diff: Diff = [
      { 
        op: 'replace', 
        key: ['fixture', this.fixtureId],
        path: ['params'],
        value: this.oldParams,
      },
    ];

    return { ok: true, value: diff };
  }

  canMergeWith(other: ICommand): boolean {
    return false;
  }
}
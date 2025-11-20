import type { ICommand, Diff } from './base-command';
import type { Result } from '../result';
import type { Scene, Fixture } from '../domain/types';
import type { FixtureSchema } from '../fixtures/schema';
import type { Vec2 } from '../math/vec';

export class AddFixtureCommand implements ICommand {
  private fixtureId: string;
  private fixture: Fixture;

  constructor(
    private schema: FixtureSchema,
    private positionMm: Vec2,
    private rotation: number,
    private getScene: () => Scene,
    private setScene: (scene: Scene) => void
  ) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    this.fixtureId = `fixture-${timestamp}-${random}`;

    // Build default params from schema
    const params: Record<string, any> = {};
    for (const paramDef of schema.params) {
      params[paramDef.key] = paramDef.default;
    }

    this.fixture = {
      id: this.fixtureId,
      kind: schema.id,
      params,
      anchor: {
        type: 'floor',
        refId: 'floor', // floor placement for now
      },
      rotation,
      position: { x: positionMm.x, y: positionMm.y },
    };
  }

  get label(): string {
    return `Add ${this.schema.name}`;
  }

  execute(): Result<Diff, Error> {
    const scene = this.getScene();
    const newFixtures = new Map(scene.fixtures);
    newFixtures.set(this.fixtureId, this.fixture);

    this.setScene({
      ...scene,
      fixtures: newFixtures,
    });

    const diff: Diff = [
      { op: 'add', key: ['fixture', this.fixtureId], value: this.fixture },
    ];

    return { ok: true, value: diff };
  }

  undo(): Result<Diff, Error> {
    const scene = this.getScene();
    const newFixtures = new Map(scene.fixtures);
    newFixtures.delete(this.fixtureId);

    this.setScene({
      ...scene,
      fixtures: newFixtures,
    });

    const diff: Diff = [
      { op: 'remove', key: ['fixture', this.fixtureId] },
    ];

    return { ok: true, value: diff };
  }

  canMergeWith(other: ICommand): boolean {
    return false;
  }
}
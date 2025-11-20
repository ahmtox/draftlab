import type { Vec2 } from '../core/math/vec';
import type { Scene } from '../core/domain/types';
import type { Viewport } from '../renderers/konva/viewport';
import type { FixtureSchema } from '../core/fixtures/schema';
import { screenToWorld } from '../renderers/konva/viewport';

export type FixtureToolContext = {
  state: 'idle' | 'placing';
  schema: FixtureSchema | null;
  ghostPositionMm: Vec2 | null;
  ghostRotation: number; // radians
};

export class FixtureTool {
  private context: FixtureToolContext = {
    state: 'idle',
    schema: null,
    ghostPositionMm: null,
    ghostRotation: 0,
  };

  constructor(
    private onStateChange: (ctx: FixtureToolContext) => void,
    private onCommit: (schema: FixtureSchema, positionMm: Vec2, rotation: number) => void
  ) {}

  /**
   * Activate placement mode with a selected fixture schema
   */
  startPlacing(schema: FixtureSchema): void {
    this.context = {
      state: 'placing',
      schema,
      ghostPositionMm: null,
      ghostRotation: schema.defaultRotation || 0,
    };
    this.onStateChange(this.context);
  }

  /**
   * Update ghost position as cursor moves
   */
  handlePointerMove(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    if (this.context.state !== 'placing' || !this.context.schema) return;

    const worldPos = screenToWorld(screenPx, viewport);

    this.context = {
      ...this.context,
      ghostPositionMm: worldPos,
    };

    this.onStateChange(this.context);
  }

  /**
   * Place fixture on click
   */
  handlePointerDown(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    if (this.context.state !== 'placing' || !this.context.schema || !this.context.ghostPositionMm) {
      return;
    }

    // Commit the fixture
    this.onCommit(
      this.context.schema,
      this.context.ghostPositionMm,
      this.context.ghostRotation
    );

    // Reset to idle
    this.reset();
  }

  /**
   * Rotate fixture with R key
   */
  rotate(angleDelta: number): void {
    if (this.context.state === 'placing') {
      this.context = {
        ...this.context,
        ghostRotation: this.context.ghostRotation + angleDelta,
      };
      this.onStateChange(this.context);
    }
  }

  /**
   * Cancel placement (Escape key)
   */
  cancel(): void {
    this.reset();
  }

  reset(): void {
    this.context = {
      state: 'idle',
      schema: null,
      ghostPositionMm: null,
      ghostRotation: 0,
    };
    this.onStateChange(this.context);
  }

  getContext(): FixtureToolContext {
    return this.context;
  }
}
import type { Vec2 } from '../core/math/vec';
import type { Scene } from '../core/domain/types';
import type { Viewport } from '../renderers/konva/viewport';
import type { SnapCandidate } from '../core/geometry/snapping';
import { screenToWorld } from '../renderers/konva/viewport';
import { findSnapCandidate } from '../core/geometry/snapping';
import { MIN_WALL_LENGTH_MM } from '../core/constants';
import * as vec from '../core/math/vec';

export type WallToolState = 'idle' | 'firstPoint' | 'dragging';

export interface WallToolContext {
  state: WallToolState;
  firstPointMm: Vec2 | null;
  currentPointMm: Vec2 | null;
  hoverPointMm: Vec2 | null;
  snapCandidate: SnapCandidate | null;
  firstNodeId: string | null;
}

export class WallTool {
  private context: WallToolContext = {
    state: 'idle',
    firstPointMm: null,
    currentPointMm: null,
    hoverPointMm: null,
    snapCandidate: null,
    firstNodeId: null,
  };

  private lastClickTime: number = 0;
  private readonly DOUBLE_CLICK_THRESHOLD_MS = 300;

  constructor(
    private onStateChange: (ctx: WallToolContext) => void,
    private onCommit: (startMm: Vec2, endMm: Vec2, startNodeId: string | null, endNodeId: string | null) => void
  ) {}

  handlePointerDown(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    const worldPos = screenToWorld(screenPx, viewport);
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    this.lastClickTime = now;

    if (this.context.state === 'idle') {
      // Find snap candidate for first point
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
        }
      );

      const finalPoint = snapResult.snapped ? snapResult.point : worldPos;

      // Extract node ID if we snapped to a node
      const firstNodeId = snapResult.candidate?.type === 'node' ? snapResult.candidate.entityId || null : null;

      this.context = {
        state: 'firstPoint',
        firstPointMm: finalPoint,
        currentPointMm: finalPoint,
        hoverPointMm: null,
        snapCandidate: snapResult.candidate || null,
        firstNodeId,
      };

      this.onStateChange(this.context);
    } else if (this.context.state === 'firstPoint') {
      // Second click - commit the wall
      // Only treat as double-click if it's very fast (prevents interference with snap-to-node clicks)
      const isRapidDoubleClick = timeSinceLastClick < 200; // Tighter threshold than hover double-click
      
      if (isRapidDoubleClick) {
        // User double-clicked rapidly - commit at current position
        this.commitWall(screenPx, scene, viewport);
      } else {
        // Normal second click - commit the wall
        this.commitWall(screenPx, scene, viewport);
      }
    }
  }

  handlePointerMove(screenPx: Vec2, scene: Scene, viewport: Viewport, buttons: number): void {
    const worldPos = screenToWorld(screenPx, viewport);

    if (this.context.state === 'idle') {
      // Show hover point with snapping
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
        }
      );

      this.context = {
        ...this.context,
        hoverPointMm: snapResult.snapped ? snapResult.point : worldPos,
        snapCandidate: snapResult.candidate || null,
      };

      this.onStateChange(this.context);
    } else if (this.context.state === 'firstPoint') {
      // Transition to dragging if mouse button is held
      if (buttons === 1) {
        this.context.state = 'dragging';
      }

      // Update preview with snapping
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
        }
      );

      this.context = {
        ...this.context,
        currentPointMm: snapResult.snapped ? snapResult.point : worldPos,
        snapCandidate: snapResult.candidate || null,
      };

      this.onStateChange(this.context);
    } else if (this.context.state === 'dragging') {
      // Continue updating preview while dragging
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
        }
      );

      this.context = {
        ...this.context,
        currentPointMm: snapResult.snapped ? snapResult.point : worldPos,
        snapCandidate: snapResult.candidate || null,
      };

      this.onStateChange(this.context);
    }
  }

  handlePointerUp(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    if (this.context.state === 'dragging') {
      // Drag-to-create: commit on mouse up
      this.commitWall(screenPx, scene, viewport);
    }
    // If state is 'firstPoint', wait for second click (click-twice workflow)
  }

  private commitWall(screenPx: Vec2, scene: Scene, viewport: Viewport): void {
    if (!this.context.firstPointMm) return;

    const worldPos = screenToWorld(screenPx, viewport);

    // Find final snap position
    const snapResult = findSnapCandidate(
      screenPx,
      scene,
      viewport,
      {
        snapToGrid: true,
        snapToNodes: true,
        snapToEdges: true,
      }
    );

    const endPoint = snapResult.snapped ? snapResult.point : worldPos;

    // Extract end node ID if we snapped to a node
    const existingEndNodeId = snapResult.candidate?.type === 'node' ? snapResult.candidate.entityId || null : null;

    // Check minimum wall length
    const wallLength = vec.distance(this.context.firstPointMm, endPoint);
    if (wallLength < MIN_WALL_LENGTH_MM) {
      console.warn(`Wall too short: ${wallLength.toFixed(1)}mm (minimum: ${MIN_WALL_LENGTH_MM}mm)`);
      this.reset();
      return;
    }

    // Commit the wall with node IDs for merging
    this.onCommit(
      this.context.firstPointMm, 
      endPoint,
      this.context.firstNodeId,
      existingEndNodeId
    );

    // Reset to idle
    this.reset();
  }

  reset(): void {
    this.context = {
      state: 'idle',
      firstPointMm: null,
      currentPointMm: null,
      hoverPointMm: null,
      snapCandidate: null,
      firstNodeId: null,
    };
    this.onStateChange(this.context);
  }

  getContext(): WallToolContext {
    return this.context;
  }
}
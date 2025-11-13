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

  handlePointerDown(screenPx: Vec2, scene: Scene, viewport: Viewport, shiftKey: boolean): void {
    const worldPos = screenToWorld(screenPx, viewport);
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    this.lastClickTime = now;

    if (this.context.state === 'idle') {
      // Find snap candidate for first point (enable guidelines, no angle wheel)
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToAngles: false,
          snapToGuidelines: true,
          guidelineOrigin: undefined, // No origin yet
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
      const isRapidDoubleClick = timeSinceLastClick < 200;
      
      if (isRapidDoubleClick) {
        this.commitWall(screenPx, scene, viewport, shiftKey);
      } else {
        this.commitWall(screenPx, scene, viewport, shiftKey);
      }
    }
  }

  handlePointerMove(screenPx: Vec2, scene: Scene, viewport: Viewport, buttons: number, shiftKey: boolean): void {
    const worldPos = screenToWorld(screenPx, viewport);

    if (this.context.state === 'idle') {
      // Show hover point with snapping (enable guidelines, no angle wheel)
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToAngles: false,
          snapToGuidelines: true,
          guidelineOrigin: undefined, // No origin for hover
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

      // Update preview with snapping (enable guidelines + angle wheel if Shift)
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToAngles: shiftKey,
          snapToGuidelines: true,
          angleOrigin: this.context.firstPointMm || undefined,
          guidelineOrigin: this.context.firstPointMm || undefined, // Filter by first point
        }
      );

      this.context = {
        ...this.context,
        currentPointMm: snapResult.snapped ? snapResult.point : worldPos,
        snapCandidate: snapResult.candidate || null,
      };

      this.onStateChange(this.context);
    } else if (this.context.state === 'dragging') {
      // Continue updating preview while dragging (enable guidelines + angle wheel if Shift)
      const snapResult = findSnapCandidate(
        screenPx,
        scene,
        viewport,
        {
          snapToGrid: true,
          snapToNodes: true,
          snapToEdges: true,
          snapToAngles: shiftKey,
          snapToGuidelines: true,
          angleOrigin: this.context.firstPointMm || undefined,
          guidelineOrigin: this.context.firstPointMm || undefined, // Filter by first point
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

  handlePointerUp(screenPx: Vec2, scene: Scene, viewport: Viewport, shiftKey: boolean): void {
    if (this.context.state === 'dragging') {
      // Drag-to-create: commit on mouse up
      this.commitWall(screenPx, scene, viewport, shiftKey);
    }
    // If state is 'firstPoint', wait for second click (click-twice workflow)
  }

  private commitWall(screenPx: Vec2, scene: Scene, viewport: Viewport, shiftKey: boolean): void {
    if (!this.context.firstPointMm) return;

    const worldPos = screenToWorld(screenPx, viewport);

    // Find final snap position (enable guidelines + angle wheel if Shift)
    const snapResult = findSnapCandidate(
      screenPx,
      scene,
      viewport,
      {
        snapToGrid: true,
        snapToNodes: true,
        snapToEdges: true,
        snapToAngles: shiftKey,
        snapToGuidelines: true,
        angleOrigin: this.context.firstPointMm,
        guidelineOrigin: this.context.firstPointMm, // Filter by first point
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
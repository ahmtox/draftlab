import type { Vec2 } from '../../core/math/vec';
import type { Scene } from '../../core/domain/types';
import type { SnapCandidate } from '../../core/geometry/snapping';

export const MIN_MARQUEE_SIZE_PX = 5;
export const MIN_DRAG_DISTANCE_PX = 10;
export const RIGID_BODY_SNAP_TOLERANCE_MM = 0.5;
export const SAME_POSITION_TOLERANCE_MM = 1.0;

export type DragMode = 'wall' | 'node-a' | 'node-b' | 'marquee' | 'fixture';

export type SelectToolContext = {
  state: 'idle' | 'dragging' | 'marquee' | 'marquee-pending';
  selectedWallIds: Set<string>;
  hoveredWallId: string | null;
  dragMode: DragMode | null;
  dragStartMm: Vec2 | null;
  dragCurrentMm: Vec2 | null;
  offsetAMm: Vec2 | null;
  offsetBMm: Vec2 | null;
  snapCandidateA: SnapCandidate | null;
  snapCandidateB: SnapCandidate | null;
  marqueeStart: Vec2 | null;
  marqueeCurrent: Vec2 | null;
  activeSnaps: Map<string, string>;
  snapCandidates: SnapCandidate[];
};

export type SelectToolCallbacks = {
  onStateChange: (ctx: SelectToolContext) => void;
  onDragUpdate: (wallIds: Set<string>, nodePositions: Map<string, Vec2>) => void;
  onDragCommit: (
    nodePositions: Map<string, { original: Vec2; final: Vec2 }>,
    mergeTargets: Map<string, string>
  ) => void;
  onFixtureDragUpdate: (fixtureId: string, position: Vec2) => void;
  onFixtureDragCommit: (fixtureId: string, originalPos: Vec2, finalPos: Vec2) => void;
};

export type SelectToolState = {
  context: SelectToolContext;
  originalSceneSnapshot: Scene | null;
  originalNodePositions: Map<string, Vec2>;
  originalFixturePosition: Vec2 | null;
  draggingFixtureId: string | null;
  shiftKeyHeld: boolean;
  getSelectedFixtureId: () => string | null; // ✅ NEW: Function to get current selected fixture ID
};
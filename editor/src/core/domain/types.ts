export type Node = {
  id: string;
  x: number; // mm
  y: number; // mm
  locked?: boolean;
  wallRefs?: Set<string>;
};

export type Wall = {
  id: string;
  nodeAId: string;
  nodeBId: string;
  thicknessMm: number;
  heightMm: number;
  raiseFromFloorMm: number;
  leftFaceId?: string;
  rightFaceId?: string;
};

export type Room = {
  id: string;
  roomNumber: number;
  boundary: string[];
  halfEdges: string[];
  areaMm2: number;
  perimeterMm: number;
  raiseFromFloorMm: number;
  labelPositionMm?: { x: number; y: number }; // ✅ NEW: Custom label position in world coords
  color?: string;
};

export type Fixture = {
  id: string;
  kind: string; // key into fixture library
  params: Record<string, any>; // numeric params in mm
  anchor: {
    type: 'wall' | 'room' | 'floor';
    refId: string; // ID of anchored entity
    t?: number; // parametric position on wall [0,1]
  };
  rotation?: number; // radians
  position?: { x: number; y: number }; // for floor/room anchors (mm)
};

export type Scene = {
  nodes: Map<string, Node>;
  walls: Map<string, Wall>;
  rooms: Map<string, Room>;
  fixtures: Map<string, Fixture>; // ✅ NEW
};
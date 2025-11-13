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
  leftFaceId?: string;   // ✅ NEW: room on left side (from A → B)
  rightFaceId?: string;  // ✅ NEW: room on right side (from A → B)
};

export type Room = {
  id: string;
  boundary: string[];      // ✅ NEW: ordered wall IDs forming closed loop
  areaCache?: number;      // square millimeters
};

export type Scene = {
  nodes: Map<string, Node>;
  walls: Map<string, Wall>;
  rooms?: Map<string, Room>; // ✅ NEW: detected rooms
};
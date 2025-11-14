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

export type Scene = {
  nodes: Map<string, Node>;
  walls: Map<string, Wall>;
  rooms: Map<string, Room>;
};
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
  roomNumber: number;        // ✅ NEW: monotonic room number for display
  boundary: string[];        // ordered wall IDs forming closed loop
  halfEdges: string[];       // ordered half-edge IDs
  areaMm2: number;          // cached area in square millimeters
  perimeterMm: number;      // cached perimeter in millimeters
  raiseFromFloorMm: number; // ✅ NEW: floor elevation (default 100mm = 10cm)
  color?: string;           // fill color
};

export type Scene = {
  nodes: Map<string, Node>;
  walls: Map<string, Wall>;
  rooms: Map<string, Room>;  // detected rooms
};
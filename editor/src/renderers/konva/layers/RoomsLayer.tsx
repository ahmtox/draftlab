import React, { memo, useMemo, useState, useEffect, useRef } from 'react';
import { Layer, Line, Text, Group, Rect } from 'react-konva';
import { useStore } from '../../../state/store';
import { worldToScreen, screenToWorld } from '../viewport';
import { buildHalfEdgeStructure, buildInnerRoomPolygon } from '../../../core/topology/half-edge';
import { computeRoomCentroid, isPointInsidePolygon } from '../../../core/topology/room-detect';
import type { Vec2 } from '../../../core/math/vec';

/**
 * Find a valid position inside the room boundary
 * If the given position is outside, find the nearest point on/inside the boundary
 */
function ensurePositionInsideBoundary(position: Vec2, polygonMm: Vec2[]): Vec2 {
  // If already inside, return as-is
  if (isPointInsidePolygon(position, polygonMm)) {
    return position;
  }

  // Find the centroid of the polygon as fallback
  let sumX = 0;
  let sumY = 0;
  for (const point of polygonMm) {
    sumX += point.x;
    sumY += point.y;
  }
  const centroid = { x: sumX / polygonMm.length, y: sumY / polygonMm.length };

  // If centroid is inside, use it
  if (isPointInsidePolygon(centroid, polygonMm)) {
    return centroid;
  }

  // Last resort: find the average of all vertices (always inside for convex polygons)
  // For concave polygons, find the first vertex that's definitely inside
  for (const point of polygonMm) {
    if (isPointInsidePolygon(point, polygonMm)) {
      return point;
    }
  }

  // Ultimate fallback: use the first vertex
  return polygonMm[0] || { x: 0, y: 0 };
}

// ============================================================================
// Shared Room Data Hook
// ============================================================================

/**
 * Compute room shape data (used by both fills and labels layers)
 */
function useRoomShapes() {
  const scene = useStore((state) => state.scene);
  
  return useMemo(() => {
    const shapes: Array<{
      key: string;
      roomId: string;
      polygonMm: Vec2[];
      labelPositionMm: Vec2;
      roomNumber: number;
      area: string;
    }> = [];

    const halfEdges = buildHalfEdgeStructure(scene);

    for (const room of scene.rooms.values()) {
      const innerPolygonMm = buildInnerRoomPolygon(room.halfEdges, halfEdges, scene);

      if (innerPolygonMm.length < 3) {
        continue;
      }

      // Use custom label position if available, otherwise use centroid
      let labelPositionMm: Vec2;
      if (room.labelPositionMm) {
        labelPositionMm = room.labelPositionMm;
      } else {
        labelPositionMm = computeRoomCentroid(room, scene);
      }

      // ✅ ALWAYS ensure label is inside the boundary
      labelPositionMm = ensurePositionInsideBoundary(labelPositionMm, innerPolygonMm);

      // Format area for display
      const areaSqM = room.areaMm2 / 1_000_000;
      const areaText = areaSqM < 1 
        ? `${(areaSqM * 10000).toFixed(0)} cm²`
        : `${areaSqM.toFixed(2)} m²`;

      shapes.push({
        key: room.id,
        roomId: room.id,
        polygonMm: innerPolygonMm,
        labelPositionMm,
        roomNumber: room.roomNumber,
        area: areaText,
      });
    }

    return shapes;
  }, [scene]);
}

// ============================================================================
// LAYER 1: Room Fills (Below Walls)
// ============================================================================

function RoomFillsLayerComponent() {
  const viewport = useStore((state) => state.viewport);
  const selectedRoomId = useStore((state) => state.selectedRoomId);
  const setSelectedRoomId = useStore((state) => state.setSelectedRoomId);
  const setSelectedWallIds = useStore((state) => state.setSelectedWallIds);
  const [debugEnabled, setDebugEnabled] = useState(false);
  
  const roomShapes = useRoomShapes();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        setDebugEnabled((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRoomClick = (e: any, roomId: string) => {
    if (!debugEnabled) return;
    
    e.cancelBubble = true;
    
    if (selectedRoomId === roomId) {
      setSelectedRoomId(null);
    } else {
      setSelectedWallIds(new Set());
      setSelectedRoomId(roomId);
    }
  };

  if (roomShapes.length === 0) {
    return <Layer listening={false} />;
  }

  return (
    <Layer>
      {roomShapes.map((shape) => {
        const isSelected = debugEnabled && selectedRoomId === shape.roomId;
        
        const polygonScreen: number[] = [];
        for (const point of shape.polygonMm) {
          const screenPt = worldToScreen(point, viewport);
          polygonScreen.push(screenPt.x, screenPt.y);
        }
        
        return (
          <Line
            key={`fill-${shape.key}`}
            points={polygonScreen}
            closed
            fill={isSelected ? "rgba(156, 39, 176, 0.15)" : "rgba(255, 255, 255, 0.95)"}
            stroke={isSelected ? "#9c27b0" : "rgba(200, 200, 200, 0.3)"}
            strokeWidth={isSelected ? 2 : 1}
            listening={debugEnabled}
            onClick={(e) => handleRoomClick(e, shape.roomId)}
            onTap={(e) => handleRoomClick(e, shape.roomId)}
          />
        );
      })}
    </Layer>
  );
}

// ============================================================================
// LAYER 2: Room Labels (Above Walls)
// ============================================================================

function RoomLabelsLayerComponent() {
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);
  const setScene = useStore((state) => state.setScene);
  const selectedRoomId = useStore((state) => state.selectedRoomId);
  const [debugEnabled, setDebugEnabled] = useState(false);
  
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const [hoveredLabelId, setHoveredLabelId] = useState<string | null>(null);
  
  const dragStateRef = useRef<Map<string, { startPos: Vec2; lastValidPos: Vec2 }>>(new Map());
  const groupRefsRef = useRef<Map<string, any>>(new Map());
  
  const roomShapes = useRoomShapes();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        setDebugEnabled((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLabelDragStart = (e: any, roomId: string, initialPosMm: Vec2) => {
    e.cancelBubble = true;
    e.evt?.stopPropagation();
    setDraggingLabelId(roomId);
    dragStateRef.current.set(roomId, {
      startPos: initialPosMm,
      lastValidPos: initialPosMm,
    });
  };

  const handleLabelDragMove = (e: any, roomId: string, polygonMm: Vec2[]) => {
    e.cancelBubble = true;
    e.evt?.stopPropagation();
    
    const group = e.target;
    const newPosScreen = { x: group.x(), y: group.y() };
    const newPosMm = screenToWorld(newPosScreen, viewport);

    const dragState = dragStateRef.current.get(roomId);
    if (!dragState) {
      return;
    }

    const isInside = isPointInsidePolygon(newPosMm, polygonMm);

    if (!isInside) {
      const lastValidScreen = worldToScreen(dragState.lastValidPos, viewport);
      group.position({ x: lastValidScreen.x, y: lastValidScreen.y });
      return;
    }

    dragState.lastValidPos = newPosMm;
  };

  const handleLabelDragEnd = (e: any, roomId: string) => {
    e.cancelBubble = true;
    e.evt?.stopPropagation();
    
    const group = e.target;
    const finalPosScreen = { x: group.x(), y: group.y() };
    const finalPosMm = screenToWorld(finalPosScreen, viewport);

    const dragState = dragStateRef.current.get(roomId);
    if (!dragState) {
      setDraggingLabelId(null);
      return;
    }

    const validPosMm = dragState.lastValidPos;

    const updatedRooms = new Map(scene.rooms);
    const room = updatedRooms.get(roomId);
    
    if (room) {
      updatedRooms.set(roomId, {
        ...room,
        labelPositionMm: validPosMm,
      });
      
      setScene({
        ...scene,
        rooms: updatedRooms,
      });
    }

    dragStateRef.current.delete(roomId);
    setDraggingLabelId(null);
  };

  if (roomShapes.length === 0) {
    return <Layer listening={false} />;
  }

  return (
    <Layer>
      {roomShapes.map((shape) => {
        const isSelected = debugEnabled && selectedRoomId === shape.roomId;
        const isDragging = draggingLabelId === shape.roomId;
        const isHovered = hoveredLabelId === shape.roomId;
        
        const labelPositionScreen = worldToScreen(shape.labelPositionMm, viewport);
        
        return (
          <Group
            key={`label-${shape.key}`}
            ref={(node) => {
              if (node) {
                groupRefsRef.current.set(shape.roomId, node);
              }
            }}
            x={isDragging ? undefined : labelPositionScreen.x}
            y={isDragging ? undefined : labelPositionScreen.y}
            draggable={true}
            listening={true}
            onDragStart={(e) => handleLabelDragStart(e, shape.roomId, shape.labelPositionMm)}
            onDragMove={(e) => handleLabelDragMove(e, shape.roomId, shape.polygonMm)}
            onDragEnd={(e) => handleLabelDragEnd(e, shape.roomId)}
            onMouseEnter={() => setHoveredLabelId(shape.roomId)}
            onMouseLeave={() => setHoveredLabelId(null)}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              e.evt?.stopPropagation();
            }}
            onClick={(e) => {
              e.cancelBubble = true;
              e.evt?.stopPropagation();
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              e.evt?.stopPropagation();
            }}
          >
            {/* Invisible hit area for dragging */}
            <Rect
              x={-55}
              y={-22}
              width={110}
              height={44}
              fill="transparent"
              listening={true}
            />

            {/* Room number - changes to blue on hover/drag */}
            <Text
              x={-50}
              y={-18}
              text={`Room ${shape.roomNumber}`}
              fontSize={14}
              fontStyle="bold"
              fill={
                isDragging 
                  ? "#3b82f6"
                  : isHovered 
                    ? "#3b82f6"
                    : isSelected 
                      ? "#9c27b0"
                      : "#1a1a1a"
              }
              align="center"
              width={100}
              listening={false}
            />
            
            {/* Area - also changes to blue on hover/drag */}
            <Text
              x={-50}
              y={2}
              text={shape.area}
              fontSize={11}
              fill={
                isDragging 
                  ? "#60a5fa"
                  : isHovered 
                    ? "#60a5fa"
                    : isSelected 
                      ? "#7b1fa2"
                      : "#666666"
              }
              align="center"
              width={100}
              listening={false}
            />
          </Group>
        );
      })}
    </Layer>
  );
}

// ============================================================================
// Exports
// ============================================================================

export const RoomFillsLayer = memo(RoomFillsLayerComponent);
export const RoomLabelsLayer = memo(RoomLabelsLayerComponent);

// ✅ Keep old export for backward compatibility (renders fills only)
export const RoomsLayer = RoomFillsLayer;
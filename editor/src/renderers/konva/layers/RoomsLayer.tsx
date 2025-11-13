import React, { memo, useMemo, useState, useEffect } from 'react';
import { Layer, Line, Text, Group } from 'react-konva';
import { useStore } from '../../../state/store';
import { worldToScreen } from '../viewport';
import { buildHalfEdgeStructure, buildInnerRoomPolygon } from '../../../core/topology/half-edge';
import { computeRoomCentroid } from '../../../core/topology/room-detect';

function RoomsLayerComponent() {
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);
  const selectedRoomId = useStore((state) => state.selectedRoomId); // ✅ NEW: Get current selection
  const setSelectedRoomId = useStore((state) => state.setSelectedRoomId);
  const setSelectedWallIds = useStore((state) => state.setSelectedWallIds);
  const [debugEnabled, setDebugEnabled] = useState(false);

  // ✅ Listen for debug toggle
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

  const roomShapes = useMemo(() => {
    const shapes: Array<{
      key: string;
      roomId: string;
      polygon: number[]; // Screen coordinates
      polygonMm: { x: number; y: number }[]; // Store world coords for hit testing
      centroid: { x: number; y: number }; // Screen coordinates
      roomNumber: number;
      area: string;
    }> = [];

    const halfEdges = buildHalfEdgeStructure(scene);

    for (const room of scene.rooms.values()) {
      const innerPolygonMm = buildInnerRoomPolygon(room.halfEdges, halfEdges, scene);

      if (innerPolygonMm.length < 3) {
        console.warn(`Room ${room.id} has invalid polygon (${innerPolygonMm.length} points)`);
        continue;
      }

      // Convert to screen coordinates
      const polygonScreen: number[] = [];
      for (const point of innerPolygonMm) {
        const screenPt = worldToScreen(point, viewport);
        polygonScreen.push(screenPt.x, screenPt.y);
      }

      // Compute centroid for label
      const centroidMm = computeRoomCentroid(room, scene);
      const centroidScreen = worldToScreen(centroidMm, viewport);

      // Format area for display
      const areaSqM = room.areaMm2 / 1_000_000;
      const areaText = areaSqM < 1 
        ? `${(areaSqM * 10000).toFixed(0)} cm²`
        : `${areaSqM.toFixed(2)} m²`;

      shapes.push({
        key: room.id,
        roomId: room.id,
        polygon: polygonScreen,
        polygonMm: innerPolygonMm,
        centroid: centroidScreen,
        roomNumber: room.roomNumber,
        area: areaText,
      });
    }

    return shapes;
  }, [viewport, scene]);

  // ✅ Handle room click in debug mode (toggle selection)
  const handleRoomClick = (e: any, roomId: string) => {
    if (!debugEnabled) return;
    
    e.cancelBubble = true; // Prevent event propagation
    
    // Toggle: if already selected, deselect; otherwise select
    if (selectedRoomId === roomId) {
      setSelectedRoomId(null);
    } else {
      // Clear wall selection and select this room
      setSelectedWallIds(new Set());
      setSelectedRoomId(roomId);
    }
  };

  if (roomShapes.length === 0) {
    return <Layer listening={false} />;
  }

  return (
    <Layer listening={debugEnabled}>
      {roomShapes.map((shape) => {
        // ✅ Highlight selected room in debug mode
        const isSelected = debugEnabled && selectedRoomId === shape.roomId;
        
        return (
          <React.Fragment key={shape.key}>
            {/* Room fill polygon */}
            <Line
              points={shape.polygon}
              closed
              fill={isSelected ? "rgba(156, 39, 176, 0.15)" : "rgba(255, 255, 255, 0.95)"}
              stroke={isSelected ? "#9c27b0" : "rgba(200, 200, 200, 0.3)"}
              strokeWidth={isSelected ? 2 : 1}
              listening={debugEnabled} // Make clickable in debug mode
              onClick={(e) => handleRoomClick(e, shape.roomId)}
              onTap={(e) => handleRoomClick(e, shape.roomId)}
            />

            {/* Room label group */}
            <Group x={shape.centroid.x} y={shape.centroid.y} listening={false}>
              {/* Room number */}
              <Text
                x={-50}
                y={-20}
                text={`Room ${shape.roomNumber}`}
                fontSize={16}
                fontStyle="bold"
                fill={isSelected ? "#9c27b0" : "#333333"}
                align="center"
                width={100}
                listening={false}
              />
              
              {/* Area */}
              <Text
                x={-50}
                y={0}
                text={shape.area}
                fontSize={12}
                fill={isSelected ? "#9c27b0" : "#666666"}
                align="center"
                width={100}
                listening={false}
              />
            </Group>
          </React.Fragment>
        );
      })}
    </Layer>
  );
}

export const RoomsLayer = memo(RoomsLayerComponent);
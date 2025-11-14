import React, { memo, useMemo } from 'react';
import { Layer, Line, Circle } from 'react-konva';
import { useStore } from '../../../state/store';
import { useSettings } from '../../../state/settings';
import { worldToScreen } from '../viewport';
import { NODE_RADIUS_MM } from '../../../core/constants';
import { buildWallPolygon } from '../../../core/geometry/miter';
import * as vec from '../../../core/math/vec';

function WallsLayerComponent() {
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);
  const selectedWallIds = useStore((state) => state.selectedWallIds);
  const hoveredWallId = useStore((state) => state.hoveredWallId);
  const useBlackWalls = useSettings((state) => state.useBlackWalls);

  const wallShapes = useMemo(() => {
    const shapes: Array<{
      key: string;
      polygon: number[];
      centerline: number[];
      nodeA: { x: number; y: number };
      nodeB: { x: number; y: number };
      isSelected: boolean;
      isHovered: boolean;
      showNodes: boolean;
    }> = [];

    const nodeRadiusPx = NODE_RADIUS_MM * viewport.scale;

    // ✅ Only show nodes when walls are selected (not on hover)
    const showNodesGlobally = selectedWallIds.size > 0;

    for (const wall of scene.walls.values()) {
      const nodeA = scene.nodes.get(wall.nodeAId);
      const nodeB = scene.nodes.get(wall.nodeBId);

      if (!nodeA || !nodeB) continue;

      // Use mitering to compute wall polygon
      const polygonMm = buildWallPolygon(wall, scene);
      
      // Convert polygon to screen coordinates
      const polygon: number[] = [];
      for (const point of polygonMm) {
        const screenPt = worldToScreen(point, viewport);
        polygon.push(screenPt.x, screenPt.y);
      }

      // Centerline (for visual reference)
      const a = worldToScreen(nodeA, viewport);
      const b = worldToScreen(nodeB, viewport);
      const centerline = [a.x, a.y, b.x, b.y];

      const isSelected = selectedWallIds.has(wall.id);
      const isHovered = hoveredWallId === wall.id;

      // ✅ Show nodes only when this wall is selected OR when any wall is selected (for dragging)
      const showNodes = isSelected || showNodesGlobally;

      shapes.push({
        key: wall.id,
        polygon,
        centerline,
        nodeA: a,
        nodeB: b,
        isSelected,
        isHovered,
        showNodes,
      });
    }

    return { shapes, nodeRadiusPx };
  }, [viewport, scene, selectedWallIds, hoveredWallId]);

  return (
    <Layer>
      {wallShapes.shapes.map((shape) => (
        <React.Fragment key={shape.key}>
          {/* Wall polygon with mitered corners */}
          <Line
            points={shape.polygon}
            closed
            fill={
              useBlackWalls 
                ? '#000000'
                : shape.isSelected 
                  ? '#dbeafe'
                  : shape.isHovered 
                    ? '#eff6ff'
                    : '#f3f4f6'
            }
            stroke={
              // Selection/hover ALWAYS shows blue, even in black walls mode
              shape.isSelected 
                ? '#2563eb'
                : shape.isHovered 
                  ? '#3b82f6'
                  : useBlackWalls
                    ? '#000000'
                    : '#333333'
            }
            strokeWidth={shape.isSelected ? 2 : shape.isHovered ? 2 : 1}
            listening={false}
          />
          
          {/* Centerline */}
          <Line
            points={shape.centerline}
            stroke={
              shape.isSelected
                ? '#2563eb'  // Blue when selected
                : useBlackWalls 
                  ? '#000000' 
                  : '#666666'
            }
            strokeWidth={1}
            dash={[5, 5]}
            listening={false}
          />
          
          {/* Node circles - only visible when a wall is selected */}
          {shape.showNodes && (
            <>
              <Circle
                x={shape.nodeA.x}
                y={shape.nodeA.y}
                radius={wallShapes.nodeRadiusPx}
                fill={
                  // ✅ In black walls mode: always transparent (hollow)
                  useBlackWalls
                    ? 'transparent'
                    : shape.isSelected
                      ? '#2563eb'
                      : '#3b82f6'
                }
                stroke={
                  // ✅ In black walls mode: always white
                  useBlackWalls 
                    ? '#ffffff'
                    : shape.isSelected
                      ? '#1e40af'
                      : '#2563eb'
                }
                strokeWidth={useBlackWalls ? 2 : 1}
                listening={false}
              />
              <Circle
                x={shape.nodeB.x}
                y={shape.nodeB.y}
                radius={wallShapes.nodeRadiusPx}
                fill={
                  // ✅ In black walls mode: always transparent (hollow)
                  useBlackWalls
                    ? 'transparent'
                    : shape.isSelected
                      ? '#2563eb'
                      : '#3b82f6'
                }
                stroke={
                  // ✅ In black walls mode: always white
                  useBlackWalls 
                    ? '#ffffff'
                    : shape.isSelected
                      ? '#1e40af'
                      : '#2563eb'
                }
                strokeWidth={useBlackWalls ? 2 : 1}
                listening={false}
              />
            </>
          )}
        </React.Fragment>
      ))}
    </Layer>
  );
}

export const WallsLayer = memo(WallsLayerComponent);
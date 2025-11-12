import React from 'react';
import { Layer, Line, Circle, Text, Group, Rect } from 'react-konva';
import { memo, useState, useEffect } from 'react';
import { useStore } from '../../state/store';
import { worldToScreen, screenToWorld } from '../../renderers/konva/viewport';
import { buildWallPolygon } from '../../core/geometry/miter';
import type { Vec2 } from '../../core/math/vec';
import * as vec from '../../core/math/vec';

interface Ray {
  origin: Vec2;
  direction: Vec2;
  label: string;
  color: string;
}

function RayVisualizationComponent() {
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);
  const selectedWallIds = useStore((state) => state.selectedWallIds);
  const [hoveredRay, setHoveredRay] = useState<Ray | null>(null);
  const [hoveredVertex, setHoveredVertex] = useState<{ index: number; point: Vec2; wallId: string } | null>(null);
  const [cursorPx, setCursorPx] = useState<Vec2 | null>(null);

  // Track cursor for ray hover detection
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPx({ x: e.clientX, y: e.clientY - 48 }); // Subtract header height
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const selectedWallId = selectedWallIds.size === 1 ? Array.from(selectedWallIds)[0] : null;
  const selectedWall = selectedWallId ? scene.walls.get(selectedWallId) : null;

  if (!selectedWall) return <Layer listening={false} />;

  const nodeA = scene.nodes.get(selectedWall.nodeAId);
  const nodeB = scene.nodes.get(selectedWall.nodeBId);

  if (!nodeA || !nodeB) return <Layer listening={false} />;

  // Helper to format IDs
  const formatWallId = (id: string): string => id.slice(-5);
  const formatNodeId = (id: string): string => id.slice(-8);

  // Compute rays for selected wall
  const dirAB = vec.normalize(vec.sub(nodeB, nodeA));
  const leftOfAB = { x: -dirAB.y, y: dirAB.x }; // perpCCW
  const halfThickness = selectedWall.thicknessMm / 2;

  const rays: Ray[] = [
    {
      origin: vec.add(nodeA, vec.scale(leftOfAB, halfThickness)),
      direction: dirAB,
      label: 'A Left Ray',
      color: '#00ff00',
    },
    {
      origin: vec.sub(nodeA, vec.scale(leftOfAB, halfThickness)),
      direction: dirAB,
      label: 'A Right Ray',
      color: '#ff0000',
    },
    {
      origin: vec.add(nodeB, vec.scale(leftOfAB, halfThickness)),
      direction: vec.scale(dirAB, -1),
      label: 'B Left Ray',
      color: '#00ffff',
    },
    {
      origin: vec.sub(nodeB, vec.scale(leftOfAB, halfThickness)),
      direction: vec.scale(dirAB, -1),
      label: 'B Right Ray',
      color: '#ff00ff',
    },
  ];

  // Get mitered polygon vertices
  const polygonMm = buildWallPolygon(selectedWall, scene);

  // Check which ray or vertex is being hovered
  let newHoveredRay: Ray | null = null;
  let newHoveredVertex: { index: number; point: Vec2; wallId: string } | null = null;
  
  if (cursorPx) {
    const cursorMm = screenToWorld(cursorPx, viewport);
    const hoverRadius = 20 / viewport.scale; // 20px in world units

    // Check vertices first (higher priority)
    for (let i = 0; i < polygonMm.length; i++) {
      const dist = vec.distance(cursorMm, polygonMm[i]);
      if (dist < hoverRadius) {
        newHoveredVertex = { 
          index: i, 
          point: polygonMm[i],
          wallId: selectedWallId,
        };
        break;
      }
    }

    // If no vertex hovered, check rays
    if (!newHoveredVertex) {
      for (const ray of rays) {
        const dist = vec.distance(cursorMm, ray.origin);
        if (dist < hoverRadius) {
          newHoveredRay = ray;
          break;
        }
      }
    }
  }

  // Update hovered state (avoid unnecessary re-renders)
  if (newHoveredRay?.label !== hoveredRay?.label) {
    setHoveredRay(newHoveredRay);
  }
  if (newHoveredVertex?.index !== hoveredVertex?.index) {
    setHoveredVertex(newHoveredVertex);
  }

  // Render rays
  const rayLength = 2000; // mm, extend rays far for visualization

  // Vertex semantic labels
  const getVertexLabel = (index: number, totalVertices: number): string => {
    // Standard 6-vertex wall: A_left, A_apex, A_right, B_right, B_apex, B_left
    // Standard 4-vertex wall: A_left, A_right, B_right, B_left
    
    if (totalVertices === 6) {
      const labels = ['A_left', 'A_apex', 'A_right', 'B_right', 'B_apex', 'B_left'];
      return labels[index] || `Vertex ${index + 1}`;
    } else if (totalVertices === 4) {
      const labels = ['A_left', 'A_right', 'B_right', 'B_left'];
      return labels[index] || `Vertex ${index + 1}`;
    } else if (totalVertices === 5) {
      // Could be missing one apex
      const labels = ['A_left', 'A_right/apex?', 'B_right', 'B_apex?', 'B_left'];
      return labels[index] || `Vertex ${index + 1}`;
    }
    
    return `Vertex ${index + 1}`;
  };

  return (
    <Layer listening={false}>
      {/* Draw rays */}
      {rays.map((ray, index) => {
        const originScreen = worldToScreen(ray.origin, viewport);
        const endPoint = vec.add(ray.origin, vec.scale(ray.direction, rayLength));
        const endScreen = worldToScreen(endPoint, viewport);

        const isHovered = hoveredRay?.label === ray.label;

        return (
          <React.Fragment key={`ray-${index}`}>
            {/* Ray line */}
            <Line
              points={[originScreen.x, originScreen.y, endScreen.x, endScreen.y]}
              stroke={ray.color}
              strokeWidth={isHovered ? 3 : 1.5}
              dash={[10, 5]}
              opacity={isHovered ? 1 : 0.6}
              listening={false}
            />

            {/* Ray origin circle */}
            <Circle
              x={originScreen.x}
              y={originScreen.y}
              radius={isHovered ? 8 : 5}
              fill={ray.color}
              stroke="#ffffff"
              strokeWidth={isHovered ? 2 : 1}
              listening={false}
            />

            {/* Ray label (if hovered) */}
            {isHovered && (
              <Group x={originScreen.x + 15} y={originScreen.y - 45}>
                {/* Background for better readability */}
                <Rect
                  x={-5}
                  y={-5}
                  width={200}
                  height={50}
                  fill="rgba(0, 0, 0, 0.85)"
                  cornerRadius={4}
                  listening={false}
                />
                <Text
                  x={0}
                  y={0}
                  text={ray.label}
                  fontSize={13}
                  fontStyle="bold"
                  fill="#ffffff"
                  listening={false}
                />
                <Text
                  x={0}
                  y={18}
                  text={`Origin: (${ray.origin.x.toFixed(1)}, ${ray.origin.y.toFixed(1)}) mm`}
                  fontSize={11}
                  fill="#cccccc"
                  listening={false}
                />
                <Text
                  x={0}
                  y={33}
                  text={`Dir: (${ray.direction.x.toFixed(3)}, ${ray.direction.y.toFixed(3)})`}
                  fontSize={11}
                  fill="#cccccc"
                  listening={false}
                />
              </Group>
            )}
          </React.Fragment>
        );
      })}

      {/* Draw polygon vertices */}
      {polygonMm.map((vertex, index) => {
        const screenPos = worldToScreen(vertex, viewport);
        const isHovered = hoveredVertex?.index === index;
        const vertexLabel = getVertexLabel(index, polygonMm.length);

        return (
          <React.Fragment key={`vertex-${index}`}>
            {/* Vertex circle */}
            <Circle
              x={screenPos.x}
              y={screenPos.y}
              radius={isHovered ? 10 : 6}
              fill="#ff9800"
              stroke="#ffffff"
              strokeWidth={2}
              listening={false}
            />

            {/* Vertex label (always show but small) */}
            <Text
              x={screenPos.x + 8}
              y={screenPos.y - 6}
              text={`${index + 1}`}
              fontSize={10}
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={2}
              listening={false}
            />

            {/* Detailed info on hover */}
            {isHovered && (
              <Group x={screenPos.x + 15} y={screenPos.y - 70}>
                <Rect
                  x={-5}
                  y={-5}
                  width={250}
                  height={90}
                  fill="rgba(0, 0, 0, 0.9)"
                  cornerRadius={4}
                  listening={false}
                />
                
                {/* Wall identification */}
                <Text
                  x={0}
                  y={0}
                  text={`Wall: ${formatWallId(selectedWallId)}`}
                  fontSize={12}
                  fontStyle="bold"
                  fill="#fbbf24"
                  listening={false}
                />
                
                {/* Vertex info */}
                <Text
                  x={0}
                  y={18}
                  text={`Vertex ${index + 1}/${polygonMm.length}: ${vertexLabel}`}
                  fontSize={12}
                  fontStyle="bold"
                  fill="#ff9800"
                  listening={false}
                />
                
                {/* Position */}
                <Text
                  x={0}
                  y={36}
                  text={`Position: (${vertex.x.toFixed(1)}, ${vertex.y.toFixed(1)}) mm`}
                  fontSize={11}
                  fill="#cccccc"
                  listening={false}
                />
                
                {/* Node info */}
                <Text
                  x={0}
                  y={54}
                  text={`Node A: ${formatNodeId(nodeA.id)}`}
                  fontSize={10}
                  fill="#888888"
                  listening={false}
                />
                <Text
                  x={0}
                  y={69}
                  text={`Node B: ${formatNodeId(nodeB.id)}`}
                  fontSize={10}
                  fill="#888888"
                  listening={false}
                />
              </Group>
            )}
          </React.Fragment>
        );
      })}

      {/* Draw polygon edges with labels */}
      {polygonMm.map((vertex, index) => {
        const nextVertex = polygonMm[(index + 1) % polygonMm.length];
        const start = worldToScreen(vertex, viewport);
        const end = worldToScreen(nextVertex, viewport);

        return (
          <Line
            key={`edge-${index}`}
            points={[start.x, start.y, end.x, end.y]}
            stroke="#ff9800"
            strokeWidth={2}
            opacity={0.7}
            listening={false}
          />
        );
      })}
    </Layer>
  );
}

export const RayVisualization = memo(RayVisualizationComponent);
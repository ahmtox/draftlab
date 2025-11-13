import React, { memo } from 'react';
import { Layer, Line, Circle, Text, Group, Arrow } from 'react-konva';
import { useStore } from '../../../state/store';
import { worldToScreen } from '../viewport';
import { buildWallPolygon } from '../../../core/geometry/miter';
import type { MeasureToolContext } from '../../../tools/measure.tool';

interface MeasureLayerProps {
  measureContext: MeasureToolContext | null;
}

function MeasureLayerComponent({ measureContext }: MeasureLayerProps) {
  const viewport = useStore((state) => state.viewport);
  const scene = useStore((state) => state.scene);

  if (!measureContext) return <Layer listening={false} />;

  const { measurement, hoverTarget, previewStartMm, previewEndMm, state, firstSelection } = measureContext;

  return (
    <Layer listening={false}>
      {/* First selection highlight (for edge-to-edge or centerline) */}
      {state === 'idle' && firstSelection && measurement?.edge1 && (
        <>
          {(() => {
            const edge1 = measurement.edge1;
            const startScreen = worldToScreen(edge1.startMm, viewport);
            const endScreen = worldToScreen(edge1.endMm, viewport);
            const midX = (startScreen.x + endScreen.x) / 2;
            const midY = (startScreen.y + endScreen.y) / 2;
            
            const isCenterline = edge1.isCenterline;
            
            return (
              <Group>
                {/* Highlight edge 1 */}
                <Line
                  points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                  stroke="#3b82f6"
                  strokeWidth={5}
                  dash={isCenterline ? [10, 5] : undefined}
                  listening={false}
                />
                
                {/* Edge 1 measurement label */}
                <Group x={midX - 60} y={midY - 45}>
                  <Text
                    x={0}
                    y={0}
                    text={`${isCenterline ? 'Centerline' : 'Edge'} 1: ${edge1.lengthMm.toFixed(1)} mm`}
                    fontSize={14}
                    fontStyle="bold"
                    fill="#ffffff"
                    padding={6}
                    align="center"
                    width={120}
                  />
                  <Text
                    x={0}
                    y={0}
                    text={`${isCenterline ? 'Centerline' : 'Edge'} 1: ${edge1.lengthMm.toFixed(1)} mm`}
                    fontSize={14}
                    fontStyle="bold"
                    fill="#3b82f6"
                    padding={6}
                    align="center"
                    width={120}
                  />
                </Group>
              </Group>
            );
          })()}
        </>
      )}

      {/* Hover highlight */}
      {state === 'idle' && hoverTarget && !firstSelection && (
        <>
          {hoverTarget.type === 'node' && (() => {
            const node = scene.nodes.get(hoverTarget.id);
            if (!node) return null;
            const screenPos = worldToScreen(node, viewport);
            return (
              <Circle
                x={screenPos.x}
                y={screenPos.y}
                radius={8}
                stroke="#fbbf24"
                strokeWidth={2}
                fill="transparent"
              />
            );
          })()}
          
          {hoverTarget.type === 'wall' && (() => {
            const wall = scene.walls.get(hoverTarget.id);
            if (!wall) return null;
            const nodeA = scene.nodes.get(wall.nodeAId);
            const nodeB = scene.nodes.get(wall.nodeBId);
            if (!nodeA || !nodeB) return null;
            
            const startScreen = worldToScreen(nodeA, viewport);
            const endScreen = worldToScreen(nodeB, viewport);
            
            return (
              <Line
                points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                stroke="#fbbf24"
                strokeWidth={3}
                dash={[8, 4]}
              />
            );
          })()}

          {hoverTarget.type === 'edge' && hoverTarget.edgeIndex !== undefined && (() => {
            const wall = scene.walls.get(hoverTarget.id);
            if (!wall) return null;
            
            const polygon = buildWallPolygon(wall, scene);
            const startVertex = polygon[hoverTarget.edgeIndex];
            const endVertex = polygon[(hoverTarget.edgeIndex + 1) % polygon.length];
            
            const startScreen = worldToScreen(startVertex, viewport);
            const endScreen = worldToScreen(endVertex, viewport);
            
            return (
              <Line
                points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                stroke="#fbbf24"
                strokeWidth={4}
                listening={false}
              />
            );
          })()}
        </>
      )}

      {/* Second target hover (when first is selected) */}
      {state === 'idle' && firstSelection && hoverTarget && (
        <>
          {hoverTarget.type === 'wall' && (() => {
            const wall = scene.walls.get(hoverTarget.id);
            if (!wall) return null;
            const nodeA = scene.nodes.get(wall.nodeAId);
            const nodeB = scene.nodes.get(wall.nodeBId);
            if (!nodeA || !nodeB) return null;
            
            const startScreen = worldToScreen(nodeA, viewport);
            const endScreen = worldToScreen(nodeB, viewport);
            
            return (
              <Line
                points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                stroke="#fbbf24"
                strokeWidth={4}
                dash={[8, 4]}
                listening={false}
              />
            );
          })()}

          {hoverTarget.type === 'edge' && hoverTarget.edgeIndex !== undefined && (() => {
            const wall = scene.walls.get(hoverTarget.id);
            if (!wall) return null;
            
            const polygon = buildWallPolygon(wall, scene);
            const startVertex = polygon[hoverTarget.edgeIndex];
            const endVertex = polygon[(hoverTarget.edgeIndex + 1) % polygon.length];
            
            const startScreen = worldToScreen(startVertex, viewport);
            const endScreen = worldToScreen(endVertex, viewport);
            
            return (
              <Line
                points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                stroke="#fbbf24"
                strokeWidth={4}
                listening={false}
              />
            );
          })()}

          {hoverTarget.type === 'node' && (() => {
            const node = scene.nodes.get(hoverTarget.id);
            if (!node) return null;
            const screenPos = worldToScreen(node, viewport);
            return (
              <Circle
                x={screenPos.x}
                y={screenPos.y}
                radius={8}
                stroke="#fbbf24"
                strokeWidth={2}
                fill="transparent"
              />
            );
          })()}
        </>
      )}

      {/* Preview line during measuring (node-to-node) */}
      {(state === 'measuring' || state === 'click-pending') && previewStartMm && previewEndMm && (
        <>
          {(() => {
            const startScreen = worldToScreen(previewStartMm, viewport);
            const endScreen = worldToScreen(previewEndMm, viewport);
            const lengthMm = Math.sqrt(
              (previewEndMm.x - previewStartMm.x) ** 2 +
              (previewEndMm.y - previewStartMm.y) ** 2
            );

            const midX = (startScreen.x + endScreen.x) / 2;
            const midY = (startScreen.y + endScreen.y) / 2;

            return (
              <Group>
                <Line
                  points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dash={[5, 5]}
                  listening={false}
                />

                <Arrow
                  points={[startScreen.x - 20, startScreen.y, startScreen.x, startScreen.y]}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="#3b82f6"
                  pointerLength={8}
                  pointerWidth={8}
                />

                <Arrow
                  points={[endScreen.x + 20, endScreen.y, endScreen.x, endScreen.y]}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="#3b82f6"
                  pointerLength={8}
                  pointerWidth={8}
                />
                
                <Text
                  x={midX - 40}
                  y={midY - 25}
                  text={`${lengthMm.toFixed(0)} mm`}
                  fontSize={14}
                  fontStyle="bold"
                  fill="#1e40af"
                  padding={4}
                  align="center"
                />
              </Group>
            );
          })()}
        </>
      )}

      {/* Completed measurement */}
      {state === 'complete' && measurement && (
        <>
          {(() => {
            // Render edge 1
            const renderEdge1 = measurement.edge1 && (
              <Group key="edge1">
                {(() => {
                  const edge = measurement.edge1!;
                  const startScreen = worldToScreen(edge.startMm, viewport);
                  const endScreen = worldToScreen(edge.endMm, viewport);
                  const midX = (startScreen.x + endScreen.x) / 2;
                  const midY = (startScreen.y + endScreen.y) / 2;
                  
                  return (
                    <>
                      <Line
                        points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                        stroke="#3b82f6"
                        strokeWidth={5}
                        dash={edge.isCenterline ? [10, 5] : undefined}
                        listening={false}
                      />
                      <Group x={midX - 60} y={midY - 45}>
                        <Text
                          x={0}
                          y={0}
                          text={`${edge.isCenterline ? 'CL' : 'Edge'} 1: ${edge.lengthMm.toFixed(1)} mm`}
                          fontSize={14}
                          fontStyle="bold"
                          fill="#ffffff"
                          padding={6}
                          align="center"
                          width={120}
                        />
                        <Text
                          x={0}
                          y={0}
                          text={`${edge.isCenterline ? 'CL' : 'Edge'} 1: ${edge.lengthMm.toFixed(1)} mm`}
                          fontSize={14}
                          fontStyle="bold"
                          fill="#3b82f6"
                          padding={6}
                          align="center"
                          width={120}
                        />
                      </Group>
                    </>
                  );
                })()}
              </Group>
            );

            // Render edge 2
            const renderEdge2 = measurement.edge2 && (
              <Group key="edge2">
                {(() => {
                  const edge = measurement.edge2!;
                  const startScreen = worldToScreen(edge.startMm, viewport);
                  const endScreen = worldToScreen(edge.endMm, viewport);
                  const midX = (startScreen.x + endScreen.x) / 2;
                  const midY = (startScreen.y + endScreen.y) / 2;
                  
                  return (
                    <>
                      <Line
                        points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                        stroke="#10b981"
                        strokeWidth={5}
                        dash={edge.isCenterline ? [10, 5] : undefined}
                        listening={false}
                      />
                      <Group x={midX - 60} y={midY - 45}>
                        <Text
                          x={0}
                          y={0}
                          text={`${edge.isCenterline ? 'CL' : 'Edge'} 2: ${edge.lengthMm.toFixed(1)} mm`}
                          fontSize={14}
                          fontStyle="bold"
                          fill="#ffffff"
                          padding={6}
                          align="center"
                          width={120}
                        />
                        <Text
                          x={0}
                          y={0}
                          text={`${edge.isCenterline ? 'CL' : 'Edge'} 2: ${edge.lengthMm.toFixed(1)} mm`}
                          fontSize={14}
                          fontStyle="bold"
                          fill="#10b981"
                          padding={6}
                          align="center"
                          width={120}
                        />
                      </Group>
                    </>
                  );
                })()}
              </Group>
            );

            // Sort measurement lines by length (render longer ones first so shorter are on top)
            const measurementLines: Array<{ key: string; length: number; render: () => JSX.Element }> = [];

            // ✅ Only render min/max horizontal and vertical distances (no perpendicular line)
            if (measurement.minHorizontal) {
              measurementLines.push({
                key: 'min-h',
                length: measurement.minHorizontal.lengthMm,
                render: () => {
                  const dist = measurement.minHorizontal!;
                  const startScreen = worldToScreen(dist.startMm, viewport);
                  const endScreen = worldToScreen(dist.endMm, viewport);
                  const midX = (startScreen.x + endScreen.x) / 2;
                  const midY = startScreen.y - 30;
                  
                  return (
                    <Group key="min-h">
                      <Line
                        points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dash={[10, 5]}
                        listening={false}
                      />
                      <Circle x={startScreen.x} y={startScreen.y} radius={4} fill="#8b5cf6" />
                      <Circle x={endScreen.x} y={endScreen.y} radius={4} fill="#8b5cf6" />
                      <Text
                        x={midX - 50}
                        y={midY}
                        text={`Min H: ${dist.lengthMm.toFixed(1)} mm`}
                        fontSize={12}
                        fontStyle="bold"
                        fill="#8b5cf6"
                        align="center"
                        width={100}
                      />
                    </Group>
                  );
                }
              });
            }

            if (measurement.maxHorizontal) {
              measurementLines.push({
                key: 'max-h',
                length: measurement.maxHorizontal.lengthMm,
                render: () => {
                  const dist = measurement.maxHorizontal!;
                  const startScreen = worldToScreen(dist.startMm, viewport);
                  const endScreen = worldToScreen(dist.endMm, viewport);
                  const midX = (startScreen.x + endScreen.x) / 2;
                  const midY = startScreen.y + 30;
                  
                  return (
                    <Group key="max-h">
                      <Line
                        points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dash={[10, 5]}
                        listening={false}
                      />
                      <Circle x={startScreen.x} y={startScreen.y} radius={4} fill="#f59e0b" />
                      <Circle x={endScreen.x} y={endScreen.y} radius={4} fill="#f59e0b" />
                      <Text
                        x={midX - 50}
                        y={midY}
                        text={`Max H: ${dist.lengthMm.toFixed(1)} mm`}
                        fontSize={12}
                        fontStyle="bold"
                        fill="#f59e0b"
                        align="center"
                        width={100}
                      />
                    </Group>
                  );
                }
              });
            }

            if (measurement.minVertical) {
              measurementLines.push({
                key: 'min-v',
                length: measurement.minVertical.lengthMm,
                render: () => {
                  const dist = measurement.minVertical!;
                  const startScreen = worldToScreen(dist.startMm, viewport);
                  const endScreen = worldToScreen(dist.endMm, viewport);
                  const midX = startScreen.x + 30;
                  const midY = (startScreen.y + endScreen.y) / 2;
                  
                  return (
                    <Group key="min-v">
                      <Line
                        points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                        stroke="#ec4899"
                        strokeWidth={2}
                        dash={[10, 5]}
                        listening={false}
                      />
                      <Circle x={startScreen.x} y={startScreen.y} radius={4} fill="#ec4899" />
                      <Circle x={endScreen.x} y={endScreen.y} radius={4} fill="#ec4899" />
                      <Text
                        x={midX}
                        y={midY - 10}
                        text={`Min V: ${dist.lengthMm.toFixed(1)} mm`}
                        fontSize={12}
                        fontStyle="bold"
                        fill="#ec4899"
                        align="left"
                        width={100}
                      />
                    </Group>
                  );
                }
              });
            }

            if (measurement.maxVertical) {
              measurementLines.push({
                key: 'max-v',
                length: measurement.maxVertical.lengthMm,
                render: () => {
                  const dist = measurement.maxVertical!;
                  const startScreen = worldToScreen(dist.startMm, viewport);
                  const endScreen = worldToScreen(dist.endMm, viewport);
                  const midX = startScreen.x - 110;
                  const midY = (startScreen.y + endScreen.y) / 2;
                  
                  return (
                    <Group key="max-v">
                      <Line
                        points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                        stroke="#14b8a6"
                        strokeWidth={2}
                        dash={[10, 5]}
                        listening={false}
                      />
                      <Circle x={startScreen.x} y={startScreen.y} radius={4} fill="#14b8a6" />
                      <Circle x={endScreen.x} y={endScreen.y} radius={4} fill="#14b8a6" />
                      <Text
                        x={midX}
                        y={midY - 10}
                        text={`Max V: ${dist.lengthMm.toFixed(1)} mm`}
                        fontSize={12}
                        fontStyle="bold"
                        fill="#14b8a6"
                        align="left"
                        width={100}
                      />
                    </Group>
                  );
                }
              });
            }

            // Sort by length descending (longer lines first = rendered first = appear behind)
            measurementLines.sort((a, b) => b.length - a.length);

            // For single measurements (no edge2), render simple version
            if (!measurement.edge2) {
              const startScreen = worldToScreen(measurement.startMm, viewport);
              const endScreen = worldToScreen(measurement.endMm, viewport);
              const midX = (startScreen.x + endScreen.x) / 2;
              const midY = (startScreen.y + endScreen.y) / 2;

              return (
                <Group>
                  <Line
                    points={[startScreen.x, startScreen.y, endScreen.x, endScreen.y]}
                    stroke="#10b981"
                    strokeWidth={4}
                    listening={false}
                  />
                  
                  <Arrow
                    points={[startScreen.x - 20, startScreen.y, startScreen.x, startScreen.y]}
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="#10b981"
                    pointerLength={10}
                    pointerWidth={10}
                  />

                  <Arrow
                    points={[endScreen.x + 20, endScreen.y, endScreen.x, endScreen.y]}
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="#10b981"
                    pointerLength={10}
                    pointerWidth={10}
                  />
                  
                  <Circle
                    x={startScreen.x}
                    y={startScreen.y}
                    radius={5}
                    fill="#10b981"
                  />
                  
                  <Circle
                    x={endScreen.x}
                    y={endScreen.y}
                    radius={5}
                    fill="#10b981"
                  />
                  
                  <Group x={midX - 60} y={midY - 35}>
                    <Text
                      x={0}
                      y={0}
                      text={`${measurement.lengthMm.toFixed(1)} mm`}
                      fontSize={16}
                      fontStyle="bold"
                      fill="#ffffff"
                      padding={8}
                      align="center"
                      width={120}
                    />
                    
                    <Text
                      x={0}
                      y={0}
                      text={`${measurement.lengthMm.toFixed(1)} mm`}
                      fontSize={16}
                      fontStyle="bold"
                      fill="#059669"
                      padding={8}
                      align="center"
                      width={120}
                    />
                    
                    <Text
                      x={0}
                      y={28}
                      text={getMeasurementTypeLabel(measurement.type)}
                      fontSize={11}
                      fill="#6b7280"
                      align="center"
                      width={120}
                    />
                  </Group>
                </Group>
              );
            }

            // Render all components for edge-to-edge measurements (edges first, then measurements sorted by length)
            return (
              <>
                {renderEdge1}
                {renderEdge2}
                {measurementLines.map(line => line.render())}
              </>
            );
          })()}
        </>
      )}
    </Layer>
  );
}

function getMeasurementTypeLabel(type: string): string {
  switch (type) {
    case 'node-to-node': return 'Node to Node';
    case 'wall-centerline': return 'Wall Centerline';
    case 'wall-edge': return 'Wall Edge';
    case 'parallel-distance': return 'Parallel Distance';
    case 'closest-distance': return 'Non-Parallel';
    case 'farthest-distance': return 'Farthest Distance';
    case 'collinear-distance': return 'Collinear';
    case 'point-to-line': return 'Point to Line';
    default: return '';
  }
}

export const MeasureLayer = memo(MeasureLayerComponent);
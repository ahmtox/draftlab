import { Stage as KonvaStage } from 'react-konva';
import { useCallback, useRef, useEffect, useState } from 'react';
import { GridLayer } from './layers/GridLayer';
import { WallsLayer } from './layers/WallsLayer';
import { PreviewLayer } from './layers/PreviewLayer';
import { GuidesLayer } from './layers/GuidesLayer';
import { useStore } from '../../state/store';
import { MIN_ZOOM_SCALE, MAX_ZOOM_SCALE, MIN_WALL_LENGTH_MM } from '../../core/constants';
import { screenToWorld } from './viewport';
import { findSnapCandidate, type SnapCandidate } from '../../core/geometry/snapping';
import * as vec from '../../core/math/vec';
import type { Vec2 } from '../../core/math/vec';

type WallToolState = 'idle' | 'first-point' | 'dragging';

export function Stage() {
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);
  const activeTool = useStore((state) => state.activeTool);
  const wallParams = useStore((state) => state.wallParams);
  const scene = useStore((state) => state.scene);
  const setScene = useStore((state) => state.setScene);
  
  const rafIdRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 48, // header height
  });

  // Wall tool state
  const [wallToolState, setWallToolState] = useState<WallToolState>('idle');
  const [firstPointMm, setFirstPointMm] = useState<Vec2 | null>(null);
  const [currentPointMm, setCurrentPointMm] = useState<Vec2 | null>(null);
  const [hoverPointMm, setHoverPointMm] = useState<Vec2 | null>(null); // Hover indicator before first click
  const [activeSnapCandidate, setActiveSnapCandidate] = useState<SnapCandidate | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 48,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset tool state when switching tools
  useEffect(() => {
    setWallToolState('idle');
    setFirstPointMm(null);
    setCurrentPointMm(null);
    setHoverPointMm(null);
    setActiveSnapCandidate(null);
  }, [activeTool]);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const scaleBy = 1.1;
      const stage = e.target.getStage();
      const oldScale = viewport.scale;
      const pointer = stage.getPointerPosition();

      const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clampedScale = Math.max(MIN_ZOOM_SCALE, Math.min(MAX_ZOOM_SCALE, newScale));

      const mousePointTo = {
        x: (pointer.x - viewport.centerX) / oldScale,
        y: (viewport.centerY - pointer.y) / oldScale,
      };

      const newCenterX = pointer.x - mousePointTo.x * clampedScale;
      const newCenterY = pointer.y + mousePointTo.y * clampedScale;

      setViewport({
        centerX: newCenterX,
        centerY: newCenterY,
        scale: clampedScale,
      });

      rafIdRef.current = null;
    });
  }, [viewport, setViewport]);

  const handleMouseDown = useCallback((e: any) => {
    if (activeTool !== 'wall') return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    // Find snap candidate
    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point; // Use snapped point

    if (wallToolState === 'idle') {
      setFirstPointMm(worldPos);
      setCurrentPointMm(worldPos);
      setWallToolState('first-point');
      setActiveSnapCandidate(snapResult.candidate || null);
      setHoverPointMm(null); // Clear hover indicator once placed
    } else if (wallToolState === 'first-point') {
      // Validate wall length before creating
      const wallLength = vec.distance(firstPointMm!, worldPos);
      if (wallLength >= MIN_WALL_LENGTH_MM) {
        createWall(firstPointMm!, worldPos);
      }
      // Reset state
      setWallToolState('idle');
      setFirstPointMm(null);
      setCurrentPointMm(null);
      setActiveSnapCandidate(null);
    }
  }, [activeTool, wallToolState, firstPointMm, viewport, wallParams, scene]);

  const handleMouseMove = useCallback((e: any) => {
    if (activeTool !== 'wall') return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    // Find snap candidate
    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point; // Use snapped point

    if (wallToolState === 'idle') {
      // Show hover indicator before first click
      setHoverPointMm(worldPos);
      setActiveSnapCandidate(snapResult.candidate || null);
    } else if (wallToolState === 'first-point') {
      setCurrentPointMm(worldPos);
      setActiveSnapCandidate(snapResult.candidate || null);
      
      if (e.evt.buttons === 1) {
        setWallToolState('dragging');
      }
    } else if (wallToolState === 'dragging') {
      setCurrentPointMm(worldPos);
      setActiveSnapCandidate(snapResult.candidate || null);
    }
  }, [activeTool, wallToolState, viewport, scene]);

  const handleMouseUp = useCallback((e: any) => {
    if (activeTool !== 'wall' || wallToolState !== 'dragging') return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    // Find snap candidate for final point
    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point; // Use snapped point

    // Validate wall length before creating
    const wallLength = vec.distance(firstPointMm!, worldPos);
    if (wallLength >= MIN_WALL_LENGTH_MM) {
      createWall(firstPointMm!, worldPos);
    }
    // Reset state
    setWallToolState('idle');
    setFirstPointMm(null);
    setCurrentPointMm(null);
    setActiveSnapCandidate(null);
  }, [activeTool, wallToolState, firstPointMm, viewport, wallParams, scene]);

  const createWall = (startMm: Vec2, endMm: Vec2) => {
    const nodeAId = `node-${Date.now()}-a`;
    const nodeBId = `node-${Date.now()}-b`;
    const wallId = `wall-${Date.now()}`;

    const newNodes = new Map(scene.nodes);
    const newWalls = new Map(scene.walls);

    newNodes.set(nodeAId, { id: nodeAId, x: startMm.x, y: startMm.y });
    newNodes.set(nodeBId, { id: nodeBId, x: endMm.x, y: endMm.y });

    newWalls.set(wallId, {
      id: wallId,
      nodeAId,
      nodeBId,
      thicknessMm: wallParams.thicknessMm,
      heightMm: wallParams.heightMm,
      raiseFromFloorMm: wallParams.raiseFromFloorMm,
    });

    setScene({ nodes: newNodes, walls: newWalls });
  };

  // Only show preview if wall length meets minimum
  const previewWall = (wallToolState === 'first-point' || wallToolState === 'dragging') && 
                      firstPointMm && 
                      currentPointMm &&
                      vec.distance(firstPointMm, currentPointMm) >= MIN_WALL_LENGTH_MM
    ? { startMm: firstPointMm, endMm: currentPointMm }
    : null;

  return (
    <KonvaStage
      width={dimensions.width}
      height={dimensions.height}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
    >
      <GridLayer />
      <WallsLayer />
      <PreviewLayer previewWall={previewWall} hoverPoint={hoverPointMm} />
      <GuidesLayer snapCandidate={activeSnapCandidate} />
    </KonvaStage>
  );
}
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
import { hitTestWalls } from '../../core/geometry/hit-testing';
import * as vec from '../../core/math/vec';
import type { Vec2 } from '../../core/math/vec';

type WallToolState = 'idle' | 'first-point' | 'dragging';
type SelectToolState = 'idle' | 'dragging-wall';

export function Stage() {
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);
  const activeTool = useStore((state) => state.activeTool);
  const wallParams = useStore((state) => state.wallParams);
  const scene = useStore((state) => state.scene);
  const setScene = useStore((state) => state.setScene);
  const selectedWallId = useStore((state) => state.selectedWallId);
  const setSelectedWallId = useStore((state) => state.setSelectedWallId);
  const hoveredWallId = useStore((state) => state.hoveredWallId);
  const setHoveredWallId = useStore((state) => state.setHoveredWallId);
  
  const rafIdRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 48, // header height
  });

  // Wall tool state
  const [wallToolState, setWallToolState] = useState<WallToolState>('idle');
  const [firstPointMm, setFirstPointMm] = useState<Vec2 | null>(null);
  const [currentPointMm, setCurrentPointMm] = useState<Vec2 | null>(null);
  const [hoverPointMm, setHoverPointMm] = useState<Vec2 | null>(null);
  const [activeSnapCandidate, setActiveSnapCandidate] = useState<SnapCandidate | null>(null);

  // Select tool state
  const [selectToolState, setSelectToolState] = useState<SelectToolState>('idle');
  const [dragStartMm, setDragStartMm] = useState<Vec2 | null>(null);
  const [dragOffsetNodeA, setDragOffsetNodeA] = useState<Vec2 | null>(null);
  const [dragOffsetNodeB, setDragOffsetNodeB] = useState<Vec2 | null>(null);

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
    setSelectToolState('idle');
    setDragStartMm(null);
    setSelectedWallId(null);
    setHoveredWallId(null);
  }, [activeTool, setSelectedWallId, setHoveredWallId]);

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

  // Wall Tool Handlers
  const handleWallMouseDown = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point;

    if (wallToolState === 'idle') {
      setFirstPointMm(worldPos);
      setCurrentPointMm(worldPos);
      setWallToolState('first-point');
      setActiveSnapCandidate(snapResult.candidate || null);
      setHoverPointMm(null);
    } else if (wallToolState === 'first-point') {
      const wallLength = vec.distance(firstPointMm!, worldPos);
      if (wallLength >= MIN_WALL_LENGTH_MM) {
        createWall(firstPointMm!, worldPos);
      }
      setWallToolState('idle');
      setFirstPointMm(null);
      setCurrentPointMm(null);
      setActiveSnapCandidate(null);
    }
  }, [wallToolState, firstPointMm, viewport, wallParams, scene]);

  const handleWallMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point;

    if (wallToolState === 'idle') {
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
  }, [wallToolState, viewport, scene]);

  const handleWallMouseUp = useCallback((e: any) => {
    if (wallToolState !== 'dragging') return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    const snapResult = findSnapCandidate(pointer, scene, viewport, {
      snapToGrid: true,
      snapToNodes: true,
      snapToEdges: true,
    });

    const worldPos = snapResult.point;

    const wallLength = vec.distance(firstPointMm!, worldPos);
    if (wallLength >= MIN_WALL_LENGTH_MM) {
      createWall(firstPointMm!, worldPos);
    }
    setWallToolState('idle');
    setFirstPointMm(null);
    setCurrentPointMm(null);
    setActiveSnapCandidate(null);
  }, [wallToolState, firstPointMm, viewport, wallParams, scene]);

  // Select Tool Handlers
  const handleSelectMouseDown = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    const worldPos = screenToWorld(pointer, viewport);

    // Hit test with screen-space radius converted to mm
    const hitRadiusMm = 20 / viewport.scale; // 20px hit radius
    const hitWallId = hitTestWalls(worldPos, scene, hitRadiusMm);

    if (hitWallId) {
      setSelectedWallId(hitWallId);
      
      // Start drag
      const wall = scene.walls.get(hitWallId);
      if (wall) {
        const nodeA = scene.nodes.get(wall.nodeAId);
        const nodeB = scene.nodes.get(wall.nodeBId);
        
        if (nodeA && nodeB) {
          setSelectToolState('dragging-wall');
          setDragStartMm(worldPos);
          setDragOffsetNodeA(vec.sub(nodeA, worldPos));
          setDragOffsetNodeB(vec.sub(nodeB, worldPos));
        }
      }
    } else {
      setSelectedWallId(null);
    }
  }, [viewport, scene, setSelectedWallId]);

  const handleSelectMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    const worldPos = screenToWorld(pointer, viewport);

    if (selectToolState === 'dragging-wall' && selectedWallId && dragStartMm) {
      // Update wall position
      const wall = scene.walls.get(selectedWallId);
      if (wall && dragOffsetNodeA && dragOffsetNodeB) {
        const newNodeAPos = vec.add(worldPos, dragOffsetNodeA);
        const newNodeBPos = vec.add(worldPos, dragOffsetNodeB);

        const newNodes = new Map(scene.nodes);
        newNodes.set(wall.nodeAId, { 
          ...scene.nodes.get(wall.nodeAId)!, 
          x: newNodeAPos.x, 
          y: newNodeAPos.y 
        });
        newNodes.set(wall.nodeBId, { 
          ...scene.nodes.get(wall.nodeBId)!, 
          x: newNodeBPos.x, 
          y: newNodeBPos.y 
        });

        setScene({ nodes: newNodes, walls: scene.walls });
      }
    } else if (selectToolState === 'idle') {
      // Update hover state
      const hitRadiusMm = 20 / viewport.scale;
      const hitWallId = hitTestWalls(worldPos, scene, hitRadiusMm);
      setHoveredWallId(hitWallId);
    }
  }, [selectToolState, selectedWallId, dragStartMm, dragOffsetNodeA, dragOffsetNodeB, viewport, scene, setScene, setHoveredWallId]);

  const handleSelectMouseUp = useCallback(() => {
    if (selectToolState === 'dragging-wall') {
      setSelectToolState('idle');
      setDragStartMm(null);
      setDragOffsetNodeA(null);
      setDragOffsetNodeB(null);
    }
  }, [selectToolState]);

  // Combined handlers
  const handleMouseDown = useCallback((e: any) => {
    if (activeTool === 'wall') {
      handleWallMouseDown(e);
    } else if (activeTool === 'select') {
      handleSelectMouseDown(e);
    }
  }, [activeTool, handleWallMouseDown, handleSelectMouseDown]);

  const handleMouseMove = useCallback((e: any) => {
    if (activeTool === 'wall') {
      handleWallMouseMove(e);
    } else if (activeTool === 'select') {
      handleSelectMouseMove(e);
    }
  }, [activeTool, handleWallMouseMove, handleSelectMouseMove]);

  const handleMouseUp = useCallback((e: any) => {
    if (activeTool === 'wall') {
      handleWallMouseUp(e);
    } else if (activeTool === 'select') {
      handleSelectMouseUp();
    }
  }, [activeTool, handleWallMouseUp, handleSelectMouseUp]);

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

  const previewWall = (wallToolState === 'first-point' || wallToolState === 'dragging') && 
                      firstPointMm && 
                      currentPointMm &&
                      vec.distance(firstPointMm, currentPointMm) >= MIN_WALL_LENGTH_MM
    ? { startMm: firstPointMm, endMm: currentPointMm }
    : null;

  const showWallPreview = activeTool === 'wall' && previewWall;
  const showWallHover = activeTool === 'wall' && hoverPointMm && !previewWall;

  return (
    <KonvaStage
      width={dimensions.width}
      height={dimensions.height}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ display: 'block', position: 'absolute', top: 0, left: 0, cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
    >
      <GridLayer />
      <WallsLayer />
      {showWallPreview && <PreviewLayer previewWall={previewWall} hoverPoint={null} />}
      {showWallHover && <PreviewLayer previewWall={null} hoverPoint={hoverPointMm} />}
      {activeTool === 'wall' && <GuidesLayer snapCandidate={activeSnapCandidate} />}
    </KonvaStage>
  );
}
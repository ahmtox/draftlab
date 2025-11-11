import { Stage as KonvaStage } from 'react-konva';
import { useCallback, useRef, useEffect, useState } from 'react';
import { GridLayer } from './layers/GridLayer';
import { WallsLayer } from './layers/WallsLayer';
import { PreviewLayer } from './layers/PreviewLayer';
import { GuidesLayer } from './layers/GuidesLayer';
import { useStore } from '../../state/store';
import { MIN_ZOOM_SCALE, MAX_ZOOM_SCALE } from '../../core/constants';
import { WallTool } from '../../tools/wall.tool';
import { SelectTool } from '../../tools/select.tool';
import { AddWallCommand } from '../../core/commands/add-wall';
import { MergeNodesCommand } from '../../core/commands/merge-nodes';

export function Stage() {
  const viewport = useStore((state) => state.viewport);
  const setViewport = useStore((state) => state.setViewport);
  const activeTool = useStore((state) => state.activeTool);
  const scene = useStore((state) => state.scene);
  const setScene = useStore((state) => state.setScene);
  
  const rafIdRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 48,
  });

  const wallToolRef = useRef<WallTool | null>(null);
  const selectToolRef = useRef<SelectTool | null>(null);

  const [wallToolContext, setWallToolContext] = useState<any>(null);
  const [selectToolContext, setSelectToolContext] = useState<any>(null);

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

  useEffect(() => {
    if (!wallToolRef.current) {
      wallToolRef.current = new WallTool(
        (ctx) => setWallToolContext(ctx),
        (startMm, endMm, startNodeId, endNodeId) => {
          const params = useStore.getState().wallParams;
          const cmd = new AddWallCommand(
            startMm, 
            endMm, 
            params, 
            () => useStore.getState().scene,
            setScene,
            startNodeId,
            endNodeId
          );
          cmd.execute();
        }
      );
    }

    if (!selectToolRef.current) {
      selectToolRef.current = new SelectTool(
        (ctx) => setSelectToolContext(ctx),
        (wallId, nodeAPos, nodeBPos) => {
          const currentScene = useStore.getState().scene;
          const newNodes = new Map(currentScene.nodes);
          const wall = currentScene.walls.get(wallId)!;
          newNodes.set(wall.nodeAId, { ...newNodes.get(wall.nodeAId)!, x: nodeAPos.x, y: nodeAPos.y });
          newNodes.set(wall.nodeBId, { ...newNodes.get(wall.nodeBId)!, x: nodeBPos.x, y: nodeBPos.y });
          setScene({ nodes: newNodes, walls: currentScene.walls });
        },
        (wallId, finalNodeAPos, finalNodeBPos, mergeAToNodeId, mergeBToNodeId) => {
          const currentScene = useStore.getState().scene;
          const wall = currentScene.walls.get(wallId);
          if (!wall) return;

          const newNodes = new Map(currentScene.nodes);
          newNodes.set(wall.nodeAId, { ...newNodes.get(wall.nodeAId)!, x: finalNodeAPos.x, y: finalNodeAPos.y });
          newNodes.set(wall.nodeBId, { ...newNodes.get(wall.nodeBId)!, x: finalNodeBPos.x, y: finalNodeBPos.y });
          setScene({ nodes: newNodes, walls: currentScene.walls });

          if (mergeAToNodeId && mergeAToNodeId !== wall.nodeAId) {
            const mergeCmd = new MergeNodesCommand(
              wall.nodeAId,
              mergeAToNodeId,
              () => useStore.getState().scene,
              setScene
            );
            mergeCmd.execute();
          }

          if (mergeBToNodeId && mergeBToNodeId !== wall.nodeBId) {
            const currentSceneAfterA = useStore.getState().scene;
            const wallAfterA = currentSceneAfterA.walls.get(wallId);
            if (wallAfterA) {
              const mergeCmd = new MergeNodesCommand(
                wallAfterA.nodeBId,
                mergeBToNodeId,
                () => useStore.getState().scene,
                setScene
              );
              mergeCmd.execute();
            }
          }
        }
      );
    }
  }, []);

  useEffect(() => {
    wallToolRef.current?.reset();
    selectToolRef.current?.reset();
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
    const pointer = e.target.getStage().getPointerPosition();
    
    if (activeTool === 'wall') {
      wallToolRef.current?.handlePointerDown(pointer, scene, viewport);
    } else if (activeTool === 'select') {
      selectToolRef.current?.handlePointerDown(pointer, scene, viewport);
    }
  }, [activeTool, scene, viewport]);

  const handleMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    const buttons = e.evt.buttons;

    if (activeTool === 'wall') {
      wallToolRef.current?.handlePointerMove(pointer, scene, viewport, buttons);
    } else if (activeTool === 'select') {
      selectToolRef.current?.handlePointerMove(pointer, scene, viewport);
    }
  }, [activeTool, scene, viewport]);

  const handleMouseUp = useCallback((e: any) => {
    const pointer = e.target.getStage().getPointerPosition();

    if (activeTool === 'wall') {
      wallToolRef.current?.handlePointerUp(pointer, scene, viewport);
    } else if (activeTool === 'select') {
      selectToolRef.current?.handlePointerUp(scene);
    }
  }, [activeTool, scene, viewport]);

  const showWallPreview = activeTool === 'wall' && wallToolContext?.state !== 'idle' && wallToolContext?.firstPointMm && wallToolContext?.currentPointMm;
  const showWallHover = activeTool === 'wall' && wallToolContext?.state === 'idle' && wallToolContext?.hoverPointMm;

  const wallSnapCandidates = activeTool === 'wall' && wallToolContext?.snapCandidate 
    ? [wallToolContext.snapCandidate] 
    : [];

  const selectSnapCandidates = activeTool === 'select' && selectToolContext
    ? [selectToolContext.snapCandidateA, selectToolContext.snapCandidateB].filter((c: any) => c !== null && c !== undefined)
    : [];

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
      {showWallPreview && <PreviewLayer previewWall={{ startMm: wallToolContext.firstPointMm, endMm: wallToolContext.currentPointMm }} hoverPoint={null} />}
      {showWallHover && <PreviewLayer previewWall={null} hoverPoint={wallToolContext.hoverPointMm} />}
      <GuidesLayer snapCandidates={wallSnapCandidates} />
      <GuidesLayer snapCandidates={selectSnapCandidates} />
    </KonvaStage>
  );
}
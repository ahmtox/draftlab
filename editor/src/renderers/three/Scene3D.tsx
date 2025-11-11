import { useEffect, useRef } from 'react';
import { useStore } from '../../state/store';
import { ThreeSceneAdapter } from './adapters/scene-adapter';

export function Scene3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<ThreeSceneAdapter | null>(null);

  const scene = useStore((state) => state.scene);

  // Initialize adapter once
  useEffect(() => {
    if (!containerRef.current) return;

    console.log('🎨 Initializing Three.js adapter');
    adapterRef.current = new ThreeSceneAdapter(containerRef.current);

    return () => {
      if (adapterRef.current) {
        adapterRef.current.dispose();
        adapterRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Subscribe to scene changes
  useEffect(() => {
    if (!adapterRef.current) return;

    console.log('📡 Scene changed, applying to 3D adapter');
    adapterRef.current.applyScene(scene);
  }, [scene]); // Re-run when scene changes

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        cursor: 'grab',
        pointerEvents: 'auto',
        touchAction: 'none',
      }} 
    />
  );
}
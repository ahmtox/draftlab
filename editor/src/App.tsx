import { useEffect } from 'react';
import { Stage } from './renderers/konva/Stage';
import { useStore } from './state/store';
import { DEFAULT_ZOOM_SCALE } from './core/constants';
import { HeaderBar } from './ui/chrome/HeaderBar';
import { Sidebar } from './ui/panels/Sidebar';
import { WallProperties } from './ui/panels/WallProperties';

function App() {
  const setViewport = useStore((state) => state.setViewport);

  useEffect(() => {
    setViewport({
      centerX: window.innerWidth / 2,
      centerY: window.innerHeight / 2,
      scale: DEFAULT_ZOOM_SCALE,
    });
  }, [setViewport]);

  return (
    <div className="fixed inset-0 m-0 p-0 bg-gray-50">
      <HeaderBar />
      <Sidebar />
      <WallProperties />
      <div className="absolute top-12 left-0 right-0 bottom-0">
        <Stage />
      </div>
    </div>
  );
}

export default App;
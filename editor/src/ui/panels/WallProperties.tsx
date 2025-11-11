import { useStore } from '../../state/store';
import { useState, useEffect } from 'react';

export function WallProperties() {
  const activeTool = useStore((state) => state.activeTool);
  const wallParams = useStore((state) => state.wallParams);
  const setWallParams = useStore((state) => state.setWallParams);

  // Local state for input values (allows empty string while typing)
  const [thicknessInput, setThicknessInput] = useState((wallParams.thicknessMm / 10).toFixed(1));
  const [heightInput, setHeightInput] = useState((wallParams.heightMm / 10).toFixed(1));
  const [raiseInput, setRaiseInput] = useState((wallParams.raiseFromFloorMm / 10).toFixed(1));

  // Sync local state when wallParams change from elsewhere
  useEffect(() => {
    setThicknessInput((wallParams.thicknessMm / 10).toFixed(1));
    setHeightInput((wallParams.heightMm / 10).toFixed(1));
    setRaiseInput((wallParams.raiseFromFloorMm / 10).toFixed(1));
  }, [wallParams]);

  if (activeTool !== 'wall') return null;

  const handleThicknessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string or any numeric input (including negatives, decimals)
    setThicknessInput(value);
  };

  const handleThicknessBlur = () => {
    const cm = parseFloat(thicknessInput);
    // If invalid, empty, or <= 0, default to 0.1cm
    if (isNaN(cm) || cm <= 0 || thicknessInput.trim() === '') {
      setThicknessInput('0.1');
      setWallParams({ ...wallParams, thicknessMm: 1 });
    } else {
      // Normalize display and update store
      setThicknessInput(cm.toFixed(1));
      setWallParams({ ...wallParams, thicknessMm: cm * 10 });
    }
  };

  const handleThicknessKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleThicknessBlur();
      e.currentTarget.blur();
    }
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string or any numeric input
    setHeightInput(value);
  };

  const handleHeightBlur = () => {
    const cm = parseFloat(heightInput);
    // If invalid, empty, or <= 0, default to 0.1cm
    if (isNaN(cm) || cm <= 0 || heightInput.trim() === '') {
      setHeightInput('0.1');
      setWallParams({ ...wallParams, heightMm: 1 });
    } else {
      // Normalize display and update store
      setHeightInput(cm.toFixed(1));
      setWallParams({ ...wallParams, heightMm: cm * 10 });
    }
  };

  const handleHeightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleHeightBlur();
      e.currentTarget.blur();
    }
  };

  const handleRaiseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string or any numeric input
    setRaiseInput(value);
  };

  const handleRaiseBlur = () => {
    const cm = parseFloat(raiseInput);
    // If invalid or empty, default to 0. Allow 0 for raise.
    if (isNaN(cm) || raiseInput.trim() === '') {
      setRaiseInput('0.0');
      setWallParams({ ...wallParams, raiseFromFloorMm: 0 });
    } else if (cm < 0) {
      // Negative values default to 0
      setRaiseInput('0.0');
      setWallParams({ ...wallParams, raiseFromFloorMm: 0 });
    } else {
      // Normalize display and update store
      setRaiseInput(cm.toFixed(1));
      setWallParams({ ...wallParams, raiseFromFloorMm: cm * 10 });
    }
  };

  const handleRaiseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRaiseBlur();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="fixed top-32 right-4 w-56 bg-white rounded-xl shadow-lg p-4 z-30 border border-gray-200">
      <h2 className="text-gray-800 font-semibold mb-3 text-sm">Wall Properties</h2>
      
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1.5 font-medium">
            Thickness (cm)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={thicknessInput}
            onChange={handleThicknessChange}
            onBlur={handleThicknessBlur}
            onKeyDown={handleThicknessKeyDown}
            className="w-full px-3 py-1.5 bg-gray-50 text-gray-800 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1.5 font-medium">
            Height (cm)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={heightInput}
            onChange={handleHeightChange}
            onBlur={handleHeightBlur}
            onKeyDown={handleHeightKeyDown}
            className="w-full px-3 py-1.5 bg-gray-50 text-gray-800 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1.5 font-medium">
            Raise from Floor (cm)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={raiseInput}
            onChange={handleRaiseChange}
            onBlur={handleRaiseBlur}
            onKeyDown={handleRaiseKeyDown}
            className="w-full px-3 py-1.5 bg-gray-50 text-gray-800 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
          />
        </div>
      </div>
    </div>
  );
}
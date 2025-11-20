import { useStore } from '../../state/store';
import { getFixture } from '../../core/fixtures/library';
import { useState, useEffect } from 'react';
import { EditFixtureParamsCommand } from '../../core/commands/edit-fixture-params';
import { RotateFixtureCommand } from '../../core/commands/rotate-fixture';

export function FixtureProperties() {
  const scene = useStore((state) => state.scene);
  const selectedFixtureId = useStore((state) => state.selectedFixtureId);
  const setScene = useStore((state) => state.setScene);
  const history = useStore((state) => state.history);

  const fixture = selectedFixtureId ? scene.fixtures?.get(selectedFixtureId) : null;
  const schema = fixture ? getFixture(fixture.kind) : null;

  const [localParams, setLocalParams] = useState<Record<string, any>>({});

  // Sync local params when fixture selection changes
  useEffect(() => {
    if (fixture) {
      setLocalParams({ ...fixture.params });
    }
  }, [fixture]);

  if (!fixture || !schema) return null;

  const handleParamChange = (key: string, value: any) => {
    setLocalParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleParamCommit = (key: string, value: any) => {
    const oldParams = { ...fixture.params };
    const newParams = { ...localParams, [key]: value };

    const cmd = new EditFixtureParamsCommand(
      fixture.id,
      oldParams,
      newParams,
      () => useStore.getState().scene,
      setScene
    );

    history.push(cmd);
  };

  const handleRotate90 = () => {
    const oldRotation = fixture.rotation || 0;
    const newRotation = oldRotation + Math.PI / 2; // 90 degrees

    const cmd = new RotateFixtureCommand(
      fixture.id,
      oldRotation,
      newRotation,
      () => useStore.getState().scene,
      setScene
    );

    history.push(cmd);
  };

  const handleFlipHorizontal = () => {
    // For doors, toggle swing direction
    if (schema.id === 'door') {
      const oldParams = { ...fixture.params };
      const newParams = {
        ...oldParams,
        swing: oldParams.swing === 'left' ? 'right' : 'left',
      };

      const cmd = new EditFixtureParamsCommand(
        fixture.id,
        oldParams,
        newParams,
        () => useStore.getState().scene,
        setScene
      );

      history.push(cmd);
    }
  };

  return (
    <div className="fixed bottom-4 left-20 z-30 bg-white rounded-xl shadow-lg border border-gray-200 p-4 w-64">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">{schema.name}</h3>
        <button
          onClick={() => useStore.getState().setSelectedFixtureId(null)}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Parameters */}
      <div className="space-y-3 mb-4">
        {schema.params.map((paramDef) => {
          if (paramDef.type === 'number') {
            return (
              <div key={paramDef.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {paramDef.label} {paramDef.unit && `(${paramDef.unit})`}
                </label>
                <input
                  type="number"
                  value={localParams[paramDef.key] ?? paramDef.default}
                  onChange={(e) => handleParamChange(paramDef.key, Number(e.target.value))}
                  onBlur={(e) => handleParamCommit(paramDef.key, Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  min={paramDef.min}
                  max={paramDef.max}
                  step={paramDef.step}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            );
          }

          if (paramDef.type === 'enum') {
            return (
              <div key={paramDef.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {paramDef.label}
                </label>
                <select
                  value={localParams[paramDef.key] ?? paramDef.default}
                  onChange={(e) => {
                    handleParamChange(paramDef.key, e.target.value);
                    handleParamCommit(paramDef.key, e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {paramDef.values?.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-3 border-t border-gray-200">
        <button
          onClick={handleRotate90}
          className="w-full px-3 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm font-medium"
        >
          Rotate 90° (R)
        </button>

        {schema.id === 'door' && (
          <button
            onClick={handleFlipHorizontal}
            className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Flip Swing
          </button>
        )}
      </div>

      {/* Rotation display */}
      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
        Rotation: {((fixture.rotation || 0) * 180 / Math.PI).toFixed(0)}°
      </div>
    </div>
  );
}
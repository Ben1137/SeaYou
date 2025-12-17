import React, { useState } from 'react';

export interface VesselSettings {
  draft: number; // meters
  name: string;
  type: 'sail' | 'power' | 'fishing' | 'commercial';
}

interface VesselSettingsModalProps {
  settings: VesselSettings;
  onSave: (settings: VesselSettings) => void;
  onClose: () => void;
}

export const VesselSettingsModal: React.FC<VesselSettingsModalProps> = ({
  settings,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState(settings.draft);
  const [name, setName] = useState(settings.name);
  const [type, setType] = useState<VesselSettings['type']>(settings.type);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4 text-slate-900">Vessel Settings</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700">Vessel Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700">
              Draft (meters) - Critical for shallow water detection
            </label>
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(parseFloat(e.target.value))}
              step="0.1"
              min="0.1"
              max="10"
              className="w-full p-2 border border-slate-300 rounded text-slate-900 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Depth from waterline to lowest point of keel
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700">Vessel Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full p-2 border border-slate-300 rounded text-slate-900 focus:outline-none focus:border-blue-500"
            >
              <option value="sail">Sailboat</option>
              <option value="power">Powerboat</option>
              <option value="fishing">Fishing Vessel</option>
              <option value="commercial">Commercial Vessel</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => onSave({ draft, name, type })}
            className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

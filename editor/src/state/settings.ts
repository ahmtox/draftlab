import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SettingsState = {
  // Visual settings
  useBlackWalls: boolean;
  
  // Actions
  setUseBlackWalls: (value: boolean) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      useBlackWalls: false,
      
      // Actions
      setUseBlackWalls: (value) => set({ useBlackWalls: value }),
    }),
    {
      name: 'draftlab-settings', // localStorage key
    }
  )
);
import React, { useContext, useEffect, useMemo, useState } from "react";

const SettingsContext = React.createContext(null);

type PersistedSettings = {
  fogEnabled?: boolean;
  speedMultiplier?: number;
  fov?: number;
};

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [fogEnabled, setFogEnabled] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [fov, setFov] = useState(90);

  const value = useMemo(
    () => ({
      fogEnabled,
      setFogEnabled,
      speedMultiplier,
      setSpeedMultiplier,
      fov,
      setFov,
    }),
    [fogEnabled, speedMultiplier, fov]
  );

  // Read persisted settings from localStoarge.
  useEffect(() => {
    let savedSettings: PersistedSettings = {};
    try {
      savedSettings = JSON.parse(localStorage.getItem("settings")) || {};
    } catch (err) {
      // Ignore.
    }
    if (savedSettings.fogEnabled != null) {
      setFogEnabled(savedSettings.fogEnabled);
    }
    if (savedSettings.speedMultiplier != null) {
      setSpeedMultiplier(savedSettings.speedMultiplier);
    }
    if (savedSettings.fov != null) {
      setFov(savedSettings.fov);
    }
  }, []);

  // Persist settings to localStoarge.
  useEffect(() => {
    const settingsToSave: PersistedSettings = {
      fogEnabled,
      speedMultiplier,
      fov,
    };
    try {
      localStorage.setItem("settings", JSON.stringify(settingsToSave));
    } catch (err) {
      // Probably forbidden by browser settings.
    }
  }, [fogEnabled, speedMultiplier, fov]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

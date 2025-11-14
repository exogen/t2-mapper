import React, { useContext, useMemo } from "react";

const SettingsContext = React.createContext(null);

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({
  children,
  fogEnabled,
}: {
  children: React.ReactNode;
  fogEnabled: boolean;
}) {
  const value = useMemo(() => ({ fogEnabled }), [fogEnabled]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

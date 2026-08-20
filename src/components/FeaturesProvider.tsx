"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useQueryState, parseAsString } from "nuqs";

type Features = {
  live: boolean;
  stats: boolean;
};

const defaultFeatures: Features = {
  // Live spectating is on by default; the browser-controlled player flow
  // (warrior name, real joins) stays unexposed until a future feature.
  live: true,
  stats: false,
};

const FeaturesContext = createContext<Features>(defaultFeatures);

export function useFeatures(): Features {
  return useContext(FeaturesContext);
}

/** Reads `?features=live,stats,...` once on mount and provides feature flags. */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [featuresParam] = useQueryState("features", parseAsString);
  const [features] = useState<Features>(() => {
    const tokens = new Set(
      (featuresParam ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    return {
      live: defaultFeatures.live || tokens.has("live"),
      stats: tokens.has("stats"),
    };
  });

  return (
    <FeaturesContext.Provider value={features}>
      {children}
    </FeaturesContext.Provider>
  );
}

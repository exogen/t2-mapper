"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useQueryState, parseAsString } from "nuqs";

type Features = {
  live: boolean;
};

const defaultFeatures: Features = {
  live: false,
};

const FeaturesContext = createContext<Features>(defaultFeatures);

export function useFeatures(): Features {
  return useContext(FeaturesContext);
}

/** Reads `?features=live,demo,...` once on mount and provides feature flags. */
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
      live: tokens.has("live"),
    };
  });

  return (
    <FeaturesContext.Provider value={features}>
      {children}
    </FeaturesContext.Provider>
  );
}

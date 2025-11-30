import { createContext, useContext, useMemo } from "react";
import type { TorqueObject } from "../torqueScript";
import { renderObject } from "./renderObject";

export type SimGroupContextType = {
  object: TorqueObject;
  parent: SimGroupContextType;
  hasTeams: boolean;
  team: null | number;
};

const SimGroupContext = createContext<SimGroupContextType | null>(null);

export function useSimGroup() {
  return useContext(SimGroupContext);
}

export function SimGroup({ object }: { object: TorqueObject }) {
  const parent = useSimGroup();

  const simGroup: SimGroupContextType = useMemo(() => {
    let team: number | null = null;
    let hasTeams = false;

    if (parent && parent.hasTeams) {
      hasTeams = true;
      if (parent.team != null) {
        team = parent.team;
      } else if (object._name) {
        const match = object._name.match(/^team(\d+)$/i);
        if (match) {
          team = parseInt(match[1], 10);
        }
      }
    } else if (object._name) {
      hasTeams = object._name.toLowerCase() === "teams";
    }

    return {
      // the current SimGroup's data
      object,
      // the closest ancestor of this SimGroup
      parent,
      // whether this is, or is the descendant of, the "Teams" SimGroup
      hasTeams,
      // what team this is for, when this is either a "Team<N>" SimGroup itself,
      // or a descendant of one
      team,
    };
  }, [object, parent]);

  return (
    <SimGroupContext.Provider value={simGroup}>
      {(object._children ?? []).map((child, i) => renderObject(child, i))}
    </SimGroupContext.Provider>
  );
}

import { createContext, useContext, useMemo } from "react";
import { ConsoleObject } from "../mission";
import { renderObject } from "./renderObject";

export type SimGroupContextType = {
  object: ConsoleObject;
  parent: SimGroupContextType;
  hasTeams: boolean;
  team: null | number;
};

const SimGroupContext = createContext<SimGroupContextType | null>(null);

export function useSimGroup() {
  return useContext(SimGroupContext);
}

export function SimGroup({ object }: { object: ConsoleObject }) {
  const parent = useSimGroup();

  const simGroup: SimGroupContextType = useMemo(() => {
    let team: number | null = null;
    let hasTeams = false;

    if (parent && parent.hasTeams) {
      hasTeams = true;
      if (parent.team != null) {
        team = parent.team;
      } else if (object.instanceName) {
        const match = object.instanceName.match(/^team(\d+)$/i);
        team = parseInt(match[1], 10);
      }
    } else if (object.instanceName) {
      hasTeams = object.instanceName.toLowerCase() === "teams";
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
      {object.children.map((child, i) => renderObject(child, i))}
    </SimGroupContext.Provider>
  );
}

import { createContext, useContext, useMemo } from "react";
import type { TorqueObject } from "../torqueScript";
import { SimObject } from "./SimObject";
import { useRuntimeChildIds, useRuntimeObjectById } from "../state";

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
  const liveObject = useRuntimeObjectById(object._id) ?? object;
  const parent = useSimGroup();
  const childIds = useRuntimeChildIds(liveObject._id, liveObject._children ?? []);

  const simGroup: SimGroupContextType = useMemo(() => {
    let team: number | null = null;
    let hasTeams = false;

    if (parent && parent.hasTeams) {
      hasTeams = true;
      if (parent.team != null) {
        team = parent.team;
      } else if (liveObject._name) {
        const match = liveObject._name.match(/^team(\d+)$/i);
        if (match) {
          team = parseInt(match[1], 10);
        }
      }
    } else if (liveObject._name) {
      hasTeams = liveObject._name.toLowerCase() === "teams";
    }

    return {
      // the current SimGroup's data
      object: liveObject,
      // the closest ancestor of this SimGroup
      parent,
      // whether this is, or is the descendant of, the "Teams" SimGroup
      hasTeams,
      // what team this is for, when this is either a "Team<N>" SimGroup itself,
      // or a descendant of one
      team,
    };
  }, [liveObject, parent]);

  return (
    <SimGroupContext.Provider value={simGroup}>
      {childIds.map((childId) => (
        <SimObject objectId={childId} key={childId} />
      ))}
    </SimGroupContext.Provider>
  );
}

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useDemoTimeline } from "../state/demoTimelineStore";
import { isRelayRecording } from "../stream/demoDate";
import {
  defaultTimelineCategories,
  TIMELINE_ANYONE,
  TIMELINE_RECORDER,
  type TimelineCategory,
} from "./demoTimelineFilters";
import { useRecording } from "./usePlayback";

export interface DemoTimelineFilters {
  categories: Set<TimelineCategory>;
  setCategories: Dispatch<SetStateAction<Set<TimelineCategory>>>;
  player: string;
  setPlayer: Dispatch<SetStateAction<string>>;
}

/** Own these filters above the accordion content so closing it preserves them. */
export function useDemoTimelineFilters(): DemoTimelineFilters {
  const events = useDemoTimeline((state) => state.events);
  const recording = useRecording();
  const defaultPlayer =
    recording?.recorderName && !isRelayRecording(recording.recorderName)
      ? TIMELINE_RECORDER
      : TIMELINE_ANYONE;
  const [categories, setCategories] = useState(defaultTimelineCategories);
  const [player, setPlayer] = useState<string>(defaultPlayer);
  const resetFor = useRef({ events, defaultPlayer });

  useEffect(() => {
    // Activity recreates effects when the sidebar reopens, preserving refs
    // and state. Reset only when the demo inputs themselves have changed.
    const previous = resetFor.current;
    if (previous.events === events && previous.defaultPlayer === defaultPlayer)
      return;
    resetFor.current = { events, defaultPlayer };
    setCategories(defaultTimelineCategories());
    setPlayer(defaultPlayer);
  }, [events, defaultPlayer]);

  return { categories, setCategories, player, setPlayer };
}

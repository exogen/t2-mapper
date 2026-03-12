import type { ReactiveFieldRule, ReactiveMethodRule } from "./types";

function normalize(value: string): string {
  return value.toLowerCase();
}

function normalizeGlobalName(name: string): string {
  const trimmed = name.trim();
  return normalize(trimmed.startsWith("$") ? trimmed.slice(1) : trimmed);
}

interface ClassRuleIndex {
  anyClassValues: Set<string>;
  valuesByClass: Map<string, Set<string>>;
}

function getOrCreateSet(
  map: Map<string, Set<string>>,
  key: string,
): Set<string> {
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  return set;
}

function addRuleValues(target: Set<string>, values: readonly string[]): void {
  for (const value of values) {
    target.add(normalize(value));
  }
}

function buildFieldIndex(rules: readonly ReactiveFieldRule[]): ClassRuleIndex {
  const anyClassValues = new Set<string>();
  const valuesByClass = new Map<string, Set<string>>();

  for (const rule of rules) {
    for (const className of rule.classNames) {
      const normalizedClass = normalize(className);
      if (normalizedClass === "*") {
        addRuleValues(anyClassValues, rule.fields);
        continue;
      }
      addRuleValues(
        getOrCreateSet(valuesByClass, normalizedClass),
        rule.fields,
      );
    }
  }

  return { anyClassValues, valuesByClass };
}

function buildMethodIndex(
  rules: readonly ReactiveMethodRule[],
): ClassRuleIndex {
  const anyClassValues = new Set<string>();
  const valuesByClass = new Map<string, Set<string>>();

  for (const rule of rules) {
    for (const className of rule.classNames) {
      const normalizedClass = normalize(className);
      if (normalizedClass === "*") {
        addRuleValues(anyClassValues, rule.methods);
        continue;
      }
      addRuleValues(
        getOrCreateSet(valuesByClass, normalizedClass),
        rule.methods,
      );
    }
  }

  return { anyClassValues, valuesByClass };
}

function buildGlobalIndex(reactiveGlobalNames: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const name of reactiveGlobalNames) {
    names.add(normalizeGlobalName(name));
  }
  return names;
}

function classRuleMatches(
  index: ClassRuleIndex,
  classChain: readonly string[],
  normalizedValue: string,
): boolean {
  if (
    index.anyClassValues.has("*") ||
    index.anyClassValues.has(normalizedValue)
  ) {
    return true;
  }

  for (const className of classChain) {
    const values = index.valuesByClass.get(normalize(className));
    if (!values) {
      continue;
    }
    if (values.has("*") || values.has(normalizedValue)) {
      return true;
    }
  }
  return false;
}

export const DEFAULT_REACTIVE_FIELD_RULES: ReactiveFieldRule[] = [
  {
    classNames: ["SceneObject", "GameBase", "ShapeBase", "Item", "Player"],
    fields: [
      "position",
      "rotation",
      "scale",
      "transform",
      "hidden",
      "renderingdistance",
      "datablock",
      "shapename",
      "shapefile",
      "initialbarrel",
      "skin",
      "team",
      "health",
      "energy",
      "energylevel",
      "damagelevel",
      "damageflash",
      "damagepercent",
      "damagestate",
      "mountobject",
      "mountedimage",
      "targetposition",
      "targetrotation",
      "targetscale",
      "missiontypeslist",
      "renderenabled",
      "vis",
      "velocity",
      "name",
    ],
  },
  {
    classNames: ["*"],
    fields: [
      "position",
      "rotation",
      "scale",
      "hidden",
      "shapefile",
      "datablock",
    ],
  },
];

export const DEFAULT_REACTIVE_METHOD_RULES: ReactiveMethodRule[] = [
  {
    classNames: ["SceneObject", "GameBase", "ShapeBase", "SimObject"],
    methods: [
      "settransform",
      "setposition",
      "setrotation",
      "setscale",
      "sethidden",
      "setdatablock",
      "setshapename",
      "mountimage",
      "unmountimage",
      "mountobject",
      "unmountobject",
      "setdamagelevel",
      "setenergylevel",
      "schedule",
      "delete",
      "deleteallobjects",
      "add",
      "remove",
      "playthread",
      "stopthread",
      "setthreaddir",
      "pausethread",
    ],
  },
  {
    classNames: ["*"],
    methods: ["settransform", "setscale", "delete", "add", "remove"],
  },
];

export const DEFAULT_REACTIVE_GLOBAL_NAMES = [
  "missionrunning",
  "loadingmission",
] as const;

export function createReactiveFieldMatcher(
  rules: readonly ReactiveFieldRule[],
): (classChain: readonly string[], fieldName: string) => boolean {
  const index = buildFieldIndex(rules);
  return (classChain, fieldName) =>
    classRuleMatches(index, classChain, normalize(fieldName));
}

export function createReactiveMethodMatcher(
  rules: readonly ReactiveMethodRule[],
): (classChain: readonly string[], methodName: string) => boolean {
  const index = buildMethodIndex(rules);
  return (classChain, methodName) =>
    classRuleMatches(index, classChain, normalize(methodName));
}

export function createReactiveGlobalMatcher(
  reactiveGlobalNames: readonly string[],
): (globalName: string) => boolean {
  const globalIndex = buildGlobalIndex(reactiveGlobalNames);
  return (globalName) => {
    const normalizedName = normalizeGlobalName(globalName);
    return globalIndex.has("*") || globalIndex.has(normalizedName);
  };
}

export function isReactiveField(
  classChain: readonly string[],
  fieldName: string,
  rules: readonly ReactiveFieldRule[],
): boolean {
  return createReactiveFieldMatcher(rules)(classChain, fieldName);
}

export function isReactiveMethod(
  classChain: readonly string[],
  methodName: string,
  rules: readonly ReactiveMethodRule[],
): boolean {
  return createReactiveMethodMatcher(rules)(classChain, methodName);
}

export function isReactiveGlobal(
  globalName: string,
  reactiveGlobalNames: readonly string[],
): boolean {
  return createReactiveGlobalMatcher(reactiveGlobalNames)(globalName);
}

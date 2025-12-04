import picomatch from "picomatch";
import { generate } from "./codegen";
import { parse, type Program } from "./index";
import { createBuiltins as defaultCreateBuiltins } from "./builtins";
import { CaseInsensitiveMap, CaseInsensitiveSet, normalizePath } from "./utils";
import type {
  BuiltinsContext,
  FunctionStack,
  FunctionsAPI,
  GlobalsAPI,
  LoadedScript,
  LoadScriptOptions,
  LocalsAPI,
  MethodStack,
  PackageState,
  RuntimeAPI,
  RuntimeState,
  ScriptCache,
  TorqueFunction,
  TorqueMethod,
  TorqueObject,
  TorqueRuntime,
  TorqueRuntimeOptions,
  VariableStoreAPI,
} from "./types";

/**
 * Create a script cache that can be shared across runtime instances.
 * This allows parsed ASTs and generated code to be reused when switching
 * missions or restarting the runtime.
 */
export function createScriptCache(): ScriptCache {
  return {
    scripts: new Map<string, Program>(),
    generatedCode: new WeakMap<Program, string>(),
  };
}

function normalize(name: string): string {
  return name.toLowerCase();
}

function toU32(value: any): number {
  return (Number(value) | 0) >>> 0;
}

function toI32(value: any): number {
  return Number(value) | 0;
}

/** Coerce instance name to string, returning null for empty/null values. */
function toName(value: any): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value || null;
  if (typeof value === "number") return String(value);
  throw new Error(`Invalid instance name type: ${typeof value}`);
}

export function createRuntime(
  options: TorqueRuntimeOptions = {},
): TorqueRuntime {
  const methods = new CaseInsensitiveMap<CaseInsensitiveMap<MethodStack>>();
  const functions = new CaseInsensitiveMap<FunctionStack>();
  const packages = new CaseInsensitiveMap<PackageState>();
  const activePackages: string[] = [];
  // Track package names that were activated before being defined (deferred activation)
  const pendingActivations = new CaseInsensitiveSet();

  const FIRST_DATABLOCK_ID = 3;
  const FIRST_DYNAMIC_ID = 1027;
  let nextDatablockId = FIRST_DATABLOCK_ID;
  let nextObjectId = FIRST_DYNAMIC_ID;

  const objectsById = new Map<number, TorqueObject>();
  const objectsByName = new CaseInsensitiveMap<TorqueObject>();
  const datablocks = new CaseInsensitiveMap<TorqueObject>();
  const globals = new CaseInsensitiveMap<any>();
  const methodHooks = new CaseInsensitiveMap<
    CaseInsensitiveMap<Array<(thisObj: TorqueObject, ...args: any[]) => void>>
  >();
  // Namespace inheritance: className -> superClassName (for ScriptObject/ScriptGroup)
  const namespaceParents = new CaseInsensitiveMap<string>();

  // Populate initial globals from options
  if (options.globals) {
    for (const [key, value] of Object.entries(options.globals)) {
      if (!key.startsWith("$")) {
        throw new Error(
          `Global variable "${key}" must start with $, e.g. "$${key}"`,
        );
      }
      globals.set(key.slice(1), value);
    }
  }

  const executedScripts = new Set<string>();
  const failedScripts = new Set<string>();
  // Create matcher for ignored scripts (case insensitive)
  const isIgnoredScript =
    options.ignoreScripts && options.ignoreScripts.length > 0
      ? picomatch(options.ignoreScripts, { nocase: true })
      : null;
  // Use cache if provided, otherwise create new maps
  const cache = options.cache ?? createScriptCache();
  const scripts = cache.scripts;
  const generatedCode = cache.generatedCode;

  // Execution context: tracks which stack index is currently executing for each function/method
  // This is needed for Parent:: to correctly call the parent in the stack, not just stack[length-2]
  // Key format: "funcname" for functions, "classname::methodname" for methods
  const executionContext = new Map<string, number[]>();

  function pushExecutionContext(key: string, stackIndex: number): void {
    let stack = executionContext.get(key);
    if (!stack) {
      stack = [];
      executionContext.set(key, stack);
    }
    stack.push(stackIndex);
  }

  function popExecutionContext(key: string): void {
    const stack = executionContext.get(key);
    if (stack) {
      stack.pop();
    }
  }

  function getCurrentExecutionIndex(key: string): number | undefined {
    const stack = executionContext.get(key);
    return stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
  }

  /** Execute a function with execution context tracking for proper Parent:: support */
  function withExecutionContext<T>(key: string, index: number, fn: () => T): T {
    pushExecutionContext(key, index);
    try {
      return fn();
    } finally {
      popExecutionContext(key);
    }
  }

  /** Build the execution context key for a method */
  function methodContextKey(className: string, methodName: string): string {
    return `${className.toLowerCase()}::${methodName.toLowerCase()}`;
  }

  /** Get the method stack for a class/method pair, or null if not found */
  function getMethodStack(
    className: string,
    methodName: string,
  ): MethodStack | null {
    return methods.get(className)?.get(methodName) ?? null;
  }

  const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  let currentPackage: PackageState | null = null;
  let runtimeRef: TorqueRuntime | null = null;
  const getRuntime = () => runtimeRef!;
  const createBuiltins = options.builtins ?? defaultCreateBuiltins;
  const builtinsCtx: BuiltinsContext = {
    runtime: getRuntime,
    fileSystem: options.fileSystem ?? null,
  };
  const builtins = createBuiltins(builtinsCtx);

  function registerMethod(
    className: string,
    methodName: string,
    fn: TorqueMethod,
  ): void {
    if (currentPackage) {
      if (!currentPackage.methods.has(className)) {
        currentPackage.methods.set(className, new CaseInsensitiveMap());
      }
      currentPackage.methods.get(className)!.set(methodName, fn);
    } else {
      if (!methods.has(className)) {
        methods.set(className, new CaseInsensitiveMap());
      }
      const classMethods = methods.get(className)!;
      if (!classMethods.has(methodName)) {
        classMethods.set(methodName, []);
      }
      classMethods.get(methodName)!.push(fn);
    }
  }

  function registerFunction(name: string, fn: TorqueFunction): void {
    if (currentPackage) {
      currentPackage.functions.set(name, fn);
    } else {
      if (!functions.has(name)) {
        functions.set(name, []);
      }
      functions.get(name)!.push(fn);
    }
  }

  function activatePackage(name: string): void {
    const pkg = packages.get(name);
    if (!pkg) {
      // Package doesn't exist yet - defer activation until it's defined
      // This matches Torque engine behavior where activatePackage can be
      // called before the package block is executed
      pendingActivations.add(name);
      return;
    }
    if (pkg.active) return;

    pkg.active = true;
    activePackages.push(pkg.name);

    for (const [className, methodMap] of pkg.methods) {
      if (!methods.has(className)) {
        methods.set(className, new CaseInsensitiveMap());
      }
      const classMethods = methods.get(className)!;
      for (const [methodName, fn] of methodMap) {
        if (!classMethods.has(methodName)) {
          classMethods.set(methodName, []);
        }
        classMethods.get(methodName)!.push(fn);
      }
    }

    for (const [funcName, fn] of pkg.functions) {
      if (!functions.has(funcName)) {
        functions.set(funcName, []);
      }
      functions.get(funcName)!.push(fn);
    }
  }

  function deactivatePackage(name: string): void {
    const pkg = packages.get(name);
    if (!pkg || !pkg.active) return;

    pkg.active = false;
    // Find and remove from activePackages (case-insensitive search)
    const idx = activePackages.findIndex(
      (n) => n.toLowerCase() === name.toLowerCase(),
    );
    if (idx !== -1) activePackages.splice(idx, 1);

    // Remove the specific functions this package added (not just pop!)
    for (const [className, methodMap] of pkg.methods) {
      const classMethods = methods.get(className);
      if (!classMethods) continue;
      for (const [methodName, fn] of methodMap) {
        const stack = classMethods.get(methodName);
        if (stack) {
          const fnIdx = stack.indexOf(fn);
          if (fnIdx !== -1) stack.splice(fnIdx, 1);
        }
      }
    }

    for (const [funcName, fn] of pkg.functions) {
      const stack = functions.get(funcName);
      if (stack) {
        const fnIdx = stack.indexOf(fn);
        if (fnIdx !== -1) stack.splice(fnIdx, 1);
      }
    }
  }

  function packageFn(name: string, fn: () => void): void {
    let pkg = packages.get(name);
    if (!pkg) {
      pkg = {
        name,
        active: false,
        methods: new CaseInsensitiveMap(),
        functions: new CaseInsensitiveMap(),
      };
      packages.set(name, pkg);
    }

    const prevPackage = currentPackage;
    currentPackage = pkg;
    fn();
    currentPackage = prevPackage;

    // Check for deferred activation - if activatePackage was called before
    // the package was defined, activate it now
    if (pendingActivations.has(name)) {
      pendingActivations.delete(name);
      activatePackage(name);
    }
  }

  function createObject(
    className: string,
    instanceName: string | null,
    props: Record<string, any>,
    children?: TorqueObject[],
  ): TorqueObject {
    const normClass = normalize(className);
    const id = nextObjectId++;

    const obj: TorqueObject = {
      _class: normClass,
      _className: className,
      _id: id,
    };

    for (const [key, value] of Object.entries(props)) {
      obj[normalize(key)] = value;
    }

    // Extract superClass for namespace inheritance (used by ScriptObject/ScriptGroup)
    if (obj.superclass) {
      obj._superClass = normalize(String(obj.superclass));
      // Register the class -> superClass link for method lookup chains
      if (obj.class) {
        namespaceParents.set(normalize(String(obj.class)), obj._superClass);
      }
    }

    objectsById.set(id, obj);

    const name = toName(instanceName);
    if (name) {
      obj._name = name;
      objectsByName.set(name, obj);
    }

    if (children) {
      for (const child of children) {
        child._parent = obj;
      }
      obj._children = children;
    }

    const onAdd = findMethod(className, "onAdd");
    if (onAdd) {
      onAdd(obj);
    }

    return obj;
  }

  function deleteObject(obj: any): boolean {
    if (obj == null) return false;

    // Resolve object if given by ID or name
    let target: TorqueObject | undefined;
    if (typeof obj === "number") {
      target = objectsById.get(obj);
    } else if (typeof obj === "string") {
      target = objectsByName.get(obj);
    } else if (typeof obj === "object" && obj._id) {
      target = obj;
    }

    if (!target) return false;

    // Call onRemove if it exists
    const onRemove = findMethod(target._className, "onRemove");
    if (onRemove) {
      onRemove(target);
    }

    // Remove from tracking maps
    objectsById.delete(target._id);
    if (target._name) {
      objectsByName.delete(target._name);
    }
    if (target._isDatablock && target._name) {
      datablocks.delete(target._name);
    }

    // Remove from parent's children array
    if (target._parent && target._parent._children) {
      const idx = target._parent._children.indexOf(target);
      if (idx !== -1) {
        target._parent._children.splice(idx, 1);
      }
    }

    // Recursively delete children
    if (target._children) {
      for (const child of [...target._children]) {
        deleteObject(child);
      }
    }

    return true;
  }

  function datablock(
    className: string,
    instanceName: string | null,
    parentName: string | null,
    props: Record<string, any>,
  ): TorqueObject {
    const normClass = normalize(className);
    const id = nextDatablockId++;

    const obj: TorqueObject = {
      _class: normClass,
      _className: className,
      _id: id,
      _isDatablock: true,
    };

    const parentKey = toName(parentName);
    if (parentKey) {
      const parentObj = datablocks.get(parentKey);
      if (parentObj) {
        for (const [key, value] of Object.entries(parentObj)) {
          if (!key.startsWith("_")) {
            obj[key] = value;
          }
        }
        obj._parent = parentObj;
      }
    }

    for (const [key, value] of Object.entries(props)) {
      obj[normalize(key)] = value;
    }

    objectsById.set(id, obj);

    const name = toName(instanceName);
    if (name) {
      obj._name = name;
      objectsByName.set(name, obj);
      datablocks.set(name, obj);
    }

    return obj;
  }

  /**
   * Resolve an object reference to an actual TorqueObject.
   * In TorqueScript, bareword identifiers in member expressions (e.g., `Game.cdtrack`)
   * are looked up by name via Sim::findObject(). This function handles that resolution.
   */
  function resolveObject(obj: any): TorqueObject | null {
    if (obj == null || obj === "") return null;
    // Already an object with an ID - return as-is
    if (typeof obj === "object" && obj._id != null) return obj;
    // String or number - look up by name or ID
    if (typeof obj === "string") return objectsByName.get(obj) ?? null;
    if (typeof obj === "number") return objectsById.get(obj) ?? null;
    return null;
  }

  function prop(obj: any, name: string): any {
    const resolved = resolveObject(obj);
    if (resolved == null) return "";
    return resolved[normalize(name)] ?? "";
  }

  function setProp(obj: any, name: string, value: any): any {
    const resolved = resolveObject(obj);
    if (resolved == null) return value;
    resolved[normalize(name)] = value;
    return value;
  }

  function getIndex(obj: any, index: any): any {
    const resolved = resolveObject(obj);
    if (resolved == null) return "";
    return resolved[String(index)] ?? "";
  }

  function setIndex(obj: any, index: any, value: any): any {
    const resolved = resolveObject(obj);
    if (resolved == null) return value;
    resolved[String(index)] = value;
    return value;
  }

  function postIncDec(obj: any, key: string, delta: 1 | -1): number {
    const resolved = resolveObject(obj);
    if (resolved == null) return 0;
    const oldValue = toNum(resolved[key]);
    resolved[key] = oldValue + delta;
    return oldValue;
  }

  function propPostInc(obj: any, name: string): number {
    return postIncDec(obj, normalize(name), 1);
  }

  function propPostDec(obj: any, name: string): number {
    return postIncDec(obj, normalize(name), -1);
  }

  function indexPostInc(obj: any, index: any): number {
    return postIncDec(obj, String(index), 1);
  }

  function indexPostDec(obj: any, index: any): number {
    return postIncDec(obj, String(index), -1);
  }

  // TorqueScript array indexing: foo[0] -> foo0, foo[0,1] -> foo0_1
  function key(base: string, ...indices: any[]): string {
    return base + indices.join("_");
  }

  function findMethod(
    className: string,
    methodName: string,
  ): TorqueMethod | null {
    const stack = getMethodStack(className, methodName);
    return stack && stack.length > 0 ? stack[stack.length - 1] : null;
  }

  /** Call a method with execution context tracking for proper Parent:: support */
  function callMethodWithContext(
    className: string,
    methodName: string,
    thisObj: any,
    args: any[],
  ): { found: true; result: any } | { found: false } {
    const stack = getMethodStack(className, methodName);
    if (!stack || stack.length === 0) return { found: false };

    const key = methodContextKey(className, methodName);
    const result = withExecutionContext(key, stack.length - 1, () =>
      stack[stack.length - 1](thisObj, ...args),
    );
    return { found: true, result };
  }

  function fireMethodHooks(
    className: string,
    methodName: string,
    thisObj: TorqueObject,
    args: any[],
  ): void {
    const classHooks = methodHooks.get(className);
    if (classHooks) {
      const hooks = classHooks.get(methodName);
      if (hooks) {
        for (const hook of hooks) {
          hook(thisObj, ...args);
        }
      }
    }
  }

  function call(obj: any, methodName: string, ...args: any[]): any {
    if (obj == null) return "";

    // Dereference string/number names to actual objects
    if (typeof obj === "string" || typeof obj === "number") {
      obj = deref(obj);
      if (obj == null) return "";
    }

    // For ScriptObject/ScriptGroup, the "class" property overrides the C++ class name
    const objClass = obj.class || obj._className || obj._class;

    if (objClass) {
      const callResult = callMethodWithContext(objClass, methodName, obj, args);
      if (callResult.found) {
        fireMethodHooks(objClass, methodName, obj, args);
        return callResult.result;
      }
    }

    // Walk the superClass chain (for ScriptObject/ScriptGroup inheritance)
    // First check the object's direct _superClass, then walk namespaceParents
    let currentClass = obj._superClass || namespaceParents.get(objClass);
    while (currentClass) {
      const callResult = callMethodWithContext(
        currentClass,
        methodName,
        obj,
        args,
      );
      if (callResult.found) {
        fireMethodHooks(currentClass, methodName, obj, args);
        return callResult.result;
      }
      // Walk up the namespace parent chain
      currentClass = namespaceParents.get(currentClass);
    }

    return "";
  }

  function nsCall(namespace: string, method: string, ...args: any[]): any {
    // For nsCall, args are passed directly to the method (including %this as args[0])
    // This is different from call() where thisObj is passed separately
    const stack = getMethodStack(namespace, method);
    if (!stack || stack.length === 0) return "";

    const key = methodContextKey(namespace, method);
    const fn = stack[stack.length - 1] as (...args: any[]) => any;
    const result = withExecutionContext(key, stack.length - 1, () =>
      fn(...args),
    );

    // First arg is typically the object (e.g., %game in DefaultGame::missionLoadDone(%game))
    const thisObj = args[0];
    if (thisObj && typeof thisObj === "object") {
      fireMethodHooks(namespace, method, thisObj, args.slice(1));
    }
    return result;
  }

  function nsRef(
    namespace: string,
    method: string,
  ): ((...args: any[]) => any) | null {
    const stack = getMethodStack(namespace, method);
    if (!stack || stack.length === 0) return null;

    const key = methodContextKey(namespace, method);
    const fn = stack[stack.length - 1] as (...args: any[]) => any;
    // Return a wrapper that tracks execution context for proper Parent:: support
    return (...args: any[]) =>
      withExecutionContext(key, stack.length - 1, () => fn(...args));
  }

  function parent(
    currentClass: string,
    methodName: string,
    thisObj: any,
    ...args: any[]
  ): any {
    const stack = getMethodStack(currentClass, methodName);
    const key = methodContextKey(currentClass, methodName);
    const currentIndex = getCurrentExecutionIndex(key);

    // If we have a parent in the stack (package override), call it
    if (stack && currentIndex !== undefined && currentIndex >= 1) {
      const parentIndex = currentIndex - 1;
      const result = withExecutionContext(key, parentIndex, () =>
        stack[parentIndex](thisObj, ...args),
      );
      // Fire hooks for the method that was called (same class, previous version)
      if (thisObj && typeof thisObj === "object") {
        fireMethodHooks(currentClass, methodName, thisObj, args);
      }
      return result;
    }

    // Otherwise, walk up the namespace parent chain (like real TorqueScript)
    // This handles cases like TDMGame::missionLoadDone calling Parent::missionLoadDone
    // which should resolve to DefaultGame::missionLoadDone
    let parentClass = namespaceParents.get(currentClass);
    while (parentClass) {
      const parentStack = getMethodStack(parentClass, methodName);
      if (parentStack && parentStack.length > 0) {
        const parentKey = methodContextKey(parentClass, methodName);
        const result = withExecutionContext(
          parentKey,
          parentStack.length - 1,
          () => parentStack[parentStack.length - 1](thisObj, ...args),
        );
        // Fire hooks for the parent class method that was actually called
        if (thisObj && typeof thisObj === "object") {
          fireMethodHooks(parentClass, methodName, thisObj, args);
        }
        return result;
      }
      parentClass = namespaceParents.get(parentClass);
    }

    return "";
  }

  function parentFunc(currentFunc: string, ...args: any[]): any {
    const stack = functions.get(currentFunc);
    if (!stack) return "";

    const key = currentFunc.toLowerCase();
    const currentIndex = getCurrentExecutionIndex(key);
    if (currentIndex === undefined || currentIndex < 1) return "";

    const parentIndex = currentIndex - 1;
    return withExecutionContext(key, parentIndex, () =>
      stack[parentIndex](...args),
    );
  }

  function toNum(value: any): number {
    if (value == null || value === "") return 0;
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  function add(a: any, b: any): number {
    return toNum(a) + toNum(b);
  }

  function sub(a: any, b: any): number {
    return toNum(a) - toNum(b);
  }

  function mul(a: any, b: any): number {
    return toNum(a) * toNum(b);
  }

  function div(a: any, b: any): number {
    return toNum(a) / toNum(b);
  }

  function neg(a: any): number {
    return -toNum(a);
  }

  function lt(a: any, b: any): boolean {
    return toNum(a) < toNum(b);
  }

  function le(a: any, b: any): boolean {
    return toNum(a) <= toNum(b);
  }

  function gt(a: any, b: any): boolean {
    return toNum(a) > toNum(b);
  }

  function ge(a: any, b: any): boolean {
    return toNum(a) >= toNum(b);
  }

  function eq(a: any, b: any): boolean {
    return toNum(a) === toNum(b);
  }

  function ne(a: any, b: any): boolean {
    return toNum(a) !== toNum(b);
  }

  function mod(a: any, b: any): number {
    const ib = toI32(b);
    if (ib === 0) return 0;
    return toI32(a) % ib;
  }

  function bitand(a: any, b: any): number {
    return toU32(a) & toU32(b);
  }

  function bitor(a: any, b: any): number {
    return toU32(a) | toU32(b);
  }

  function bitxor(a: any, b: any): number {
    return toU32(a) ^ toU32(b);
  }

  function shl(a: any, b: any): number {
    return toU32(toU32(a) << (toU32(b) & 31));
  }

  function shr(a: any, b: any): number {
    return toU32(a) >>> (toU32(b) & 31);
  }

  function bitnot(a: any): number {
    return ~toU32(a) >>> 0;
  }

  function concat(...parts: any[]): string {
    return parts.map((p) => String(p ?? "")).join("");
  }

  function streq(a: any, b: any): boolean {
    return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
  }

  function switchStr(
    value: any,
    cases: Record<string, () => void> & { default?: () => void },
  ): void {
    const normValue = String(value ?? "").toLowerCase();

    for (const [caseValue, handler] of Object.entries(cases)) {
      if (caseValue === "default") continue;
      if (normalize(caseValue) === normValue) {
        handler();
        return;
      }
    }

    if (cases.default) {
      cases.default();
    }
  }

  /**
   * Find an object by path. Supports:
   * - Simple names: "MissionGroup"
   * - Path resolution: "MissionGroup/Teams/team0"
   * - Numeric IDs: "123" or "123/child"
   * - Absolute paths: "/MissionGroup/Teams"
   */
  function findObjectByPath(name: string): TorqueObject | null {
    if (!name || name === "") return null;

    // Handle leading slash (absolute path from root)
    if (name.startsWith("/")) {
      name = name.slice(1);
    }

    // Split into path segments
    const segments = name.split("/");
    let current: TorqueObject | null = null;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      if (i === 0) {
        // First segment: look up in global dictionaries
        // Check if it's a numeric ID
        if (/^\d+$/.test(segment)) {
          current = objectsById.get(parseInt(segment, 10)) ?? null;
        } else {
          current = objectsByName.get(segment) ?? null;
        }
      } else {
        // Subsequent segments: look in children of current object
        if (!current || !current._children) {
          return null;
        }
        const segmentLower = segment.toLowerCase();
        const child = current._children.find(
          (c) => c._name?.toLowerCase() === segmentLower,
        );
        current = child ?? null;
      }

      if (!current) return null;
    }

    return current;
  }

  function deref(tag: any): any {
    if (tag == null || tag === "") return null;
    return findObjectByPath(String(tag));
  }

  function nameToId(name: string): number {
    const obj = findObjectByPath(name);
    // TorqueScript returns -1 when object not found, not 0
    return obj ? obj._id : -1;
  }

  function isObject(obj: any): boolean {
    if (obj == null) return false;
    if (typeof obj === "object" && obj._id) return true;
    if (typeof obj === "number") return objectsById.has(obj);
    if (typeof obj === "string") return objectsByName.has(obj);
    return false;
  }

  function isFunction(name: string): boolean {
    // Check both user-defined functions and builtins
    return functions.has(name) || name.toLowerCase() in builtins;
  }

  function isPackage(name: string): boolean {
    return packages.has(name);
  }

  function isActivePackage(name: string): boolean {
    const pkg = packages.get(name);
    return pkg?.active ?? false;
  }

  function getPackageList(): string {
    return activePackages.join(" ");
  }

  function createVariableStore(
    storage: CaseInsensitiveMap<any>,
  ): VariableStoreAPI {
    // TorqueScript array indexing: $foo[0] -> $foo0, $foo[0,1] -> $foo0_1
    function fullName(name: string, indices: any[]): string {
      return name + indices.join("_");
    }

    return {
      get(name: string, ...indices: any[]): any {
        return storage.get(fullName(name, indices)) ?? "";
      },
      set(name: string, ...args: any[]): any {
        if (args.length === 0) {
          throw new Error("set() requires at least a value argument");
        }
        if (args.length === 1) {
          storage.set(name, args[0]);
          return args[0];
        }
        const value = args[args.length - 1];
        const indices = args.slice(0, -1);
        storage.set(fullName(name, indices), value);
        return value;
      },
      postInc(name: string, ...indices: any[]): number {
        const key = fullName(name, indices);
        const oldValue = toNum(storage.get(key));
        storage.set(key, oldValue + 1);
        return oldValue;
      },
      postDec(name: string, ...indices: any[]): number {
        const key = fullName(name, indices);
        const oldValue = toNum(storage.get(key));
        storage.set(key, oldValue - 1);
        return oldValue;
      },
    };
  }

  function createLocals(): LocalsAPI {
    return createVariableStore(new CaseInsensitiveMap<any>());
  }

  const $: RuntimeAPI = {
    registerMethod,
    registerFunction,
    package: packageFn,
    activatePackage,
    deactivatePackage,
    create: createObject,
    datablock,
    deleteObject,
    prop,
    setProp,
    getIndex,
    setIndex,
    propPostInc,
    propPostDec,
    indexPostInc,
    indexPostDec,
    key,
    call,
    nsCall,
    nsRef,
    parent,
    parentFunc,
    add,
    sub,
    mul,
    div,
    neg,
    lt,
    le,
    gt,
    ge,
    eq,
    ne,
    mod,
    bitand,
    bitor,
    bitxor,
    shl,
    shr,
    bitnot,
    concat,
    streq,
    switchStr,
    deref,
    nameToId,
    isObject,
    isFunction,
    isPackage,
    isActivePackage,
    getPackageList,
    locals: createLocals,
    onMethodCalled(
      className: string,
      methodName: string,
      callback: (thisObj: TorqueObject, ...args: any[]) => void,
    ): void {
      let classMethods = methodHooks.get(className);
      if (!classMethods) {
        classMethods = new CaseInsensitiveMap();
        methodHooks.set(className, classMethods);
      }
      let hooks = classMethods.get(methodName);
      if (!hooks) {
        hooks = [];
        classMethods.set(methodName, hooks);
      }
      hooks.push(callback);
    },
  };

  const $f: FunctionsAPI = {
    call(name: string, ...args: any[]): any {
      const fnStack = functions.get(name);
      if (fnStack && fnStack.length > 0) {
        const key = name.toLowerCase();
        return withExecutionContext(key, fnStack.length - 1, () =>
          fnStack[fnStack.length - 1](...args),
        );
      }

      // Builtins are stored with lowercase keys
      const builtin = builtins[name.toLowerCase()];
      if (builtin) {
        return builtin(...args);
      }

      // Match TorqueScript behavior: warn and return empty string
      console.warn(
        `Unknown function: ${name}(${args
          .map((a) => JSON.stringify(a))
          .join(", ")})`,
      );
      return "";
    },
  };

  const $g: GlobalsAPI = createVariableStore(globals);

  const state: RuntimeState = {
    methods,
    functions,
    packages,
    activePackages,
    objectsById,
    objectsByName,
    datablocks,
    globals,
    executedScripts,
    failedScripts,
    scripts,
    generatedCode,
    pendingTimeouts,
    startTime: Date.now(),
  };

  function destroy(): void {
    for (const timeoutId of state.pendingTimeouts) {
      clearTimeout(timeoutId);
    }
    state.pendingTimeouts.clear();
  }

  function getOrGenerateCode(ast: Program): string {
    let code = generatedCode.get(ast);
    if (code == null) {
      code = generate(ast);
      generatedCode.set(ast, code);
    }
    return code;
  }

  function executeAST(ast: Program): void {
    const code = getOrGenerateCode(ast);
    // Provide $l (locals) at module scope for top-level local variable access
    const $l = createLocals();
    const execFn = new Function("$", "$f", "$g", "$l", code);
    execFn($, $f, $g, $l);
  }

  function createLoadedScript(ast: Program, path?: string): LoadedScript {
    return {
      execute(): void {
        if (path) {
          const normalized = normalizePath(path);
          state.executedScripts.add(normalized);
        }
        executeAST(ast);
      },
    };
  }

  async function loadDependencies(
    scriptsToLoad: string[],
    loadingPromises: Map<string, Promise<void>>,
    ancestors: Set<string>,
  ): Promise<void> {
    const loader = options.loadScript;
    if (!loader) {
      if (scriptsToLoad.length > 0) {
        console.warn(
          `Script has exec() calls but no loadScript provided:`,
          scriptsToLoad,
        );
      }
      return;
    }

    async function loadSingleScript(ref: string): Promise<void> {
      options.signal?.throwIfAborted();
      const normalized = normalizePath(ref);

      // Skip if already loaded or failed
      if (
        state.scripts.has(normalized) ||
        state.failedScripts.has(normalized)
      ) {
        return;
      }

      // Skip if script matches ignore patterns
      if (isIgnoredScript && isIgnoredScript(normalized)) {
        console.warn(`Ignoring script: ${ref}`);
        state.failedScripts.add(normalized);
        return;
      }

      // If this script is an ancestor in our load chain, it's a cycle - skip
      // (awaiting would cause deadlock)
      if (ancestors.has(normalized)) {
        return;
      }

      // If already loading from a parallel branch, wait for it to complete
      const existingPromise = loadingPromises.get(normalized);
      if (existingPromise) {
        await existingPromise;
        return;
      }

      const loadPromise = (async () => {
        // Pass original path to loader - it handles its own normalization
        const source = await loader(ref);
        if (source == null) {
          console.warn(`Script not found: ${ref}`);
          state.failedScripts.add(normalized);
          return;
        }

        let depAst: Program;
        try {
          depAst = parse(source, { filename: ref });
        } catch (err) {
          console.warn(`Failed to parse script: ${ref}`, err);
          state.failedScripts.add(normalized);
          return;
        }

        // Add this script to ancestors for nested loads (cycle detection)
        const newAncestors = new Set(ancestors);
        newAncestors.add(normalized);

        // Recursively load this script's dependencies in parallel
        await loadDependencies(
          depAst.execScriptPaths,
          loadingPromises,
          newAncestors,
        );

        // Store the parsed AST
        state.scripts.set(normalized, depAst);
      })();

      loadingPromises.set(normalized, loadPromise);
      await loadPromise;
    }

    // Load all scripts in parallel
    await Promise.all(scriptsToLoad.map(loadSingleScript));
  }

  async function loadFromPath(path: string): Promise<LoadedScript> {
    const loader = options.loadScript;
    if (!loader) {
      throw new Error("loadFromPath requires loadScript option to be set");
    }

    const normalized = normalizePath(path);
    if (state.scripts.has(normalized)) {
      return createLoadedScript(state.scripts.get(normalized)!, path);
    }

    // Pass original path to loader - it handles its own normalization
    const source = await loader(path);
    if (source == null) {
      throw new Error(`Script not found: ${path}`);
    }

    return loadFromSource(source, { path });
  }

  async function loadFromSource(
    source: string,
    loadOptions?: LoadScriptOptions,
  ): Promise<LoadedScript> {
    // Check if already loaded
    if (loadOptions?.path) {
      const normalized = normalizePath(loadOptions.path);
      if (state.scripts.has(normalized)) {
        return createLoadedScript(
          state.scripts.get(normalized)!,
          loadOptions.path,
        );
      }
    }

    const ast = parse(source, { filename: loadOptions?.path });
    return loadFromAST(ast, loadOptions);
  }

  async function loadFromAST(
    ast: Program,
    loadOptions?: LoadScriptOptions,
  ): Promise<LoadedScript> {
    const loadingPromises = new Map<string, Promise<void>>();
    const ancestors = new Set<string>();
    if (loadOptions?.path) {
      const normalized = normalizePath(loadOptions.path);
      // Mark the main script as loaded to prevent cycles back to it
      state.scripts.set(normalized, ast);
      ancestors.add(normalized);
    }

    // Load dependencies and any preload scripts
    const scriptsToLoad = [
      ...ast.execScriptPaths,
      ...(options.preloadScripts ?? []),
    ];
    await loadDependencies(scriptsToLoad, loadingPromises, ancestors);

    return createLoadedScript(ast, loadOptions?.path);
  }

  runtimeRef = {
    $,
    $f,
    $g,
    state,
    destroy,
    executeAST,
    loadFromPath,
    loadFromSource,
    loadFromAST,
    call: (name: string, ...args: any[]) => $f.call(name, ...args),
    getObjectByName: (name: string) => objectsByName.get(name),
  };
  return runtimeRef;
}

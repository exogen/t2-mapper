import { generate } from "./codegen";
import { parse, type Program } from "./index";
import { createBuiltins as defaultCreateBuiltins } from "./builtins";
import { CaseInsensitiveMap, normalizePath } from "./utils";
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
  TorqueFunction,
  TorqueMethod,
  TorqueObject,
  TorqueRuntime,
  TorqueRuntimeOptions,
  VariableStoreAPI,
} from "./types";

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

  const FIRST_DATABLOCK_ID = 3;
  const FIRST_DYNAMIC_ID = 1027;
  let nextDatablockId = FIRST_DATABLOCK_ID;
  let nextObjectId = FIRST_DYNAMIC_ID;

  const objectsById = new Map<number, TorqueObject>();
  const objectsByName = new CaseInsensitiveMap<TorqueObject>();
  const datablocks = new CaseInsensitiveMap<TorqueObject>();
  const globals = new CaseInsensitiveMap<any>();
  const executedScripts = new Set<string>();
  const scripts = new Map<string, Program>();
  const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  let currentPackage: PackageState | null = null;
  let runtimeRef: TorqueRuntime | null = null;
  const getRuntime = () => runtimeRef!;
  const createBuiltins = options.builtins ?? defaultCreateBuiltins;
  const builtinsCtx: BuiltinsContext = { runtime: getRuntime };
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
    if (!pkg || pkg.active) return;

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

    activatePackage(name);
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

  function prop(obj: any, name: string): any {
    if (obj == null) return "";
    return obj[normalize(name)] ?? "";
  }

  function setProp(obj: any, name: string, value: any): any {
    if (obj == null) return value;
    obj[normalize(name)] = value;
    return value;
  }

  function getIndex(obj: any, index: any): any {
    if (obj == null) return "";
    return obj[String(index)] ?? "";
  }

  function setIndex(obj: any, index: any, value: any): any {
    if (obj == null) return value;
    obj[String(index)] = value;
    return value;
  }

  function postIncDec(obj: any, key: string, delta: 1 | -1): number {
    if (obj == null) return 0;
    const oldValue = toNum(obj[key]);
    obj[key] = oldValue + delta;
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
    const classMethods = methods.get(className);
    if (classMethods) {
      const stack = classMethods.get(methodName);
      if (stack && stack.length > 0) {
        return stack[stack.length - 1];
      }
    }
    return null;
  }

  function findFunction(name: string): TorqueFunction | null {
    const stack = functions.get(name);
    if (stack && stack.length > 0) {
      return stack[stack.length - 1];
    }
    return null;
  }

  function call(obj: any, methodName: string, ...args: any[]): any {
    if (obj == null) return "";

    // Dereference string/number names to actual objects
    if (typeof obj === "string" || typeof obj === "number") {
      obj = deref(obj);
      if (obj == null) return "";
    }

    const objClass = obj._className || obj._class;

    if (objClass) {
      const fn = findMethod(objClass, methodName);
      if (fn) {
        return fn(obj, ...args);
      }
    }

    const db = obj._datablock || obj;
    if (db._parent) {
      let current = db._parent;
      while (current) {
        const parentClass = current._className || current._class;
        if (parentClass) {
          const fn = findMethod(parentClass, methodName);
          if (fn) {
            return fn(obj, ...args);
          }
        }
        current = current._parent;
      }
    }

    return "";
  }

  function nsCall(namespace: string, method: string, ...args: any[]): any {
    const fn = findMethod(namespace, method);
    if (fn) {
      return (fn as TorqueFunction)(...args);
    }
    return "";
  }

  function nsRef(
    namespace: string,
    method: string,
  ): ((...args: any[]) => any) | null {
    const fn = findMethod(namespace, method);
    if (fn) {
      return (...args: any[]) => (fn as TorqueFunction)(...args);
    }
    return null;
  }

  function parent(
    currentClass: string,
    methodName: string,
    thisObj: any,
    ...args: any[]
  ): any {
    const classMethods = methods.get(currentClass);
    if (!classMethods) return "";

    const stack = classMethods.get(methodName);
    if (!stack || stack.length < 2) return "";

    // Call parent method with the object as first argument
    return stack[stack.length - 2](thisObj, ...args);
  }

  function parentFunc(currentFunc: string, ...args: any[]): any {
    const stack = functions.get(currentFunc);
    if (!stack || stack.length < 2) return "";

    return stack[stack.length - 2](...args);
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
    const divisor = toNum(b);
    if (divisor === 0) return 0; // TorqueScript returns 0 for division by zero
    return toNum(a) / divisor;
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

  function deref(tag: any): any {
    if (tag == null || tag === "") return null;
    return objectsByName.get(String(tag)) ?? null;
  }

  function nameToId(name: string): number {
    const obj = objectsByName.get(name);
    return obj ? obj._id : 0;
  }

  function isObject(obj: any): boolean {
    if (obj == null) return false;
    if (typeof obj === "object" && obj._id) return true;
    if (typeof obj === "number") return objectsById.has(obj);
    if (typeof obj === "string") return objectsByName.has(obj);
    return false;
  }

  function isFunction(name: string): boolean {
    return functions.has(name);
  }

  function isPackage(name: string): boolean {
    return packages.has(name);
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
    locals: createLocals,
  };

  const $f: FunctionsAPI = {
    call(name: string, ...args: any[]): any {
      const fn = findFunction(name);
      if (fn) {
        return fn(...args);
      }

      // Builtins are stored with lowercase keys
      const builtin = builtins[name.toLowerCase()];
      if (builtin) {
        return builtin(...args);
      }

      throw new Error(
        `Unknown function: ${name}(${args
          .map((a) => JSON.stringify(a))
          .join(", ")})`,
      );
    },
  };

  const $g: GlobalsAPI = createVariableStore(globals);

  const generatedCode = new WeakMap<Program, string>();

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
    ast: Program,
    loading: Set<string>,
  ): Promise<void> {
    const loader = options.loadScript;
    if (!loader) {
      // No loader, can't resolve dependencies
      if (ast.execScriptPaths.length > 0) {
        console.warn(
          `Script has exec() calls but no loadScript provided:`,
          ast.execScriptPaths,
        );
      }
      return;
    }

    for (const ref of ast.execScriptPaths) {
      const normalized = normalizePath(ref);

      // Skip if already loaded or currently loading (cycle detection)
      if (state.scripts.has(normalized) || loading.has(normalized)) {
        continue;
      }

      loading.add(normalized);

      const source = await loader(ref);
      if (source == null) {
        console.warn(`Script not found: ${ref}`);
        loading.delete(normalized);
        continue;
      }

      let depAst: Program;
      try {
        depAst = parse(source, { filename: ref });
      } catch (err) {
        console.warn(`Failed to parse script: ${ref}`, err);
        loading.delete(normalized);
        continue;
      }

      // Recursively load this script's dependencies first
      await loadDependencies(depAst, loading);

      // Store the parsed AST
      state.scripts.set(normalized, depAst);
      loading.delete(normalized);
    }
  }

  async function loadFromPath(path: string): Promise<LoadedScript> {
    const loader = options.loadScript;
    if (!loader) {
      throw new Error("loadFromPath requires loadScript option to be set");
    }

    // Check if already loaded (avoid unnecessary fetch)
    const normalized = normalizePath(path);
    if (state.scripts.has(normalized)) {
      return createLoadedScript(state.scripts.get(normalized)!, path);
    }

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
    // Load dependencies
    const loading = new Set<string>();
    if (loadOptions?.path) {
      const normalized = normalizePath(loadOptions.path);
      loading.add(normalized);
      state.scripts.set(normalized, ast);
    }
    await loadDependencies(ast, loading);

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
  };
  return runtimeRef;
}

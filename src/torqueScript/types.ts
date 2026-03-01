import type { Program } from "./ast";
import type { ProgressTrackerInternal } from "./progress";
import type { CaseInsensitiveMap } from "./utils";

export type TorqueFunction = (...args: any[]) => any;
export type TorqueMethod = (this_: TorqueObject, ...args: any[]) => any;

export interface TorqueObject {
  _class: string; // normalized class name
  _className: string; // original class name
  _id: number;
  _name?: string;
  _isDatablock?: boolean;
  _superClass?: string; // normalized superClass name (for ScriptObjects)
  _parent?: TorqueObject;
  _children?: TorqueObject[];
  [key: string]: any;
}

export interface ReactiveFieldRule {
  classNames: string[];
  fields: string[];
}

export interface ReactiveMethodRule {
  classNames: string[];
  methods: string[];
}

export interface RuntimeObjectCreatedEvent {
  type: "object.created";
  objectId: number;
  object: TorqueObject;
}

export interface RuntimeObjectDeletedEvent {
  type: "object.deleted";
  objectId: number;
  object?: TorqueObject;
}

export interface RuntimeFieldChangedEvent {
  type: "field.changed";
  objectId: number;
  field: string;
  value: any;
  previousValue: any;
  object?: TorqueObject;
}

export interface RuntimeMethodCalledEvent {
  type: "method.called";
  className: string;
  methodName: string;
  objectId?: number;
  args: any[];
}

export interface RuntimeGlobalChangedEvent {
  type: "global.changed";
  name: string;
  value: any;
  previousValue: any;
}

export type RuntimeMutationEvent =
  | RuntimeObjectCreatedEvent
  | RuntimeObjectDeletedEvent
  | RuntimeFieldChangedEvent
  | RuntimeMethodCalledEvent
  | RuntimeGlobalChangedEvent;

export interface RuntimeBatchFlushedEvent {
  type: "batch.flushed";
  tick: number;
  events: RuntimeMutationEvent[];
}

export type RuntimeEvent = RuntimeMutationEvent | RuntimeBatchFlushedEvent;
export type RuntimeEventListener = (event: RuntimeEvent) => void;

export type MethodStack = TorqueMethod[];
export type FunctionStack = TorqueFunction[];

export interface PackageState {
  name: string;
  active: boolean;
  methods: CaseInsensitiveMap<CaseInsensitiveMap<TorqueMethod>>; // class -> method -> fn
  functions: CaseInsensitiveMap<TorqueFunction>;
}

export interface RuntimeState {
  methods: CaseInsensitiveMap<CaseInsensitiveMap<MethodStack>>;
  functions: CaseInsensitiveMap<FunctionStack>;
  packages: CaseInsensitiveMap<PackageState>;
  activePackages: readonly string[];
  objectsById: Map<number, TorqueObject>;
  objectsByName: CaseInsensitiveMap<TorqueObject>;
  datablocks: CaseInsensitiveMap<TorqueObject>;
  globals: CaseInsensitiveMap<any>;
  executedScripts: Set<string>;
  failedScripts: Set<string>;
  scripts: Map<string, Program>;
  generatedCode: WeakMap<Program, string>;
  pendingTimeouts: Set<ReturnType<typeof setTimeout>>;
  startTime: number;
}

export interface TorqueRuntime {
  $: RuntimeAPI;
  $f: FunctionsAPI;
  $g: GlobalsAPI;
  state: RuntimeState;
  destroy(): void;
  executeAST(ast: Program): void;
  loadFromPath(path: string): Promise<LoadedScript>;
  loadFromSource(
    source: string,
    options?: LoadScriptOptions,
  ): Promise<LoadedScript>;
  loadFromAST(ast: Program, options?: LoadScriptOptions): Promise<LoadedScript>;
  /** Call a TorqueScript function by name. Shorthand for $f.call(). */
  call(name: string, ...args: any[]): any;
  /** Get an object by its name. Returns undefined if not found. */
  getObjectByName(name: string): TorqueObject | undefined;
  /** Subscribe to runtime reactivity events. */
  subscribeRuntimeEvents(listener: RuntimeEventListener): () => void;
}

export type ScriptLoader = (path: string) => Promise<string | null>;

/**
 * Handler for file system operations (findFirstFile, findNextFile, isFile).
 * The runtime maintains an iterator state for the current file search.
 */
export interface FileSystemHandler {
  /**
   * Find files matching a glob pattern.
   * Returns an array of matching file paths (relative to game root).
   */
  findFiles(pattern: string): string[];

  /**
   * Check if a file exists at the given path.
   */
  isFile(path: string): boolean;
}

export interface LoadedScript {
  execute(): void;
}

export interface TorqueRuntimeOptions {
  loadScript?: ScriptLoader;
  fileSystem?: FileSystemHandler;
  builtins?: BuiltinsFactory;
  signal?: AbortSignal;
  globals?: Record<string, any>;
  /**
   * Scripts to preload during dependency resolution. Useful for scripts that
   * are exec()'d dynamically and can't be statically analyzed.
   */
  preloadScripts?: string[];
  /**
   * Glob patterns for scripts to ignore during dependency resolution.
   * Matched scripts will be skipped and logged as warnings.
   */
  ignoreScripts?: string[];
  /**
   * Cache for parsed scripts and generated code. If provided, the runtime
   * will use this cache to store and retrieve parsed ASTs, avoiding redundant
   * parsing when scripts are loaded multiple times across runtime instances.
   * Create with `createScriptCache()`.
   */
  cache?: ScriptCache;
  /**
   * Progress tracker for monitoring script loading. If provided, the runtime
   * will report loading progress as scripts are discovered and loaded.
   * Create with `createProgressTracker()`.
   */
  progress?: ProgressTrackerInternal;
  /** Controls which field writes emit runtime reactivity events. */
  reactiveFieldRules?: ReactiveFieldRule[];
  /** Controls which method calls emit runtime reactivity events. */
  reactiveMethodRules?: ReactiveMethodRule[];
  /**
   * Controls which global variable writes emit runtime reactivity events.
   * Names may be specified with or without a leading `$`.
   */
  reactiveGlobalNames?: string[];
}

export interface LoadScriptOptions {
  path?: string;
}

/**
 * Cache for parsed scripts and generated code. Can be shared across
 * multiple runtime instances to speed up script loading when switching
 * missions or restarting the runtime.
 */
export interface ScriptCache {
  /** Parsed ASTs by normalized path */
  scripts: Map<string, Program>;
  /** Generated JavaScript code by AST */
  generatedCode: WeakMap<Program, string>;
}

export interface RuntimeAPI {
  // Registration
  registerMethod(className: string, methodName: string, fn: TorqueMethod): void;
  registerFunction(name: string, fn: TorqueFunction): void;
  package(name: string, fn: () => void): void;
  activatePackage(name: string): void;
  deactivatePackage(name: string): void;

  // Object creation and deletion
  create(
    className: string,
    instanceName: string | null,
    props: Record<string, any>,
    children?: TorqueObject[],
  ): TorqueObject;
  datablock(
    className: string,
    instanceName: string | null,
    parentName: string | null,
    props: Record<string, any>,
  ): TorqueObject;
  deleteObject(obj: any): boolean;

  // Property access
  prop(obj: any, name: string): any;
  setProp(obj: any, name: string, value: any): any;
  getIndex(obj: any, index: any): any;
  setIndex(obj: any, index: any, value: any): any;
  propPostInc(obj: any, name: string): number;
  propPostDec(obj: any, name: string): number;
  indexPostInc(obj: any, index: any): number;
  indexPostDec(obj: any, index: any): number;
  key(...parts: any[]): string;

  // Method dispatch
  call(obj: any, methodName: string, ...args: any[]): any;
  nsCall(namespace: string, method: string, ...args: any[]): any;
  nsRef(namespace: string, method: string): ((...args: any[]) => any) | null;
  parent(currentClass: string, methodName: string, ...args: any[]): any;
  parentFunc(currentFunc: string, ...args: any[]): any;

  // Arithmetic (numeric coercion)
  add(a: any, b: any): number;
  sub(a: any, b: any): number;
  mul(a: any, b: any): number;
  div(a: any, b: any): number;
  neg(a: any): number;

  // Numeric comparison
  lt(a: any, b: any): boolean;
  le(a: any, b: any): boolean;
  gt(a: any, b: any): boolean;
  ge(a: any, b: any): boolean;
  eq(a: any, b: any): boolean;
  ne(a: any, b: any): boolean;

  // Integer math
  mod(a: any, b: any): number;
  bitand(a: any, b: any): number;
  bitor(a: any, b: any): number;
  bitxor(a: any, b: any): number;
  shl(a: any, b: any): number;
  shr(a: any, b: any): number;
  bitnot(a: any): number;

  // String operations
  concat(...parts: any[]): string;
  streq(a: any, b: any): boolean;
  switchStr(
    value: any,
    cases: Record<string, () => void> & { default?: () => void },
  ): void;

  // Special
  deref(tag: any): any;
  nameToId(name: string): number;
  isObject(obj: any): boolean;
  isFunction(name: string): boolean;
  isPackage(name: string): boolean;
  isActivePackage(name: string): boolean;
  getPackageList(): string;

  // Local variable scope
  locals(): LocalsAPI;

  // Hooks
  /**
   * Register a callback to be called after a method is invoked.
   * Useful for hooking into game events like missionLoadDone without
   * worrying about method registration order.
   */
  onMethodCalled(
    className: string,
    methodName: string,
    callback: (thisObj: TorqueObject, ...args: any[]) => void,
  ): void;
}

export interface FunctionsAPI {
  call(name: string, ...args: any[]): any;
}

export interface VariableStoreAPI {
  get(name: string, ...indices: any[]): any;
  set(name: string, ...args: any[]): any;
  postInc(name: string, ...indices: any[]): number;
  postDec(name: string, ...indices: any[]): number;
}

// Backwards compatibility aliases
export type GlobalsAPI = VariableStoreAPI;
export type LocalsAPI = VariableStoreAPI;

export interface BuiltinsContext {
  runtime: () => TorqueRuntime;
  fileSystem: FileSystemHandler | null;
}

export type BuiltinsFactory = (
  ctx: BuiltinsContext,
) => Record<string, TorqueFunction>;

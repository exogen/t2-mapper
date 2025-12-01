import type { Program } from "./ast";
import type { CaseInsensitiveMap } from "./utils";

export type TorqueFunction = (...args: any[]) => any;
export type TorqueMethod = (this_: TorqueObject, ...args: any[]) => any;

export interface TorqueObject {
  _class: string; // normalized class name
  _className: string; // original class name
  _id: number;
  _name?: string;
  _isDatablock?: boolean;
  _parent?: TorqueObject;
  _children?: TorqueObject[];
  [key: string]: any;
}

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
}

export type ScriptLoader = (path: string) => Promise<string | null>;

export interface LoadedScript {
  execute(): void;
}

export interface TorqueRuntimeOptions {
  loadScript?: ScriptLoader;
  builtins?: BuiltinsFactory;
}

export interface LoadScriptOptions {
  path?: string;
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

  // Local variable scope
  locals(): LocalsAPI;
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
}

export type BuiltinsFactory = (
  ctx: BuiltinsContext,
) => Record<string, TorqueFunction>;

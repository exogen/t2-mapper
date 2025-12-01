import TorqueScript from "@/generated/TorqueScript.cjs";
import { generate, type GeneratorOptions } from "./codegen";
import type { Program } from "./ast";

export { generate, type GeneratorOptions } from "./codegen";
export type { Program } from "./ast";
export { createBuiltins } from "./builtins";
export { createRuntime } from "./runtime";
export { normalizePath } from "./utils";
export type {
  BuiltinsContext,
  BuiltinsFactory,
  RuntimeState,
  TorqueObject,
  TorqueRuntime,
  TorqueRuntimeOptions,
} from "./types";

export interface ParseOptions {
  filename?: string;
}

export type TranspileOptions = ParseOptions & GeneratorOptions;

export function parse(source: string, options?: ParseOptions): Program {
  try {
    return TorqueScript.parse(source);
  } catch (error: any) {
    if (options?.filename && error.location) {
      throw new Error(
        `${options.filename}:${error.location.start.line}:${error.location.start.column}: ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

export function transpile(
  source: string,
  options?: TranspileOptions,
): { code: string; ast: Program } {
  const ast = parse(source, options);
  const code = generate(ast, options);
  return { code, ast };
}

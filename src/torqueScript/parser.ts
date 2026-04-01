import { parse as torqueScriptParse } from "@/generated/TorqueScript.js";
import type { Program } from "./ast";

export interface ParseOptions {
  filename?: string;
}

export function parse(source: string, options?: ParseOptions): Program {
  try {
    return torqueScriptParse(source);
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

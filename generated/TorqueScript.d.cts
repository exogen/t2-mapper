import type { Program } from "@/src/torqueScript/ast";

export interface ParseOptions {
  grammarSource?: string;
  startRule?: "Program";
}

export function parse(input: string, options?: ParseOptions): Program;

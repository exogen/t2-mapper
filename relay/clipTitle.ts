import {
  RegExpMatcher,
  SyntaxKind,
  collapseDuplicatesTransformer,
  resolveConfusablesTransformer,
  resolveLeetSpeakTransformer,
  skipNonAlphabeticTransformer,
  toAsciiLowerCaseTransformer,
  type BlacklistedTerm,
} from "obscenity";
import { MAX_CLIP_TITLE_LENGTH } from "./clipTypes.js";

export function createClipTitleMatcher(
  wordList: string | undefined,
): RegExpMatcher | null {
  if (!wordList?.trim()) return null;
  const transformers = [
    resolveConfusablesTransformer(),
    resolveLeetSpeakTransformer(),
    toAsciiLowerCaseTransformer(),
    skipNonAlphabeticTransformer(),
    collapseDuplicatesTransformer(),
  ];
  const normalizers = transformers.map((transformer) =>
    "factory" in transformer ? transformer.factory() : transformer,
  );

  // Obscenity transforms the input before matching. Use the same built-in
  // transformers to compile each configured term as a literal pattern.
  const blacklistedTerms: BlacklistedTerm[] = [];
  for (const term of wordList.split(/[,\n]/u)) {
    const chars: number[] = [];
    for (const character of term.trim()) {
      let point = character.codePointAt(0);
      for (const normalizer of normalizers) {
        if (point === undefined) break;
        point = normalizer.transform(point);
      }
      if (point !== undefined) chars.push(point);
    }
    for (const normalizer of normalizers) {
      if ("reset" in normalizer) normalizer.reset();
    }
    if (chars.length) {
      blacklistedTerms.push({
        id: blacklistedTerms.length,
        pattern: {
          nodes: [{ kind: SyntaxKind.Literal, chars }],
          requireWordBoundaryAtStart: false,
          requireWordBoundaryAtEnd: false,
        },
      });
    }
  }
  return blacklistedTerms.length
    ? new RegExpMatcher({
        blacklistedTerms,
        blacklistMatcherTransformers: transformers,
      })
    : null;
}

export function readClipTitle(
  value: unknown,
  matcher: RegExpMatcher | null,
): string {
  if (typeof value !== "string") throw new Error("Enter a clip title.");
  const title = value.trim().replace(/\s+/gu, " ");
  if (!title) throw new Error("Enter a clip title.");
  if (title.length > MAX_CLIP_TITLE_LENGTH)
    throw new Error(
      `Keep clip titles to ${MAX_CLIP_TITLE_LENGTH} characters or fewer.`,
    );
  if (matcher?.hasMatch(title)) throw new Error("Nah – try a different title.");
  return title;
}

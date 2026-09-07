import { lazy, type ComponentType, type LazyExoticComponent } from "react";

type PropsOf<T> = T extends ComponentType<infer P> ? P : never;

/**
 * `React.lazy` for a component exported under a name instead of as the
 * module's default export. The loader's module type carries the
 * component's props through, so call sites stay type checked.
 *
 * @example
 *   const GameView = lazyNamed("GameView", () => import("./GameView"));
 */
export function lazyNamed<
  M extends Record<string, unknown>,
  K extends keyof M & string,
>(
  name: K,
  loader: () => Promise<M>,
): LazyExoticComponent<ComponentType<PropsOf<M[K]>>> {
  return lazy(() =>
    loader().then((mod) => ({
      default: mod[name] as ComponentType<PropsOf<M[K]>>,
    })),
  );
}

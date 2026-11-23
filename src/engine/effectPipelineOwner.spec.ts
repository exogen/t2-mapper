import { expect, it, vi } from "vitest";
import { EffectPipelineOwner } from "./effectPipelineOwner";

it("rejects a pipeline created after its factory synchronously releases ownership", () => {
  const owner = new EffectPipelineOwner<{ dispose(): void }>();
  const dispose = vi.fn();
  const rendered = vi.fn();
  owner.setActive(true);
  expect(
    owner.render(() => {
      owner.setActive(false);
      return { dispose };
    }, rendered),
  ).toBeUndefined();
  expect(rendered).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
  expect(owner.current).toBeUndefined();
});

it("rejects stale construction after a store release/re-enable and permits the new owner", () => {
  const owner = new EffectPipelineOwner<{ dispose(): void }>();
  const dispose = vi.fn();
  owner.setActive(true);
  const nested = vi.fn();
  const stale = owner.beginRender(() => {
    owner.release();
    owner.setActive(true);
    expect(owner.beginRender(nested)).toBeUndefined();
    return { dispose };
  });
  expect(stale).toBeUndefined();
  expect(nested).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
  expect(
    owner.render(
      () => ({ dispose: vi.fn() }),
      () => true,
    ),
  ).toBe(true);
  owner.dispose();
});

it("releases disabled pipelines and lazily recreates them on re-enable", () => {
  const owner = new EffectPipelineOwner<{ dispose(): void }>();
  const create = vi.fn(() => ({ dispose: vi.fn() }));
  expect(owner.render(create, () => true)).toBeUndefined();
  expect(create).not.toHaveBeenCalled();
  owner.setActive(true);
  owner.render(create, () => true);
  const first = create.mock.results[0].value;
  owner.setActive(false);
  expect(first.dispose).toHaveBeenCalledExactlyOnceWith();
  expect(owner.current).toBeUndefined();
  owner.setActive(false);
  owner.setActive(true);
  expect(create).toHaveBeenCalledTimes(1);
  owner.render(create, () => true);
  expect(create).toHaveBeenCalledTimes(2);
  owner.dispose();
  owner.dispose();
  expect(create.mock.results[1].value.dispose).toHaveBeenCalledTimes(1);
});

it("waits until rendering unwinds before disposal, including exceptions", () => {
  const order: string[] = [];
  const owner = new EffectPipelineOwner<{ dispose(): void }>();
  owner.setActive(true);
  expect(() =>
    owner.render(
      () => ({ dispose: () => order.push("dispose") }),
      () => {
        order.push("render");
        owner.setActive(false);
        owner.setActive(true);
        expect(owner.current).toBeUndefined();
        expect(
          owner.render(
            () => {
              throw new Error("reentrant factory");
            },
            () => true,
          ),
        ).toBeUndefined();
        order.push("render-end");
        throw new Error("render failed");
      },
    ),
  ).toThrow("render failed");
  expect(order).toEqual(["render", "render-end", "dispose"]);
});

it("does not allocate after an asynchronous module becomes ready while disabled", async () => {
  const owner = new EffectPipelineOwner<{ dispose(): void }>();
  const factory = vi.fn(() => ({ dispose: vi.fn() }));
  owner.setActive(true);
  const module = Promise.resolve(factory);
  owner.setActive(false);
  owner.render(await module, () => true);
  expect(factory).not.toHaveBeenCalled();
});

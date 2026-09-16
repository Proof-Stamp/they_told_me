import { describe, expect, it, vi } from "vitest";
import { createLatestAsyncRunner, CreationOperation } from "../src/lib/operation-control";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("UI operation coordination", () => {
  it("keeps an older verification result from replacing a newer failure", async () => {
    const runLatest = createLatestAsyncRunner();
    const packageA = deferred<string>();
    const packageB = deferred<string>();
    const displayed: string[] = [];
    const finished = vi.fn();

    const runA = runLatest(
      () => packageA.promise,
      {
        onSuccess: (value) => displayed.push(value),
        onError: (error) => displayed.push(String(error)),
        onFinish: finished,
      },
    );
    const runB = runLatest(
      () => packageB.promise,
      {
        onSuccess: (value) => displayed.push(value),
        onError: (error) => displayed.push(error instanceof Error ? error.message : String(error)),
        onFinish: finished,
      },
    );

    packageB.reject(new Error("Package B failed"));
    await runB;
    expect(displayed).toEqual(["Package B failed"]);

    packageA.resolve("Package A verified");
    await runA;
    expect(displayed).toEqual(["Package B failed"]);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("locks creation to a snapshot until the active run finishes", () => {
    const coordinator = new CreationOperation<{ id: string }>();
    const selected = [{ id: "first" }];
    const run = coordinator.start(selected, "original label");

    selected[0] = { id: "changed" };
    selected.push({ id: "added" });

    expect(coordinator.locked).toBe(true);
    expect(run.selected).toEqual([{ id: "first" }]);
    expect(run.label).toBe("original label");
    expect(() => coordinator.start(selected, "new label")).toThrow(/already being created/i);

    coordinator.cancel();
    expect(run.signal.aborted).toBe(true);
    coordinator.finish(run);
    expect(coordinator.locked).toBe(false);
  });
});

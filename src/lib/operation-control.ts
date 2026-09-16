export interface LatestAsyncHandlers<T> {
  onStart?: () => void;
  onSuccess: (value: T) => void;
  onError: (error: unknown) => void;
  onFinish?: () => void;
}

export function createLatestAsyncRunner() {
  let latestOperation = 0;

  return async function runLatest<T>(task: () => Promise<T>, handlers: LatestAsyncHandlers<T>): Promise<boolean> {
    const operation = ++latestOperation;
    handlers.onStart?.();
    try {
      const value = await task();
      if (operation !== latestOperation) return false;
      handlers.onSuccess(value);
      return true;
    } catch (error) {
      if (operation !== latestOperation) return false;
      handlers.onError(error);
      return true;
    } finally {
      if (operation === latestOperation) handlers.onFinish?.();
    }
  };
}

export interface CreationRun<T> {
  readonly id: number;
  readonly selected: T[];
  readonly label: string;
  readonly controller: AbortController;
  readonly signal: AbortSignal;
}

export class CreationOperation<T> {
  #nextId = 0;
  #active: CreationRun<T> | null = null;

  get locked(): boolean {
    return this.#active !== null;
  }

  start(selected: readonly T[], label: string): CreationRun<T> {
    if (this.#active) throw new Error("A ProofStamp is already being created.");
    const controller = new AbortController();
    const run: CreationRun<T> = {
      id: ++this.#nextId,
      selected: [...selected],
      label,
      controller,
      signal: controller.signal,
    };
    this.#active = run;
    return run;
  }

  isCurrent(run: CreationRun<T>): boolean {
    return this.#active === run;
  }

  cancel(): void {
    this.#active?.controller.abort();
  }

  finish(run: CreationRun<T>): void {
    if (this.#active === run) this.#active = null;
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

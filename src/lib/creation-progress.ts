export type CreationStage =
  | "hashing-files"
  | "getting-signed-time"
  | "checking-signed-time"
  | "building-package";

type CreationStageListener = (stage: CreationStage) => void;

const listeners = new Set<CreationStageListener>();

export function reportCreationStage(stage: CreationStage): void {
  for (const listener of listeners) listener(stage);
}

export function subscribeCreationProgress(listener: CreationStageListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Lets the update manager know when it's safe to reload (never mid-recording
// or while an answer is streaming).

let busy = false;
const idleListeners = new Set<() => void>();

export function setBusy(next: boolean) {
  busy = next;
  if (!next) idleListeners.forEach((fn) => fn());
}

export function isBusy() {
  return busy;
}

export function onIdle(fn: () => void) {
  idleListeners.add(fn);
  return () => {
    idleListeners.delete(fn);
  };
}

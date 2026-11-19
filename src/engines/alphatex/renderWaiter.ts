/**
 * Starts a render and resolves when alphaTab reports it finished. Every
 * render still waiting resolves on each finish: a render replaced by a
 * newer one may never report its own end, and its caller must not hang.
 */
export function renderWaiter(finished: { on(listener: () => void): unknown }) {
  let waiting: Array<() => void> = [];
  finished.on(() => {
    const done = waiting;
    waiting = [];
    for (const resolve of done) resolve();
  });
  return (start: () => void) =>
    new Promise<void>((resolve) => {
      waiting.push(resolve);
      start();
    });
}

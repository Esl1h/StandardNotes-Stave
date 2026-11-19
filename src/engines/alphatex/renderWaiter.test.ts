import { renderWaiter } from './renderWaiter';

const emitter = () => {
  const listeners: Array<() => void> = [];
  return {
    on: (cb: () => void) => void listeners.push(cb),
    fire: () => listeners.forEach((cb) => cb()),
  };
};

describe('renderWaiter', () => {
  it('resolves a render once alphaTab reports it finished', async () => {
    const finished = emitter();
    const start = vi.fn();
    const render = renderWaiter(finished);
    const done = render(start);
    expect(start).toHaveBeenCalledTimes(1);
    finished.fire();
    await expect(done).resolves.toBeUndefined();
  });

  it('resolves every render when a second one starts before the first finishes', async () => {
    const finished = emitter();
    const render = renderWaiter(finished);
    const first = vi.fn();
    const second = vi.fn();
    const a = render(first);
    const b = render(second);
    finished.fire();
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined]);
  });

  it('does not resolve a render that starts after the last finish', async () => {
    const finished = emitter();
    const render = renderWaiter(finished);
    finished.fire();
    let resolved = false;
    void render(() => {}).then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(false);
  });
});

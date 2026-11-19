import ComponentRelay from './ComponentRelay';

const registered = {
  action: 'component-registered',
  sessionKey: 'k',
  componentData: {},
  data: { environment: 'web', platform: 'linux', uuid: 'u', activeThemeUrls: [] },
};

const send = (source: unknown) =>
  window.dispatchEvent(new MessageEvent('message', { data: registered, origin: 'null', source: source as Window }));

describe('ComponentRelay message source', () => {
  it('registers on a message from the parent window', () => {
    const onReady = vi.fn();
    const relay = new ComponentRelay({
      targetWindow: window,
      onReady,
      handleRequestForContentHeight: () => undefined,
    });
    send(window.parent);
    expect(onReady).toHaveBeenCalledTimes(1);
    relay.deinit();
  });

  it('ignores a message from any other window', () => {
    const onReady = vi.fn();
    const relay = new ComponentRelay({
      targetWindow: window,
      onReady,
      handleRequestForContentHeight: () => undefined,
    });
    send({} as Window);
    expect(onReady).not.toHaveBeenCalled();
    relay.deinit();
  });
});

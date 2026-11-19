import fc from 'fast-check';
import { downloadFile, fileNameFor, pngScale, svgToPng } from './download';

afterEach(() => {
  vi.restoreAllMocks();
});

test('saves the data as a file with the given name and type', async () => {
  const blobs: Blob[] = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:file';
  });
  URL.revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  downloadFile('X:1', 'tune.abc', 'text/vnd.abc');

  const link = click.mock.contexts[0] as HTMLAnchorElement;
  expect(link.download).toBe('tune.abc');
  expect(blobs[0].type).toBe('text/vnd.abc');
  expect(await blobs[0].text()).toBe('X:1');
  expect(document.querySelector('a[download]')).toBeNull();
  await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file'));
});

test('names the file after the title', () => {
  expect(fileNameFor('Air on a G: string', 'svg')).toBe('Air on a G string.svg');
  expect(fileNameFor(undefined, 'mid')).toBe('stave.mid');
  expect(fileNameFor(' / ', 'abc')).toBe('stave.abc');
});

test('never yields a path or a reserved character', () => {
  fc.assert(
    fc.property(fc.string(), (title) => {
      const name = fileNameFor(title, 'abc');
      expect(name).not.toMatch(/[\\/:*?"<>|]/);
      expect([...name].every((char) => char.charCodeAt(0) >= 32)).toBe(true);
      expect(name.endsWith('.abc')).toBe(true);
    })
  );
});

describe('pngScale', () => {
  test('doubles a normal score for a sharp print', () => {
    expect(pngScale(800, 1000)).toBe(2);
  });

  test('keeps a tall score inside the canvas side limit', () => {
    const scale = pngScale(800, 20000);
    expect(scale).toBeLessThan(1);
    expect(20000 * scale).toBeLessThanOrEqual(16384);
  });

  test('keeps a wide and tall score inside the area limit', () => {
    const scale = pngScale(15000, 15000);
    expect(15000 * scale * 15000 * scale).toBeLessThanOrEqual(100_000_000);
  });
});

test('svgToPng sizes the canvas by the capped scale', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:svg');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'Image',
    class {
      width = 800;
      height = 20000;
      set src(_: string) {}
      decode = async () => {};
    }
  );
  const canvas = document.createElement('canvas');
  const context = { scale: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(canvas, 'toBlob').mockImplementation((done) => done(new Blob(['png'])));
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);

  await svgToPng('<svg/>');

  expect(canvas.height).toBeLessThanOrEqual(16384);
  expect(canvas.height).toBeGreaterThan(0);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg');
  vi.unstubAllGlobals();
});

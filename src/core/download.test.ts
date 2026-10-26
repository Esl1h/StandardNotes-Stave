import fc from 'fast-check';
import { downloadFile, fileNameFor } from './download';

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

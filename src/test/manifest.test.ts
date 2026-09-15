import { describe, expect, it } from 'vitest';
import { buildManifest, validateSelection } from '../lib/manifest';

function file(name: string, text: string): File {
  return new File([text], name, { type: 'text/plain' });
}

describe('manifest', () => {
  it('keeps duplicate filenames and repeated contents distinct', async () => {
    const files = [file('chat.png', 'same'), file('chat.png', 'same')];
    const { manifest, bytes } = await buildManifest(files, 'support case');
    expect(manifest.files).toHaveLength(2);
    expect(manifest.files[0].path).not.toBe(manifest.files[1].path);
    expect(manifest.files[0].sha256).toBe(manifest.files[1].sha256);
    expect(new TextDecoder().decode(bytes)).toContain('support case');
  });

  it('rejects an empty selection', () => {
    expect(() => validateSelection([])).toThrow('Choose at least one file');
  });
});

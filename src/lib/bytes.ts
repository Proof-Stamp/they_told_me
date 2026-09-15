export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function equalBytes(a: ArrayBufferView | ArrayBuffer, b: ArrayBufferView | ArrayBuffer): boolean {
  const aa = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const bb = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  if (aa.byteLength !== bb.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

export async function sha256(data: BufferSource): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

import { throwIfAborted } from "./operation-control";

export interface StoredZipEntry {
  name: string;
  data: Blob | Uint8Array;
  crc32?: number;
}

const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const VERSION_NEEDED = 10;
const DOS_TIME = 0;
const DOS_DATE = 33; // 1980-01-01. ZIP metadata is not the ProofStamp time.
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

const CRC32_TABLE = new Uint32Array(256);
for (let value = 0; value < 256; value += 1) {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  CRC32_TABLE[value] = crc >>> 0;
}

export function updateCrc32(crc: number, bytes: Uint8Array): number {
  let next = crc;
  for (const byte of bytes) next = CRC32_TABLE[(next ^ byte) & 0xff] ^ (next >>> 8);
  return next >>> 0;
}

export function crc32Bytes(bytes: Uint8Array): number {
  return (updateCrc32(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
}

async function crc32(data: Blob | Uint8Array, signal?: AbortSignal): Promise<number> {
  throwIfAborted(signal);
  let crc = 0xffffffff;

  if (data instanceof Uint8Array) {
    throwIfAborted(signal);
    return crc32Bytes(data);
  }

  const reader = data.stream().getReader();
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (value) crc = updateCrc32(crc, value);
    }
  } finally {
    reader.releaseLock();
  }
  throwIfAborted(signal);
  return (crc ^ 0xffffffff) >>> 0;
}

function dataSize(data: Blob | Uint8Array): number {
  return data instanceof Uint8Array ? data.byteLength : data.size;
}

function uint8View(length: number, write: (view: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(length);
  write(new DataView(bytes.buffer));
  return bytes;
}

function localHeader(nameBytes: Uint8Array, size: number, crc: number): Uint8Array {
  return uint8View(30 + nameBytes.byteLength, (view) => {
    let offset = 0;
    view.setUint32(offset, 0x04034b50, true); offset += 4;
    view.setUint16(offset, VERSION_NEEDED, true); offset += 2;
    view.setUint16(offset, UTF8_FLAG, true); offset += 2;
    view.setUint16(offset, STORE_METHOD, true); offset += 2;
    view.setUint16(offset, DOS_TIME, true); offset += 2;
    view.setUint16(offset, DOS_DATE, true); offset += 2;
    view.setUint32(offset, crc, true); offset += 4;
    view.setUint32(offset, size, true); offset += 4;
    view.setUint32(offset, size, true); offset += 4;
    view.setUint16(offset, nameBytes.byteLength, true); offset += 2;
    view.setUint16(offset, 0, true); offset += 2;
    new Uint8Array(view.buffer, offset).set(nameBytes);
  });
}

function centralHeader(nameBytes: Uint8Array, size: number, crc: number, localOffset: number): Uint8Array {
  return uint8View(46 + nameBytes.byteLength, (view) => {
    let offset = 0;
    view.setUint32(offset, 0x02014b50, true); offset += 4;
    view.setUint16(offset, 20, true); offset += 2;
    view.setUint16(offset, VERSION_NEEDED, true); offset += 2;
    view.setUint16(offset, UTF8_FLAG, true); offset += 2;
    view.setUint16(offset, STORE_METHOD, true); offset += 2;
    view.setUint16(offset, DOS_TIME, true); offset += 2;
    view.setUint16(offset, DOS_DATE, true); offset += 2;
    view.setUint32(offset, crc, true); offset += 4;
    view.setUint32(offset, size, true); offset += 4;
    view.setUint32(offset, size, true); offset += 4;
    view.setUint16(offset, nameBytes.byteLength, true); offset += 2;
    view.setUint16(offset, 0, true); offset += 2;
    view.setUint16(offset, 0, true); offset += 2;
    view.setUint16(offset, 0, true); offset += 2;
    view.setUint16(offset, 0, true); offset += 2;
    view.setUint32(offset, 0, true); offset += 4;
    view.setUint32(offset, localOffset, true); offset += 4;
    new Uint8Array(view.buffer, offset).set(nameBytes);
  });
}

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  return uint8View(22, (view) => {
    let offset = 0;
    view.setUint32(offset, 0x06054b50, true); offset += 4;
    view.setUint16(offset, 0, true); offset += 2;
    view.setUint16(offset, 0, true); offset += 2;
    view.setUint16(offset, entryCount, true); offset += 2;
    view.setUint16(offset, entryCount, true); offset += 2;
    view.setUint32(offset, centralSize, true); offset += 4;
    view.setUint32(offset, centralOffset, true); offset += 4;
    view.setUint16(offset, 0, true);
  });
}

function bytesAsBlobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function buildStoredZip(entries: StoredZipEntry[], signal?: AbortSignal): Promise<Blob> {
  if (entries.length > MAX_UINT16) throw new Error("ZIP contains too many entries.");

  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    throwIfAborted(signal);
    const nameBytes = encoder.encode(entry.name);
    const size = dataSize(entry.data);
    if (!nameBytes.byteLength || nameBytes.byteLength > MAX_UINT16) throw new Error("ZIP entry name is invalid or too long.");
    if (size > MAX_UINT32 || localOffset > MAX_UINT32) throw new Error("ZIP64 is not supported by this ProofStamp package writer.");

    const crc = entry.crc32 ?? await crc32(entry.data, signal);
    const header = localHeader(nameBytes, size, crc);
    const central = centralHeader(nameBytes, size, crc, localOffset);

    localParts.push(bytesAsBlobPart(header), entry.data instanceof Uint8Array ? bytesAsBlobPart(entry.data) : entry.data);
    centralParts.push(bytesAsBlobPart(central));
    localOffset += header.byteLength + size;
    centralSize += central.byteLength;
  }

  if (localOffset > MAX_UINT32 || centralSize > MAX_UINT32 || localOffset + centralSize + 22 > MAX_UINT32) {
    throw new Error("ZIP64 is not supported by this ProofStamp package writer.");
  }

  throwIfAborted(signal);
  return new Blob(
    [...localParts, ...centralParts, bytesAsBlobPart(endOfCentralDirectory(entries.length, centralSize, localOffset))],
    { type: "application/zip" },
  );
}

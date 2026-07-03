// Minimal MessagePack decoder — just enough to read Ampersand `.ampar` archives.
//
// Why hand-rolled instead of @msgpack/msgpack: the only place we decode msgpack
// is the Ampersand importer (a rarely-used one-shot path). Pulling the full
// library into the bundle for that isn't worth it, and this decoder is loaded
// lazily by ampersand.js (dynamic import) so it never touches the main bundle.
//
// Supports everything an Ampersand archive actually contains:
//   - all int / float / str / bin / array / map encodings
//   - the timestamp extension (ext type -1, the 4/8/12-byte forms) → Date
//     (@msgpack/msgpack encodes JS Dates this way by default)
//   - bin8/16/32 → Uint8Array (Ampersand stores File bytes as msgpack bin)
//
// Ampersand pre-serializes real Maps/Sets/Files into plain `{_meta, value}`
// objects BEFORE encoding (see their serialization.replace), so we never have to
// decode a non-string map key here — every msgpack map in the stream is a plain
// string-keyed object. ampersand.js reverses the `_meta` wrappers afterwards.

const TD = new TextDecoder('utf-8');

function readStr(bytes, state, len) {
  const s = TD.decode(bytes.subarray(state.pos, state.pos + len));
  state.pos += len;
  return s;
}

function readBin(bytes, state, len) {
  const out = bytes.slice(state.pos, state.pos + len);
  state.pos += len;
  return out; // Uint8Array
}

function readArray(view, bytes, state, n) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) arr[i] = decodeValue(view, bytes, state);
  return arr;
}

function readMap(view, bytes, state, n) {
  const obj = {};
  for (let i = 0; i < n; i++) {
    const k = decodeValue(view, bytes, state);
    const v = decodeValue(view, bytes, state);
    obj[typeof k === 'string' ? k : String(k)] = v;
  }
  return obj;
}

// MessagePack timestamp extension (type -1). Returns a Date.
function decodeTimestamp(view, offset, len) {
  if (len === 4) {
    const sec = view.getUint32(offset);
    return new Date(sec * 1000);
  }
  if (len === 8) {
    // data64: nanoseconds in the high 30 bits, seconds in the low 34 bits.
    const hi = view.getUint32(offset);
    const lo = view.getUint32(offset + 4);
    const nsec = hi >>> 2;
    const sec = (hi & 0x3) * 4294967296 + lo;
    return new Date(sec * 1000 + Math.floor(nsec / 1e6));
  }
  if (len === 12) {
    const nsec = view.getUint32(offset);
    const sec = Number(view.getBigInt64(offset + 4));
    return new Date(sec * 1000 + Math.floor(nsec / 1e6));
  }
  return new Date(NaN);
}

function readExt(view, bytes, state, len) {
  const type = view.getInt8(state.pos);
  state.pos += 1;
  const start = state.pos;
  state.pos += len;
  if (type === -1) return decodeTimestamp(view, start, len);
  return { __ext: type, data: bytes.subarray(start, start + len) }; // unknown ext kept raw
}

function decodeValue(view, bytes, state) {
  const b = bytes[state.pos++];
  if (b <= 0x7f) return b;                 // positive fixint
  if (b >= 0xe0) return b - 256;           // negative fixint
  if (b >= 0xa0 && b <= 0xbf) return readStr(bytes, state, b & 0x1f);   // fixstr
  if (b >= 0x90 && b <= 0x9f) return readArray(view, bytes, state, b & 0x0f); // fixarray
  if (b >= 0x80 && b <= 0x8f) return readMap(view, bytes, state, b & 0x0f);   // fixmap

  switch (b) {
    case 0xc0: return null;
    case 0xc2: return false;
    case 0xc3: return true;
    case 0xcc: return bytes[state.pos++];                                            // uint8
    case 0xcd: { const v = view.getUint16(state.pos); state.pos += 2; return v; }    // uint16
    case 0xce: { const v = view.getUint32(state.pos); state.pos += 4; return v; }    // uint32
    case 0xcf: { const v = view.getBigUint64(state.pos); state.pos += 8; return Number(v); } // uint64
    case 0xd0: { const v = view.getInt8(state.pos); state.pos += 1; return v; }      // int8
    case 0xd1: { const v = view.getInt16(state.pos); state.pos += 2; return v; }     // int16
    case 0xd2: { const v = view.getInt32(state.pos); state.pos += 4; return v; }     // int32
    case 0xd3: { const v = view.getBigInt64(state.pos); state.pos += 8; return Number(v); }  // int64
    case 0xca: { const v = view.getFloat32(state.pos); state.pos += 4; return v; }   // float32
    case 0xcb: { const v = view.getFloat64(state.pos); state.pos += 8; return v; }   // float64
    case 0xd9: return readStr(bytes, state, bytes[state.pos++]);                     // str8
    case 0xda: { const n = view.getUint16(state.pos); state.pos += 2; return readStr(bytes, state, n); } // str16
    case 0xdb: { const n = view.getUint32(state.pos); state.pos += 4; return readStr(bytes, state, n); } // str32
    case 0xc4: { const n = bytes[state.pos++]; return readBin(bytes, state, n); }    // bin8
    case 0xc5: { const n = view.getUint16(state.pos); state.pos += 2; return readBin(bytes, state, n); } // bin16
    case 0xc6: { const n = view.getUint32(state.pos); state.pos += 4; return readBin(bytes, state, n); } // bin32
    case 0xdc: { const n = view.getUint16(state.pos); state.pos += 2; return readArray(view, bytes, state, n); } // array16
    case 0xdd: { const n = view.getUint32(state.pos); state.pos += 4; return readArray(view, bytes, state, n); } // array32
    case 0xde: { const n = view.getUint16(state.pos); state.pos += 2; return readMap(view, bytes, state, n); }   // map16
    case 0xdf: { const n = view.getUint32(state.pos); state.pos += 4; return readMap(view, bytes, state, n); }   // map32
    case 0xd4: return readExt(view, bytes, state, 1);   // fixext1
    case 0xd5: return readExt(view, bytes, state, 2);   // fixext2
    case 0xd6: return readExt(view, bytes, state, 4);   // fixext4
    case 0xd7: return readExt(view, bytes, state, 8);   // fixext8
    case 0xd8: return readExt(view, bytes, state, 16);  // fixext16
    case 0xc7: { const n = bytes[state.pos++]; return readExt(view, bytes, state, n); }    // ext8
    case 0xc8: { const n = view.getUint16(state.pos); state.pos += 2; return readExt(view, bytes, state, n); } // ext16
    case 0xc9: { const n = view.getUint32(state.pos); state.pos += 4; return readExt(view, bytes, state, n); } // ext32
    default:
      throw new Error(`msgpack: unsupported byte 0x${b.toString(16)} at offset ${state.pos - 1}`);
  }
}

// Decode a buffer that holds ONE or MORE concatenated msgpack values (the
// Ampersand archive is a stream of back-to-back `{table, data}` values).
export function decodeMulti(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const state = { pos: 0 };
  const out = [];
  while (state.pos < bytes.length) out.push(decodeValue(view, bytes, state));
  return out;
}

// Decode a buffer holding exactly one msgpack value.
export function decode(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return decodeValue(view, bytes, { pos: 0 });
}

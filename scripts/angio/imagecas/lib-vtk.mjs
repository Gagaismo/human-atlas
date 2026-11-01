// Lector mínimo de los centerlines VTK 5.1 de ImageCAS-X (binario big-endian o ASCII).
// Solo lee datos: nunca ejecuta nada del archivo.
import { readFileSync } from "node:fs";

export function readCenterline(path) {
  const b = readFileSync(path);
  const fmt = b.toString("latin1", 0, 100).split("\n")[2].trim();
  return fmt === "ASCII" ? readAscii(b.toString("latin1")) : readBinary(b);
}

function readBinary(b) {
  const ascii = (a, z) => b.toString("latin1", a, z);
  const find = (s, from = 0) => b.indexOf(s, from, "latin1");
  const lineEnd = (i) => b.indexOf(10, i);
  let i = find("POINTS ");
  let e = lineEnd(i);
  const n = Number(ascii(i, e).split(" ")[1]);
  let p = e + 1;
  const pts = new Float32Array(n * 3);
  for (let k = 0; k < n * 3; k++) pts[k] = b.readFloatBE(p + 4 * k);
  p += n * 12;
  i = find("LINES ", p);
  e = lineEnd(i);
  const [, nOff, nConn] = ascii(i, e).split(" ").map(Number);
  p = lineEnd(e + 1) + 1; // salta "OFFSETS ..."
  const offsets = [];
  for (let k = 0; k < nOff; k++) offsets.push(Number(b.readBigInt64BE(p + 8 * k)));
  p += nOff * 8;
  p = lineEnd(find("CONNECTIVITY", p)) + 1;
  const conn = [];
  for (let k = 0; k < nConn; k++) conn.push(Number(b.readBigInt64BE(p + 8 * k)));
  p += nConn * 8;
  const lines = [];
  for (let k = 0; k + 1 < offsets.length; k++) lines.push(conn.slice(offsets[k], offsets[k + 1]));
  i = find("SCALARS segment_label", p);
  p = lineEnd(lineEnd(i) + 1) + 1;
  const label = new Int32Array(n);
  for (let k = 0; k < n; k++) label[k] = b.readInt32BE(p + 4 * k);
  p += n * 4;
  // FIELD: segment_name (cadenas con prefijo 0xC0|largo), luego tres vectores int32
  i = find("segment_name", p);
  p = lineEnd(i) + 1;
  const name = [];
  for (let k = 0; k < n; k++) {
    const len = b[p++] & 0x3f;
    name.push(b.toString("latin1", p, p + len));
    p += len;
  }
  const ints = {};
  for (const key of ["branch_points", "end_points", "start_points"]) {
    i = find(key, p);
    p = lineEnd(i) + 1;
    const a = new Int32Array(n);
    for (let k = 0; k < n; k++) a[k] = b.readInt32BE(p + 4 * k);
    p += n * 4;
    ints[key] = a;
  }
  return { n, pts, lines, label, name, ...ints };
}

// Variante ASCII: mismas secciones, valores separados por espacios o saltos de línea.
function readAscii(t) {
  const after = (key) => {
    const i = t.indexOf(key);
    const e = t.indexOf("\n", i);
    return { head: t.slice(i, e).split(/\s+/), rest: t.slice(e + 1) };
  };
  const nums = (s, k) => {
    const out = [];
    const re = /\s*(-?[0-9.eE+-]+)/y;
    while (out.length < k) {
      const r = re.exec(s);
      if (!r) break;
      out.push(Number(r[1]));
    }
    return out;
  };
  const P = after("POINTS ");
  const n = Number(P.head[1]);
  const pts = Float32Array.from(nums(P.rest, n * 3));
  const Lh = after("LINES ");
  const nOff = Number(Lh.head[1]);
  const nConn = Number(Lh.head[2]);
  const offsets = nums(after("OFFSETS").rest, nOff);
  const conn = nums(after("CONNECTIVITY").rest, nConn);
  const lines = [];
  for (let k = 0; k + 1 < offsets.length; k++) lines.push(conn.slice(offsets[k], offsets[k + 1]));
  const label = Int32Array.from(nums(after("LOOKUP_TABLE").rest, n));
  const name = after("segment_name").rest.split("\n").slice(0, n).map((s) => s.trim());
  const ints = {};
  for (const key of ["branch_points", "end_points", "start_points"]) ints[key] = Int32Array.from(nums(after(key + " ").rest, n));
  return { n, pts, lines, label, name, ...ints };
}

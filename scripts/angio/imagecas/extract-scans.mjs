// Paso 1: de cada scan de ImageCAS-X (centerlines VTK izquierdo y derecho) saca un camino ordenado por segmento
// (LM, LAD, LCx, D1, D2, OM1, OM2, IM, RCA, R-PDA, R-PLA, L-PDA, L-PLA) en el marco del atlas
// (X = izquierda del paciente, Y = superior, Z = anterior; el conjunto viene en LPS: x izquierda, y posterior, z superior).
// Si hay segmentación (<dir segmentaciones>/<id>.coronary.nii.gz) estima también el radio de la luz a lo largo de cada camino
// (volumen de vóxeles de la etiqueta asignados al punto más cercano / largo local, radio equivalente de un cilindro).
// Uso: node extract-scans.mjs <dir centerlines> <descriptors.json> <salida scans.json> [<dir segmentaciones>]
// La salida es geometría por paciente: queda en work/ (git-ignored) y NUNCA se publica.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { readCenterline } from "./lib-vtk.mjs";
import { readNifti } from "./lib-nifti.mjs";

const [dir, descPath, outPath, segDir] = process.argv.slice(2);
const LABELS = { 1: "lm", 2: "lad", 3: "lcx", 4: "d1", 5: "d2", 6: "om1", 7: "om2", 8: "ramus", 9: "rca", 10: "rpda", 11: "rpla", 12: "lpda", 13: "lpla" };
const toAtlas = (x, y, z) => [x, z, -y];

function graph(c) {
  const adj = Array.from({ length: c.n }, () => []);
  const d = (a, b) => Math.hypot(c.pts[3 * a] - c.pts[3 * b], c.pts[3 * a + 1] - c.pts[3 * b + 1], c.pts[3 * a + 2] - c.pts[3 * b + 2]);
  for (const l of c.lines) for (let k = 0; k + 1 < l.length; k++) { const w = d(l[k], l[k + 1]); adj[l[k]].push([l[k + 1], w]); adj[l[k + 1]].push([l[k], w]); }
  return { adj, d };
}

function dijkstra(adj, src, allowed) {
  const n = adj.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  dist[src] = 0;
  const done = new Uint8Array(n);
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best && (!allowed || allowed[i])) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const [v, w] of adj[u]) if ((!allowed || allowed[v]) && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  return { dist, prev };
}

// Radio equivalente por punto del camino. Las coordenadas del centerline están en LPS; el afín del NIfTI es RAS.
function radii(nii, c, path, label) {
  const [ni, nj, nk] = nii.dim, A = nii.A, vv = nii.pix[0] * nii.pix[1] * nii.pix[2];
  const P = path.map((i) => [c.pts[3 * i], c.pts[3 * i + 1], c.pts[3 * i + 2]]);
  const vox = new Float64Array(P.length);
  for (let k = 0; k < nk; k++) for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    if (nii.data[i + ni * (j + nj * k)] !== label) continue;
    const x = -(A[0][0] * i + A[0][3]), y = -(A[1][1] * j + A[1][3]), z = A[2][2] * k + A[2][3];
    let best = 0, bd = Infinity;
    for (let q = 0; q < P.length; q++) { const d = (P[q][0] - x) ** 2 + (P[q][1] - y) ** 2 + (P[q][2] - z) ** 2; if (d < bd) { bd = d; best = q; } }
    vox[best]++;
  }
  const r = [];
  for (let q = 0; q < P.length; q++) {
    const a = P[Math.max(0, q - 1)], b = P[Math.min(P.length - 1, q + 1)];
    const len = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (q === 0 || q === P.length - 1 ? 1 : 2) || 0.3;
    r.push(Math.sqrt((vox[q] * vv) / (Math.PI * len)));
  }
  // suavizado por ventana (los vóxeles son discretos): media móvil de 25 puntos
  return r.map((_, q) => { let s = 0, n = 0; for (let u = Math.max(0, q - 12); u <= Math.min(r.length - 1, q + 12); u++) { s += r[u]; n++; } return +(s / n).toFixed(3); });
}

function extract(c, nii) {
  const root = c.start_points.findIndex((v) => v === 1);
  if (root < 0) return null;
  const { adj } = graph(c);
  const { dist: dr, prev: pr } = dijkstra(adj, root);
  const out = { root: [c.pts[3 * root], c.pts[3 * root + 1], c.pts[3 * root + 2]], paths: {} };
  for (const [lab, key] of Object.entries(LABELS)) {
    const allowed = new Uint8Array(c.n);
    let s0 = -1, cnt = 0;
    for (let i = 0; i < c.n; i++) if (c.label[i] === Number(lab)) { allowed[i] = 1; cnt++; if (s0 < 0 || dr[i] < dr[s0]) s0 = i; }
    if (cnt < 4 || !Number.isFinite(dr[s0])) continue;
    const { dist, prev } = dijkstra(adj, s0, allowed);
    let e = s0;
    for (let i = 0; i < c.n; i++) if (allowed[i] && Number.isFinite(dist[i]) && dist[i] > dist[e]) e = i;
    const path = [];
    for (let v = e; v >= 0; v = prev[v]) path.push(v);
    path.reverse();
    if (pr[s0] >= 0 && !allowed[pr[s0]]) path.unshift(pr[s0]); // punto de unión con el padre
    if (nii) (out.radii ??= {})[key] = radii(nii, c, path, Number(lab));
    out.paths[key] = path.map((i) => toAtlas(c.pts[3 * i], c.pts[3 * i + 1], c.pts[3 * i + 2]).map((v) => +v.toFixed(2)));
  }
  out.root = toAtlas(...out.root);
  return out;
}

const desc = JSON.parse(readFileSync(descPath, "utf8"));
const scans = [];
let skipped = 0;
for (const s of desc) {
  if (!s.dominance) continue; // excluidos por ImageCAS-X (exclude.txt)
  const fl = `${dir}/${s.id}.coronary_left_centerline.vtk`, fr = `${dir}/${s.id}.coronary_right_centerline.vtk`;
  if (!existsSync(fl) || !existsSync(fr)) { skipped++; continue; }
  const nii = segDir && existsSync(`${segDir}/${s.id}.coronary.nii.gz`) ? readNifti(`${segDir}/${s.id}.coronary.nii.gz`) : null;
  const L = extract(readCenterline(fl), nii), R = extract(readCenterline(fr), nii);
  if (!L || !R) { skipped++; continue; }
  scans.push({ id: s.id, dominance: { R: "right", L: "left", Co: "co" }[s.dominance], quality: Number(s.quality), disease: s.disease, lmOstium: L.root, rcaOstium: R.root, paths: { ...L.paths, ...R.paths }, radii: { ...L.radii, ...R.radii } });
}
writeFileSync(outPath, JSON.stringify(scans));
console.log(`escaneos: ${scans.length} (omitidos ${skipped})`);
const cnt = {};
for (const s of scans) for (const k of Object.keys(s.paths)) cnt[k] = (cnt[k] || 0) + 1;
console.log("caminos por segmento:", JSON.stringify(cnt));

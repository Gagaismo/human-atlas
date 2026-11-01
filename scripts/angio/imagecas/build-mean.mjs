// Paso 2: cursos medios de las coronarias a partir de los caminos por scan (extract-scans.mjs).
//  1. cada camino se suaviza y se remuestrea por fracción de arco (N muestras);
//  2. Procrustes generalizado (semejanza) sobre puntos de referencia anatómicos + muestras de LM/DA/Cx/CD de todos
//     los scans, así las formas son comparables y la escala media queda en milímetros reales;
//  3. media recortada (20 %) coordenada a coordenada por muestra, por grupo de dominancia (derecha, izquierda, co).
// Salida: SOLO estadísticas derivadas (cursos medios, dispersión, posición de nacimiento sobre el padre, cantidades),
// nunca geometría por paciente. Uso: node build-mean.mjs <scans.json> <salida imagecas-mean.json>
import { readFileSync, writeFileSync } from "node:fs";

const [scansPath, outPath] = process.argv.slice(2);
const N = 32;
const scans = JSON.parse(readFileSync(scansPath, "utf8"));

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function cum(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + dist(p[i - 1], p[i])); return c; }
function resample(p, n) {
  const c = cum(p), L = c.at(-1), out = [];
  for (let s = 0, j = 0; s < n; s++) {
    const d = (L * s) / (n - 1);
    while (j < p.length - 2 && c[j + 1] < d) j++;
    const f = (d - c[j]) / (c[j + 1] - c[j] || 1);
    out.push([0, 1, 2].map((k) => p[j][k] + (p[j + 1][k] - p[j][k]) * f));
  }
  return out;
}
function resampleScalar(path, vals, n) {
  const c = cum(path), L = c.at(-1), out = [];
  for (let s = 0, j = 0; s < n; s++) {
    const d = (L * s) / (n - 1);
    while (j < path.length - 2 && c[j + 1] < d) j++;
    const f = (d - c[j]) / (c[j + 1] - c[j] || 1);
    out.push(vals[j] + (vals[j + 1] - vals[j]) * f);
  }
  return out;
}
// media móvil por posición (los centerlines vienen de esqueletización y son algo ruidosos), extremos fijos
function smoothPath(p, w = 6) {
  const q = p.map((x) => [...x]);
  for (let i = 1; i < p.length - 1; i++) {
    const h = Math.min(w, i, p.length - 1 - i);
    for (let k = 0; k < 3; k++) { let s = 0; for (let j = i - h; j <= i + h; j++) s += p[j][k]; q[i][k] = s / (2 * h + 1); }
  }
  return q;
}
const arcOf = (p) => cum(p).at(-1);

// ---- descriptor por scan -----------------------------------------------------------------------------------
const usable = [];
for (const s of scans) {
  const P = s.paths;
  if (!P.lad || !P.lcx || !P.rca) continue;
  if (arcOf(P.lad) < 50 || arcOf(P.lcx) < 25 || arcOf(P.rca) < 40) continue;
  const rs = {};
  const rr = {};
  for (const [k, p] of Object.entries(P)) {
    rs[k] = resample(smoothPath(p), N);
    if (s.radii?.[k]) rr[k] = resampleScalar(P[k], s.radii[k], N); // misma fracción de arco que el camino
  }
  const crux = s.dominance === "left" ? (P.lpda?.[0] ?? P.lcx.at(-1)) : (P.rpda?.[0] ?? P.rca.at(-1));
  const lmBif = P.lm ? P.lm.at(-1) : P.lad[0];
  s.land = [s.lmOstium, s.rcaOstium, lmBif, P.lad.at(-1), crux];
  s.rs = rs;
  s.rr = rr;
  s.len = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, arcOf(p)]));
  usable.push(s);
}

// ---- normalización SIN rotación -------------------------------------------------------------------------------
// Las centerlines de ImageCAS-X vienen en el marco del paciente (LPS del escáner, ya pasado al marco del atlas), así que la
// orientación de cada árbol respecto del paciente es información real: la media la conserva. Cada scan se normaliza solo
// por traslación (centroide de cuatro puntos de referencia comunes a las tres dominancias: ostios, bifurcación del TCI y
// extremo de la DA) y escala isotrópica (tamaño de centroide de esos puntos, llevado a la media de la cohorte para
// conservar los mm). El Procrustes generalizado anterior rotaba cada caso y la media quedaba en un marco arbitrario.
const NORM_IDX = [0, 1, 2, 3];
const sizes = usable.map((s) => {
  const P = NORM_IDX.map((i) => s.land[i]);
  s.cen = [0, 1, 2].map((k) => P.reduce((a, p) => a + p[k], 0) / P.length);
  return (s.size = Math.sqrt(P.reduce((a, p) => a + dist(p, s.cen) ** 2, 0) / P.length));
});
const meanSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
for (const s of usable) {
  const k = meanSize / s.size;
  s.T = { s: k, apply: (p) => [(p[0] - s.cen[0]) * k, (p[1] - s.cen[1]) * k, (p[2] - s.cen[2]) * k] };
}
const scales = usable.map((s) => s.T.s);
const meanS = scales.reduce((a, b) => a + b, 0) / scales.length;
const sdS = Math.sqrt(scales.reduce((a, b) => a + (b - meanS) ** 2, 0) / scales.length);

// ---- medias recortadas por grupo -----------------------------------------------------------------------------
function trimmedMean(vals, trim = 0.2) {
  const v = [...vals].sort((a, b) => a - b), k = Math.floor(v.length * trim), u = v.slice(k, v.length - k);
  return u.reduce((a, b) => a + b, 0) / u.length;
}
const r2 = (x) => +x.toFixed(2);
const groups = {};
for (const dom of ["right", "left", "co"]) {
  const g = usable.filter((s) => s.dominance === dom);
  const labels = {};
  const names = new Set(g.flatMap((s) => Object.keys(s.rs)));
  for (const key of names) {
    const have = g.filter((s) => s.rs[key]);
    if (have.length < Math.max(3, g.length * 0.12)) continue;
    const curves = have.map((s) => s.rs[key].map((p) => s.T.apply(p)));
    const mean = Array.from({ length: N }, (_, i) => [0, 1, 2].map((k) => trimmedMean(curves.map((c) => c[i][k]))));
    // dispersión: media (sobre muestras) de la distancia de las curvas a la media, y su percentil 80
    const dev = curves.map((c) => c.reduce((a, p, i) => a + dist(p, mean[i]), 0) / N).sort((a, b) => a - b);
    const withR = have.filter((s) => s.rr[key]);
    const radius = withR.length >= 5 ? Array.from({ length: N }, (_, i) => +trimmedMean(withR.map((s) => s.rr[key][i] * s.T.s)).toFixed(3)) : null;
    const lens = have.map((s) => s.len[key] * s.T.s).sort((a, b) => a - b);
    labels[key] = {
      n: have.length,
      lengthMm: r2(trimmedMean(lens)),
      spreadMm: r2(dev.reduce((a, b) => a + b, 0) / dev.length),
      spreadP80Mm: r2(dev[Math.floor(dev.length * 0.8)]),
      points: mean.map((p) => p.map(r2)),
      ...(radius ? { radiusMm: radius, radiusN: withR.length } : {}),
    };
  }
  // nacimiento sobre el padre: fracción de arco del padre más cercana al primer punto de cada rama (mediana)
  const parentOf = { d1: "lad", d2: "lad", om1: "lcx", om2: "lcx", ramus: "lm", rpda: "rca", rpla: "rca", lpda: "lcx", lpla: "lcx", lad: "lm", lcx: "lm" };
  for (const [child, par] of Object.entries(parentOf)) {
    if (!labels[child]) continue;
    const ts = [];
    for (const s of g) {
      if (!s.rs[child] || !s.rs[par]) continue;
      const P = s.rs[par].map((p) => s.T.apply(p)), q = s.T.apply(s.rs[child][0]);
      const c = cum(P);
      let best = 1e9, bt = 0;
      for (let i = 0; i < P.length - 1; i++) {
        const ab = [0, 1, 2].map((k) => P[i + 1][k] - P[i][k]), l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
        const u = Math.min(1, Math.max(0, ([0, 1, 2].reduce((a, k) => a + (q[k] - P[i][k]) * ab[k], 0)) / l2));
        const d = dist([0, 1, 2].map((k) => P[i][k] + ab[k] * u), q);
        if (d < best) { best = d; bt = (c[i] + u * Math.sqrt(l2)) / c.at(-1); }
      }
      ts.push(bt);
    }
    ts.sort((a, b) => a - b);
    if (ts.length) labels[child].attachOnParent = { parent: par, t: +ts[Math.floor(ts.length / 2)].toFixed(3), n: ts.length };
  }
  groups[dom] = { scans: g.length, labels };
}

// puntos de referencia en el marco medio (todos los scans usados)
const landmarks = Object.fromEntries(["lmOstium", "rcaOstium", "lmBif", "ladEnd", "crux"].map((k, i) => [k, [0, 1, 2].map((c) => r2(trimmedMean(usable.map((s) => s.T.apply(s.land[i])[c]))))]));
// los mismos cinco puntos, por grupo
for (const dom of ["right", "left", "co"]) {
  const g = usable.filter((s) => s.dominance === dom);
  groups[dom].landmarks = Object.fromEntries(["lmOstium", "rcaOstium", "lmBif", "ladEnd", "crux"].map((k, i) => [k, [0, 1, 2].map((c) => r2(trimmedMean(g.map((s) => s.T.apply(s.land[i])[c]))))]));
}

const qc = {};
for (const q of [0, 1, 2, 3, 4]) qc[q] = usable.filter((s) => s.quality === q).length;
const out = {
  meta: {
    source: "ImageCAS-X (Bransby KM, Paulsen RR; Zenodo, doi:10.5281/zenodo.21887809), centerlines con etiquetas de segmento de 800 CCTA de la cohorte ImageCAS",
    license: "CC BY 4.0 (ImageCAS-X); cohorte ImageCAS original: ver public/ATTRIBUTION.md",
    note: "Solo estadísticas derivadas: cursos medios por fracción de arco, normalizados por traslación y escala isotrópica (SIN rotación: conservan la orientación del paciente de ImageCAS-X). Sin geometría por paciente.",
    frame: "X = izquierda del paciente, Y = superior, Z = anterior; mm; marco del paciente de la cohorte (X izquierda, Y superior, Z anterior), origen en el centroide de ostios + bifurcación del TCI + extremo de la DA, escala isotrópica a la media de la cohorte; sin rotación",
    samples: N,
    scansTotal: scans.length,
    scansUsed: usable.length,
    scansUsedByDominance: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, g.scans])),
    scaleToMeanFrame: { mean: +meanS.toFixed(3), sd: +sdS.toFixed(3) },
    trim: 0.2,
    generator: "scripts/angio/imagecas/build-mean.mjs",
  },
  landmarks,
  groups,
};
writeFileSync(outPath, JSON.stringify(out));
console.log("usables", usable.length, "de", scans.length, JSON.stringify(out.meta.scansUsedByDominance), "escala", meanS.toFixed(3), "±", sdS.toFixed(3));
for (const [dom, g] of Object.entries(groups)) console.log(dom, Object.entries(g.labels).map(([k, v]) => `${k}:${v.n}/${v.lengthMm}mm±${v.spreadMm}`).join("  "));
console.log("landmarks", JSON.stringify(landmarks));

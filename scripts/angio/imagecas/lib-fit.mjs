// Ajuste de semejanza (escala + rotación + traslación) por mínimos cuadrados ponderados: método cuaternión de Horn.
// p' = s·R·p + t. Sin dependencias.

function jacobiEigen4(A) {
  const n = 4;
  const a = A.map((r) => [...r]);
  const v = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  let best = 0;
  for (let i = 1; i < n; i++) if (a[i][i] > a[best][best]) best = i;
  return [0, 1, 2, 3].map((k) => v[k][best]);
}

function quatToMat([w, x, y, z]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

/** Ajusta src → dst. opts.weights (por punto), opts.noScale. Devuelve {s,R,t,apply(p)}. */
export function similarity(src, dst, opts = {}) {
  const n = src.length;
  const w = opts.weights ?? new Array(n).fill(1);
  const W = w.reduce((a, b) => a + b, 0);
  const cs = [0, 0, 0], cd = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { cs[k] += (w[i] * src[i][k]) / W; cd[k] += (w[i] * dst[i][k]) / W; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const a = [src[i][0] - cs[0], src[i][1] - cs[1], src[i][2] - cs[2]];
    const b = [dst[i][0] - cd[0], dst[i][1] - cd[1], dst[i][2] - cd[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += w[i] * a[r] * b[c];
    ss += w[i] * (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  }
  const N = [
    [S[0][0] + S[1][1] + S[2][2], S[1][2] - S[2][1], S[2][0] - S[0][2], S[0][1] - S[1][0]],
    [S[1][2] - S[2][1], S[0][0] - S[1][1] - S[2][2], S[0][1] + S[1][0], S[2][0] + S[0][2]],
    [S[2][0] - S[0][2], S[0][1] + S[1][0], -S[0][0] + S[1][1] - S[2][2], S[1][2] + S[2][1]],
    [S[0][1] - S[1][0], S[2][0] + S[0][2], S[1][2] + S[2][1], -S[0][0] - S[1][1] + S[2][2]],
  ];
  const q = jacobiEigen4(N);
  const R = quatToMat(q);
  // escala óptima: Σ w a'·R^T b / Σ w |a|²  (trazas)
  let num = 0;
  for (let i = 0; i < n; i++) {
    const a = [src[i][0] - cs[0], src[i][1] - cs[1], src[i][2] - cs[2]];
    const b = [dst[i][0] - cd[0], dst[i][1] - cd[1], dst[i][2] - cd[2]];
    const Ra = [0, 1, 2].map((r) => R[r][0] * a[0] + R[r][1] * a[1] + R[r][2] * a[2]);
    num += w[i] * (Ra[0] * b[0] + Ra[1] * b[1] + Ra[2] * b[2]);
  }
  const s = opts.noScale ? 1 : num / (ss || 1);
  const t = [0, 1, 2].map((r) => cd[r] - s * (R[r][0] * cs[0] + R[r][1] * cs[1] + R[r][2] * cs[2]));
  const apply = (p) => [0, 1, 2].map((r) => s * (R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2]) + t[r]);
  return { s, R, t, apply };
}

export function rms(a, b) {
  let e = 0;
  for (let i = 0; i < a.length; i++) e += (a[i][0] - b[i][0]) ** 2 + (a[i][1] - b[i][1]) ** 2 + (a[i][2] - b[i][2]) ** 2;
  return Math.sqrt(e / a.length);
}

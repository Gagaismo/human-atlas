"""CARDIAG -> rasgos 2D por caso (datos no confiables: solo se leen PNG/JSON, sin ejecutar nada).
Uso: python extract-features.py <dir datos> <salida.json>     (numpy + Pillow; sin -I porque -I oculta los paquetes)
Por caso: ángulos primario/secundario, SID/SOD, lado inyectado, punta del catéter y por segmento SYNTAX el área, el
centroide, el eje principal y los extremos (proximal = el más cercano a la punta del catéter). Coordenadas de imagen
normalizadas con x a la derecha, y hacia arriba, 0..1 (la imagen es de 512 px). La salida son datos por paciente: queda
en work/ (git-ignored); solo se versionan los agregados (aggregate-features.mjs)."""
import sys, os, json, glob
import numpy as np
from PIL import Image
root, out = sys.argv[1], sys.argv[2]
RIGHT = {"01", "02", "03", "04", "16", "16a", "16b", "16c"}
LEFT = {"05", "06", "07", "08", "09", "09a", "10", "10a", "11", "12", "12a", "12b", "13", "14", "14a", "14b", "15"}
def mask(p):
    a = np.array(Image.open(p))
    return (a if a.ndim == 2 else a.max(axis=2)) > 0
def feat(m, tip):
    ys, xs = np.nonzero(m)
    if len(xs) < 30: return None
    P = np.stack([xs, 511 - ys], 1).astype(float) / 512
    c = P.mean(0)
    w, v = np.linalg.eigh(np.cov((P - c).T))
    d = v[:, 1]
    t = (P - c) @ d
    a, b = P[t < np.percentile(t, 5)].mean(0), P[t > np.percentile(t, 95)].mean(0)
    if tip is not None and np.linalg.norm(b - tip) < np.linalg.norm(a - tip): a, b = b, a
    return {"n": int(len(xs)), "c": c.round(4).tolist(), "near": a.round(4).tolist(), "far": b.round(4).tolist(),
            "elong": float(np.sqrt(w[1] / max(w[0], 1e-9))) }
res = []
for d in sorted(glob.glob(os.path.join(root, "[0-9][0-9][0-9]"))):
    mp = os.path.join(d, "metadata.json")
    if not os.path.exists(mp): continue
    meta = json.load(open(mp))
    names = {os.path.basename(f)[:-4] for f in glob.glob(os.path.join(d, "*.png"))}
    segs = names & (RIGHT | LEFT)
    nr, nl = len(segs & RIGHT), len(segs & LEFT)
    side = "right" if nr > nl else "left"
    tip = None
    if "catheter" in names:
        ys, xs = np.nonzero(mask(os.path.join(d, "catheter.png")))
        if len(xs) > 20 and segs:
            allp = np.concatenate([np.stack(np.nonzero(mask(os.path.join(d, s + ".png")))[::-1], 1) for s in segs])
            cen = allp.mean(0)
            k = np.argmin((xs - cen[0]) ** 2 + (ys - cen[1]) ** 2)
            tip = np.array([xs[k], 511 - ys[k]], float) / 512
    f = {s: feat(mask(os.path.join(d, s + ".png")), tip) for s in sorted(segs)}
    f = {k: v for k, v in f.items() if v}
    res.append({"case": os.path.basename(d), "primary": float(meta["primary_angle"]), "secondary": float(meta["secondary_angle"]),
                "sid": float(meta["sid"]), "sod": float(meta["sod"]), "center": meta["center_id"][:6], "side": side,
                "tip": None if tip is None else tip.round(4).tolist(), "segs": f})
json.dump(res, open(out, "w"))
print(len(res), "casos;", sum(r["side"] == "right" for r in res), "derecha")

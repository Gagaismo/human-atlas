"""Baja de CARDIAG.zip (Zenodo 19958730, CC BY 4.0) solo los miembros pedidos, por HTTP Range y en paralelo.
Uso: python -I fetch-members.py <directorio_salida> <regex sobre el nombre del miembro>
El directorio central se lee una vez (RangeFile de scripts/angio/imagecas); cada miembro es una lectura de bytes
(cabecera local + datos deflate o stored). No ejecuta nada del zip, no baja modelos ni radiografías salvo que la
expresión las pida. Escribe <salida>/<caso>/<nombre>."""
import sys, os, io, re, zlib, struct, zipfile, urllib.request, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "imagecas"))
from rangezip import RangeFile
URL = "https://zenodo.org/api/records/19958730/files/CARDIAG.zip/content"
SIZE = 4569236433
out, pat = sys.argv[1], re.compile(sys.argv[2])
z = zipfile.ZipFile(io.BufferedReader(RangeFile(URL, SIZE), buffer_size=1 << 20))
todo = [i for i in z.infolist() if not i.is_dir() and pat.search(i.filename)]
print(len(todo), "miembros", flush=True)

def get(i):
    dst = os.path.join(out, i.filename)
    if os.path.exists(dst) and os.path.getsize(dst) == i.file_size: return 0
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    start, n = i.header_offset, 30 + 512 + i.compress_size
    for attempt in range(8):
        try:
            req = urllib.request.Request(URL, headers={"Range": f"bytes={start}-{min(SIZE - 1, start + n - 1)}"})
            with urllib.request.urlopen(req, timeout=120) as r: b = r.read()
            break
        except Exception:
            if attempt == 7: raise
            time.sleep(10 * (attempt + 1))
    sig, = struct.unpack("<I", b[:4])
    if sig != 0x04034B50: raise RuntimeError("cabecera local inválida " + i.filename)
    nl, el = struct.unpack("<HH", b[26:30])
    data = b[30 + nl + el: 30 + nl + el + i.compress_size]
    raw = zlib.decompress(data, -15) if i.compress_type == 8 else data
    if len(raw) != i.file_size: raise RuntimeError("tamaño distinto " + i.filename)
    with open(dst, "wb") as f: f.write(raw)
    return 1

done = 0
with ThreadPoolExecutor(4) as ex:
    for k, r in enumerate(ex.map(get, todo)):
        done += r
        if (k + 1) % 500 == 0: print(k + 1, "de", len(todo), flush=True)
print("listo", done, "nuevos")

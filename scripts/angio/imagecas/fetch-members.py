"""Baja solo los miembros pedidos del zip de ImageCAS-X por HTTP Range.
Uso: python -I fetch-members.py <directorio_salida> <prefijo>...   (p. ej. ImageCAS-X_dataset/centerlines/)
Escribe cada miembro con su nombre base (sin rutas) y no ejecuta nada."""
import sys, os, zipfile, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rangezip import RangeFile, URL, SIZE
out, prefixes = sys.argv[1], sys.argv[2:]
os.makedirs(out, exist_ok=True)
z = zipfile.ZipFile(io.BufferedReader(RangeFile(URL, SIZE), buffer_size=1 << 20))
todo = [i for i in z.infolist() if not i.is_dir() and any(i.filename.startswith(p) or i.filename == p for p in prefixes)]
done = 0
for i in todo:
    dst = os.path.join(out, os.path.basename(i.filename))
    if os.path.exists(dst) and os.path.getsize(dst) == i.file_size: continue
    with z.open(i) as s, open(dst, "wb") as d: d.write(s.read())
    done += 1
    if done % 100 == 0: print(done, "de", len(todo), flush=True)
print("listo", len(todo))

"""Lista los miembros del zip de ImageCAS-X (directorio central por HTTP Range).
Uso: python -I list-zip.py <salida.tsv>"""
import sys, zipfile, io
sys.path.insert(0, __file__.rsplit("/", 1)[0] if "/" in __file__ else ".")
from rangezip import RangeFile, URL, SIZE
f = io.BufferedReader(RangeFile(URL, SIZE), buffer_size=1 << 20)
z = zipfile.ZipFile(f)
with open(sys.argv[1], "w") as o:
    for i in z.infolist():
        o.write(f"{i.filename}\t{i.compress_size}\t{i.file_size}\n")
print(len(z.infolist()), "miembros")

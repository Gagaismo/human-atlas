"""Lista los miembros del zip de CARDIAG (directorio central por HTTP Range; no baja datos).
Uso: python -I list-zip.py <salida.tsv>   (Zenodo record 19958730, CC BY 4.0). Solo lee bytes."""
import sys, os, zipfile, io
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "imagecas"))
from rangezip import RangeFile
URL = "https://zenodo.org/api/records/19958730/files/CARDIAG.zip/content"
SIZE = 4569236433
z = zipfile.ZipFile(io.BufferedReader(RangeFile(URL, SIZE), buffer_size=1 << 20))
with open(sys.argv[1], "w") as o:
    for i in z.infolist():
        o.write(f"{i.filename}\t{i.compress_size}\t{i.file_size}\n")
print(len(z.infolist()), "miembros")

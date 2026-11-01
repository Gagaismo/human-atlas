"""Lee Descriptors.xlsx de ImageCAS-X (xlsx = zip + XML) y escribe descriptors.json.
Uso: python -I descriptors.py <Descriptors.xlsx> <salida.json>"""
import zipfile, re, json, sys
z = zipfile.ZipFile(sys.argv[1])
ss = [re.sub('<[^>]+>', '', s) for s in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode(), re.S)]
sh = z.read('xl/worksheets/sheet1.xml').decode()
out = []
for r in re.findall(r'<row [^>]*>(.*?)</row>', sh, re.S)[1:]:
    cells = {c: (ss[int(v)] if 't="s"' in a else v) for c, a, v in re.findall(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)</v>)?', r)}
    if cells.get('A'):
        out.append({'id': int(cells['A']), 'quality': cells.get('B'), 'dominance': cells.get('C'), 'disease': cells.get('D')})
json.dump(out, open(sys.argv[2], 'w'))
print(len(out), 'filas')

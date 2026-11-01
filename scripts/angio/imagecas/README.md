# ImageCAS-X → cursos medios de las coronarias

Regenera `scripts/angio/data/imagecas-mean.json` (solo estadísticas derivadas, el único archivo que se versiona). Los datos descargados son no confiables: viven en `work/imagecas-x/` (ignorado por git), solo se leen y los scripts reciben las rutas por argumento. Python siempre con `-I`.

Fuente: ImageCAS-X, Bransby KM y Paulsen RR, Zenodo, doi:10.5281/zenodo.21887809, CC BY 4.0. No se baja `pretrained_weights.zip`.

```sh
D=work/imagecas-x
python -I scripts/angio/imagecas/list-zip.py $D/members.tsv                                   # directorio central por HTTP Range
python -I scripts/angio/imagecas/fetch-members.py $D/filelist ImageCAS-X_dataset/filelist/ ImageCAS-X_dataset/Descriptors.xlsx
python -I scripts/angio/imagecas/fetch-members.py $D/centerlines ImageCAS-X_dataset/centerlines/
python -I scripts/angio/imagecas/fetch-members.py $D/segmentations ImageCAS-X_dataset/segmentations/   # opcional: radios de la luz
python -I scripts/angio/imagecas/descriptors.py $D/filelist/Descriptors.xlsx $D/descriptors.json
node scripts/angio/imagecas/extract-scans.mjs $D/centerlines $D/descriptors.json $D/scans.json $D/segmentations   # ~17 min con segmentaciones
node scripts/angio/imagecas/build-mean.mjs $D/scans.json scripts/angio/data/imagecas-mean.json
node scripts/angio/build-anatomy.mjs && node scripts/angio/validate-data.mjs
node scripts/angio/imagecas/qa-projections.mjs <etiqueta>   # PNG en work/qa/t5-<etiqueta>-*.png
```

`scans.json` contiene la geometría de cada paciente: no se publica. Detalle del método en `docs/research/angiografia-anatomia.md`.

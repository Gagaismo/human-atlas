# CARDIAG → calibración de las vistas (S18)

Reduce CARDIAG (Lau DB et al., Zenodo 2026, doi:10.5281/zenodo.19958730, CC BY 4.0; código https://github.com/cvlab-ai/cardiag-benchmark) a estadísticas agregadas en `scripts/angio/data/cardiag-features.json` (lo único que se versiona: sin imágenes, sin ids ni geometría por paciente). Los datos bajados son no confiables: viven en `work/cardiag/` (ignorado por git), solo se leen, y los scripts reciben las rutas por argumento. No se baja `models.zip` ni las radiografías.

```sh
D=work/cardiag
python -I scripts/angio/cardiag/list-zip.py $D/members.tsv                      # directorio central por HTTP Range
python -I scripts/angio/cardiag/fetch-members.py $D/data '^\d{3}/metadata\.json$|^(train|val|test)_split\.txt$'
python -I scripts/angio/cardiag/fetch-members.py $D/data '^\d{3}/(\d\d[abc]?|binary|catheter)\.png$'   # máscaras; 4 hilos, sin tocar la cuota de Zenodo (429)
python scripts/angio/cardiag/extract-features.py $D/data $D/features-all.json   # numpy + Pillow: sin -I (-I oculta los paquetes)
node scripts/angio/cardiag/fit-orientation.mjs $D/features-all.json $D/data     # ajuste de una rotación global (--write guarda orientation.json)
node scripts/angio/cardiag/aggregate-features.mjs $D/features-all.json $D/data --before <árboles anteriores> --after public/models/angio
node scripts/angio/cardiag/qa-compare.mjs <etiqueta>                            # work/qa/t9-compare-<etiqueta>-*.png contra work/angioview-ref/ (solo mirar)
node scripts/angio/cardiag/best-views.mjs                                       # mejores vistas de DA media, Cx proximal y CD media
```

Convención: ángulo primario DICOM + = OAI, secundario + = CRA (verificada: los otros tres signos dan más error). Detalle y resultados en `docs/research/angiografia-anatomia.md` (sección «Fidelidad angiográfica»).

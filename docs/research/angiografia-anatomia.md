# Angiografía: anatomía propia (T1, T5)

Notas del método con el que `scripts/angio/build-anatomy.mjs` genera `public/models/angio/*`. El corazón y los grandes vasos salen de las mallas BodyParts3D que ya están en el atlas (© DBCLS, CC BY 4.0); los **trayectos de las coronarias** (T5, spec S13) son los cursos medios de población de ImageCAS-X (CC BY 4.0) registrados sobre ese corazón; los calibres y las posiciones de los segmentos, medidas publicadas. No se descargó, leyó ni reutilizó nada de angioview.com (no es open source).

Comandos: `node scripts/angio/build-anatomy.mjs` (regenera todo, determinista, a partir de `scripts/angio/data/imagecas-mean.json`, ya versionado) y `node scripts/angio/validate-data.mjs` (3105 comprobaciones, sale con 1 si algo falla). Para regenerar los cursos medios desde ImageCAS-X, ver `scripts/angio/imagecas/README.md`.

## Marco y transformación

- Milímetros, X = izquierda del paciente, Y = superior, Z = anterior (verificado: el esternón está en z mayor que el corazón y la DA en x mayor que la CD).
- Origen = isocentro = centroide de volumen de la envolvente convexa (`three` ConvexHull) de: pared ventricular (`FJ2428`), paredes auriculares (`FJ2438`, `FJ2439`), aorta ascendente (`FJ3413`), tronco pulmonar (`FJ2966`) y las líneas centrales de las arterias coronarias.
- Isocentro en coordenadas del atlas: `[19.941, 1305.147, 23.311]` mm (`[0.019941, 1.305147, 0.023311]` m). Transformación: `frame_mm = atlas_m * 1000 - isocentro_mm`. Solo traslación: los ejes del atlas ya cumplen la convención (+x izquierda del paciente, +y superior, +z anterior). Queda registrada en `meta` de cada JSON y en `heart.json` (`meta.transform`).

## Cursos medios de ImageCAS-X (T5, S13)

**Por qué.** Las líneas centrales de BodyParts3D, unidas a mano con vasos sintetizados, daban proyecciones que no se parecían a una angiografía real (CD aplanada, DA angulosa, diagonales que no se abrían en abanico). Los cursos de los vasos etiquetados salen ahora de una población real.

**Fuente.** ImageCAS-X (Bransby KM, Paulsen RR; Technical University of Denmark; Zenodo, 2026; doi:10.5281/zenodo.21887809; arXiv:2608.30404): etiquetas de luz y de segmento, centerlines, mallas y descriptores (dominancia, calidad de imagen, enfermedad) de **800 TC coronarias** de la cohorte ImageCAS. Se bajó solo lo necesario con HTTP Range (directorio central del zip y los miembros pedidos): 1600 centerlines VTK, `Descriptors.xlsx`, las listas de archivos y las 800 segmentaciones (13 MB). No se bajaron las mallas, los volúmenes ni los pesos preentrenados. Todo lo bajado vive en `work/imagecas-x/` (ignorado por git), se trató como dato no confiable (solo se lee; nada se ejecuta) y los scripts de `scripts/angio/imagecas/` lo reciben por argumento; el Python se corre con `-I`.

**Esquema de etiquetas** (README del repositorio del conjunto): 1 LM, 2 LAD, 3 LCx, 4 D1, 5 D2, 6 OM1, 7 OM2, 8 IM (ramo intermedio), 9 RCA, 10 R-PDA, 11 R-PLA, 12 L-PDA, 13 L-PLA, 14 Other (D3, D4, OM3, OM4; no se usa). Cada centerline es un grafo de polilíneas con una etiqueta por punto (`segment_label`, `segment_name`) y marcas de inicio, bifurcación y fin. El formato es VTK 5.1 (binario big-endian, y ASCII en algunos archivos), en milímetros y en LPS (x izquierda, y posterior, z superior); verificado contra los ostios en los 800 casos y contra el afín de la segmentación NIfTI (RAS: se invierten x e y). Pasamos a nuestro marco con `X = x, Y = z, Z = −y`. Las etiquetas no distinguen proximal/medio/distal: los límites SYNTAX se calculan sobre cada curso (ver más abajo).

**Escaneos usados.** `exclude.txt` y los descriptores dejan 800 con dominancia (derecha 729, izquierda 41, codominante 30). Se descartan 19 por no tener las tres arterias principales completas (DA ≥ 50 mm, Cx ≥ 25 mm, CD ≥ 40 mm): quedan **781 (derecha 715, izquierda 38, codominante 28)**. Casos por rama (derecha / izquierda / co): TCI 715/38/28, DA 715/38/28, Cx 715/38/28, D1 706/36/27, D2 432/20/11, OM1 611/38/28, OM2 243/28/20, ramo intermedio 179/9/7, CD 715/38/28, DP derecha 713/–/15, PL derecha 710/–/12, DP izquierda –/34/8, PL izquierda –/34/24. Si un grupo tiene menos de 12 casos de una rama se usa el curso medio del grupo derecho (mismo marco medio).

**Método** (`scripts/angio/imagecas/`, en este orden):

1. `fetch-members.py`, `descriptors.py`: descarga parcial por Range y lectura de los descriptores.
2. `extract-scans.mjs` (+ `lib-vtk.mjs`, `lib-nifti.mjs`): por escaneo, camino ordenado de cada etiqueta desde el ostio (Dijkstra sobre el grafo, camino más largo dentro de la etiqueta, con el punto de unión del padre) y radio equivalente de la luz a lo largo del camino (vóxeles de la etiqueta asignados al punto más cercano, volumen / largo local, suavizado). Salida por paciente en `work/` (nunca se publica).
3. `build-mean.mjs` (+ `lib-fit.mjs`): cada camino se suaviza y se remuestrea a 32 puntos por fracción de arco; Procrustes generalizado (semejanza, 8 iteraciones) sobre cinco puntos de referencia (ostio del TCI, ostio de la CD, bifurcación del TCI, extremo distal de la DA, crux = origen de la DP) más muestras de TCI, DA, Cx y CD; la escala del marco medio se conserva en mm (los escaneos se escalan 0,955 ± 0,075 respecto de la referencia). Por grupo de dominancia y por rama: media recortada al 20 % coordenada a coordenada, dispersión (distancia media de las curvas a la media), longitud media, posición de nacimiento sobre el padre (mediana de la fracción de arco) y afinamiento medio del radio. **Solo estas estadísticas se publican** en `scripts/angio/data/imagecas-mean.json` (unos 37 kB); la geometría por paciente no se guarda ni se distribuye.
4. `qa-projections.mjs`: proyecciones en perspectiva con `app/angio/core/geometry.ts` (líneas oscuras sobre gris claro) a `work/qa/t5-*.png`, para comparar antes/después con las referencias de `work/angioview-ref/`.

**Registro sobre el corazón BodyParts3D** (`lib-imagecas.mjs`, `build-anatomy.mjs`):

1. Semejanza sobre los mismos cinco puntos medidos en nuestro corazón: ostios y bifurcación del TCI y ostio de la CD y crux de las piezas BodyParts3D `FJ2737`/`FJ2723`/`FJ2692`, y extremo distal de la DA `FJ2631` (en el isocentro del atlas). El ajuste se hace con el grupo derecho (el más numeroso) y se aplica a los tres grupos, que comparten el marco medio, así los tres árboles coinciden entre sí; en dominancia izquierda el «crux» de la cohorte (origen de la DPI) no es el mismo punto que el crux de la CD. Escala 1,016; residuo de los cinco puntos tras la semejanza, 6,9 mm RMS.
2. Corrección suave: RBF gaussiana (σ = 40 mm) que hace coincidir exactamente los cinco puntos y decae lejos de ellos.
3. Ajuste al epicardio: cada curso se lleva a 1,4 mm por fuera de la pared (ventrículos, aurículas, aorta, tronco pulmonar) con un desplazamiento hacia la superficie más cercana, suavizado a lo largo de la curva (σ = 6 muestras, 4 iteraciones), para conservar la forma media. Las ramas se pegan a su padre con el mismo método.
4. El ostio de cada vaso principal cae a ≤ 4 mm de la aorta, los hijos arrancan sobre el padre (`parentArc`) y el espaciado es ≤ 3,2 mm (los mismos controles de antes).

**Resultado numérico.** Distancia de cada segmento SYNTAX al curso medio registrado (antes del ajuste epicárdico), media/máximo en mm, dominancia derecha: TCI 2,8/3,2; DA 1,4–5,1/4,7–5,7; D1 3,9/6,5; D2 3,4/4,6; Cx 2,9/4,3; OM1 3,0/4,6; OM2 1,9/3,1; CD 1,3–3,1/2,2–4,6; DP 1,0/1,6. El validador exige ≤ 7 mm de media y ≤ 12 mm de máximo en las tres dominancias.

**Qué cambió respecto de T1.** Vienen ahora de ImageCAS-X: TCI, DA, D1, D2, Cx, OM1, OM2, ramo intermedio, CD, DP/DPI y PL/PLI (11–12 vasos por árbol). Los puntos de unión SYNTAX salen de los datos: DA proximal/media = nacimiento de D1; DA media/apical = nacimiento de D2; Cx proximal/distal = nacimiento de OM1; CD = ostio, medio camino al margen agudo, margen agudo, crux.

**Calibres.** La CD, la DA y la Cx conservan el diámetro de Dodge 1992 en el origen. Los centerlines de ImageCAS-X no traen radio; se estimó con las segmentaciones (volumen de la etiqueta / largo, radio equivalente de un cilindro, media recortada de 715 casos). Diámetros medios en dominancia derecha, de proximal a distal: TCI 3,6 → 3,2 mm; DA 2,5 → 1,5; Cx 2,3 → 1,5; CD 3,3 → 2,3; D1 1,6 → 1,4; OM1 1,5. Son menores que los de Dodge (cine, sujetos normales; la luz por TC en una cohorte con sospecha de enfermedad es más fina y el extremo distal queda sobrestimado por volumen parcial, vóxel 0,38 × 0,38 × 0,5 mm). Por eso solo se toma de ImageCAS-X la *forma* del afinamiento: diámetro(t) = D0 de Dodge × (0,5 · perfil de Dodge relativo + 0,5 · perfil medido relativo), monótono decreciente. La DA queda 3,6 → ≈ 1,6 mm, la Cx 3,4 → ≈ 1,9, la CD 3,9 → ≈ 2,9. **A validar**.

## Cómo se extraen las líneas centrales de BodyParts3D (`lib-centerline.mjs`)

Solo para las ramas que ImageCAS-X no etiqueta (cono, ramas ventriculares derechas, marginal aguda, PL1–PL2) y como guías de dirección (surco interventricular posterior para los septales).

Cada pieza coronaria es un tubo de malla. Para cada una: diámetro geodésico A→B sobre el grafo de la malla (Dijkstra), bandas de igual distancia geodésica desde A, un centroide por banda (solo la componente de banda que cruza el diámetro, así se ignoran ramas pegadas a la misma pieza), suavizado gaussiano y remuestreo a 1,5 mm. Las piezas no tienen sentido propio: `lib-tree.mjs` las orienta con el padre. Los radios de la malla (0,3–1 mm) no se usan: son ruido de la segmentación, los radios finales salen de Dodge (ver abajo).

Después `lib-tree.mjs` une piezas en vasos (spline de Catmull-Rom centrípeta por los puntos, remuestreo a 1,5 mm), y cada hijo arranca exactamente sobre su padre (`parentArc` = fracción de arco del punto más cercano). Los vasos sintetizados se apoyan sobre el epicardio: cada muestra se proyecta a la superficie más cercana (pared ventricular + aurículas + aorta + tronco pulmonar) y se separa hacia afuera `radio + 0,2 mm`, luego se suaviza. Los septales van dentro del tabique y no se proyectan.

## Qué vaso viene de dónde

| Vaso (id) | Fuente | Notas |
|---|---|---|
| `lm` TCI, `lad` DA, `d1`, `d2`, `lcx` Cx, `om1`, `om2`, `ramus` RI | ImageCAS-X (LM, LAD, D1, D2, LCx, OM1, OM2, IM), curso medio registrado | n por grupo arriba; en dominancia izquierda la Cx sigue hasta el crux |
| `rca` CD | ImageCAS-X (RCA) | del ostio al crux (en dominancia izquierda termina antes, como en los datos) |
| `pda` DP (derecha, co), `rpl` PL | ImageCAS-X (R-PDA, R-PLA) | |
| `lpda` DPI (izquierda), `lpl` PLI (izquierda, co) | ImageCAS-X (L-PDA, L-PLA) | `lpda` no existe en codominante |
| `rvd1`, `rvd2` | BodyParts3D `FJ2645`, `FJ2646` | ramas ventriculares derechas anteriores de la DA; el inicio se desplaza a la DA nueva y el desplazamiento se desvanece en 30 mm |
| `cono` | `FJ2670`, `FJ2676` Right conus artery | ídem, sobre la CD |
| `ma` marginal aguda | `FJ2672` | ídem |
| `rv1`, `rv2` | `FJ2671`, `FJ2673` | ídem |
| `rpl1`, `rpl2` | `FJ2720`; `FJ2722`+`FJ2721` | ídem, sobre la PL nueva |

Piezas de BodyParts3D no usadas: `FJ2632`, `FJ2633`–`FJ2641`, `FJ2643`, `FJ2647`, `FJ2648` (fragmentos cortos o ramas que cuelgan de otras ramas), `FJ2667`, `FJ2668`, `FJ2674`, `FJ2675`, `FJ2677`, `FJ2693`–`FJ2700`, `FJ2717`–`FJ2719`, `FJ2732`–`FJ2736` (septales cortos). Algunas sirvieron solo de guía de dirección.

## Vasos sintetizados y cómo

Las ramas que ImageCAS-X no etiqueta siguen sintetizadas y ahora cuelgan de los cursos nuevos: sus puntos de origen se calculan sobre la DA, la CD, la DP o la PL ya registradas. Llevan `source: "synthesised: …"` en el JSON; las que usan una línea central de BodyParts3D, `source: "BodyParts3D … re-attached to the ImageCAS-X course of its parent"`; las de ImageCAS-X, `source: "ImageCAS-X mean course (<etiqueta>; n=<casos>) registered onto the BodyParts3D heart"`.

- `d3`, `rpl3`: spline sobre el epicardio desde el padre nuevo (arco indicado) hacia la pared apicolateral / inferior. Waypoints elegidos a mano en coordenadas del atlas (el corazón no cambió), orientados por las piezas cortas no usadas (`FJ2639`, `FJ2640`, `FJ2719`). `d2`, `om2` y el ramo intermedio (variante `ramus`) ya no se sintetizan: vienen de ImageCAS-X.
- `s1`–`s5`: septales de la DA nueva, en los arcos 0,13/0,25/0,38/0,50/0,64. Dirección = componente perpendicular a la DA del vector hacia el surco interventricular posterior (guía = trayecto de `FJ2692`), longitud 16–28 mm, ligera curva hacia el ápex. Dentro del tabique.
- `dp-s1`–`dp-s3`: septales de la DP/DPI hacia la DA, mismo método.
- `cono-i`: del arco 0,10 de la DA al cono pulmonar, tramo distal de `FJ2644`.
- `san` (nodo sinusal, `NS`): de la CD proximal (arco 0,05) sobre la aurícula derecha hasta la base de la vena cava superior (8 % más bajo de `FJ3645`).
- `avn` (nodo AV, `NAV`): 10 mm desde el crux hacia la base del tabique. Se admite que entre en el miocardio.
- `aur-i`: ramo auricular izquierdo de la Cx proximal.
- Izquierda: `lpl` y `lpda` salen de ImageCAS-X. Co: `lpl` además de `pda`/`rpl` de ImageCAS-X (grupo de 28; la PL derecha media mide 13 mm).
- Septales: más finos (diámetro inicial 1,1 → 0,6 mm) para que no dibujen travesaños oscuros en la proyección.
- Puentes (`grafts-right.json`): `lima` sigue la malla `FJ1972` (arteria torácica interna izquierda, desde la subclavia izquierda) y baja a la DA media (arco 0,58); `svg-om` y `svg-pda` salen de la cara anterior de la aorta ascendente y rodean el corazón a 4–10 mm del epicardio hasta OM1 (arco 0,50) y la DP (arco 0,35). Son recorridos verosímiles, no datos de un paciente.

## Dominancias

- Derecha: la CD llega al crux; de ahí salen la DP y las PL (`rpl`, `rpl1`–`rpl3`). 33 vasos.
- Izquierda: la CD es pequeña y termina pasado el margen agudo, antes del crux; la Cx sigue por el surco AV posterior hasta el crux y da la `lpda` y la `lpl`. 30 vasos. Sin `pda` ni `rpl*`.
- Codominante: DP desde la CD, PL derechas acortadas y `lpl` desde la Cx. 34 vasos.

## Calibres de Dodge 1992 (orígenes y ramas)

Valores usados como diámetros iniciales: TCI 4,5 mm, DA proximal 3,6 mm, Cx proximal 3,4 mm, CD proximal 3,9 mm (los valores medios que fijó el pedido, tomados de Dodge JT Jr et al., Circulation 1992;86:232–246). El afinamiento distal (DA 3,6 → 3,1 al 30 % → 2,4 al 60 % → 1,2 mm en el ápex; Cx 3,4 → 1,5 mm; CD 3,9 → 2,8 mm en el crux; DP 2,4 → 1,2 mm) y los calibres de las ramas son nuestros, plausibles y monótonos, no cifras de la tabla de Dodge: **a validar**. Cada rama arranca con ≤ 85 % del radio de su padre en la unión. La validación exige TCI 4,5 ± 0,8, DA 3,6 ± 0,7, Cx 3,4 ± 0,7 y CD 3,9 ± 0,7 mm (2,8 ± 1 en dominancia izquierda).

## Posiciones de los segmentos (Dodge 1988, SYNTAX)

Los segmentos son fracciones de arco del vaso: DA proximal/media/apical = 0–origen de D1 (del dato, acotado a 0,15–0,40) / hasta el origen de D2 (acotado a ≥ D1 + 0,15 y ≤ 0,70) / resto; Cx proximal = hasta el origen de OM1 (del dato, 0,2–0,5), distal el resto; CD proximal / media / distal = ostium–mitad del trayecto al margen agudo / hasta el margen agudo (punto más a la derecha de la CD) / margen agudo–crux. Números SYNTAX: 1, 2, 3 CD; 4 DP; 5 TCI; 6, 7, 8 DA; 9, 10 D1, D2; 11 Cx proximal; 12 ramo intermedio; 12a, 12b OM; 13 Cx distal; 14 PL izquierda; 15 DP izquierda; 16, 16a–c PL derechas. Las ramas sin número SYNTAX (septales, D3, cono, NS, NAV, RV, MA, ramo auricular) llevan `syntax: ""`.

## Geometría del corazón (`heart.json` + `heart.bin`)

66 piezas, 39 892 triángulos (de 96 370 originales): pared ventricular, paredes auriculares, aorta ascendente/cayado/descendente torácica, tronco braquiocefálico, subclavias, arteria torácica interna izquierda, tronco y ramas pulmonares, venas cavas, esternón (cuerpo, manubrio, xifoides), clavículas, costillas 1–10, cartílagos costales 1–7, vértebras T1–T12. Corazón y grandes vasos conservan las mallas originales; el esqueleto se decima con meshoptimizer (`MeshoptSimplifier`, error relativo 0,05). Diseño binario (little-endian, bloques alineados a 4 bytes) documentado en `meta.layout`: posiciones float32 ×3 en mm, normales float32 ×3 unitarias, índices uint32. Se sirve también `heart.bin.gz` (como los chunks `body-*.bin.gz`; el cliente debe comprobar la firma gzip como `decodeModelResponse`). Tamaños: `heart.bin` 1 105 200 B, `.gz` 681 820 B; total de todos los activos 0,70 MB gz (límite 3 MB).

## Licencia

ImageCAS-X: CC BY 4.0 (metadatos del registro de Zenodo y «Data Availability» del artículo, arXiv:2608.30404); el código del repositorio es MIT. El zip no trae README ni LICENSE propios. El artículo dice que los volúmenes del ImageCAS original (Zeng A et al., Computerized Medical Imaging and Graphics 2023, distribuidos en Kaggle) están bajo Apache 2.0, pero la página de Kaggle los declara CC BY-NC 4.0. Como solo publicamos estadísticas derivadas (cursos medios, sin imágenes ni geometría por paciente) y damos crédito a ambos, se consideran cubiertas; la cláusula NC de Kaggle queda anotada para revisarla antes de cualquier uso comercial. Ver `public/ATTRIBUTION.md`.

BodyParts3D (CC BY 4.0, atribución obligatoria) → líneas centrales, mallas decimadas y mediciones derivadas aquí (CC BY 4.0, misma atribución) → uso en la app. Medidas publicadas (Dodge 1988/1992) son datos factuales citados. Los vasos sintetizados y los puentes son obra propia. AngioView (Annas Rahman, MD) solo se cita como inspiración; no se usa ninguno de sus datos. Ver la sección «Angiografía» de `public/ATTRIBUTION.md`.

## Límites conocidos

- Un solo corazón de referencia (varón adulto BodyParts3D); las tres dominancias comparten geometría común, lo que cambia es el patrón de ramas. Los cursos medios de dominancia izquierda (38 casos) y codominante (28) son menos estables que el derecho (715); la media por fracción de arco acorta algo las ramas que no llegan siempre al mismo punto (OM, Cx).
- El registro usa cinco puntos de referencia; el resto lo resuelven la corrección suave y el ajuste al epicardio. Es una anatomía de población puesta sobre un único corazón, no una medición en él.
- Las mallas coronarias de BodyParts3D están fragmentadas y la nomenclatura es la del proyecto (p. ej. «First posterior ventricular branch of RCA» es en realidad el tramo PL/surco AV posterior): la asignación a segmentos SYNTAX es nuestra y debe revisarla un docente (**a validar**).
- Las distancias de los vasos al epicardio se validan contra la malla decimada (límite 5,5 mm; septales y NAV hasta 26 mm).

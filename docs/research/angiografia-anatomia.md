# Angiografía: anatomía propia (T1)

Notas del método con el que `scripts/angio/build-anatomy.mjs` genera `public/models/angio/*`. Todo sale de las mallas BodyParts3D que ya están en el atlas (© DBCLS, CC BY 4.0) y de medidas publicadas. No se descargó ni reutilizó nada de angioview.com (no es open source).

Comandos: `node scripts/angio/build-anatomy.mjs` (regenera todo, determinista) y `node scripts/angio/validate-data.mjs` (3000 comprobaciones, sale con 1 si algo falla).

## Marco y transformación

- Milímetros, X = izquierda del paciente, Y = superior, Z = anterior (verificado: el esternón está en z mayor que el corazón y la DA en x mayor que la CD).
- Origen = isocentro = centroide de volumen de la envolvente convexa (`three` ConvexHull) de: pared ventricular (`FJ2428`), paredes auriculares (`FJ2438`, `FJ2439`), aorta ascendente (`FJ3413`), tronco pulmonar (`FJ2966`) y las líneas centrales de las arterias coronarias.
- Isocentro en coordenadas del atlas: `[19.941, 1305.147, 23.311]` mm (`[0.019941, 1.305147, 0.023311]` m). Transformación: `frame_mm = atlas_m * 1000 - isocentro_mm`. Solo traslación: los ejes del atlas ya cumplen la convención (+x izquierda del paciente, +y superior, +z anterior). Queda registrada en `meta` de cada JSON y en `heart.json` (`meta.transform`).

## Cómo se extraen las líneas centrales (`lib-centerline.mjs`)

Cada pieza coronaria es un tubo de malla. Para cada una: diámetro geodésico A→B sobre el grafo de la malla (Dijkstra), bandas de igual distancia geodésica desde A, un centroide por banda (solo la componente de banda que cruza el diámetro, así se ignoran ramas pegadas a la misma pieza), suavizado gaussiano y remuestreo a 1,5 mm. Las piezas no tienen sentido propio: `lib-tree.mjs` las orienta con el padre. Los radios de la malla (0,3–1 mm) no se usan: son ruido de la segmentación, los radios finales salen de Dodge (ver abajo).

Después `lib-tree.mjs` une piezas en vasos (spline de Catmull-Rom centrípeta por los puntos, remuestreo a 1,5 mm), y cada hijo arranca exactamente sobre su padre (`parentArc` = fracción de arco del punto más cercano). Los vasos sintetizados se apoyan sobre el epicardio: cada muestra se proyecta a la superficie más cercana (pared ventricular + aurículas + aorta + tronco pulmonar) y se separa hacia afuera `radio + 0,2 mm`, luego se suaviza. Los septales van dentro del tabique y no se proyectan.

## Qué vaso viene de qué parte BodyParts3D

| Vaso (id) | Parte(s) BodyParts3D | Notas |
|---|---|---|
| `lm` TCI | `FJ2737` Trunk of left coronary artery | 11 mm; el ostium cae a ≤ 4 mm de la aorta |
| `lad` DA | `FJ2631` Trunk of anterior interventricular branch | de la bifurcación al ápex, 109 mm |
| `d1` | `FJ2642` | un diagonal largo que sale de la DA en el arco 0,30 |
| `rvd1`, `rvd2` | `FJ2645`, `FJ2646` | «First/Second right anterior branch…» (ramas ventriculares derechas anteriores de la DA) |
| `lcx` Cx | `FJ2649`, `FJ2650`, `FJ2652`, `FJ2653`, `FJ2654` (y en izquierda: `FJ2716`, `FJ2715`, `FJ2714`, `FJ2723` posterior) | piezas separadas por huecos de 4–12 mm que se unen con la spline |
| `om1` | `FJ2651` | |
| `rca` CD | `FJ2723` Trunk of right coronary artery | del ostium al crux; el crux es la muestra de la CD más cercana al origen de la pieza `FJ2692` |
| `pda` DP (derecha, co) y `lpda` DPI (izquierda) | `FJ2692` Posterior interventricular branch | la pieza paralela `FJ2693` (5 mm al lado) se descartó como duplicado |
| `rpl` PL | `FJ2714` + tramo posterior de `FJ2723` | |
| `rpl1`, `rpl2` | `FJ2720`; `FJ2722`+`FJ2721` | |
| `cono` | `FJ2670`, `FJ2676` Right conus artery | |
| `ma` marginal aguda | `FJ2672` | |
| `rv1`, `rv2` | `FJ2671`, `FJ2673` | First anterior ventricular branch of RCA |

Piezas de BodyParts3D no usadas: `FJ2632`, `FJ2633`–`FJ2641`, `FJ2643`, `FJ2647`, `FJ2648` (fragmentos cortos o ramas que cuelgan de otras ramas), `FJ2667`, `FJ2668`, `FJ2674`, `FJ2675`, `FJ2677`, `FJ2693`–`FJ2700`, `FJ2717`–`FJ2719`, `FJ2732`–`FJ2736` (septales cortos). Algunas sirvieron solo de guía de dirección.

## Vasos sintetizados y cómo

Todos llevan `source: "synthesised: …"` en el JSON.

- `d2`, `d3`, `om2`, `rpl3`: spline sobre el epicardio desde el padre (arco indicado) hacia la pared anterolateral / apicolateral / lateral / inferior. Waypoints elegidos a mano en coordenadas del atlas, orientados por las piezas cortas no usadas (`FJ2648`, `FJ2639`, `FJ2640`, `FJ2719`).
- `ramus` (variante `ramus`): tercera rama del TCI entre DA y Cx, sobre la pared anterolateral.
- `s1`–`s5`: septales de la DA, en los arcos 0,13/0,25/0,38/0,50/0,64. Dirección = componente perpendicular a la DA del vector hacia el surco interventricular posterior (guía = trayecto de `FJ2692`), longitud 16–28 mm, ligera curva hacia el ápex. Dentro del tabique.
- `dp-s1`–`dp-s3`: septales de la DP/DPI hacia la DA, mismo método.
- `cono-i`: del arco 0,10 de la DA al cono pulmonar, tramo distal de `FJ2644`.
- `san` (nodo sinusal, `NS`): de la CD proximal (arco 0,05) sobre la aurícula derecha hasta la base de la vena cava superior (8 % más bajo de `FJ3645`).
- `avn` (nodo AV, `NAV`): 10 mm desde el crux hacia la base del tabique. Se admite que entre en el miocardio.
- `aur-i`: ramo auricular izquierdo de la Cx proximal.
- Izquierda: `lpl` (de la Cx distal a la pared posterolateral) y `lpda`. Co: `lpl` además de `rpl*` acortados (la PL derecha se corta al 50 %).
- Puentes (`grafts-right.json`): `lima` sigue la malla `FJ1972` (arteria torácica interna izquierda, desde la subclavia izquierda) y baja a la DA media (arco 0,58); `svg-om` y `svg-pda` salen de la cara anterior de la aorta ascendente y rodean el corazón a 4–10 mm del epicardio hasta OM1 (arco 0,50) y la DP (arco 0,35). Son recorridos verosímiles, no datos de un paciente.

## Dominancias

- Derecha: la CD llega al crux; de ahí salen la DP y las PL (`rpl`, `rpl1`–`rpl3`). 33 vasos.
- Izquierda: la CD es pequeña y termina pasado el margen agudo, antes del crux; la Cx sigue por el surco AV posterior hasta el crux y da la `lpda` y la `lpl`. 30 vasos. Sin `pda` ni `rpl*`.
- Codominante: DP desde la CD, PL derechas acortadas y `lpl` desde la Cx. 34 vasos.

## Calibres (Dodge 1992)

Valores usados como diámetros iniciales: TCI 4,5 mm, DA proximal 3,6 mm, Cx proximal 3,4 mm, CD proximal 3,9 mm (los valores medios que fijó el pedido, tomados de Dodge JT Jr et al., Circulation 1992;86:232–246). El afinamiento distal (DA 3,6 → 3,1 al 30 % → 2,4 al 60 % → 1,2 mm en el ápex; Cx 3,4 → 1,5 mm; CD 3,9 → 2,8 mm en el crux; DP 2,4 → 1,2 mm) y los calibres de las ramas son nuestros, plausibles y monótonos, no cifras de la tabla de Dodge: **a validar**. Cada rama arranca con ≤ 85 % del radio de su padre en la unión. La validación exige TCI 4,5 ± 0,8, DA 3,6 ± 0,7, Cx 3,4 ± 0,7 y CD 3,9 ± 0,7 mm (2,8 ± 1 en dominancia izquierda).

## Posiciones de los segmentos (Dodge 1988, SYNTAX)

Los segmentos son fracciones de arco del vaso: DA proximal/media/apical = 0–D1 (≈ 0,30) / 0,30–0,60 / 0,60–1; Cx proximal = hasta el origen de OM1 (≈ 0,2–0,35), distal el resto; CD proximal / media / distal = ostium–mitad del trayecto al margen agudo / hasta el margen agudo (punto más a la derecha de la CD) / margen agudo–crux. Números SYNTAX: 1, 2, 3 CD; 4 DP; 5 TCI; 6, 7, 8 DA; 9, 10 D1, D2; 11 Cx proximal; 12 ramo intermedio; 12a, 12b OM; 13 Cx distal; 14 PL izquierda; 15 DP izquierda; 16, 16a–c PL derechas. Las ramas sin número SYNTAX (septales, D3, cono, NS, NAV, RV, MA, ramo auricular) llevan `syntax: ""`.

## Geometría del corazón (`heart.json` + `heart.bin`)

66 piezas, 39 892 triángulos (de 96 370 originales): pared ventricular, paredes auriculares, aorta ascendente/cayado/descendente torácica, tronco braquiocefálico, subclavias, arteria torácica interna izquierda, tronco y ramas pulmonares, venas cavas, esternón (cuerpo, manubrio, xifoides), clavículas, costillas 1–10, cartílagos costales 1–7, vértebras T1–T12. Corazón y grandes vasos conservan las mallas originales; el esqueleto se decima con meshoptimizer (`MeshoptSimplifier`, error relativo 0,05). Diseño binario (little-endian, bloques alineados a 4 bytes) documentado en `meta.layout`: posiciones float32 ×3 en mm, normales float32 ×3 unitarias, índices uint32. Se sirve también `heart.bin.gz` (como los chunks `body-*.bin.gz`; el cliente debe comprobar la firma gzip como `decodeModelResponse`). Tamaños: `heart.bin` 1 105 200 B, `.gz` 681 820 B; total de todos los activos 0,70 MB gz (límite 3 MB).

## Licencia

BodyParts3D (CC BY 4.0, atribución obligatoria) → líneas centrales, mallas decimadas y mediciones derivadas aquí (CC BY 4.0, misma atribución) → uso en la app. Medidas publicadas (Dodge 1988/1992) son datos factuales citados. Los vasos sintetizados y los puentes son obra propia. AngioView (Annas Rahman, MD) solo se cita como inspiración; no se usa ninguno de sus datos. Ver la sección «Angiografía» de `public/ATTRIBUTION.md`.

## Límites conocidos

- Un solo corazón de referencia (varón adulto BodyParts3D); las tres dominancias comparten geometría común, lo que cambia es el patrón de ramas.
- Las mallas coronarias de BodyParts3D están fragmentadas y la nomenclatura es la del proyecto (p. ej. «First posterior ventricular branch of RCA» es en realidad el tramo PL/surco AV posterior): la asignación a segmentos SYNTAX es nuestra y debe revisarla un docente (**a validar**).
- Las distancias de los vasos al epicardio se validan contra la malla decimada (límite 5,5 mm; septales y NAV hasta 26 mm).

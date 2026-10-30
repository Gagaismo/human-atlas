# Anatomy data attribution

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- License: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (updated 2025-02-27)
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License terms: https://creativecommons.org/licenses/by/4.0/
- Source geometry: `isa_BP3D_4.0_obj_99.zip`, BodyParts3D 4.0.
- English names and relationships: IS-A and PART-OF concept, element, and inclusion tables from the same archive.
- Publication: Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical concepts. https://doi.org/10.1093/nar/gkn613

Adaptations: axes and units converted from millimeters/Z-up to meters/Y-up; translated to rest at the stage; geometry simplified using meshoptimizer with 0.2% relative error limit per structure; normals quantized to signed 16-bit; packed into binary chunks; curated display system groupings and colors. The source contains 2,234 individual OBJ meshes; all remain represented. The combined hierarchy contains 3,432 named FMA concepts, which may reference multiple meshes. Original source identity is preserved in the manifest.

Source OBJ comments mention an older CC BY-SA 2.1 Japan license. The official current database license linked above supersedes that legacy text and explicitly permits redistribution and adaptation under CC BY 4.0.

BodyParts3D represents an adult male reference anatomy based on TARO MRI and anatomical illustration refinements. It is not a complete model of every possible human anatomical structure or variation. This interface is educational and is not a clinical tool.

## Kinesiology mode model (`public/models/kinesio/`)

`lower-limb.glb.gz` and `lower-limb.json` are derived from **Z-Anatomy** by Gauthier Kervyn and contributors, licensed under **CC BY-SA 4.0**, which is itself built on BodyParts3D (above, CC BY 4.0). These two files are therefore distributed under **CC BY-SA 4.0**: you may share and adapt them, including commercially, if you credit the sources and share your adaptations under the same license. The application code that loads them stays under the MIT License.

- Source: https://github.com/Z-Anatomy/Models-of-human-anatomy (`Z-Anatomy.zip` for the muscle bellies and their origin/insertion patches, `Z-Biomechanics.7z` for the armature and the skeleton meshes).
- License terms: https://creativecommons.org/licenses/by-sa/4.0/

Adaptations, made by `scripts/kinesio/build-rig.py`: the Z-Biomechanics armature returned to its rest pose with animation and constraints removed; skeleton meshes decimated and kept rigid on their bones, with the patella moved to the tibia; 18 lower-limb muscles per side (and 3 context muscles) appended from Z-Anatomy, decimated to at most 2,500 vertices and skinned to the bones they cross with line-of-action weights; origin and insertion markers taken from the Z-Anatomy patches (or from the belly ends where a patch is missing) plus a pelvic via point for psoas major and iliacus; exported to glTF with Y-up and gzip-compressed.

The clinical content of the kinesiology mode (`app/kinesio/catalog.ts`) cites Kendall et al., *Músculos: pruebas funcionales, postura y dolor*, and Kapandji, *Fisiología articular*, tomo 2, for concepts and reference values. No text or figure from those works is reproduced. Every technique is marked as pending review by a kinesiologist.

## Bone landmarks, muscle attachments and lymph nodes (`public/models/descriptive/`)

`landmarks.json`, `attachments.glb.gz`, `lymph.glb.gz` and the lymph chunk (`lymph-chunk.bin*`, `lymph-parts.json`) are derived from **Z-Anatomy** by Gauthier Kervyn and contributors, licensed under **CC BY-SA 4.0** (itself built on BodyParts3D). These files are therefore distributed under **CC BY-SA 4.0**.

- Source: https://github.com/Z-Anatomy/Models-of-human-anatomy (`Z-Anatomy.zip`, `Startup.blend`)
- License terms: https://creativecommons.org/licenses/by-sa/4.0/

Adaptations, made by `scripts/zanatomy/extract.py`, `scripts/zanatomy/build.mjs` and `scripts/lymph/to-chunk.mjs`: landmark labels, origin and insertion areas and lymphoid organ meshes exported from the Blender file; aligned bone by bone to the BodyParts3D frame (Z-Anatomy bones are remodelled, so one global transform left about 17 mm of error); landmarks snapped to the atlas bone surfaces and one-sided labels mirrored to the other side; region labels, the spleen and the thymus (already in BodyParts3D) left out; meshes simplified; Spanish names added; lymph nodes packed as an extra atlas geometry chunk, with their side taken from the geometry. Z-Anatomy has no lymphatic vessel geometry, so lymph pathways are described in text.

## Female variant (`public/models/female/`)

The female structures shown by the sex switch (bony pelvis, uterus, uterine tubes, ovaries, urinary bladder, mammary glands and skin) are derived from the **Human Reference Atlas (HuBMAP)** 3D reference organs of the Visible Human female, licensed **CC BY 4.0**.

- Dataset: https://lod.humanatlas.io/ref-organ
- License terms: https://creativecommons.org/licenses/by/4.0/
- Organs and versions used:
  - `skin-female` v1.5: https://cdn.humanatlas.io/digital-objects/ref-organ/skin-female/v1.5/assets/3d-vh-f-skin.glb
  - `pelvis-female` v1.3: https://cdn.humanatlas.io/digital-objects/ref-organ/pelvis-female/v1.3/assets/3d-vh-f-pelvis.glb
  - `uterus-female` v1.2: https://cdn.humanatlas.io/digital-objects/ref-organ/uterus-female/v1.2/assets/3d-vh-f-uterus.glb
  - `ovary-female-left` v1.3: https://cdn.humanatlas.io/digital-objects/ref-organ/ovary-female-left/v1.3/assets/3d-vh-f-ovary-l.glb
  - `ovary-female-right` v1.3: https://cdn.humanatlas.io/digital-objects/ref-organ/ovary-female-right/v1.3/assets/3d-vh-f-ovary-r.glb
  - `fallopian-tube-female-left` v1.2: https://cdn.humanatlas.io/digital-objects/ref-organ/fallopian-tube-female-left/v1.2/assets/3d-vh-f-fallopian-tube-l.glb
  - `fallopian-tube-female-right` v1.2: https://cdn.humanatlas.io/digital-objects/ref-organ/fallopian-tube-female-right/v1.2/assets/3d-vh-f-fallopian-tube-r.glb
  - `urinary-bladder-female` v1.2: https://cdn.humanatlas.io/digital-objects/ref-organ/urinary-bladder-female/v1.2/assets/3d-vh-f-urinary-bladder.glb
  - `mammary-gland-female-left` v1.1: https://cdn.humanatlas.io/digital-objects/ref-organ/mammary-gland-female-left/v1.1/assets/3d-vh-f-mammary-gland-l.glb
  - `mammary-gland-female-right` v1.1: https://cdn.humanatlas.io/digital-objects/ref-organ/mammary-gland-female-right/v1.1/assets/3d-vh-f-mammary-gland-r.glb

Adaptations, made by `scripts/female/build.mjs` and `scripts/female/to-chunk.mjs`: axes and units converted to the atlas frame; the pelvis and pelvic organs scaled and translated as one group to fit the BodyParts3D bony pelvis, and the skin and mammary glands fitted to the body height; organ sub-meshes merged into named structures; geometry simplified and normals recomputed; packed as an extra atlas geometry chunk. The female skin keeps the source pose, with the arms away from the body. Muscles, nerves, vessels and the rest of the skeleton remain the shared BodyParts3D anatomy.

## Histology images (`public/histology/`)

Micrographs from Wikimedia Commons, each under its own license as listed below (CC0, public domain, CC BY or CC BY-SA). Every image was resized and converted to WebP (some were also cropped, as noted). Images under CC BY-SA remain under CC BY-SA. The Spanish captions in `histology.json` were written for this project and are pending review by a teacher.

| Image | Tissue | Author | License | Source | Changes |
|---|---|---|---|---|---|
| `histology/epitelio-plano-simple.webp` | Epitelio plano simple | Berkshire Community College Bioscience Image Library | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Epithelial_Tissues_Simple_Squamous_Epithelium_(41722161301).jpg) | Redimensionada y convertida a WebP |
| `histology/epitelio-cubico-simple.webp` | Epitelio cúbico simple | Echinaceapallida | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Epith_simple_cuboidal4.jpg) | Redimensionada y convertida a WebP |
| `histology/epitelio-cilindrico-simple.webp` | Epitelio cilíndrico simple | Mikael Häggström, M.D. | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Histology_of_normal_simple_columnar_epithelium_of_the_endometrium.jpg) | Convertida a WebP |
| `histology/epitelio-seudoestratificado-ciliado.webp` | Epitelio seudoestratificado cilíndrico ciliado | John.devos | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Masson%27s_trichrome_staining_of_the_Human_trachea.jpg) | Convertida a WebP |
| `histology/epitelio-plano-estratificado-queratinizado.webp` | Epitelio plano estratificado queratinizado | Kilbad (original); Mikael Häggström, M.D. (obra derivada) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Epidermis,_papillary_dermis_and_reticular_dermis.png) | Convertida a WebP |
| `histology/epitelio-plano-estratificado-no-queratinizado.webp` | Epitelio plano estratificado no queratinizado | Photograper09 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A_classic_view_of_non-keratinized_stratified_squamous_epithelium.jpg) | Redimensionada y convertida a WebP |
| `histology/epitelio-de-transicion.webp` | Epitelio de transición (urotelio) | Echinaceapallida | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Epith_transitional.jpg) | Redimensionada y convertida a WebP |
| `histology/conectivo-laxo.webp` | Tejido conectivo laxo | Berkshire Community College Bioscience Image Library | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Connective_Tissue_Loose_Aerolar_(41743649122).jpg) | Redimensionada y convertida a WebP |
| `histology/conectivo-denso-regular.webp` | Tejido conectivo denso regular (tendón) | Nephron | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tendon_-_high_mag.jpg) | Redimensionada y convertida a WebP |
| `histology/conectivo-denso-irregular.webp` | Tejido conectivo denso irregular | Echinaceapallida | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Dense_irregular.jpg) | Redimensionada y convertida a WebP |
| `histology/tejido-adiposo.webp` | Tejido adiposo (unilocular) | Mikael Häggström, M.D. | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Adipose_tissue_with_crumpling_artifact_due_to_insufficient_fixation.jpg) | Redimensionada y convertida a WebP |
| `histology/cartilago-hialino.webp` | Cartílago hialino | Ganímedes | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Cartilage03.JPG) | Redimensionada y convertida a WebP |
| `histology/cartilago-elastico.webp` | Cartílago elástico | Echinaceapallida | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Cartilage_elastic1.jpg) | Redimensionada y convertida a WebP |
| `histology/fibrocartilago.webp` | Fibrocartílago | Berkshire Community College Bioscience Image Library | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Connective_Tissue_Fibrocartilage_(41140134544).jpg) | Redimensionada y convertida a WebP |
| `histology/hueso-compacto.webp` | Hueso compacto | Athikhun.suw | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Compact_bone_histology_2014.jpg) | Redimensionada y convertida a WebP |
| `histology/hueso-esponjoso.webp` | Hueso esponjoso (trabecular) | Nataliia Maryenko | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Spongy_bone_in_polarized_light.jpg) | Redimensionada y convertida a WebP |
| `histology/sangre-frotis.webp` | Sangre (frotis periférico) | Ajay Kumar Chaurasiya | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:WBC_(neutrophil)_at_centre,_numerous_erythrocytes_and_platelets_(dot_like_bodies)_in_Wright%27s_stained_peripheral_blood_smear_(PBS)_microscopy.jpg) | Redimensionada y convertida a WebP |
| `histology/musculo-esqueletico-longitudinal.webp` | Músculo esquelético (corte longitudinal) | Rollroboter | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Muskel_(_1).jpg) | Redimensionada y convertida a WebP |
| `histology/musculo-esqueletico-transversal.webp` | Músculo esquelético (corte transversal) | Ganímedes | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Muscular_estriado_transv_400X.JPG) | Redimensionada y convertida a WebP |
| `histology/musculo-cardiaco.webp` | Músculo cardíaco | Alexander G. Cheroske | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Cardiac_muscle_histology_400x.jpg) | Redimensionada y convertida a WebP |
| `histology/musculo-liso.webp` | Músculo liso | Juan Carlos Fonseca Mata | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Smooth_muscle_(histology_slide).jpg) | Redimensionada y convertida a WebP |
| `histology/neuronas-asta-anterior.webp` | Neuronas del asta anterior de la médula espinal | Tulemo | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Nissl_bodies_in_neurons_of_the_spinal_cord.jpg) | Convertida a WebP |
| `histology/nervio-periferico.webp` | Nervio periférico (corte transversal) | Малишко Анастасія | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%D0%9F%D0%BE%D0%BF%D0%B5%D1%80%D0%B5%D1%87%D0%BD%D0%B8%D0%B9_%D0%BD%D0%B5%D1%80%D0%B2.jpg) | Redimensionada y convertida a WebP |
| `histology/piel.webp` | Piel | Guido Fregapani | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Pele_de_humano_%E2%80%93_HE_%E2%80%93_20x.png) | Redimensionada y convertida a WebP |
| `histology/higado.webp` | Hígado | Mikael Häggström, M.D. | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Histology_of_liver_tissue_from_a_gallbladder_resection.jpg) | Redimensionada y convertida a WebP |
| `histology/rinon.webp` | Riñón (corteza) | Nephron | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Benign_kidney_--_intermed_mag.jpg) | Redimensionada y convertida a WebP |
| `histology/pulmon.webp` | Pulmón | Yale Rosen | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Normal_lung_(5414785258).jpg) | Redimensionada y convertida a WebP |
| `histology/estomago.webp` | Estómago (mucosa del fondo) | Carrasco G, Corvalán AH | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Histology_of_normal_fundic_mucosa.png) | Redimensionada y convertida a WebP |
| `histology/intestino-delgado.webp` | Intestino delgado (mucosa) | Nephron | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Small_intestine_low_mag.jpg) | Redimensionada y convertida a WebP |
| `histology/colon.webp` | Colon | CoRus13 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Colon,_low_mag.jpg) | Redimensionada y convertida a WebP |
| `histology/tiroides.webp` | Glándula tiroides | M-J-G | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Histology_thyroid_gland.jpg) | Convertida a WebP |
| `histology/bazo.webp` | Bazo | Josef Reischig | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Spleen_(265_19)_Section;_mammal.jpg) | Redimensionada y convertida a WebP |
| `histology/ganglio-linfatico.webp` | Ganglio linfático | Ed Uthman, MD | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Normal_Lymph_Node.jpg) | Redimensionada y convertida a WebP |
| `histology/arteria-muscular.webp` | Arteria muscular | Lord of Konrad | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Artery.png) | Redimensionada y convertida a WebP |
| `histology/vena-con-valvula.webp` | Vena pequeña con válvula | Josef Reischig | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Venule_(238_12A)_With_a_vein_valve;_cross-section;_human.jpg) | Redimensionada y convertida a WebP |
| `histology/osificacion-endocondral.webp` | Osificación endocondral | Patbio | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ossification_endochondrale_chez_le_chat.jpg) | Redimensionada y convertida a WebP |
| `histology/medula-osea.webp` | Médula ósea (biopsia con trefina) | Gabriel Caponetti | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Bone_marrow_core_biopsy_microscopy_(trephine)_H%26E_panorama_by_gabriel_caponetti.jpg) | Recortada, redimensionada y convertida a WebP |

## Spanish names and descriptions

The Spanish structure names (`scripts/i18n/`, `public/models/names-es.json`) and the educational descriptions (`public/models/descriptions/`) were written for this project from standard anatomical terminology. They are not copied from any textbook and are flagged in the interface as pending review by a teacher.

## Historical assets (not included in the current release)

Earlier repository revisions included female reference anatomy: Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, *3D Reference Organ Set for Female v1.5* (2023). CC BY 4.0. Geometry adapted for this viewer.

- Source DOI: https://doi.org/10.48539/HBM352.BTSQ.586
- Dataset: https://lod.humanatlas.io/ref-organ/united-female/v1.5
- Original GLB: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb
- License: https://creativecommons.org/licenses/by/4.0/

Adaptations: translated native meter/Y-up coordinates onto the stage, coincident vertices welded and source normals averaged, geometry simplified with a 0.2% per-structure relative error bound, and normals quantized. Colors and display systems are curated for this interface. All 888 source meshes are represented, with 1,073 source nodes available as selectable individual or compound concepts.

This is a reference assembly with whole-body surface and selected organs, including female reproductive anatomy. Its skeleton and muscle coverage is partial. It is not a complete model of every human structure or a single-person scan. Eight placenta/umbilical structures are classified under Pregnancy reference and hidden by default.

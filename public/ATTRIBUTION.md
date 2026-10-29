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

## Historical assets (not included in the current release)

Earlier repository revisions included female reference anatomy: Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, *3D Reference Organ Set for Female v1.5* (2023). CC BY 4.0. Geometry adapted for this viewer.

- Source DOI: https://doi.org/10.48539/HBM352.BTSQ.586
- Dataset: https://lod.humanatlas.io/ref-organ/united-female/v1.5
- Original GLB: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb
- License: https://creativecommons.org/licenses/by/4.0/

Adaptations: translated native meter/Y-up coordinates onto the stage, coincident vertices welded and source normals averaged, geometry simplified with a 0.2% per-structure relative error bound, and normals quantized. Colors and display systems are curated for this interface. All 888 source meshes are represented, with 1,073 source nodes available as selectable individual or compound concepts.

This is a reference assembly with whole-body surface and selected organs, including female reproductive anatomy. Its skeleton and muscle coverage is partial. It is not a complete model of every human structure or a single-person scan. Eight placenta/umbilical structures are classified under Pregnancy reference and hidden by default.

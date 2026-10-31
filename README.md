# Human Atlas

An interactive 3D anatomy explorer built with React, Three.js, and shadcn/ui, with its interface and content in Spanish. Take the BodyParts3D adult male reference apart into **2,234 individually selectable meshes**, explore **15 anatomical systems**, search **3,432 named concepts**, switch to a female variant, cut the body along anatomical planes, and read descriptions of bones, muscles, vessels and nerves.

**[Explore the live demo](https://human-atlas-seven.vercel.app)**

## Explore

- Orbit, zoom, and select structures directly on the body.
- Toggle individual systems or use skeleton and organ presets.
- Move from assembled anatomy to a spaced inventory of every visible piece.
- Search anatomical names and source identifiers.
- Isolate a selected structure and read its details.
- Read Spanish descriptions of every bone (shape, parts, landmarks and what passes through its foramina), muscle (origin, insertion, innervation, action, supply), artery, vein, nerve and reproductive organ.
- See the landmarks of a selected bone, what passes through its foramina and grooves, and the origin and insertion areas of its muscles; explore the lymph node groups.
- Switch between the male and the female variant.
- Cut the assembled body with a sagittal, coronal or transverse plane, move the plane and flip the kept half.
- Browse openly licensed histology micrographs, also linked from each structure.
- Use compact controls and detail panels on mobile.
- Open the **kinesiology mode** (`/#kinesiologia`, in Spanish) to pose a rigged patient and stretch lower-limb muscles.

## Spanish content

The interface is in Spanish. Structure names come from a line-aligned translation table (`scripts/i18n/names-en.txt` and `names-es-*.txt`, built into `public/models/names-es.json` by `npm run build:names`); a placeholder for left/right agrees in gender with the noun it qualifies. Search ignores accents and also accepts the English source names.

Descriptions live in `public/models/descriptions/<system>.json`, one entry per structure name without its side, with a short summary and labelled fields per system. They, the histology captions and the Spanish names were written for this project, are educational, and are flagged in the interface as pending review by a teacher.

## Female variant

The sex switch in the systems panel replaces the male reproductive organs, bony pelvis, urinary bladder and skin with the Visible Human female pelvis, uterus, uterine tubes, ovaries, bladder, mammary glands and skin from the Human Reference Atlas (CC BY 4.0), aligned to the base model and packed as an extra geometry chunk. Muscles, nerves, vessels and the rest of the skeleton are shared, as the panel notes. The female skin keeps its source pose, with the arms away from the body.

## Section planes

The scissors button in the camera controls cuts the assembled body with a sagittal, coronal or transverse plane. The camera turns to face the cut, the plane position can be moved, and the kept half can be flipped. Cut interiors are shaded darker, taps on the removed half are ignored, and exploding the anatomy removes the cut.

## Landmarks, attachments and lymph nodes

Selecting a bone labels its landmarks (processes, tuberosities, foramina, grooves…) on the model, lists them in the detail panel with what passes through each opening, and draws the origin (red) and insertion (blue) areas of the muscles attached to it. Selecting a muscle shows where it arises and inserts, drawn through the surrounding anatomy. Labels on the far side are dimmed and respect the section plane. Lymph node groups are selectable structures of the lymphatic system, with what they drain and where their lymph goes. The data come from Z-Anatomy (CC BY-SA 4.0), aligned bone by bone to the atlas; rebuild them with Blender 5.2 (see `scripts/zanatomy/build.mjs`), then `npm run build:descriptive`, `npm run build:lymph` and `npm run validate:descriptive`.

## Histology

The Histología button opens 37 micrographs of the basic tissues and of organs in the atlas, from Wikimedia Commons under CC0, CC BY or CC BY-SA, each with its author, license and source. A structure's detail panel links to its own tissues, or to those of its system.

## Kinesiology mode

The kinesiology mode is a separate, lazily loaded view for physiotherapy students. It loads a rigged lower-limb model (skeleton plus 18 muscles per side on an articulated armature) and, for hamstrings, rectus femoris, vasti, iliopsoas, gastrocnemius, soleus, adductors and gracilis:

- poses the patient in supine, prone, side-lying, sitting or standing positions for each stretching technique, including what can still be done for a patient who cannot change position (*decúbito obligado*);
- animates the movement and colors the target muscles by how much their origin-to-insertion path lengthens, with the percentage beside each muscle;
- lets the user adjust hip, knee and ankle angles within normal joint ranges and switch sides;
- lists the Kendall length test, its normal value, precautions and sources.

The clinical content is educational, follows Kendall and Kapandji, and is marked as pending review by a kinesiologist. Elongation is the change in origin-to-insertion distance of the muscle-tendon unit, an approximation rather than a measurement of fiber strain.

## Gynecology area

The gynecology area is a separate, lazily loaded view at `#ginecologia` (linked from the top bar), in Spanish, built on the female model: semi-transparent skin (with a switch to see inside), breasts with fat, lobes, ducts, areola and nipple, and the uterus, tubes, ovaries, bladder and pelvis. Its sections come from the Octubre Rosa leaflet by IFMSA Tucumán (SCOPH) and UTN Tucumán (`docs/research/folleto-octubre-rosa.md`), quoted verbatim: breast self-exam, warning signs, screening schedule, myths and truths, the free mammography centers in Tucumán, and an anatomy section that reuses the Spanish reproductive descriptions.

The **Ver cómo palparte** button plays a 3D animation of the self-exam: the pads of three fingers move over the whole breast, pectoral and axillary area in vertical strips, making small circles with soft, medium and firm pressure (shown by how far the pads press in and by a halo color), standing or lying, on either breast, with a caption per step, a scrubbable progress bar and a slow speed. The path is generated in `app/gyneco/palpation.ts` and projected onto the skin by ray casting. The text is educational, not diagnostic, and flagged *a validar* until a teacher reviews it; every section lists its sources in `app/gyneco/content.ts` (a researched source is one line in `EXTRA_SOURCES`).

## Run locally

Requires Node.js 22.13 or newer. No API keys or accounts are needed.

```sh
npm ci
npm run dev
```

Open http://localhost:3016. To build the static site, run `npm run build`; the output is in `dist/`.

## Validate

```sh
npm run check
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
npm run validate:all
npm run build
```

`validate:all` runs every content and data check: Spanish names (`validate:names`), section planes (`validate:section`), descriptions and opening contents (`validate:descriptions`), the female variant (`validate:female`), landmarks, attachment areas and lymph nodes (`validate:descriptive`), histology images, credits and links (`validate:histology`) the kinesiology mode (`validate:kinesio`) and the gynecology area (`validate:gyneco`).

`validate:kinesio` checks the rigged model (joints, muscles, origin/insertion nodes, skin weights limited to the bones each muscle crosses, size budget), the clinical catalog (coverage, sign conventions, joint ranges, an immobile-patient option per group, pending-review flags) and the physiology of the rig: for example, a straight-leg raise must lengthen the hamstrings, knee flexion must not change the soleus, and every catalog technique must lengthen its target muscles.

`validate:gyneco` checks the self-exam palpation timeline (every cell of the breast, pectoral and axillary area is within one finger-pad radius of a stop, each stop presses soft, medium and firm in that order, the path has no jumps, the steps cover the timeline with Spanish captions), that every stop lands on the skin of both breasts with an outward normal, that the leaflet text is verbatim and every section has sources and is flagged unvalidated, that all 13 mammography centers are listed, and that the female parts the scene needs exist.

Validation covers mesh buffers, names and concept membership, nonoverlapping exploded layouts at desktop and mobile aspect ratios, search and inspection contracts, and tap-versus-drag handling. Browser interaction checks have exercised selection, system controls, search, isolation, rotation, and 390×844, 320×568, and 844×390 layouts. Phone controls stay clear of the exploded inventory, and isolated structures fit the space above or beside the detail panel. Physical-device performance and real multitouch hardware have not been tested.

## Anatomy data

The current viewer uses **BodyParts3D 4.0**, an adult male reference anatomy, licensed **CC BY 4.0**. It does not represent every human structure or variation. Individual source meshes are distinct from named concepts, which may group multiple meshes. Descriptions distinguish general system context from individual organ explanations.

Geometry is simplified for browser performance while retaining every source mesh. The packaged model contains 2,288,268 triangles and downloads approximately 33 MB of compressed geometry. Full credits, source links, and adaptation details are in [ATTRIBUTION.md](public/ATTRIBUTION.md).

This is an educational explorer, not a diagnostic or surgical tool.

## How it works

Geometry is merged into batches. Per-structure GPU textures control translation, visibility, and selection, while component geometry supports accurate picking. Exploded layouts pack only the visible pieces. Rendering updates when the scene changes; orbit controls remain responsive without thousands of separate draw calls.

The optional WebMCP tools expose anatomy search and inspection in compatible browsers. The visible interface works without them.

## Rebuilding geometry

The repository includes browser-ready geometry. Rebuilding it is optional: obtain the official BodyParts3D OBJ archive and English metadata tables, prepare the joined concepts and display-system mappings, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs` and `node scripts/compress-models.mjs`. Simplification uses a 0.2% relative error limit per structure.

## Rebuilding the kinesiology model

Optional. Install Blender 5.2, download `Z-Anatomy.zip` and `Z-Biomechanics.7z` from https://github.com/Z-Anatomy/Models-of-human-anatomy, extract their `Startup.blend` files, then run:

```sh
blender -b --factory-startup --disable-autoexec <Z-Biomechanics/Startup.blend> --python-exit-code 1   -P scripts/kinesio/build-rig.py -- --anatomy <Z-Anatomy/Startup.blend> --out public/models/kinesio
npm run validate:kinesio
```

`--disable-autoexec` keeps the scripts embedded in the downloaded `.blend` files from running. `scripts/kinesio/inspect.py` dumps the armatures, meshes and empties of a `.blend` file as JSON.

## Deploy

Import this repository into Vercel as a Vite project. The included `vercel.json` configures `npm ci`, `npm run build`, and the `dist` output directory. It can also be served by a static host.

## License

Original application code is released under the [MIT License](LICENSE). **The anatomy data has its own CC BY 4.0 license**; preserve the attribution when redistributing it. **The kinesiology model in `public/models/kinesio/` is derived from Z-Anatomy and is licensed CC BY-SA 4.0**; adaptations of it must keep that license. Third-party dependencies retain their respective licenses.

Issues and pull requests are welcome. Please include reproduction steps and browser/device details for interaction problems.

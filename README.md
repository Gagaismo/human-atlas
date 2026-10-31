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

The **Ver cómo palparte** button plays a 3D animation of the self-exam in eight captioned steps, performed by a rigged female body: mirror inspection (the body shows arms down, hands on the hips, arms up), position (standing, or lying on the table with a pillow under the shoulder; the arm of the examined side is raised with the hand resting behind the nape), the pads of the three middle fingers of the opposite hand, small circles with soft, medium and firm pressure (shown by how far the fingers press in and by a halo color), strips that cover the whole breast from the clavicle to below the inframammary fold and toward the axilla (the INC clinical-exam manual also accepts quadrants, radial, zigzag or circular if the exam is complete), the axilla (tail of the breast) and a gentle nipple check between the index and the thumb. It plays on either breast, with a scrubbable progress bar and a slow speed (about 49 s). The path is generated in `app/gyneco/palpation.ts` and projected onto the posed skin by ray casting; the palpating arm follows it with an analytic two-bone IK (`app/gyneco/ik.ts`, `app/gyneco/body.ts`), the palm turned to the skin normal. The HRA breast structures (fat, lobes, ducts, areola, nipple) sit under the body's skin, so **Ver el interior** shows the glands under the fingers, and the HRA pelvic organs stay pickable. The text is educational, not diagnostic, and flagged *a validar* until a teacher reviews it.

The body (`public/models/gyneco/body.glb.gz`, about 2 MB) is built from the **MakeHuman** base mesh, game-engine skeleton and morph targets bundled with **MPFB2 v2.0.18**, released by the MakeHuman Community under **CC0 1.0** (their `LICENSE.md`, section C: "These assets have been released under CC0 1.0 Universal"). It is a plain, neutral educational body, scaled to the HRA female frame; `public/models/gyneco/body.json` records the source URL, the license, the targets, the transform and the bone names the scene uses. The credit appears in the self-exam and anatomy source lists.

Sources: every section lists the researched sources it cites by id (`SOURCES` in `app/gyneco/content.ts`; the ids and quotes are in `docs/research/ginecologia.md`, consulted 2026-10-30): the INC and the Ministerio de Salud de la Nación, the Ministerio de Salud Pública de Tucumán, the Sociedad Argentina de Mastología and PAMI, with press (La Gaceta, La Nación) and MedlinePlus labelled as backup. **No published material from the UNT Facultad de Medicina on the self-exam was found** (only the Cátedra de Ginecología syllabus), and the page says so. Where sources disagree the UI shows each side, attributed: when to do the self-exam (2–5 days after the bleeding ends vs 3–5 or 7–10 days from its start), the age and interval of the mammography (INC 50–69 every 1–2 years vs Tucumán 40–70 yearly without a referral vs societies yearly from 40), self-exam as prevention vs self-awareness, and the clinical exam from 20 vs 30. The controls section adds cervical screening (PAP from 25, HPV test from 30 every 5 years) and the HPV vaccine, and each of the 13 leaflet mammography centers shows whether it was confirmed, partly confirmed or not confirmed. Leaflet text stays verbatim; `validate:gyneco` checks it, the source ids and URLs against the report, the conflicts and the center statuses.

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

`validate:gyneco` checks the self-exam palpation timeline (every cell of the breast, pectoral and axillary area is within one finger-pad radius of a stop, each stop presses soft, medium and firm in that order, the path has no jumps, the steps cover the timeline with Spanish captions), that every stop lands on the skin of both breasts with an outward normal, that the leaflet text is verbatim and every section has sources and is flagged unvalidated, that all 13 mammography centers are listed, and that the female parts the scene needs exist. It also checks the rigged body: the file parses, records its CC0 source and stays under 3 MiB gzipped, has the bones the scene poses, matches the HRA frame (height, sternum, nipple), keeps the HRA breast structures under its skin, and, posed with the arm raised, lands every stop on its skin; the IK reaches every stop within 5 mm on both sides, standing and lying, with elbow angles between 30° and 175° and no NaN, the raised hand is behind the ears and above the shoulder, the nipple pinch brings index and thumb to the nipple, and the mirror inspection goes arms down, hands on the hips, arms up.

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

## Rebuilding the gynecology body

Optional. Install Blender 5.2 and download, from https://github.com/makehumancommunity/mpfb2 at tag `v2.0.18` (`src/mpfb/data`, assets CC0 1.0), `3dobjs/base.obj`, `rigs/standard/rig.game_engine.json`, `rigs/standard/weights.game_engine.json` and the targets named in `public/models/gyneco/body.json` into a directory that keeps the `data/...` layout (downloads are untrusted: use a new, empty directory outside the repository). Then run:

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P scripts/gyneco/build-body.py -- --mpfb <dir with data/> --out public/models/gyneco
npm run validate:gyneco
```

The script reads the data files only (no MPFB code runs), applies the female macro and breast targets, builds the armature from the rig definition, skins the mesh with the bundled weights, aligns it to the HRA female frame and exports `body.glb.gz` and `body.json`.

## Deploy

Import this repository into Vercel as a Vite project. The included `vercel.json` configures `npm ci`, `npm run build`, and the `dist` output directory. It can also be served by a static host.

## License

Original application code is released under the [MIT License](LICENSE). **The anatomy data has its own CC BY 4.0 license**; preserve the attribution when redistributing it. **The kinesiology model in `public/models/kinesio/` is derived from Z-Anatomy and is licensed CC BY-SA 4.0**; adaptations of it must keep that license. The gynecology body in `public/models/gyneco/` is derived from the MakeHuman / MPFB2 assets (CC0 1.0); the female organs shown with it are HRA data (CC BY 4.0). Third-party dependencies retain their respective licenses.

Issues and pull requests are welcome. Please include reproduction steps and browser/device details for interaction problems.

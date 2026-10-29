# Human Atlas

An interactive 3D anatomy explorer built with React, Three.js, and shadcn/ui. Take the BodyParts3D adult male reference apart into **2,234 individually selectable meshes**, explore **15 anatomical systems**, and search **3,432 named concepts**.

**[Explore the live demo](https://human-atlas-seven.vercel.app)**

## Explore

- Orbit, zoom, and select structures directly on the body.
- Toggle individual systems or use skeleton and organ presets.
- Move from assembled anatomy to a spaced inventory of every visible piece.
- Search anatomical names and source identifiers.
- Isolate a selected structure and read its details.
- Use compact controls and detail panels on mobile.
- Open the **kinesiology mode** (`/#kinesiologia`, in Spanish) to pose a rigged patient and stretch lower-limb muscles.

## Kinesiology mode

The kinesiology mode is a separate, lazily loaded view for physiotherapy students. It loads a rigged lower-limb model (skeleton plus 18 muscles per side on an articulated armature) and, for hamstrings, rectus femoris, vasti, iliopsoas, gastrocnemius, soleus, adductors and gracilis:

- poses the patient in supine, prone, side-lying, sitting or standing positions for each stretching technique, including what can still be done for a patient who cannot change position (*decúbito obligado*);
- animates the movement and colors the target muscles by how much their origin-to-insertion path lengthens, with the percentage beside each muscle;
- lets the user adjust hip, knee and ankle angles within normal joint ranges and switch sides;
- lists the Kendall length test, its normal value, precautions and sources.

The clinical content is educational, follows Kendall and Kapandji, and is marked as pending review by a kinesiologist. Elongation is the change in origin-to-insertion distance of the muscle-tendon unit, an approximation rather than a measurement of fiber strain.

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
npm run validate:kinesio
npm run build
```

`validate:kinesio` checks the rigged model (joints, muscles, origin/insertion nodes, skin weights limited to the bones each muscle crosses, size budget), the clinical catalog (coverage, sign conventions, joint ranges, an immobile-patient option per group, pending-review flags) and the physiology of the rig: for example, a straight-leg raise must lengthen the hamstrings, knee flexion must not change the soleus, and every catalog technique must lengthen its target muscles.

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

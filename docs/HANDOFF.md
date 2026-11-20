# Frontend and asset handoff

**Latest implementation:** [Free-roam venue and light rules](NIGHT-WATCH-PLAN.md). The stationary guard section below is superseded. Guard now uses WASD, mouse aim, held exposure, continuous battery and per-player line-of-sight exposure. This is a local prototype protocol extension, not a network integration.

## What runs

Plain JavaScript + Three.js browser implementation, not the TypeScript/Canvas stack suggested by the source plan. `web/js/rehearsal.js` is explicitly a local simulator, not a multiplayer server. Teammates retain backend ownership. Four room choices share one gallery set; each has separate simulated state. Ghosts never rank against humans.

`config.js` owns plan constants. Visual coordinates multiply protocol X by 3.2; do not multiply backend speed or saved-frame coordinates. `scene.js` accepts room state. Replace `RehearsalTransport` with an adapter supplying the same render state, authoritative server timestamps, input/keepalive, room selection and guard target requests. Agree on caught notification/status derivation: the source plan does not list a standalone caught event. Do not present local results as live multiplayer.

The desktop and mobile layout was inspected at 1365×900 and 390×844. Keyboard movement, capture feedback and hiding were exercised in the browser. Real phone performance, touch ergonomics, multi-device networking and live 200-player load remain untested. Seven simulator tests pass. GLB validation reports zero errors; four character files each retain two upstream warnings: runtime-generated tangent space and non-root skinned mesh. Three.js rendered these files in the local preview.

## Assets

Four rigged characters: fox, rabbit, bear, guard. Each has a 24-joint skeleton and embedded 1024px textures. Animals include Idle, RunFast, Gentlemans_Bow, Victory_Cheer; guard includes Idle, Alert, Casual_Walk. Horizontal root motion is removed for simulation-driven movement. Game uses Idle/Run and guard Idle/Walk/Alert; bow and victory are supplied for subsequent integration.

Nine reusable prop GLBs: frame, plinth, bench, stanchion, sconce, exitDoor, flashlight, lantern and owl. Architecture is procedural Three.js geometry. Collection screen offers asset downloads. Portrait atlas and third-person concept are in `web/assets/concepts/`. Concept art is an artistic target and is not claimed to match runtime rendering.

## Provenance and costs

Initial four references and four Meshy models were incorrectly submitted through Higgsfield before the user's correction. Original model quotes were 47.5 Higgsfield credits each; actual debits/refunds were not verified. Those completed meshes were reused rather than regenerated.

All subsequent Meshy requests used the user's local Meshy API key directly: owl preview 20 credits, four rig jobs 5 each, three four-action requests 12 each and guard three-action request 9. Successful response records total 85 Meshy credits. Raw task responses and source downloads are local under ignored `output/`, not shipped. Never copy `.env` into a frontend or handoff. Concept board, portrait atlas and third-person reference were generated with the built-in image generator, not Higgsfield. Eight props were authored procedurally; owl geometry came from direct Meshy with a locally assigned bronze material.

## Remaining production work

Connect and validate authoritative backend; expand real-player room rosters; device performance profiling; author richer materials, facial states and entrance/exit transitions if required. The existing charcoal catch is a dark material treatment, not a bespoke charcoal shader. Shared rooms are not four bespoke levels. No publish, deployment, commit or push was performed.

## Guard first-person update

The guard now uses a fixed eye-level sentry position at the gallery entrance, with a camera-mounted lantern, stylized sleeve/glove, reticle and sector highlight. This is first-person targeting, not free-roaming movement. Escape players retain their third-person follow camera. Projection remains the gallery monitor. The third-person guard model is hidden from its own view.

Guard controls: select 01–08 (or keys 1–8), then SWEEP LIGHT. Space also sweeps when focus is not on a button. Tapping a valid exposed floor region raycasts into a sector; safe frame bands are excluded. A sweep locks targeting during the existing 1-second warning and scan. Empty charge state disables sweep. UI separates READY, WARNING, SCANNING and RECHARGING. Mobile room selection uses a compact dropdown. Camera interpolation and equipment sway respect reduced motion.

The user's Squid Game reference informs the ominous countdown, surveillance viewpoint and contrasting mint/rose warning UI. Museum characters and the original hide-in-frame rules remain. No new paid assets or backend changes were needed. Nine tests pass, including sector boundaries and scan/charge phases.

## Free-roam validation update

13 automated tests pass, covering movement collision and tunneling, doorway LOS, beam range and angle, exposure grace, safe frames, decay and empty-battery behavior, plus legacy rehearsal rules. Browser checks exercised walking, strafing, mouse drag turning, held left-mouse exposure, keyboard exposure, Esc pause, sculpture-base collision and the connected service passage. Desktop 1365×900 and mobile 390×844 layouts were inspected. Pointer lock was unavailable in the embedded test browser, so actual browser mouse capture remains to be checked in a normal supported desktop browser; the drag fallback was verified. Real touch hardware was not exercised.

A static-mesh batching incompatibility was found in browser QA and fixed by separating indexed and non-indexed geometry groups. No new occurrence was observed after reload. GLB audit remains zero errors; original character warnings remain documented. New glove/flashlight GLB is procedurally authored, unrigged, and can be downloaded from the collection.

### 21 November detail update
See [Night Watch detail pass](NIGHT-WATCH-PLAN.md#detail-pass--21-november-2026). Direct Meshy generated two textured static props for 60 credits. Scholar bust is integrated; glove/torch study failed first-person visual review and is collection-only. Neither new static prop is rigged. Existing four character rigs remain unchanged. Display base collision and geometry now both use 1.2 m height. Touch pointer release handling and guard HUD cleanup are included. No backend, commit, push or deployment was performed.

### Reference-led v3 hand, superseding v2 study
The corrected `watch-grip-v3.png` reference was generated and inspected first, then sent through the user's direct Meshy image-to-3D API. Primary runtime viewmodel is now `props/watchGripV3.glb`, with lens calibration in `detailed-grip.js`. Cost: 30 credits for this task. V2 remains a rejected collection study. V3 is a static held pose, not independently animated fingers. Added parquet, panel mouldings, thresholds, warm fixture pools, dim environment reflections and shaped flashlight falloff; paintings now respond to light. See latest plan for acceptance evidence and remaining hardware checks.

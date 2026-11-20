# Night Watch — venue, hands, camera and light rules

Latest user direction: freely walk and turn as the guard, aim a physical flashlight with the mouse, improve the full venue and hands. This replaces the stationary sector console. Escape players retain third-person following.

## Review and visual reference

Claude reviewed `guard-current.png` in the previously authorized design-only folder and replied in [the design conversation](https://claude.ai/chat/457ea5df-d043-4794-92e9-f9280f4a6cec). Its observed criticisms were flat lighting, excessive UI, distracting checkerboard flooring and a capsule-shaped placeholder hand. Its suggestions are design proposals, not backend authorization.

[Concept reference board](../web/assets/concepts/night-watch-field-guide.png) was generated from the resulting art direction with the built-in image generator. It is a material and composition target, **not a gameplay screenshot**. The board's two-wing diagram is conceptual. [Implemented venue plan](venue-plan.svg) is generated from actual collision coordinates and shows the three connected rooms currently implemented.

## Playable venue

| Area | Implemented extent | Purpose |
|---|---|---|
| Reception | X −7.5 to 0, main-hall width | Desk, entrance signage, guard spawn |
| Main hall | X 0 to 49.6 m; Z −3.35 to 4.32 m | Eight safe frames, vaulted roof, picture lights, escape route |
| Sculpture court | X 12 to 19, Z 5 to 11.3 | Bronze knot and blocking stone plinth |
| Restoration room | X 28 to 35, Z 5 to 11.3 | Faceted sculpture and display plinth |
| Archive gallery | X 41 to 48, Z 5 to 11.3 | Ring sculpture and portrait display |
| Service passages | X 19–28 and 35–41, Z 9.7–11.3 | Alternate route connecting the side rooms |
| Exit threshold | X 49.6 to 51.2 | End wall, closed museum door, freedom marker |

Main-hall ceiling is 6.9 m. Side-room ceilings are 5 m and service passage ceilings 3.25 m. Doorways from the main hall are at X 14–17, 30–33 and 43–46. Collision radius is 0.25 m; stepping uses 0.1 m subdivisions to prevent tunneling. Axis-separated collision allows sliding along walls. Characters do not block the guard. Reception and exit are not full rotundas; four gallery choices share this venue rather than being separate maps.

The third Claude review proposed two larger wings, a circular lobby, an expanded exit hall, a 0.4 m capsule and restricted guard entry zones. Those exact elements are **not implemented**. This iteration instead completes an enclosed reception/main/three-side-room/service-route venue within the existing coordinate system. No stairs or navigable upper balcony.

## Controls

- Click **Play as the night guard**, then **Click to take control** for browser mouse capture.
- WASD moves relative to view; mouse turns freely through 360° with a ±71.6° pitch limit.
- Hold left mouse to expose; release to return to harmless search light. Space is an alternate trigger.
- Esc, window blur or hiding the tab clears input and pauses local guard play.
- If mouse capture is unavailable, **Use drag controls** supports right-drag aiming; left-drag aims while exposing. Q/E are keyboard turning alternatives.
- Touch: directional buttons move, drag the scene to look, hold EXPOSE to illuminate.
- **Explore the museum** uses the same movement/collision without a timer or captures.

Normal movement is 3 m/s, exposure movement 1.2 m/s. Exposure turn speed is capped at 70°/s. Normal view supports up to 720°/s for responsiveness. No sprint, jump, head-bob or forced camera shake. Reduced-motion preference disables equipment sway.

## Flashlight and capture rules — local prototype

| Rule | Value |
|---|---|
| Search light | Always visible, 18 m range, 34° full angle; cannot catch |
| Exposure | Hold trigger; amber light, 13 m range, 14° full angle |
| Capture | Torso point inside beam with unobstructed line of sight for 1.0 s + 0.15 s grace |
| Leaving beam / releasing | Exposure decays at 2 seconds per second |
| Safe frame band | Existing ±0.25 protocol units, or ±0.8 m; resets exposure |
| Charge capacity | 2 units; each sustains 1.25 s exposure |
| Recharge | Release trigger; restores 1 unit per 2.5 s |
| Empty battery | Cannot expose; holding trigger does not create recharge flicker |
| Capture recovery | Return to saved frame; freeze 1 s; immunity for another 0.5 s |

A visible amber ring over an exposed actor indicates exposure progress. No global white strobe. The physical spotlight and capture cone share a muzzle origin and direction. Aim converges on the centre sight line or nearest architectural obstruction to reduce close-range parallax. One shadow-casting spotlight is used. Other lights do not perform capture tests. Standby light does not affect gameplay.

Collision/LOS solids are explicit AABBs for walls, columns, frame structures, benches and display bases. Visible architecture is built from the same solids. Fine ornamental edges and sculpture tops have approximate visual shadows rather than triangle-perfect gameplay occlusion. Actors do not occlude one another. The lamp is not an x-ray: walls block captures. Gold safe bands remain safe even under direct illumination.

## Hand and environment assets

The replacement equipment is procedurally modeled geometry: separate curled fingers, thumb, palm, stitched seams, cuff, sleeve, knurled barrel, switch, brass bezel and recessed lens. It is supplied as [guardEquipment.glb](../web/assets/models/props/guardEquipment.glb). It has no hand skeleton or skin textures; it is not a photoreal asset or motion-captured grip. The concept board sets a higher material target for future asset work.

The game uses lower-contrast flooring, dark marble safe bands, cool ambient light and a physical spotlight. Repeated static meshes are batched by material and geometry layout for fewer draw calls. It does not implement baked GI, ray-traced reflections or volumetric fog. Full scene art remains a browser prototype.

## Integration contract

Existing `target {room,gap}` does not express free-roaming capture. This branch's guard mode uses a **local-only extension**: pose `{x,z,yaw,pitch}`, trigger state and deterministic actor lanes. A production service must validate guard speed, collisions, line of sight, charge and per-player exposure; the client must not decide catches. Suggested update rate is 10–20 Hz with timestamps and sequence numbers. The shared map geometry/version must be identical on server and clients. Do not silently map the new beam to old whole-sector capture.

Player/monitor mock modes retain the older automatic sector guard. That mode is not evidence of network compatibility with the new freely aimed guard. Local guard bots are staggered through the 45-second round so there are subjects to track; real-player behavior is untested. Backend files and credentials are unchanged.

## Detail pass — 21 November 2026

Direct Meshy API only, using the locally configured user key. Two Meshy 7.1 preview meshes (20 credits each) and two PBR refinements (10 each) completed: **60 credits total**. No credentials are included in public assets or documentation.

- **The Keeper**: textured bronze scholar bust replaces the geometric placeholder in Sculpture Court. Runtime GLB 1,049,904 bytes, embedded base-color / metallic-roughness / normal maps, textures reduced to 1024px. Display bases are now 1.2 m high, with matching collision dimensions, an identification plaque and warm exhibit light. Runtime metalness is moderated for the environment's limited reflections.
- **Watch grip study**: textured glove, sleeve and flashlight GLB (1,384,868 bytes) is available in the collection, but **rejected for first-person gameplay**. Orthographic geometry and in-engine checks found that the generated grip obscures the torch and presents a floating wrist. It is a static mesh with no skin or animation; do not describe it as rigged or approved. Keep the existing connected procedural hand/torch viewmodel, now with subtle runtime leather/cloth surface relief. A future replacement needs a correct first-person grip reference and another in-engine review before acceptance.
- Touch look/move pointer release no longer cancels a separate held EXPOSE control. Mouse release still clears exposure.
- Guard HUD hides the runner's route tracker and duplicate catch count. Collection reference copy now correctly identifies the first-person lighting reference.

Preview/refine source task records and originals are in ignored `output/meshy/` and `output/provider-originals/`. Meshy source filenames: `watch-grip-v2` and `scholar-bust-v2`. Public assets: `web/assets/models/props/watchGrip.glb` (study only), `scholarBust.glb` (integrated). Backend remains owned by the multiplayer team; this is a local rehearsal.

Validation: 13 automated gameplay tests pass; production build and GLB validator pass with zero errors. Existing character warning details remain in `asset-audit.json`. Desktop walkthrough confirms the new exhibit, lamp and clean guard HUD with no browser console errors. This pass's attempted mobile viewport override did not visibly take effect, so mobile touch behavior is not claimed as device-tested. Native pointer-lock and real multi-touch still require device testing.

## Reference-led grip and lighting pass — 21 November 2026

The v3 glove/torch starts from `web/assets/references/watch-grip-v3.png`, a purpose-made image reference, before direct Meshy image-to-3D. Review criteria: thumb opposing four wrapped fingers, physical palm/barrel contact, head projecting ahead of the hand, continuous wrist/cuff/forearm, and sleeve extending out of the first-person viewport rather than ending visibly in mid-air. Unlike v2, the reference shows the flashlight pointing away from the wrist. Meshy generation uses 24k target triangles, PBR materials and 2K textures; source records stay in ignored output folders.

Scene work: deterministic parquet with grain and surface relief; flush wall panel mouldings, brass thresholds and ventilation grilles; three warm local fixture pools; low-intensity prefiltered environment reflections for metal; a radial flashlight cookie with bright core and softer spill. These fixtures do not change exposure/capture rules. Only the player's flashlight casts dynamic shadows to bound rendering cost.

V3 result: direct Meshy task succeeded for **30 credits**. `watchGripV3.glb` is integrated as the primary first-person viewmodel (3,120,720 bytes after embedded-texture optimization). Connected sleeve extends beyond the bottom/right viewport; lens position is calibrated in `detailed-grip.js` and feeds the physical light origin. Existing procedural equipment remains only as a load-failure fallback. This held-pose asset is static, not a skinned character rig; camera-relative movement supplies the small walking sway. Generated surface detail is not identical to the photographic reference.

Paintings now use rough physical materials and respond to the flashlight instead of being unlit full-bright images. Touch-sized layouts show touch instructions. Desktop and 390 × 844 browser views confirm the connected grip; mouse drag changes pitch and keyboard turning changes heading with the arm attached. Real touchscreen multi-touch and native pointer lock are still hardware acceptance checks, not claimed as tested here.

## Guard polish and reusable furniture
Added reusable GLBs for an oak archive drawer cabinet and a conservator table with framed work, archival paper and brushes; room placement has matching movement/light occluders. Hand motion now has a separate walking clock, smooth start/stop, subtle lateral/vertical movement and turn response; exposure steadies it and reduced-motion disables it. The torch retracts and lowers near walls. Flashlight shadows use a 2048 map and smaller contact offsets. Automated tests now include untimed walking, settling, reduced motion and furniture occlusion (16 passing).

First playable checkpoint committed and pushed to `main` as `54d8f1b` at the user's request. This supersedes earlier notes saying no commit/push. No deployment or multiplayer integration has occurred.

## Cover choices and patrol play — local gameplay extension
Four oak cover cabinets now sit between frames at route coordinates 2.7, 6, 9.7 and 14 (world X multiplied by 3.2). The new direct-Meshy `museumCover.glb` uses PBR textures and costs 30 credits (20 geometry + 10 texture); optimized runtime size is 849,732 bytes. The geometry was inspected before refinement. It is a static environmental asset.

Player instructions: release RUN on a gold frame to hide and save progress. Near a cabinet (within 0.28 route units), press C or TAKE COVER. Entry takes 0.9 seconds and follows three segments around the left edge, then behind the solid cabinet. RUN/BACK queues movement after the return path; C toggles entry/exit. Cabinets do not save progress or grant immunity. Actual solid occlusion protects the player; a free-roaming guard can flank the cabinet. The legacy automatic patrol uses a balcony sight ray for this local cover extension. A subset of guard-mode visitors now pause behind cover, giving the guard a reason to investigate different angles.

The added test suite verifies collision-free entry/exit, checkpoint preservation, unavailable cover while caught, frontal light occlusion and successful flanking capture. These additions require backend agreement before multiplayer use. Timing and fun remain playtest questions, not a claim of player-validated balance.

Acceptance for this pass: 19 automated tests pass; the browser was used to enter cover, remain behind the cabinet and inspect it from the guard's side. Latest guard view has no console errors. All GLBs validate with zero errors (normal-map tangent warnings are recorded in the asset audit). Touch button logic exists, but real-device multi-touch and native pointer lock remain unverified. Player HUD now reports the human's catches instead of aggregating every simulated visitor's catches.

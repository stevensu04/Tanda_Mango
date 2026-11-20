# FRAME / ESCAPE — art direction review

2026-11-21, Brisbane. Design consultation with Claude in Wesley's existing [Crazy creative demo concept chat](https://claude.ai/chat/457ea5df-d043-4794-92e9-f9280f4a6cec). Claude read the v3 plan and all four reference PNGs from a separate design-only folder. This records recommendations, not user approval or completed features.

## Direction

**Fine art. Bad behaviour.** The joke is the transition from undignified escape to an absurdly dignified portrait. Preserve the four original sculptural, painterly characters and the actual 3D meshes and rigs Wesley requested.

- Warm cream / ochre stage walls separate teal, sage and navy costumes from the scenery. Deep green belongs to the interface and low wall panels.
- Locked side-stage camera. The player is foreground, full colour, with a gold marker; ghosts are translucent sepia and excluded from rankings.
- Run: saturated paint; hide: flat framed portrait with varnish; caught: charcoal / red wax seal; ghost: unfinished studio copy.
- Amber marks only the targeted floor segment. **GET TO A FRAME**, never “HOLD STILL”: a stationary character outside a safe zone is still caught. Safe zone says **RELEASE TO POSE**.
- No simulation pause for visual effects, no white full-screen strobe. Reduced motion keeps static state cues.
- Hall of Fame: salon wall of human winners, **ON LOAN: FREEDOM**; guard catch count shown separately.

## What Claude challenged

The first dark-green/brass/serif direction looked too much like a museum website. He proposed a paper theater; the implementation decision retains real 3D with a fixed side view because that is Wesley's explicit brief. He suggested sprites on weaker phones; a Canvas fallback remains a performance option, not an implemented feature.

The rabbit's reference is smoother than the other three. The fox jacket is dark; the bear's scholar identity could use glasses. These are review notes, not permission to repeatedly regenerate paid models. Three species × 67 colours would be hard to distinguish; use gallery-scoped labels plus backend IDs instead of colour alone. Backend team must own the naming decision.

## Reference board

The board is concept art, not a screenshot of the implemented frontend. It combines the escape-from-canvas hero scene, a phone composition, and four character states. The first generation incorrectly drew a pit in the phone view; a correction was requested: the floor must remain flat, with an amber light patch. There is no jumping mechanic.

## Scope and handoff

Frontend/art are under `web/`. No backend, authentication, room authority, network prediction or deployment is claimed. v3's TypeScript + Vite + Canvas stack is the team plan; this isolated art rehearsal currently uses plain JavaScript and Three.js. Integrate the renderer into the team's chosen stack after `shared/map.ts` and `shared/protocol.ts` arrive. Do not substitute local rehearsal logic for server authority.

Claude identified that v3's message list lacks a separate caught event: derive this from authoritative personal status or agree an event with the backend team.

## Confirmed camera revision

Wesley explicitly selected **third-person follow** after reviewing the first implementation. This supersedes the side-stage camera recommendation above. Put the camera behind and above the avatar, keep the next long floor segment and safety frames visible, and retain full 3D models. The initial reference board is a historical side-view exploration; produce a new third-person gameplay reference.

## Second review — third-person museum, 21 November

Wesley confirmed third-person follow and requested a larger museum, clearer UI/UX and a more believable guard. Claude replied in the same linked design chat. Claude explicitly said this second review inferred problems from the description rather than inspecting a running screenshot.

Recommendations adopted: enlarged world scale without changing server coordinates; high vaults and skylights; safe portraits facing the camera; dark decorative frames distinguished from gold safe frames; brass floor bands; immersive mobile HUD; back/run touch controls; guard patrol balcony because the protocol gives the guard a target section but no physical position. Camera stays behind when retreating. Warning remains local to the targeted floor, with no full-screen white flash.

Implementation uses 3.2 world units per protocol unit (49.6-unit playable route), 8-unit-wide gallery and 6.9-unit ceiling. Claude proposed 4x and variable 7–11-unit rooms; those exact dimensions were not adopted. Current galleries share architecture; distinct room geometry is not implemented. Guard animations are Idle/Alert/Casual_Walk, with a lantern following the hand; not facial performance or photorealism. Gold floor width matches ±0.25 protocol units. Release snap remains ±0.4. Original v3 rules are unchanged.

## Latest user direction: first-person guard

User requested Squid Game-like tension and explicitly required guard first-person. This supersedes the guard-camera presentation in the second Claude review. Guard is now an eye-level sentry with a held lantern, reticle, deliberate sector selection and separate sweep action. The patrol model remains visible to escaping players only. No further Claude consultation is claimed for this update.

## Third Claude review: freely moving night watch

Claude read the actual guard-current.png screenshot in the design-only folder. It identified flat lighting, dominant checkerboard floor, oversized console UI and placeholder capsule glove. It proposed free aim with per-target exposure rather than locking a sector; 18 m harmless search light, 13 m capture beam, 1.15 s exposure, decay, two-charge battery and slow movement while exposing. These are adopted in the local guard prototype. Complete proposal/implementation differences, reference board and actual venue plan are recorded in NIGHT-WATCH-PLAN.md. User's explicit free-roaming request supersedes earlier stationary guard decisions.

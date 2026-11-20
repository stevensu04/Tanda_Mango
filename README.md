# FRAME / ESCAPE

A 3D museum rehearsal with third-person escape and freely roaming first-person night watch. Frontend and assets only; multiplayer backend is not connected.

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:5186. Hold RUN / right arrow to move; release on gold near a frame to hide. BACK / left arrow retreats. A round lasts 45 seconds. Guard mode is freely moving first-person: WASD moves, mouse aims, hold left mouse to expose. Esc pauses. Use right-drag aiming if mouse capture is unavailable. Explore the museum opens an untimed venue walkthrough. Escaping players retain third-person follow. Projection mode is available from the lobby.

- [English source plan](docs/frame-escape-plan.en.md)
- [Design review](docs/DESIGN-REVIEW.md)
- [Latest free-roam venue and flashlight plan](docs/NIGHT-WATCH-PLAN.md)
- [Implemented venue floorplan](docs/venue-plan.svg)
- [Frontend and assets handoff](docs/HANDOFF.md)
- [Asset validation](docs/asset-audit.json)
- [Correct flashlight grip reference](web/assets/references/watch-grip-v3.png) — source for the integrated Meshy v3 hand.
- [Third-person reference](web/assets/concepts/third-person-reference.png) — concept art, not an engine screenshot.

Verification: `npm test`, `node scripts/audit-assets.mjs`, `npm run build`.

Secrets belong only in local `.env`. Neither the static server nor build includes it. No commit, push or deployment is part of this delivery.

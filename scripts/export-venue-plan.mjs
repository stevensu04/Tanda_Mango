import {writeFileSync} from 'node:fs';
import {WALK_AREAS,SOLIDS} from '../web/js/venue.js';
const scale=16,X=x=>(x+9)*scale,Y=z=>(z+5)*scale;
const areas=WALK_AREAS.map(a=>`<rect x="${X(a.x0)}" y="${Y(a.z0)}" width="${(a.x1-a.x0)*scale}" height="${(a.z1-a.z0)*scale}" fill="#ddd3b9"/>`).join('');
const solids=SOLIDS.filter(b=>b.y-b.h/2<.1).map(b=>`<rect x="${X(b.x-b.w/2)}" y="${Y(b.z-b.d/2)}" width="${b.w*scale}" height="${b.d*scale}" fill="${b.kind==='wall'?'#263b35':'#9e8050'}"/>`).join('');
const labels=[[-4,.5,'RECEPTION'],[7,.5,'MAIN HALL'],[24,.5,'PORTRAIT GALLERY'],[44,.5,'EXIT'],[15.5,7,'SCULPTURE'],[31.5,7,'RESTORATION'],[44.5,7,'ARCHIVE'],[24,10.6,'SERVICE'],[38,10.6,'SERVICE']].map(([x,z,t])=>`<text x="${X(x)}" y="${Y(z)}" font-size="10" text-anchor="middle" fill="#153a30">${t}</text>`).join('');
writeFileSync('docs/venue-plan.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="390" viewBox="0 -50 1040 390"><rect x="0" y="-50" width="1040" height="390" fill="#f5f1e7"/><text x="24" y="-20" font-size="22" font-family="Georgia">NIGHT WATCH / IMPLEMENTED VENUE</text><g>${areas}${solids}${labels}</g><text x="24" y="320" font-size="11">Top-down collision plan · Units in metres · 49.6 m escape route · Three connected side galleries · Not the concept-art floorplan</text></svg>`);

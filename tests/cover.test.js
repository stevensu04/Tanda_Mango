import test from 'node:test';import assert from 'node:assert/strict';
import {COVERS,requestCover,advanceCover,coverPose} from '../web/js/cover.js';
import {makeRoom,setInput,tick,screenedFromPatrol,updateExposure} from '../web/js/rehearsal.js';
import {inVenue} from '../web/js/venue.js';
test('entering and leaving cover follows a collision-free path and preserves checkpoint',()=>{const r=makeRoom(),p=r.players[0];p.x=2.7;p.saved=1;assert.ok(requestCover(p));for(let i=0;i<60;i++){advanceCover(p,1/60);const v=coverPose(p);assert.ok(inVenue(v.x,v.z,.15),JSON.stringify(v));}assert.equal(p.coverProgress,1);assert.equal(p.saved,1);assert.equal(screenedFromPatrol(p,1),true);setInput(r,1);for(let i=0;i<70;i++)tick(r,1/60,{autoGuard:false});assert.equal(p.coverId,undefined);assert.ok(p.x>2.7);assert.equal(p.saved,1);});
test('cover is unavailable from open floor, or when caught',()=>{const p=makeRoom().players[0];p.x=2;assert.equal(requestCover(p),false);p.x=2.7;p.freeze=1;assert.equal(requestCover(p),false);});
test('physical cabinet blocks front exposure but a guard can flank it',()=>{const r=makeRoom(),p=r.players[0];p.x=2.7;requestCover(p);advanceCover(p,1);p.hidden=false;const x=COVERS[0].wx;for(let i=0;i<30;i++)updateExposure(r,.05,{origin:{x,y:1.1,z:1.7},direction:{x:0,y:0,z:-1},exposing:true});assert.equal(p.caught,0);r.charges=2;for(let i=0;i<24;i++)updateExposure(r,.05,{origin:{x:x+3,y:1.1,z:-1.65},direction:{x:-1,y:0,z:0},exposing:true});assert.equal(p.caught,1);assert.equal(p.coverId,undefined);});

test('gallery entrances admit the indicated approach and route around solid wood', () => {
  const expectedSides = [[-1,1],[-1],[1]];
  for (let room = 0; room < 4; room++) {
    for (const cabinet of COVERS) {
      for (const side of [-1,1]) {
        const p = makeRoom('fox',room).players[0];
        p.x = cabinet.x + side * .22;
        const sides = expectedSides[room] ?? [cabinet.id % 2 ? 1 : -1];
        assert.equal(requestCover(p), sides.includes(side));
        if (p.coverId === undefined) continue;
        for (let i = 0; i < 50; i++) {
          advanceCover(p,1/60);
          const pose = coverPose(p);
          assert.ok(inVenue(pose.x,pose.z,.15));
        }
      }
    }
  }
});

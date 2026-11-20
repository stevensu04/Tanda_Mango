import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionAtWorldX,sectionBounds,WORLD_SCALE,sweepState} from '../web/js/guard-view.js';
import {makeRoom,target,tick} from '../web/js/rehearsal.js';
test('floor aiming excludes safe frames and maps all eight sectors',()=>{for(let i=0;i<8;i++){const [a,b]=sectionBounds(i);assert.equal(sectionAtWorldX((a+b)/2*WORLD_SCALE),i);assert.equal(sectionAtWorldX(a*WORLD_SCALE),null);}for(const x of [-1,100,NaN])assert.equal(sectionAtWorldX(x),null);});
test('guard sweep phases follow authoritative timing and charge gate',()=>{const r=makeRoom();assert.equal(sweepState(r,true),'PREPARING');assert.equal(sweepState(r),'READY');assert.equal(target(r,1),true);assert.equal(sweepState(r),'WARNING');assert.equal(target(r,2),false);for(let i=0;i<22;i++)tick(r,.05,{autoGuard:false});assert.equal(sweepState(r),'SCANNING');r.light=null;r.charges=0;assert.equal(sweepState(r),'RECHARGING');r.ended=true;assert.equal(sweepState(r),'CLOSED');});

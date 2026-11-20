import test from 'node:test';
import assert from 'node:assert/strict';
import {WatchMotion} from '../web/js/watch-motion.js';
import {inVenue,lineBlocked} from '../web/js/venue.js';
test('walking animates in an untimed tour, then settles after stopping',()=>{const m=new WatchMotion();const poses=[];for(let i=0;i<120;i++)poses.push(m.step(1/60,{moving:true}));assert.ok(Math.max(...poses.map(p=>p.x))-.0>.005);for(let i=0;i<120;i++)m.step(1/60);const p=m.step(1/60);assert.ok(Math.abs(p.x)+Math.abs(p.y)+Math.abs(p.roll)<1e-6);});
test('reduced motion stays still and exposure steadies the held torch',()=>{const a=new WatchMotion(),b=new WatchMotion();let sumA=0,sumB=0;for(let i=0;i<300;i++){const x=a.step(1/60,{moving:true}),y=b.step(1/60,{moving:true,exposing:true});sumA+=x.x*x.x;sumB+=y.x*y.x;}assert.ok(sumB<sumA*.25);assert.deepEqual(a.step(.05,{moving:true,reduced:true,yaw:2}),{x:0,y:0,z:0,pitch:0,roll:0});});
test('furniture blocks movement and lamp rays while gallery entrance remains open',()=>{assert.equal(inVenue(28.7,7.2),false);assert.equal(inVenue(47.5,7.5),false);assert.equal(inVenue(31.5,6),true);assert.equal(lineBlocked({x:46,y:1.5,z:7.5},{x:48,y:1.5,z:7.5}),true);});

import * as T from 'three';
import {box,frame} from './props.js';
const oak=new T.MeshStandardMaterial({color:0x453529,roughness:.72}),edge=new T.MeshStandardMaterial({color:0x715a3b,roughness:.67}),brass=new T.MeshStandardMaterial({color:0xa68b55,metalness:.65,roughness:.42}),paper=new T.MeshStandardMaterial({color:0xbeb19a,roughness:1}),green=new T.MeshStandardMaterial({color:0x30483c,roughness:.94});
export function archiveCabinet(){
 const g=new T.Group();g.name='Oak archive cabinet with labelled drawers';g.add(box(2.4,.12,.72,oak,0,.1));g.add(box(2.5,.12,.76,edge,0,2.45));for(const x of [-1.17,0,1.17])g.add(box(.065,2.3,.68,oak,x,1.27));g.add(box(2.4,2.3,.06,oak,0,1.27,-.31));
 for(const x of [-.585,.585])for(let i=0;i<7;i++){const y=.33+i*.305;g.add(box(1.08,.275,.65,oak,x,y));g.add(box(1.01,.21,.035,edge,x,y,.34));g.add(box(.19,.065,.025,brass,x-.25,y,.365));g.add(box(.15,.041,.027,paper,x-.25,y,.38));g.add(box(.26,.025,.065,brass,x+.17,y,.39));for(const dx of [-.11,.11])g.add(box(.025,.06,.035,brass,x+.17+dx,y,.365));}return g;
}
export function restorationTable(){
 const g=new T.Group();g.name='Conservator worktable with frame, tools and archival papers';g.add(box(2.2,.1,.95,edge,0,.88));g.add(box(2.05,.2,.8,oak,0,.73));for(const x of [-.91,.91])for(const z of [-.34,.34])g.add(box(.095,.7,.095,oak,x,.35,z));g.add(box(1.8,.06,.07,oak,0,.2,.3));g.add(box(1.45,.012,.7,green,-.15,.938));const f=frame(.65,.45);f.rotation.x=-Math.PI/2;f.scale.setScalar(.75);f.position.set(-.35,.98,0);g.add(f);
 for(let i=0;i<4;i++){const sheet=box(.32,.006,.42,paper,.65+i*.012,.943+i*.006,.05);sheet.rotation.y=.06*i;g.add(sheet);}for(let i=0;i<3;i++){const brush=box(.012,.012,.24,edge,.3+i*.07,.96,-.2);brush.rotation.y=-.2;g.add(brush);g.add(box(.018,.016,.045,paper,.28+i*.07,.96,-.32));}return g;
}
export const FURNITURE={archiveCabinet,restorationTable};

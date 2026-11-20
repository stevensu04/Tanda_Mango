// Physical cover bays supplement frames; they never create checkpoints or immunity.
export const COVERS=[2.7,6,9.7,14].map((x,i)=>({id:i,x,wx:x*3.2,z:-.65,w:2,h:2.25,d:.6}));
export const nearbyCover=x=>COVERS.find(c=>Math.abs(c.x-x)<=.28);
export function requestCover(p){if(!p||p.freeze>0||p.escapedAt!==null)return false;if(p.coverId!==undefined){p.coverTarget=p.coverTarget?0:1;p.dir=0;return true;}const c=nearbyCover(p.x);if(!c)return false;p.coverId=c.id;p.coverProgress=0;p.coverTarget=1;p.coverEntryX=p.x*3.2;p.dir=0;return true;}
export function coverPose(p){const c=COVERS[p.coverId];if(!c)return null;const t=p.coverProgress??0,entry=p.coverEntryX??c.wx,side=c.wx-1.3;
 // Walk around the left edge, behind the cabinet, then into its shadow. No teleport through wood.
 if(t<1/3)return {x:entry+(side-entry)*t*3,z:.65};
 if(t<2/3)return {x:side,z:.65+(-1.65-.65)*(t*3-1)};
 return {x:side+(c.wx-side)*(t*3-2),z:-1.65};
}
export function advanceCover(p,dt){if(p.coverId===undefined)return false;p.coverProgress=Math.max(0,Math.min(1,(p.coverProgress??0)+(p.coverTarget?1:-1)*dt/.9));if(!p.coverTarget&&p.coverProgress===0){p.x=(p.coverEntryX??p.x*3.2)/3.2;delete p.coverId;return false;}return true;}
export function clearCover(p){delete p.coverId;p.coverProgress=0;p.coverTarget=0;}

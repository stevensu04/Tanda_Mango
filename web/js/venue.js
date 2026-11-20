// World-space collision and occlusion shared by rendering and local flashlight rules.
export const WALK_AREAS=[{x0:-7.5,x1:51.2,z0:-3.35,z1:4.32},...[14,30,43].flatMap(x=>[{x0:x,x1:x+3,z0:4,z1:5.2},{x0:x-2,x1:x+5,z0:5,z1:11.3}])];
WALK_AREAS.push({x0:18.7,x1:28.3,z0:9.7,z1:11.3},{x0:34.7,x1:41.3,z0:9.7,z1:11.3});
export const SOLIDS=[];
const add=(x,y,z,w,h,d,kind='wall')=>SOLIDS.push({x,y,z,w,h,d,kind});
add(21.8,2.85,-3.5,60,5.7,.24);add(-7.8,2.85,.5,.3,5.7,8);add(51.5,2.85,-2.4,.3,5.7,2.2);add(51.5,2.85,3.4,.3,5.7,2.2);add(51.5,5.35,.5,.3,.7,3.6);add(51.5,2.4,.5,.3,4.8,3.6,'door');
let previous=-8;for(const x of [14,30,43]){add((previous+x)/2,2.85,4.5,x-previous,5.7,.24);previous=x+3;}add((previous+52)/2,2.85,4.5,52-previous,5.7,.24);
for(const x of [14,30,43]){for(const [sx,opening]of [[x-2.15,x!==14],[x+5.15,x!==43]]){if(opening){add(sx,2.5,7.25,.3,5,4.6);add(sx,4.1,10.45,.3,1.8,1.8);}else add(sx,2.5,8.25,.3,5,6.8);}add(x+1.5,2.5,11.5,7.6,5,.3);add(x-1,2.5,5,2,5,.25);add(x+4,2.5,5,2,5,.25);add(x+1.5,.6,9.2,1.4,1.2,1.4,'display');}
for(let x=-6;x<55;x+=6.4)for(const z of [-3.32,4.32]){if(z>0&&[14,30,43].some(a=>x>a-.5&&x<a+3.5))continue;add(x,2.3,z,.45,4.6,.46,'column');}
for(const x of [0,1,4,5,7,8,11,12.5])add(x*3.2,2.5,-2.15,.22,2.6,2,'frame');
for(const x of [8,24,38])add(x,.35,3.7,1.7,.7,.62,'bench');
add(18,.45,3.4,.85,.9,.85,'display');add(-4,.6,-2.4,2,1.2,1,'desk');
for(const [a,b]of [[19,28],[35,41]]){add((a+b)/2,1.6,9.5,b-a,3.2,.2);add((a+b)/2,1.6,11.5,b-a,3.2,.2);}
add(28.7,.48,7.2,.95,.96,2.2,'furniture');add(47.5,1.3,7.5,.76,2.6,2.5,'furniture');
export function inVenue(x,z,r=.25){return [[-r,-r],[-r,r],[r,-r],[r,r]].every(([dx,dz])=>WALK_AREAS.some(a=>x+dx>=a.x0&&x+dx<=a.x1&&z+dz>=a.z0&&z+dz<=a.z1))&&!SOLIDS.some(b=>b.y-b.h/2<1.75&&b.y+b.h/2>.1&&x+r>b.x-b.w/2&&x-r<b.x+b.w/2&&z+r>b.z-b.d/2&&z-r<b.z+b.d/2);}
export function moveGuard(p,dx,dz){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.1));for(let i=0;i<steps;i++){if(inVenue(p.x+dx/steps,p.z))p.x+=dx/steps;if(inVenue(p.x,p.z+dz/steps))p.z+=dz/steps;}return p;}
export function lineBlocked(from,to,solids=SOLIDS){const d={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};return solids.some(b=>{let lo=.001,hi=.999;for(const [axis,size]of [['x','w'],['y','h'],['z','d']]){const min=b[axis]-b[size]/2,max=b[axis]+b[size]/2;if(Math.abs(d[axis])<1e-9){if(from[axis]<min||from[axis]>max)return false;}else{let a=(min-from[axis])/d[axis],c=(max-from[axis])/d[axis];if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)return false;}}return true;});}
export const LIGHT_RULES={range:18,halfAngle:Math.PI/9,warning:1,grace:.15,scan:.35,eyeHeight:1.7,speed:3};
export function insideBeam(origin,direction,point,{range=13,halfAngle=7*Math.PI/180}={}){const dx=point.x-origin.x,dy=point.y-origin.y,dz=point.z-origin.z,d=Math.hypot(dx,dy,dz);return d>.05&&d<=range&&(dx*direction.x+dy*direction.y+dz*direction.z)/d>=Math.cos(halfAngle)&&!lineBlocked(origin,point);}
export function actorZ(index,bot=true){return bot?-1.15+(index%5)*.67:.65;}
export function sightDistance(origin,direction,max=18){let closest=max;for(const b of SOLIDS){let lo=0,hi=max;for(const [axis,size]of [['x','w'],['y','h'],['z','d']]){const mn=b[axis]-b[size]/2,mx=b[axis]+b[size]/2;if(Math.abs(direction[axis])<1e-9){if(origin[axis]<mn||origin[axis]>mx){hi=-1;break;}}else{let a=(mn-origin[axis])/direction[axis],c=(mx-origin[axis])/direction[axis];if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);}}if(hi>=lo&&lo>.05)closest=Math.min(closest,lo);}return closest;}

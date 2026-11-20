import {CONFIG as C} from './config.js';
export const WORLD_SCALE=3.2;
export function sectionBounds(index){const i=Math.max(0,Math.min(7,index));return [C.frames[i]+C.safeRadius,(C.frames[i+1]??C.exit)-(i===7?0:C.safeRadius)];}
export function sectionAtWorldX(x){const unit=x/WORLD_SCALE;if(!Number.isFinite(unit)||unit<0||unit>C.exit)return null;for(let i=0;i<8;i++){const [a,b]=sectionBounds(i);if(unit>a+1e-8&&unit<b-1e-8)return i;}return null;}
export function sweepState(room,loading=false){if(loading)return 'PREPARING';if(room.ended)return 'CLOSED';if(room.light)return room.light.age<C.warning?'WARNING':'SCANNING';return room.charges>0?'READY':'RECHARGING';}

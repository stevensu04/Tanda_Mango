// Browser-only rehearsal. This is NOT the authoritative multiplayer backend.
import {requestCover,advanceCover,coverPose,clearCover} from './cover.js';
import {insideBeam,actorZ,lineBlocked} from './venue.js';
import {CONFIG as C} from './config.js';
export const nearestFrame=x=>C.frames.reduce((a,b)=>Math.abs(b-x)<Math.abs(a-x)?b:a,0);
export const isSafe=x=>Math.abs(nearestFrame(x)-x)<=C.safeRadius+1e-8;
export function inGap(x,gap){const a=C.frames[gap],b=C.frames[gap+1]??C.exit;return x>a+C.safeRadius && x<b-(gap===7?0:C.safeRadius);}
export function rankHumans(players){return players.filter(p=>!p.bot).sort((a,b)=>(a.escapedAt??Infinity)-(b.escapedAt??Infinity)||b.x-a.x);}
export function makeRoom(character='fox',id=0,player=true){return {id,t:0,charges:2,recharge:0,light:null,catches:0,nextLight:3.1,ended:false,events:[],players:Array.from({length:12},(_,i)=>({roomId:id,id:`${id}-${i}`,character:i===0&&player?character:['fox','rabbit','bear'][i%3],bot:!(i===0&&player),x:0,saved:0,dir:0,freeze:0,escapedAt:null,caught:0,hidden:true,delay:.15+(i%5)*.12}))};}
export function setInput(room,dir){const p=room.players.find(p=>!p.bot);if(!p||p.escapedAt!==null||room.ended)return;p.dir=Math.sign(dir);if(dir&&p.coverId!==undefined)p.coverTarget=0;if(!dir&&p.freeze<=0){const f=nearestFrame(p.x);if(Math.abs(f-p.x)<=C.snapRadius){p.x=f;p.saved=f;}}}
export function target(room,gap){if(room.ended||room.light||room.charges<1||!Number.isInteger(gap)||gap<0||gap>7)return false;room.charges--;room.light={gap,age:0,judged:false};room.events.push({type:'yellow',gap});return true;}
export function tick(room,dt,{autoGuard=true,beam=null}={}){if(room.ended)return room;dt=Math.min(.05,Math.max(0,dt));room.events=[];room.t+=dt;if(!beam)room.recharge+=dt;if(room.recharge>=C.recharge){room.charges=Math.min(C.maxCharges,room.charges+1);room.recharge-=C.recharge;}
 for(const [i,p] of room.players.entries()){
  if(p.escapedAt!==null)continue;
  p.freeze=Math.max(0,p.freeze-dt);p.immunity=Math.max(0,(p.immunity??0)-dt);
  if(p.bot&&beam&&p.coverId===undefined&&i%3===1&&!p.usedCover){if(requestCover(p)){p.coverUntil=room.t+1.5;p.usedCover=true;}}if(p.bot&&p.coverId!==undefined&&room.t>p.coverUntil)p.coverTarget=0;
  if(p.bot){p.dir=room.t<(p.spawnAt??(.5+i*.35))?0:1;const light=room.light;if(light&&!light.beam&&light.age>p.delay){const a=C.frames[light.gap],b=C.frames[light.gap+1]??C.exit;if(p.x<a+.18&&p.x>a-.3)p.dir=0;else if(inGap(p.x,light.gap))p.dir=p.x<(a+b)/2?-1:1;}if(room.t%5<.3 && isSafe(p.x))p.dir=0;}
  const old=p.x;const covering=advanceCover(p,dt);if(p.freeze<=0&&!covering)p.x=Math.max(0,Math.min(C.exit,p.x+p.dir*dt*C.speed));
  for(const f of C.frames){if((old<=f+C.safeRadius&&p.x>=f-C.safeRadius&&p.dir>0)||(old>=f-C.safeRadius&&p.x<=f+C.safeRadius&&p.dir<0)){if(p.saved!==f){p.saved=f;room.events.push({type:'saved',playerId:p.id});}}}
  p.hidden=p.coverId===undefined&&!p.dir&&isSafe(p.x);
  if(p.x>=C.exit){p.escapedAt=room.t;p.dir=0;room.events.push({type:'escaped',playerId:p.id});}
 }
 if(beam)updateExposure(room,dt,beam);
 if(room.light&&!room.light.beam){room.light.age+=dt;if(!room.light.judged&&room.light.age>=C.warning+C.grace){room.light.judged=true;for(const p of room.players){if(p.escapedAt===null&&p.freeze<=0&&inGap(p.x,room.light.gap)&&!screenedFromPatrol(p,room.light.gap)){clearCover(p);p.x=p.saved;p.freeze=C.freeze;p.caught++;p.hidden=true;room.catches++;room.events.push({type:'caught',playerId:p.id});}}}if(room.light.age>1.5)room.light=null;}
 if(autoGuard&&room.t>=room.nextLight&&!room.light&&room.charges>=1){let best=0,bestN=-1;for(let g=0;g<8;g++){if(g===room.lastPatrolGap)continue;const n=room.players.filter(p=>p.escapedAt===null&&inGap(p.x+p.dir*.8,g)).length;if(n>bestN){bestN=n;best=g;}}target(room,best);room.lastPatrolGap=best;room.nextLight=room.t+3.4+(room.id*.27);}
 if(room.t>=C.duration){room.t=C.duration;room.ended=true;room.events.push({type:'end'});}return room;
}
export function screenedFromPatrol(p,gap){const pose=coverPose(p);if(!pose)return false;const x=(C.frames[gap]+(C.frames[gap+1]??C.exit))*1.6;return lineBlocked({x,y:5.7,z:3.8},{...pose,y:1.1});}
export function updateExposure(room,dt,beam){
 const active=beam.exposing&&room.charges>0;const activeDt=active?Math.min(dt,room.charges*1.25):0;
 room.charges=Math.min(C.maxCharges,Math.max(0,room.charges+(active?-activeDt/1.25:beam.exposing?0:dt/C.recharge)));
 let peak=0;for(const [i,p]of room.players.entries()){
 const hit=active&&p.escapedAt===null&&p.freeze<=0&&(p.immunity??0)<=0&&!isSafe(p.x)&&insideBeam(beam.origin,beam.direction,{x:coverPose(p)?.x??p.x*3.2,y:p.bot?.85:1.1,z:coverPose(p)?.z??actorZ(i,p.bot)});
 p.exposure=isSafe(p.x)?0:Math.max(0,(p.exposure??0)+(hit?activeDt:-dt*2));if(hit)peak=Math.max(peak,p.exposure);
 if(p.exposure>=C.warning+C.grace){clearCover(p);p.x=p.saved;p.freeze=C.freeze;p.immunity=C.freeze+.5;p.caught++;p.hidden=true;p.exposure=0;room.catches++;room.events.push({type:'caught',playerId:p.id});}
 }
 room.light=active?{beam:true,age:peak,gap:-1,judged:false}:null;
}
export class RehearsalTransport extends EventTarget{
 constructor(character,mode){super();this.mode=mode;this.rooms=Array.from({length:4},(_,i)=>makeRoom(character,i,mode==='player'));if(mode==='guard')for(const r of this.rooms)r.players.forEach((p,i)=>p.spawnAt=.6+i*2.1);this.room=0;this.connected=false;}
 input(dir){setInput(this.rooms[this.room],dir);}
 cover(){const r=this.rooms[this.room];return !r.ended&&requestCover(r.players.find(p=>!p.bot));}
 hold(){} // Production adapter sends a 200 ms keep-alive.
 switchRoom(id){this.input(0);this.room=id;}
 target(gap){return target(this.rooms[this.room],gap);}
 update(dt,beam=null){for(const r of this.rooms)tick(r,dt,{autoGuard:this.mode!=='guard'||r.id!==this.room,beam:this.mode==='guard'&&r.id===this.room?beam:null});return this.rooms[this.room];}
 close(){this.input(0);}
}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class WatchMotion{
 constructor(){this.phase=0;this.weight=0;this.turn=0;this.yaw=null;}
 step(dt,{moving=false,exposing=false,reduced=false,yaw=0}={}){
 dt=clamp(dt,0,.05);const blend=1-Math.exp(-12*dt);this.weight+=((moving?1:0)-this.weight)*blend;
 if(moving)this.phase+=dt*(exposing?6:10);const delta=this.yaw===null?0:Math.atan2(Math.sin(yaw-this.yaw),Math.cos(yaw-this.yaw));this.yaw=yaw;this.turn+=(clamp(-delta*.16,-.025,.025)-this.turn)*blend;
 if(reduced)return {x:0,y:0,z:0,pitch:0,roll:0};
 const w=this.weight*(exposing?.35:1);return {x:Math.sin(this.phase)*.007*w,y:Math.cos(this.phase*2)*.005*w,z:Math.sin(this.phase*2)*.003*w,pitch:Math.sin(this.phase*2)*.008*w,roll:Math.sin(this.phase)*.008*w+this.turn};
 }
}

import {moveGuard,LIGHT_RULES} from './venue.js';
export class GuardController{
 constructor(canvas,{onState}){this.canvas=canvas;this.onState=onState;this.keys=new Set();this.active=false;this.ready=false;this.drag=null;this.exposing=false;this.reset();
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{if(!this.active||!this.ready)return;if(e.pointerType==='touch'||e.button===2){this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}else if(e.button===0){this.exposing=true;if(document.pointerLockElement!==canvas){this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}}});
 canvas.addEventListener('pointermove',e=>{if(!this.active||!this.ready)return;if(document.pointerLockElement===canvas)this.look(e.movementX,e.movementY);else if(this.drag?.id===e.pointerId){this.look(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag.x=e.clientX;this.drag.y=e.clientY;}});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(this.drag?.id===e.pointerId)this.drag=null;if(e.button===0&&e.pointerType!=='touch')this.exposing=false;});
 window.addEventListener('keydown',e=>{if(!this.active||!this.ready||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();this.keys.add(e.code);}if(e.code==='Space'&&!e.repeat){e.preventDefault();this.exposing=true;}if(e.code==='Escape')this.pause();});
 window.addEventListener('keyup',e=>{this.keys.delete(e.code);if(e.code==='Space')this.exposing=false;});window.addEventListener('pointerup',e=>{if(e.button===0&&e.pointerType!=='touch')this.exposing=false;});window.addEventListener('blur',()=>this.pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
 document.addEventListener('pointerlockchange',()=>{if(this.locked&&document.pointerLockElement!==canvas)this.pause();this.locked=document.pointerLockElement===canvas;this.onState();});
 }
 reset(){this.pose={x:-2.8,z:.5,yaw:0,pitch:-.06};this.keys.clear();this.pendingX=0;this.pendingY=0;}
 async engage(capture=true){this.ready=true;this.onState();if(capture&&!matchMedia('(pointer:coarse)').matches&&this.canvas.requestPointerLock)try{await this.canvas.requestPointerLock();}catch{this.onState();}}
 pause(){this.keys.clear();this.exposing=false;this.pendingX=0;this.pendingY=0;this.drag=null;this.ready=false;if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.onState();}
 setActive(value){if(this.active===value)return;this.active=value;if(!value)this.pause();}
 look(dx,dy){this.pendingX+=Math.max(-250,Math.min(250,dx))*.0025;this.pendingY-=Math.max(-250,Math.min(250,dy))*.0025;}

 update(dt){if(!this.active||!this.ready)return false;this.pose.yaw+=(Number(this.keys.has('KeyE'))-Number(this.keys.has('KeyQ')))*(this.exposing?1:1.5)*dt;const cap=(this.exposing?70:720)*Math.PI/180*dt;this.pose.yaw+=Math.max(-cap,Math.min(cap,this.pendingX));this.pose.pitch=Math.max(-1.25,Math.min(1.25,this.pose.pitch+Math.max(-cap,Math.min(cap,this.pendingY))));this.pendingX=0;this.pendingY=0;const k=this.keys;let f=Number(k.has('KeyW')||k.has('ArrowUp'))-Number(k.has('KeyS')||k.has('ArrowDown')),r=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft'));const n=Math.hypot(f,r);if(!n)return false;const speed=(this.exposing?1.2:LIGHT_RULES.speed)*Math.min(dt,.05)/n;moveGuard(this.pose,(Math.cos(this.pose.yaw)*f-Math.sin(this.pose.yaw)*r)*speed,(Math.sin(this.pose.yaw)*f+Math.cos(this.pose.yaw)*r)*speed);return true;}
}

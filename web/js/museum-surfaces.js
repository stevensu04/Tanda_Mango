import * as T from 'three';
// Deterministic, locally generated material maps; no external texture requests.
export function parquet(){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#30271f';ctx.fillRect(0,0,512,512);
 let seed=391;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 for(let by=0;by<2;by++)for(let bx=0;bx<2;bx++){ctx.save();ctx.translate(bx*256+128,by*256+128);if((bx+by)%2)ctx.rotate(Math.PI/2);for(let p=0;p<4;p++){const y=-128+p*64,v=rand()*12;ctx.fillStyle=`rgb(${106+v},${76+v},${48+v})`;ctx.fillRect(-127,y+1,254,62);for(let k=0;k<85;k++){const yy=y+rand()*62;ctx.strokeStyle=`rgba(${rand()>.5?'210,168,108':'35,24,17'},${.05+rand()*.13})`;ctx.lineWidth=.4+rand();ctx.beginPath();ctx.moveTo(-126,yy);ctx.bezierCurveTo(-45,yy+rand()*5,45,yy-rand()*5,126,yy);ctx.stroke();}}ctx.restore();}
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;const bump=map.clone();bump.colorSpace=T.NoColorSpace;return {map,bumpMap:bump,bumpScale:.003,roughness:.68};
}
export function flashlightCookie(){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'#ffffff');g.addColorStop(.25,'#f7f4e9');g.addColorStop(.48,'#b2b4ae');g.addColorStop(.65,'#6b706d');g.addColorStop(.82,'#303631');g.addColorStop(1,'#000000');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);return new T.CanvasTexture(c);
}

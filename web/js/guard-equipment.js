import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export function guardEquipment(){
 const group=new T.Group();group.name='Articulated glove and inspection flashlight';
 const leather=new T.MeshStandardMaterial({color:0x343b3c,roughness:.75}),seam=new T.MeshStandardMaterial({color:0x53544d,roughness:.9}),fabric=new T.MeshStandardMaterial({color:0x263844,roughness:.95}),metal=new T.MeshStandardMaterial({color:0x343d3c,metalness:.8,roughness:.32}),brass=new T.MeshStandardMaterial({color:0x9b8556,metalness:.7,roughness:.35});
 // Fine procedural surface relief keeps close-up leather and cloth from reading as smooth plastic.
 if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);let seed=71;for(let i=0;i<7500;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%128;seed=(seed*1664525+1013904223)>>>0;const y=seed%128;ctx.fillStyle=i%2?'#a0a0a0':'#606060';ctx.fillRect(x,y,1,1);}const pores=new T.CanvasTexture(canvas);pores.wrapS=pores.wrapT=T.RepeatWrapping;pores.repeat.set(3,3);leather.bumpMap=pores;leather.bumpScale=.0008;fabric.bumpMap=pores;fabric.bumpScale=.0012;fabric.roughness=.98;}
 const round=(w,h,d,mat,x,y,z,r=.02)=>{const o=new T.Mesh(new RoundedBoxGeometry(w,h,d,3,r),mat);o.position.set(x,y,z);group.add(o);return o;};
 const tube=(points,r,mat)=>{const o=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),20,r,8,false),mat);group.add(o);return o;};
 const cylinder=(r1,r2,len,mat,z)=>{const o=new T.Mesh(new T.CylinderGeometry(r1,r2,len,32),mat);o.rotation.x=Math.PI/2;o.position.z=z;group.add(o);return o;};
 // Flashlight points down -Z, with a physical recessed lens and knurled grip.
 cylinder(.048,.048,.29,metal,-.36);for(let z=-.23;z>-.48;z-=.025)cylinder(.052,.052,.008,leather,z);
 cylinder(.075,.05,.09,metal,-.54);cylinder(.079,.079,.025,brass,-.595);cylinder(.07,.07,.012,metal,-.615);
 const lens=new T.Mesh(new T.CircleGeometry(.063,32),new T.MeshStandardMaterial({color:0xdceff0,metalness:.35,roughness:.12,emissive:0xaedbd7,emissiveIntensity:.25}));lens.rotation.y=Math.PI;lens.position.z=-.623;group.add(lens);
 round(.026,.014,.045,brass,0,.051,-.34,.004);
 // Four separate curled fingers, a palm, thumb and cuff: no mitten sphere.
 round(.095,.11,.15,leather,.065,-.035,-.34,.025);
 for(let i=0;i<4;i++){const z=-.278-i*.033;tube([[.085,-.055,z],[.025,-.079,z],[-.04,-.051,z],[-.052,.009,z],[-.026,.039,z]],.016,leather);tube([[.065,-.072,z+.013],[.014,-.091,z+.013],[-.045,-.054,z+.013]],.0015,seam);}
 tube([[.106,.008,-.29],[.08,.06,-.34],[.024,.07,-.383],[-.006,.045,-.4]],.022,leather);
 round(.07,.04,.1,seam,.105,-.012,-.34,.012);
 const cuff=round(.125,.11,.1,fabric,.095,-.085,-.19,.015);cuff.rotation.x=.35;
 const arm=round(.13,.16,.48,fabric,.14,-.19,.05,.035);arm.rotation.x=.42;arm.rotation.y=-.12;
 tube([[.075,-.155,-.12],[.09,-.23,.1],[.11,-.29,.25]],.002,seam);
 return group;
}

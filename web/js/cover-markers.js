import * as THREE from 'three';
import { entranceSide, nearbyCover } from './cover.js';

// Inlaid arrows turn the same corner as the character. The tall brass post
// makes the far-side entrance visible over the cabinet on approach.
export function makeCoverMarkers(cabinet) {
  const markers = [];
  const enamel = new THREE.MeshStandardMaterial({color:0xa9e8cd, emissive:0x589b81, emissiveIntensity:.65});
  const brass = new THREE.MeshStandardMaterial({color:0xba9858, metalness:.6, roughness:.38});
  for (const side of [-1,1]) {
    const group = new THREE.Group();
    group.userData.dynamic = true;
    const edge = cabinet.wx + side * 1.32;
    for (const z of [.63,.2,-.23,-.66,-1.09]) {
      for (const sign of [-1,1]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(.07,.018,.26),enamel);
        stripe.position.set(edge+sign*.075,.07,z);
        stripe.rotation.y=sign*.65;
        group.add(stripe);
      }
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.026,.036,2.35,10),brass);
    pole.position.set(cabinet.wx+side*.96,1.19,cabinet.z+.33);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(.12),enamel);
    beacon.position.copy(pole.position);beacon.position.y=2.42;
    group.add(pole,beacon);
    // A projecting bracket stays in front of the player as they cross
    // the usable edge. Its lit arrow points into the sheltered aisle.
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.32,.035,.035),brass);
    bracket.position.set(edge+.50,1.56,cabinet.z+.4);
    const signal = new THREE.Group();
    signal.position.set(edge+1.16,1.56,cabinet.z+.4);
    const face = new THREE.MeshBasicMaterial({color:0x77bcaa,toneMapped:false});
    const fin = new THREE.Shape();
    fin.moveTo(-.24,0);fin.lineTo(-.03,.17);fin.lineTo(-.03,.08);
    fin.lineTo(.2,.08);fin.lineTo(.2,-.08);fin.lineTo(-.03,-.08);
    fin.lineTo(-.03,-.17);fin.closePath();
    const arrow = new THREE.Mesh(new THREE.ExtrudeGeometry(fin,{depth:.035,bevelEnabled:false}),face);
    arrow.rotation.y=-Math.PI/2;
    signal.add(arrow);group.add(bracket,signal);
    markers.push({group, side,signal,face});
  }
  return {markers,highlight(roomId, player){
    const usable = player && player.coverId === undefined && nearbyCover(player.x,roomId)?.id === cabinet.id;
    for(const marker of markers){
      const active=usable && (entranceSide(roomId,cabinet.id)!==0 || marker.side===(player.x>cabinet.x?1:-1));
      marker.face.color.setHex(active?0x2affac:0x77bcaa);
      marker.signal.scale.setScalar(active?.92:.76);
    }
  },show(roomId){
    const side=entranceSide(roomId,cabinet.id);
    for(const marker of markers)marker.group.visible=!side||side===marker.side;
  }};
}

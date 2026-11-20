import * as THREE from 'three';
import { entranceSide } from './cover.js';

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
    markers.push({group, side});
  }
  return {markers,show(roomId){
    const side=entranceSide(roomId,cabinet.id);
    for(const marker of markers)marker.group.visible=!side||side===marker.side;
  }};
}

import * as T from 'three';
// Measurements from the generated v3 mesh, inspected from front, side and above.
export const GRIP_LENS=new T.Vector3(0,0,-.5);
export function detailedGrip(scene){
 const root=new T.Group();root.name='Reference-led glove and flashlight';
 const scale=.4,lens=new T.Vector3(-.88,.33,.21);
 scene.quaternion.setFromUnitVectors(new T.Vector3(-.94,.24,.24).normalize(),new T.Vector3(0,0,-1));
 scene.scale.setScalar(scale);scene.position.copy(lens.applyQuaternion(scene.quaternion).multiplyScalar(-scale)).add(GRIP_LENS);
 scene.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.material.roughness=Math.max(.6,o.material.roughness);o.material.envMapIntensity=.4;}});
 root.add(scene);return root;
}

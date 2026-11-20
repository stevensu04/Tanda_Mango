import * as T from 'three';

// Fit a brooch to the actual coat surface in the bind pose, then let the
// chest joint carry it through the existing idle, run and patrol animations.
export function fitCostumePin(body, character) {
  const chest = body.getObjectByName('Spine02');
  if (!chest) return;
  body.updateMatrixWorld(true);
  body.traverse(node => {
    if (node.isSkinnedMesh) {
      node.computeBoundingBox();
      node.computeBoundingSphere();
    }
  });
  const bounds = new T.Box3().setFromObject(body,true);
  const center = bounds.getCenter(new T.Vector3());
  const suitHeight = bounds.max.y - bounds.min.y;
  const origin = new T.Vector3(center.x-suitHeight*.055, bounds.min.y+suitHeight*.55, bounds.max.z+suitHeight);
  const ray = new T.Raycaster(origin, new T.Vector3(0,0,-1));
  const hit = ray.intersectObject(body,true).find(item=>item.object.isMesh);
  if (!hit) return;
  const pin = new T.Group();
  pin.name = character+' coat pin';
  const brass = new T.MeshStandardMaterial({color:0xc8a55e,metalness:.78,roughness:.33});
  const enamel = new T.MeshStandardMaterial({color:{fox:0x9f492d,rabbit:0x77638f,bear:0x285653,guard:0x202f40}[character],roughness:.37});
  const disk = (radius,depth,mat,sides,z) => {
    const m=new T.Mesh(new T.CylinderGeometry(radius,radius,depth,sides),mat);
    m.rotation.x=Math.PI/2;m.position.z=z;pin.add(m);
  };
  const sides={fox:8,rabbit:24,bear:4,guard:6}[character];
  disk(.025,.005,brass,sides,0);disk(.020,.005,enamel,sides,.003);
  if(character==='bear'||character==='guard'){
    for(const x of [-.008,.008]){
      const page=new T.Mesh(new T.BoxGeometry(.011,character==='bear'?.016:.022,.003),brass);
      page.position.set(x,0,.007);pin.add(page);
    }
  }else{
    const motif=new T.Mesh(new T.TorusGeometry(.009,.0025,6,20,character==='rabbit'?Math.PI*1.55:Math.PI*2),brass);
    motif.position.z=.008;pin.add(motif);
  }
  pin.scale.setScalar(suitHeight);pin.position.copy(hit.point);pin.position.z+=.003*suitHeight;
  pin.updateMatrixWorld(true);chest.attach(pin);
}

import {writeFile,mkdir} from 'node:fs/promises';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {guardEquipment} from '../web/js/guard-equipment.js';
import {FURNITURE} from '../web/js/gallery-furniture.js';
import {PROP_FACTORIES} from '../web/js/props.js';
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{this.result=`data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;this.onloadend?.();});}};
await mkdir('web/assets/models/props',{recursive:true});
for(const [name,create] of Object.entries({...PROP_FACTORIES,...FURNITURE,guardEquipment})){const result=await new GLTFExporter().parseAsync(create(),{binary:true});await writeFile(`web/assets/models/props/${name}.glb`,Buffer.from(result));console.log(`${name}: ${result.byteLength} bytes`);}

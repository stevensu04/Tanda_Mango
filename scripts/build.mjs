import { cp, mkdir, rm } from 'node:fs/promises';
await mkdir('web/vendor/three', {recursive:true});
await cp('node_modules/three/build', 'web/vendor/three/build', {recursive:true});
await cp('node_modules/three/examples/jsm', 'web/vendor/three/addons', {recursive:true});
await cp('node_modules/three/LICENSE', 'web/vendor/three/LICENSE');
await rm('dist', {recursive:true,force:true});
await cp('web', 'dist', {recursive:true});
console.log('Built static frontend in dist/ (credentials and source tooling excluded)');

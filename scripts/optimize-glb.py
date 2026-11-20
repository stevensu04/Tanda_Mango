#!/usr/bin/env python3
"""Preserve mesh, skeleton and animation; fit embedded textures to 1024px.
Remove horizontal root motion from Hips translation for engine-controlled movement.
"""
import json,struct,sys,tempfile,subprocess
from pathlib import Path
src,out=map(Path,sys.argv[1:3]);b=src.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);off=20+n;bl=struct.unpack_from('<I',b,off)[0];binary=bytearray(b[off+8:off+8+bl]);replacements={}
for anim in j.get('animations',[]):
 for c in anim['channels']:
  node=j['nodes'][c['target']['node']]
  if c['target']['path']!='translation' or node.get('name','').lower() not in ['hips','root']:continue
  acc=j['accessors'][anim['samplers'][c['sampler']]['output']];view=j['bufferViews'][acc['bufferView']]
  start=view.get('byteOffset',0)+acc.get('byteOffset',0);stride=view.get('byteStride',12)
  first=struct.unpack_from('<3f',binary,start)
  for i in range(acc['count']):
   value=list(struct.unpack_from('<3f',binary,start+i*stride));value[0]=first[0];value[2]=first[2];struct.pack_into('<3f',binary,start+i*stride,*value)
  acc.pop('min',None);acc.pop('max',None)
with tempfile.TemporaryDirectory() as tmp:
 for i,img in enumerate(j.get('images',[])):
  if 'bufferView' not in img:continue
  v=j['bufferViews'][img['bufferView']];data=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  f=Path(tmp)/f'{i}.png';f.write_bytes(data)
  subprocess.run(['sips','-Z','1024',str(f),'--out',str(f)],check=True,stdout=subprocess.DEVNULL)
  replacements[img['bufferView']]=f.read_bytes()
parts=[];cursor=0
for i,v in enumerate(j['bufferViews']):
 data=replacements.get(i,binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);v['byteOffset']=cursor;v['byteLength']=len(data);pad=bytes((-len(data))%4);parts.extend([data,pad]);cursor+=len(data)+len(pad)
binary=b''.join(parts);j['buffers'][0]['byteLength']=len(binary);raw=json.dumps(j,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
result=struct.pack('<3I',0x46546c67,2,28+len(raw)+len(binary))+struct.pack('<2I',len(raw),0x4e4f534a)+raw+struct.pack('<2I',len(binary),0x004e4942)+binary
out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(result)
print(json.dumps({'asset':out.name,'originalBytes':len(b),'bytes':len(result),'skins':len(j.get('skins',[])),'clips':[a.get('name') for a in j.get('animations',[])],'images':len(j.get('images',[]))}))

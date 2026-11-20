import importlib.util,json,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('client',root/'scripts/meshy-api.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for p in sorted((root/'output/meshy').glob('*-actions-task.json')):
 name=p.name.replace('-actions-task.json','');task=json.loads(p.read_text());r=m.request('/openapi/v1/animations/'+task['result']);(p.parent/f'{name}-actions-status.json').write_text(json.dumps(r,indent=2));print(name,{k:r.get(k) for k in ['status','progress','consumed_credits','task_error']})
 if r.get('status')=='SUCCEEDED':
  output=r.get('result') or r.get('output') or {};print('Output fields:',list(output))
  url=output.get('animation_glb_url')
  if url:
   dest=root/f'output/provider-originals/{name}-actions.glb'
   if not dest.exists():urllib.request.urlretrieve(url,dest)

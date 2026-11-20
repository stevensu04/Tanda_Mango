import importlib.util,json,urllib.request,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('meshy',root/'scripts/meshy-api.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
phase=sys.argv[1] if len(sys.argv)>1 else 'preview'
for name in ['watch-grip-v2','scholar-bust-v2']:
 taskfile=root/f'output/meshy/{name}-{phase}-task.json'
 if not taskfile.exists():continue
 task=json.loads(taskfile.read_text())['result'];result=api.request('/openapi/v2/text-to-3d/'+task)
 (root/f'output/meshy/{name}-{phase}-status.json').write_text(json.dumps(result,indent=2))
 print(name,phase,{k:result.get(k) for k in ['status','progress','consumed_credits','task_error']},flush=True)
 if result.get('status')=='SUCCEEDED':
  folder=root/'output/provider-originals';folder.mkdir(exist_ok=True)
  for field,suffix in [('thumbnail_url','png'),('model_urls','glb')]:
   url=result.get(field);url=url.get('glb') if isinstance(url,dict) else url
   dest=folder/f'{name}-{phase}.{suffix}'
   if url and not dest.exists():urllib.request.urlretrieve(url,dest)

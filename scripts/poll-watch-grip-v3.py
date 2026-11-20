import importlib.util,json,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('meshy',root/'scripts/meshy-api.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
f=root/'output/meshy/watch-grip-v3-task.json'
if not f.exists(): print('Submission pending');raise SystemExit()
task=json.loads(f.read_text())['result'];r=api.request('/openapi/v1/image-to-3d/'+task)
(root/'output/meshy/watch-grip-v3-status.json').write_text(json.dumps(r,indent=2));print({k:r.get(k) for k in ['status','progress','consumed_credits','task_error']},flush=True)
if r.get('status')=='SUCCEEDED':
 for url,suffix in [(r.get('thumbnail_url'),'png'),(r.get('model_urls',{}).get('glb'),'glb')]:
  dest=root/f'output/provider-originals/watch-grip-v3.{suffix}'
  if url and not dest.exists():urllib.request.urlretrieve(url,dest)

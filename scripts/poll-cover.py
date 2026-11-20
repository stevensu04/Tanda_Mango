import importlib.util,json,urllib.request,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('meshy',root/'scripts/meshy-api.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
phase=sys.argv[1] if len(sys.argv)>1 else 'preview';f=root/f'output/meshy/museum-cover-v1-{phase}-task.json'
if not f.exists():print('Pending submission');raise SystemExit()
r=api.request('/openapi/v2/text-to-3d/'+json.loads(f.read_text())['result']);(root/f'output/meshy/museum-cover-v1-{phase}-status.json').write_text(json.dumps(r,indent=2));print({k:r.get(k) for k in ['status','progress','consumed_credits','task_error']},flush=True)
if r.get('status')=='SUCCEEDED':
 for url,suffix in [(r.get('thumbnail_url'),'png'),(r.get('model_urls',{}).get('glb'),'glb')]:
  dest=root/f'output/provider-originals/museum-cover-v1-{phase}.{suffix}'
  if url and not dest.exists():urllib.request.urlretrieve(url,dest)

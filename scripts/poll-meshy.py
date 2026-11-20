import importlib.util,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('client',root/'scripts/meshy-api.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for p in sorted((root/'output/meshy').glob('*-rig-task.json')):
 name=p.name.replace('-rig-task.json','');task=json.loads(p.read_text());r=m.request('/openapi/v1/rigging/'+task['result']);(p.parent/f'{name}-rig-status.json').write_text(json.dumps(r,indent=2));print(name,{k:r.get(k) for k in ['status','progress','consumed_credits','task_error']})

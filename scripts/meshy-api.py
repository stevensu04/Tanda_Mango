#!/usr/bin/env python3
"""Direct Meshy client. Secrets stay in the repository's ignored .env.
GET requests are read-only; submit requires an explicit request JSON and never retries.
"""
import os,re,shlex,json,sys,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def key():
    value=os.environ.get('MESHY_API_KEY','')
    if not value:
        for line in (ROOT/'.env').read_text().splitlines():
            match=re.match(r'^\s*(?:export\s+)?meshy_api_key\s*=\s*(.*)',line,re.I)
            if match:
                tokens=shlex.split(match[1],comments=True)
                if len(tokens)==1:value=tokens[0]
    if not value:raise RuntimeError('No Meshy key configured in .env')
    return value
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise RuntimeError('Credential redirect refused')
def request(endpoint,payload=None):
    if not re.fullmatch(r'/openapi/v[12]/[a-zA-Z0-9_/?=&.\-]+',endpoint):raise ValueError('Invalid endpoint')
    req=urllib.request.Request('https://api.meshy.ai'+endpoint,data=json.dumps(payload).encode() if payload is not None else None,headers={'Authorization':'Bearer '+key(),'Content-Type':'application/json'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(req,timeout=90) as r:return json.load(r)
    except urllib.error.HTTPError as e:raise RuntimeError(f'Meshy HTTP {e.code}; no automatic retry') from None
if __name__=='__main__':
    command,endpoint=sys.argv[1:3]
    if command=='get':print(json.dumps(request(endpoint)))
    elif command=='submit':
        spec,record=map(Path,sys.argv[3:5]);record.parent.mkdir(parents=True,exist_ok=True)
        attempt=record.with_suffix('.attempt')
        if record.exists():print(record.read_text());sys.exit(0)
        if attempt.exists():raise RuntimeError('Previous submission outcome unknown; inspect before retrying')
        attempt.write_text('Submission attempted; do not automatically retry.\n')
        result=request(endpoint,json.loads(spec.read_text()));record.write_text(json.dumps(result,indent=2));print(json.dumps(result))
    else:raise ValueError('Use get or submit')

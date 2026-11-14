"""Local, standard-library checks. No network or legal conclusions."""
import sys
from types import SimpleNamespace
COMMANDS=['package','locators','diff','checkpoint']
def loads(s):
    # shortcut: the C scanner in _json (private) skips `import json` (~6 ms incl. re); any failure or doubt retries through json.loads, so error text is identical. Upgrade if _json changes shape (the fallback keeps it correct).
    try:
        from _json import make_scanner
        c=SimpleNamespace(strict=True,object_hook=None,object_pairs_hook=None,parse_float=float,parse_int=int,parse_constant={'-Infinity':float('-inf'),'Infinity':float('inf'),'NaN':float('nan')}.__getitem__)
        t=s.strip(' \t\n\r');obj,end=make_scanner(c)(t,0)
        if end==len(t):return obj
    except Exception:pass
    import json;return json.loads(s)
def dumps(o):
    # shortcut: same C encoder json.dumps(ensure_ascii=False) uses, minus the json import; any failure retries through json.dumps
    try:
        from _json import make_encoder,encode_basestring
        def no(x):raise TypeError
        return ''.join(make_encoder({},no,encode_basestring,None,': ',', ',False,False,True)(o,0))
    except Exception:pass
    import json;return json.dumps(o,ensure_ascii=False)

def need(ok,msg):
    if not ok: raise ValueError(msg)
def nonempty(x): return isinstance(x,str) and bool(x.strip())
def unique(values,label): need(len(values)==len(set(values)),f'{label}: duplicado')
def package(data):
    docs=data.get('documents');parts=data.get('parts');n=data.get('total_parts')
    need(isinstance(docs,list) and bool(docs),'documents vazio/inválido')
    need(type(n) is int and n>0,'total_parts inválido')
    need(isinstance(parts,list) and bool(parts),'parts vazio/inválido')
    ids=[d.get('id') for d in docs];need(all(nonempty(x) for x in ids),'id inválido');unique(ids,'documents')
    nums=[p.get('number') for p in parts];need(all(type(x) is int for x in nums),'parte inválida')
    need(sorted(nums)==list(range(1,n+1)),'partes ausentes/duplicadas')
    seen=[]
    for p in parts:
        need(isinstance(p.get('ids'),list),'ids inválidos');seen+=p['ids']
    need(all(nonempty(x) for x in seen),'id de parte inválido');unique(seen,'parts')
    need(set(seen)==set(ids),'cobertura de IDs divergente')
    for d in docs:
        need(d.get('status') in ['lido','parcial','ilegível','ausente','falhou','restrito'],'status inválido')
        gaps=d.get('gaps',[]);need(isinstance(gaps,list),'gaps inválido')
        need((d['status']=='lido')==not_gaps(gaps),'status/lacuna incompatível')
    return {'checked':'estrutura e cobertura declarada; não prova leitura'}
def not_gaps(gaps): return not bool(gaps)
def locators(data):
    docs=data.get('documents');refs=data.get('references')
    need(isinstance(docs,list) and bool(docs),'documents vazio/inválido')
    ids=[d.get('id') for d in docs];need(all(nonempty(x) for x in ids),'id inválido');unique(ids,'documents')
    need(isinstance(refs,list) and bool(refs),'references vazio/inválido')
    index={d['id']:d for d in docs}
    for r in refs:
        need(isinstance(r,dict) and r.get('id') in index,'ID inexistente');d=index[r['id']]
        pages=d.get('pages',[]);need(isinstance(pages,list),'pages inválido')
        for key in ['pdf_page','document_page']:
            if key in r: need(type(r[key]) is int and r[key]>0,'página inválida')
        selected=[p for p in pages if all(p.get(k)==r[k] for k in ['pdf_page','document_page'] if k in r)]
        need(bool(selected),'página/mapeamento não disponível')
        if 'quote' in r:
            need(nonempty(r['quote']),'quote vazia')
            need(any(r['quote'] in p.get('text','') for p in selected),'citação não encontrada literalmente')
    return {'checked':'ID/página e citação literal no texto fornecido; não autenticidade'}
def blocks(text):
    import re
    need(nonempty(text),'minuta vazia')
    matches=list(re.finditer(r'^\*\*(\d+)\.\*\*\s*',text,re.M));need(bool(matches),'numeração ausente')
    nums=[int(m[1]) for m in matches];need(nums==list(range(1,len(nums)+1)),'numeração não sequencial')
    return text[:matches[0].start()].strip(),{int(m[1]):text[m.end():matches[i+1].start() if i+1<len(matches) else len(text)].strip() for i,m in enumerate(matches)}
def diff(data):
    a,b=blocks(data.get('base')),blocks(data.get('candidate'));edit=data.get('editable_items',[])
    need(isinstance(edit,list) and all(type(x) is int for x in edit),'editable_items inválido')
    unique(edit,'editable_items');need(set(edit)<=set(a[1]),'item editável inexistente')
    need(set(a[1])==set(b[1]),'mudança estrutural: requer revisão própria')
    need(data.get('edit_ementa',False) is True or a[0]==b[0],'ementa alterada fora do alvo')
    for n,t in a[1].items(): need(n in edit or t==b[1][n],f'item {n} alterado fora do alvo')
    for key in ['protected','removed']:
        seq=data.get(key,[]);need(isinstance(seq,list) and all(nonempty(x) for x in seq),f'{key} inválido')
        for t in seq: need((t in data['candidate'])==(key=='protected'),f'{key}: requisito literal violado')
    return {'checked':'preservação literal; não equivalência semântica'}
def state(data):
    need(data.get('schema')=='lume-checkpoint/1','schema inválido')
    need(nonempty(data.get('case_id')),'case_id ausente')
    need(type(data.get('version')) is int and data['version']>=1,'version inválida')
    need(isinstance(data.get('source_revisions'),dict) and bool(data['source_revisions']),'fontes ausentes')
    need(all(nonempty(k) and nonempty(v) for k,v in data['source_revisions'].items()),'fontes inválidas')
    need(nonempty(data.get('stage')),'stage ausente')
    for k in ['pending','completed']:need(isinstance(data.get(k),list),'listas de estado ausentes')
    return data

def checkpoint(data,path,expected):
    import json,os
    from pathlib import Path
    state(data);target=Path(path);target.parent.mkdir(parents=True,exist_ok=True)
    lock=target.with_name(target.name+'.lock');fd=None;tmp=None
    try:
        fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        old=json.loads(target.read_text()) if target.exists() else None
        if old:state(old);need(old['case_id']==data['case_id'],'case_id diferente')
        need((old['version'] if old else 0)==expected,'versão concorrente')
        need(data['version']==expected+1,'incremento de versão inválido')
        import tempfile;handle,tmp=tempfile.mkstemp(dir=target.parent,prefix='.lume-')
        with os.fdopen(handle,'w') as f:json.dump(data,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
        os.replace(tmp,target);tmp=None
    finally:
        if tmp:os.unlink(tmp)
        if fd is not None:os.close(fd);lock.unlink()
    return {'checked':'checkpoint local salvo','version':data['version']}
def read(p):
    # shortcut: plain open() skips the pathlib import (~2 ms); any failure retries through Path so error text and path normalization stay identical
    try:
        with open(p) as f:return f.read()
    except (OSError,ValueError):
        from pathlib import Path;return Path(p).read_text()
def main():
    v=sys.argv[1:]
    # shortcut: argparse costs ~16 ms of imports and setup; the plain `<command> <file>` shape skips it, any other argv goes through argparse unchanged
    if len(v)==2 and v[0] in COMMANDS and v[1][:1]!='-':a=SimpleNamespace(command=v[0],input=v[1],output=None,expected_version=None)
    else:
        import argparse
        parser=argparse.ArgumentParser();parser.add_argument('command',choices=COMMANDS);parser.add_argument('input');parser.add_argument('--output');parser.add_argument('--expected-version',type=int)
        a=parser.parse_args()
    try:
        data=loads(read(a.input));need(isinstance(data,dict),'objeto JSON obrigatório')
        if a.command=='checkpoint':
            need(a.output is not None and a.expected_version is not None,'output e expected-version obrigatórios')
            from pathlib import Path
            need(Path(a.input).resolve()!=Path(a.output).resolve(),'entrada e saída devem diferir')
            result=checkpoint(data,a.output,a.expected_version)
        else:result={'package':package,'locators':locators,'diff':diff}[a.command](data)
        print(dumps({'status':'PASS',**result}))
    except (ValueError,TypeError,KeyError,AttributeError,OSError) as e:
        print(dumps({'status':'FAIL','error':str(e)}));return 1
    return 0
if __name__=='__main__':raise SystemExit(main())

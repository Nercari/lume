"""PDF extraction, per-page provenance and explicit OCR failures. No network."""
import argparse, hashlib, json, shutil, subprocess, tempfile
from pathlib import Path

def run(args):return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180).stdout.decode('utf-8')
def extract(path,language='por',force=()):
    try:from pypdf import PdfReader
    except ImportError:raise ValueError('pypdf indisponível: use leitor suportado do ambiente')
    path=Path(path);raw=path.read_bytes();reader=PdfReader(path)
    if reader.is_encrypted and not reader.decrypt(''):raise ValueError('PDF protegido: não foi possível ler')
    if not reader.pages:raise ValueError('PDF sem páginas')
    if any(i<1 or i>len(reader.pages) for i in force):raise ValueError('página OCR fora do arquivo')
    result={'schema':'lume-extraction/1','source_name':path.name,'sha256':hashlib.sha256(raw).hexdigest(),'pages':[]}
    for n,page in enumerate(reader.pages,1):
        row={'pdf_page':n,'method':'native','status':'extracted','review_required':True};native_error=None
        try:text=page.extract_text() or ''
        except Exception as e:text='';native_error=type(e).__name__
        row['text']=text
        if n in force or len(''.join(text.split()))<20 or '\ufffd' in text:
            row['method']='ocr';row['language']=language
            try:
                if not shutil.which('pdftoppm') or not shutil.which('tesseract'):raise ValueError('OCR indisponível: pdftoppm ou tesseract ausente')
                langs=set(run(['tesseract','--list-langs']).splitlines()[1:])
                if not set(language.split('+'))<=langs:raise ValueError('Idioma OCR não instalado: '+language)
                with tempfile.TemporaryDirectory() as d:
                    prefix=str(Path(d)/'page')
                    run(['pdftoppm','-f',str(n),'-l',str(n),'-singlefile','-r','200','-png',str(path),prefix])
                    row['text']=run(['tesseract',prefix+'.png','stdout','-l',language])
                if not row['text'].strip():raise ValueError('OCR não recuperou texto')
            except (ValueError,subprocess.SubprocessError,OSError) as e:
                row['status']='gap';row['error']=str(e);row['text']=text
        if native_error:row['native_error']=native_error
        result['pages'].append(row)
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('--output',required=True);p.add_argument('--language',default='por');p.add_argument('--ocr-pages',default='');a=p.parse_args()
    try:
        dest=Path(a.output)
        if dest.exists():raise ValueError('Saída já existe: use caminho novo')
        if dest.resolve()==Path(a.input).resolve():raise ValueError('Não sobrescrever original')
        force=tuple(int(x) for x in a.ocr_pages.split(',') if x)
        result=extract(a.input,a.language,force)
        with dest.open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2)
        gaps=sum(r['status']=='gap' for r in result['pages']);print(json.dumps({'status':'PARTIAL' if gaps else 'EXTRACTED','pages':len(result['pages']),'gaps':gaps,'review_required':True}));return 2 if gaps else 0
    except Exception as e:print(json.dumps({'status':'FAIL','error':str(e)}));return 1
if __name__=='__main__':raise SystemExit(main())

const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const path=require('path');
const fs=require('fs');

let win;
const printPreviewWindows=new Set();
const NORMAL_SIZE={width:420,height:650};
const QUOTE_SIZE={width:1480,height:860};

function create(){
  win=new BrowserWindow({
    ...NORMAL_SIZE,
    minWidth:340,
    minHeight:480,
    alwaysOnTop:true,
    autoHideMenuBar:true,
    backgroundColor:'#f7f4eb',
    webPreferences:{preload:path.join(__dirname,'preload.js')}
  });
  win.loadFile('index.html');
}
app.whenReady().then(create);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

ipcMain.handle('top',(_,v)=>{win.setAlwaysOnTop(v);return win.isAlwaysOnTop()});
ipcMain.handle('quote-window',(_,open)=>{
  if(!win||win.isDestroyed())return false;

  if(open){
    // 견적관리에서는 가로 스크롤 없이 최대한 많은 칸을 보기 위해
    // 프로그램 창을 사용 가능한 모니터 영역까지 자동 최대화합니다.
    if(!win.isMaximized())win.maximize();
    win.focus();
    return true;
  }

  // 견적관리 닫기 → 일반 업무메모 크기로 복귀
  if(win.isMaximized())win.unmaximize();
  setTimeout(()=>{
    if(!win||win.isDestroyed())return;
    win.setSize(NORMAL_SIZE.width,NORMAL_SIZE.height,true);
    win.center();
  },120);
  return true;
});

function quoteAttachmentDir(){
  const dir=path.join(app.getPath('userData'),'quote-attachments');
  fs.mkdirSync(dir,{recursive:true});
  return dir;
}
function safeQuoteId(value=''){
  return String(value||'quote').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)||'quote';
}
function safeAttachmentFileName(name=''){
  const original=path.basename(String(name||'견적서.xlsx'));
  const ext=path.extname(original);
  const base=path.basename(original,ext)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g,'_')
    .replace(/[. ]+$/g,'')
    .trim()||'견적서';
  const safeExt=['.xlsx','.xls','.xlsm'].includes(ext.toLowerCase())?ext:'.xlsx';
  return (base+safeExt).slice(0,180);
}
function quoteAttachmentPath(storedName=''){
  const raw=String(storedName||'').replaceAll('\\','/');
  if(!raw)return '';
  const root=path.resolve(quoteAttachmentDir());
  const target=path.resolve(root,raw);
  if(target!==root&&!target.startsWith(root+path.sep))return '';
  return target;
}
function quoteAttachmentRecordPath(quoteId,originalName){
  const folder=path.join(quoteAttachmentDir(),safeQuoteId(quoteId));
  fs.mkdirSync(folder,{recursive:true});
  return path.join(folder,safeAttachmentFileName(originalName));
}
function relativeQuoteAttachmentPath(filePath){
  return path.relative(quoteAttachmentDir(),filePath).replaceAll('\\','/');
}
function quoteAttachmentExtOk(filePath=''){
  return ['.xlsx','.xls','.xlsm','.jpg','.jpeg','.pdf'].includes(path.extname(filePath).toLowerCase());
}

// ----- 최소 XLSX 작성기: 추가 npm 패키지 없이 Excel(.xlsx) 파일 생성 -----
const CRC_TABLE=(()=>{
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    table[n]=c>>>0;
  }
  return table;
})();
function crc32(buffer){
  let c=0xFFFFFFFF;
  for(const b of buffer)c=CRC_TABLE[(c^b)&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
function dosDateTime(date=new Date()){
  const year=Math.max(1980,date.getFullYear());
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2);
  const day=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  return {time,date:day};
}
function createZip(entries){
  const locals=[],centrals=[];
  let offset=0;
  const dt=dosDateTime();
  for(const entry of entries){
    const name=Buffer.from(entry.name,'utf8');
    const data=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(entry.data,'utf8');
    const crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);
    local.writeUInt16LE(0,8);local.writeUInt16LE(dt.time,10);local.writeUInt16LE(dt.date,12);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);
    locals.push(local,name,data);

    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8);central.writeUInt16LE(0,10);central.writeUInt16LE(dt.time,12);central.writeUInt16LE(dt.date,14);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);
    central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);
    centrals.push(central,name);
    offset+=local.length+name.length+data.length;
  }
  const centralSize=centrals.reduce((n,b)=>n+b.length,0);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);
  end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([...locals,...centrals,end]);
}
function xmlEscape(value=''){
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
}
function excelColumnName(index){
  let n=index+1,out='';
  while(n){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26)}
  return out;
}
function quoteExcelBuffer(rows=[]){
  const columns=[
    ['NO','no',6,'number'],['견적제목','title',38,'text'],['단위','unit',9,'text'],['수량','qty',9,'number'],
    ['견적단가','quoteUnit',15,'money'],['견적금액','quoteAmount',16,'money'],['입찰단가','bidUnit',15,'money'],['입찰금액','bidAmount',16,'money'],
    ['요청회사','company',18,'text'],['부서','dept',14,'text'],['담당자','person',17,'text'],['제출일자','submitDate',13,'text'],
    ['입찰일자','bidDate',13,'text'],['입찰유무','bidStatus',10,'text'],['비고','note',26,'text'],['첨부견적서','attachment',38,'text']
  ];
  const cell=(r,c,value,type,header=false)=>{
    const ref=excelColumnName(c)+(r+1);
    const style=header?1:(type==='money'?2:(type==='number'?3:4));
    if(type==='money'||type==='number'){
      const n=Number(value)||0;
      return `<c r="${ref}" s="${style}"><v>${n}</v></c>`;
    }
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value??'')}</t></is></c>`;
  };
  const header='<row r="1" ht="24" customHeight="1">'+columns.map((col,c)=>cell(0,c,col[0],'text',true)).join('')+'</row>';
  const dataRows=rows.map((row,i)=>{
    const rn=i+2;
    return `<row r="${rn}" ht="21" customHeight="1">`+columns.map((col,c)=>cell(i+1,c,row[col[1]],col[3],false)).join('')+'</row>';
  }).join('');
  const cols=columns.map((col,i)=>`<col min="${i+1}" max="${i+1}" width="${col[2]}" customWidth="1"/>`).join('');
  const lastRow=Math.max(1,rows.length+1);
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${header}${dataRows}</sheetData><autoFilter ref="A1:P${lastRow}"/>
<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Malgun Gothic"/></font><font><b/><sz val="11"/><name val="Malgun Gothic"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const entries=[
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="견적관리" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml',data:styles},{name:'xl/worksheets/sheet1.xml',data:sheet}
  ];
  return createZip(entries);
}

function logoDataUrl(){
  const logoPath=path.join(__dirname,'assets','wontech-logo.jpg');
  return fs.existsSync(logoPath)
    ?'data:image/jpeg;base64,'+fs.readFileSync(logoPath).toString('base64')
    :'';
}
function escapeHtml(value=''){
  return String(value)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}
function printableDocument(content,{preview=false,title='WONTECH 출력 미리보기',landscape=false,kind='memo'}={}){
  const safeContent=content.replace(/src="[^"]*wontech-logo\.jpg"/gi,`src="${logoDataUrl()}"`);
  const pageRule=landscape?'A4 landscape':'A4 portrait';
  const previewBar=preview?`
    <div class="preview-toolbar">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <small>내용을 확인한 후 인쇄 설정을 열어 프린터·용지·매수를 선택하세요.</small>
      </div>
      <div class="preview-actions">
        <button type="button" onclick="window.print()">인쇄 설정 열기</button>
        <button type="button" class="secondary" onclick="window.close()">닫기</button>
      </div>
    </div>`:'';

  return `<!doctype html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>
      @page{size:${pageRule};margin:${landscape?'8mm':'10mm'}}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff;font-family:"Malgun Gothic",sans-serif;color:#222}
      body{width:100%;${preview?'padding-top:70px;background:#d9dde1;':''}}
      .preview-toolbar{position:fixed;left:0;right:0;top:0;z-index:1000;height:62px;padding:9px 14px;background:#253746;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:15px;box-shadow:0 2px 8px #0005}
      .preview-toolbar strong{display:block;font-size:15px}.preview-toolbar small{display:block;margin-top:3px;opacity:.8}
      .preview-actions{display:flex;gap:6px;flex-shrink:0}.preview-actions button{border:0;border-radius:5px;padding:8px 12px;background:#fff;color:#18364d;font-weight:800;cursor:pointer}.preview-actions button.secondary{background:#dce4e9}

      .sheet,.print-checklist{width:190mm;min-height:277mm;margin:${preview?'8mm auto':'0'};background:#fff;padding:3mm;${preview?'box-shadow:0 2px 12px #0004;':''}}
      .brand{display:flex;align-items:flex-end;border-bottom:2px solid #222;padding-bottom:2mm;gap:3mm}
      .brand-logo{width:48mm;height:auto;max-height:16mm;object-fit:contain;object-position:left bottom;display:block}
      .date{margin-left:auto;font-size:9pt;font-weight:700;white-space:nowrap}
      .head,.task{display:grid;grid-template-columns:12mm 1fr 25mm;align-items:center;min-height:8mm;border-bottom:.25mm solid #bbb;font-size:9pt}
      .head{font-weight:800;background:#f3f3f3;border-bottom:.5mm solid #222;text-align:center}
      .head>*{height:100%;display:flex;align-items:center;justify-content:center;text-align:center}
      .head>*:not(:last-child),.task>*:not(:last-child){border-right:.25mm solid #bbb}
      .task>*:not(:last-child){height:100%;display:flex;align-items:center}
      .num{justify-content:center}.text{padding:1.8mm;border:0;width:100%;font:inherit;white-space:pre-wrap;word-break:break-word}
      .status{padding:1.8mm;text-align:center}
      .task.done{background:#e4f3e8;color:#53705b}.task.pending{background:#fff3dc}
      .task.check{background:#e7f1ff;border-left:1.2mm solid #307bc4}
      .remove,.footer-actions,.empty{display:none}

      .print-check-head,.print-check-row{display:grid;grid-template-columns:12mm 28mm 1fr 25mm;align-items:stretch}
      .print-check-head{margin-top:3mm;background:#f3f3f3;border-bottom:.5mm solid #222;font-size:9pt;font-weight:800;text-align:center}
      .print-check-row{min-height:9mm;border-bottom:.25mm solid #bbb;font-size:9pt}
      .print-check-head>div,.print-check-row>div{padding:1.8mm;display:flex;align-items:center}
      .print-check-head>div{justify-content:center;text-align:center}
      .print-check-head>div:not(:last-child),.print-check-row>div:not(:last-child){border-right:.25mm solid #bbb}
      .print-check-row>div:first-child,.print-check-row>div:nth-child(2),.print-check-row>div:last-child{justify-content:center;text-align:center}
      .print-check-row.check-pending{background:#fff8e8}.print-check-row.check-done{background:#e8f4eb;color:#597061}
      .check-empty{padding:20mm;text-align:center;color:#777}

      .quote-print{
        width:281mm;min-height:194mm;margin:${preview?'7mm auto':'0'};background:#fff;padding:3mm;
        ${preview?'box-shadow:0 2px 12px #0004;':''}
      }
      .quote-print-brand{display:flex;align-items:flex-end;border-bottom:2px solid #222;padding-bottom:2mm;margin-bottom:2mm;gap:3mm}
      .quote-print-brand .brand-logo{width:42mm}
      .quote-print-brand>div{margin-left:auto;text-align:right}
      .quote-print-brand strong{display:block;font-size:15pt}.quote-print-brand small{display:block;margin-top:1mm;font-size:7pt;color:#666}
      .quote-print-table{max-width:281mm;border:.25mm solid #444;font-size:6.6pt}
      .quote-print-row{
        display:grid;
        grid-template-columns:var(--quote-grid,7mm 48mm 10mm 10mm 18mm 20mm 18mm 20mm 21mm 15mm 15mm 19mm 19mm 13mm 28mm);
        border-bottom:.2mm solid #999
      }
      .quote-print-row:last-child{border-bottom:0}
      .quote-print-row>div{
        min-height:8mm;padding:1mm .8mm;border-right:.2mm solid #999;
        display:flex;align-items:center;justify-content:center;text-align:center;
        overflow:hidden;word-break:break-word
      }
      .quote-print-row>div:last-child{border-right:0}
      .quote-print-head{font-weight:800;background:#f2f2f2}
      .quote-print-row .quote-print-title{justify-content:flex-start;text-align:left}
      .quote-print-row .money{justify-content:flex-end;text-align:right;font-variant-numeric:tabular-nums}
      .quote-print-yes{background:#edf8f0}.quote-print-cxl{background:#f1f1f1;color:#666}
      .quote-print-empty{padding:15mm;text-align:center;color:#777}
      .quote-print-footer{margin-top:2mm;font-size:7pt;color:#555}

      @media print{
        body{padding:0;background:#fff}
        .preview-toolbar{display:none!important}
        .sheet,.print-checklist,.quote-print{margin:0;box-shadow:none}
      }
    </style>
  </head>
  <body>${previewBar}${safeContent}</body>
  </html>`;
}

async function makeRenderWindow(html,options={}){
  const landscape=!!options.landscape;
  const child=new BrowserWindow({
    show:false,
    width:landscape?1600:900,
    height:landscape?1000:1200,
    autoHideMenuBar:true,
    webPreferences:{sandbox:true,contextIsolation:true}
  });
  await child.loadURL('data:text/html;charset=UTF-8,'+encodeURIComponent(printableDocument(html,options)));
  await new Promise(resolve=>setTimeout(resolve,350));
  return child;
}

async function openPrintPreview(name,html,options={}){
  const landscape=!!options.landscape;
  const preview=new BrowserWindow({
    show:false,
    width:landscape?1500:980,
    height:landscape?900:860,
    minWidth:720,
    minHeight:600,
    autoHideMenuBar:true,
    title:name+' - 인쇄 미리보기',
    backgroundColor:'#d9dde1',
    webPreferences:{sandbox:true,contextIsolation:true}
  });
  printPreviewWindows.add(preview);
  preview.on('closed',()=>printPreviewWindows.delete(preview));
  await preview.loadURL(
    'data:text/html;charset=UTF-8,'+
    encodeURIComponent(printableDocument(html,{...options,preview:true,title:name+' 인쇄 미리보기'}))
  );
  preview.once('ready-to-show',()=>{preview.center();preview.show();preview.focus()});
  if(!preview.isVisible()){preview.center();preview.show()}
  return {success:true,preview:true};
}

function storeQuoteAttachmentFromPath(source,quoteId,oldStoredName=''){
  try{
    if(!source||!path.isAbsolute(source)||!fs.existsSync(source)){
      return {success:false,reason:'선택한 파일을 찾을 수 없습니다.'};
    }
    const stat=fs.statSync(source);
    if(!stat.isFile())return {success:false,reason:'파일만 첨부할 수 있습니다.'};
    if(!quoteAttachmentExtOk(source)){
      return {success:false,reason:'Excel(.xlsx/.xls/.xlsm), JPG(.jpg/.jpeg), PDF(.pdf) 파일만 첨부할 수 있습니다.'};
    }
    if(stat.size>100*1024*1024){
      return {success:false,reason:'첨부파일은 100MB 이하만 사용할 수 있습니다.'};
    }

    const originalName=path.basename(source);
    // 견적별 폴더 안에 "원래 파일명 그대로" 보관합니다.
    const dest=quoteAttachmentRecordPath(quoteId,originalName);
    const sourceResolved=path.resolve(source);
    const destResolved=path.resolve(dest);

    if(sourceResolved!==destResolved){
      fs.copyFileSync(source,dest);
    }

    if(oldStoredName){
      const oldPath=quoteAttachmentPath(oldStoredName);
      try{
        if(oldPath&&path.resolve(oldPath)!==destResolved&&fs.existsSync(oldPath)){
          fs.unlinkSync(oldPath);
          // 이전 랜덤파일이 있던 빈 하위폴더가 있다면 정리
          const parent=path.dirname(oldPath);
          if(parent!==quoteAttachmentDir()){
            try{if(fs.existsSync(parent)&&fs.readdirSync(parent).length===0)fs.rmdirSync(parent)}catch{}
          }
        }
      }catch{}
    }

    return {
      success:true,
      originalName,
      storedName:relativeQuoteAttachmentPath(dest),
      size:stat.size
    };
  }catch(error){
    return {success:false,reason:error.message};
  }
}

ipcMain.handle('quote-attach-file',async(_,quoteId,oldStoredName='')=>{
  const r=await dialog.showOpenDialog(win,{
    title:'견적 첨부파일 선택',properties:['openFile'],
    filters:[
      {name:'견적 첨부파일',extensions:['xlsx','xls','xlsm','jpg','jpeg','pdf']},
      {name:'Excel 파일',extensions:['xlsx','xls','xlsm']},
      {name:'JPG 이미지',extensions:['jpg','jpeg']},
      {name:'PDF 문서',extensions:['pdf']}
    ]
  });
  if(r.canceled||!r.filePaths?.[0])return {canceled:true};
  return storeQuoteAttachmentFromPath(r.filePaths[0],quoteId,oldStoredName);
});

ipcMain.handle('quote-attach-dropped-file',async(_,quoteId,oldStoredName='',source='')=>{
  return storeQuoteAttachmentFromPath(source,quoteId,oldStoredName);
});

ipcMain.handle('quote-open-file',async(_,quoteId,attachment={})=>{
  try{
    const storedName=attachment?.storedName||'';
    const originalName=attachment?.originalName||'';
    let filePath=quoteAttachmentPath(storedName);

    if(!filePath||!fs.existsSync(filePath)){
      return {success:false,reason:'첨부파일을 찾을 수 없습니다.'};
    }

    let migrated=false;
    let migratedStoredName=storedName;

    // 예전 버전에서 랜덤 내부명으로 저장된 기존 파일은 처음 열 때
    // 견적별 폴더 + 원래 파일명으로 자동 이전합니다.
    const desiredPath=quoteAttachmentRecordPath(
      quoteId,
      originalName||path.basename(filePath)
    );

    if(path.resolve(filePath)!==path.resolve(desiredPath)){
      fs.copyFileSync(filePath,desiredPath);
      try{fs.unlinkSync(filePath)}catch{}
      const oldParent=path.dirname(filePath);
      if(oldParent!==quoteAttachmentDir()){
        try{
          if(fs.existsSync(oldParent)&&fs.readdirSync(oldParent).length===0)fs.rmdirSync(oldParent);
        }catch{}
      }
      filePath=desiredPath;
      migrated=true;
      migratedStoredName=relativeQuoteAttachmentPath(desiredPath);
    }

    // Windows에 등록된 기본 프로그램으로 파일을 엽니다.
    // .xlsx/.xls/.xlsm -> Excel(또는 기본 스프레드시트 앱)
    // .pdf            -> 기본 PDF 뷰어
    // .jpg/.jpeg      -> 기본 사진 앱
    const openError=await shell.openPath(filePath);
    if(openError){
      return {success:false,reason:`파일을 열지 못했습니다. ${openError}`};
    }

    return {
      success:true,
      migrated,
      storedName:migratedStoredName,
      originalName:originalName||path.basename(filePath)
    };
  }catch(error){
    return {success:false,reason:error.message};
  }
});

ipcMain.handle('quote-remove-file',async(_,storedName)=>{
  const filePath=quoteAttachmentPath(storedName);
  try{
    if(filePath&&fs.existsSync(filePath))fs.unlinkSync(filePath);
    if(filePath){
      const parent=path.dirname(filePath);
      if(parent!==quoteAttachmentDir()){
        try{if(fs.existsSync(parent)&&fs.readdirSync(parent).length===0)fs.rmdirSync(parent)}catch{}
      }
    }
    return {success:true};
  }catch(error){return {success:false,reason:error.message}}
});

ipcMain.handle('quote-export-excel',async(_,name,rows=[])=>{
  const r=await dialog.showSaveDialog(win,{
    defaultPath:name+'.xlsx',filters:[{name:'Excel 통합문서',extensions:['xlsx']}]
  });
  if(r.canceled)return {canceled:true};
  try{
    fs.writeFileSync(r.filePath,quoteExcelBuffer(Array.isArray(rows)?rows:[]));
    return {success:true,filePath:r.filePath};
  }catch(error){return {success:false,reason:error.message}}
});

ipcMain.handle('jpg',async(_,name,html,options={})=>{
  const r=await dialog.showSaveDialog(win,{defaultPath:name+'.jpg',filters:[{name:'JPG 이미지',extensions:['jpg']}]});
  if(r.canceled)return false;
  let child;
  try{
    child=await makeRenderWindow(html,options);
    const size=await child.webContents.executeJavaScript(`({
      width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),
      height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)
    })`);
    const width=Math.max(800,Math.min(6000,Math.ceil(size.width)));
    const height=Math.max(600,Math.min(12000,Math.ceil(size.height)));
    child.setContentSize(width,height,false);
    await new Promise(resolve=>setTimeout(resolve,150));
    const img=await child.webContents.capturePage({x:0,y:0,width,height});
    fs.writeFileSync(r.filePath,img.toJPEG(95));
    return true;
  }finally{
    if(child&&!child.isDestroyed())child.destroy();
  }
});

ipcMain.handle('pdf',async(_,name,html,options={})=>{
  const r=await dialog.showSaveDialog(win,{defaultPath:name+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]});
  if(r.canceled)return false;
  let child;
  try{
    child=await makeRenderWindow(html,options);
    const b=await child.webContents.printToPDF({
      printBackground:true,
      pageSize:'A4',
      landscape:!!options.landscape,
      margins:{top:0.3,bottom:0.3,left:0.3,right:0.3}
    });
    fs.writeFileSync(r.filePath,b);
    return true;
  }finally{
    if(child&&!child.isDestroyed())child.destroy();
  }
});

ipcMain.handle('print',async(_,name,html,options={})=>{
  try{return await openPrintPreview(name,html,options)}
  catch(error){return {success:false,reason:error.message}}
});

const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('path');
const fs=require('fs');

let win;
const printPreviewWindows=new Set();

function create(){
  win=new BrowserWindow({
    width:420,
    height:650,
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

function logoDataUrl(){
  const logoPath=path.join(__dirname,'assets','wontech-logo.jpg');
  return fs.existsSync(logoPath)
    ?'data:image/jpeg;base64,'+fs.readFileSync(logoPath).toString('base64')
    :'';
}

function printableDocument(content,{preview=false,title='WONTECH 출력 미리보기'}={}){
  const safeContent=content.replace(
    /src="[^"]*wontech-logo\.jpg"/gi,
    `src="${logoDataUrl()}"`
  );

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
      @page{size:A4 portrait;margin:10mm}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff;font-family:"Malgun Gothic",sans-serif;color:#222}
      body{width:100%;${preview?'padding-top:70px;background:#d9dde1;':''}}
      .preview-toolbar{position:fixed;left:0;right:0;top:0;z-index:1000;height:62px;padding:9px 14px;background:#253746;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:15px;box-shadow:0 2px 8px #0005}
      .preview-toolbar strong{display:block;font-size:15px}.preview-toolbar small{display:block;margin-top:3px;opacity:.8}
      .preview-actions{display:flex;gap:6px;flex-shrink:0}.preview-actions button{border:0;border-radius:5px;padding:8px 12px;background:#fff;color:#18364d;font-weight:800;cursor:pointer}.preview-actions button.secondary{background:#dce4e9}
      .sheet,.print-checklist{width:190mm;min-height:277mm;margin:${preview?'8mm auto':'0'};background:#fff;padding:3mm;${preview?'box-shadow:0 2px 12px #0004;':''}}
      .brand{display:flex;align-items:flex-end;border-bottom:2px solid #222;padding-bottom:2mm;gap:3mm}
      .brand-logo{width:48mm;height:auto;display:block}
      .date{margin-left:auto;font-size:9pt;font-weight:700;white-space:nowrap}
      .head,.task{display:grid;grid-template-columns:12mm 1fr 25mm;align-items:center;min-height:8mm;border-bottom:.25mm solid #bbb;font-size:9pt}
      .head{font-weight:800;background:#f3f3f3;border-bottom:.5mm solid #222;text-align:center}
      .head>*{height:100%;display:flex;align-items:center;justify-content:center;text-align:center}
      .head>*:not(:last-child),.task>*:not(:last-child){border-right:.25mm solid #bbb}
      .task>*:not(:last-child){height:100%;display:flex;align-items:center}
      .num{justify-content:center}.text{padding:1.8mm;border:0;width:100%;font:inherit;white-space:pre-wrap;word-break:break-word}
      .status{padding:1.8mm;text-align:center}
      .task.done{background:#e4f3e8;color:#53705b}
      .task.pending{background:#fff3dc}
      .task.check{background:#e7f1ff;border-left:1.2mm solid #307bc4}
      .remove,.footer-actions,.empty{display:none}

      .print-check-head,.print-check-row{display:grid;grid-template-columns:12mm 28mm 1fr 25mm;align-items:stretch}
      .print-check-head{margin-top:3mm;background:#f3f3f3;border-bottom:.5mm solid #222;font-size:9pt;font-weight:800;text-align:center}
      .print-check-row{min-height:9mm;border-bottom:.25mm solid #bbb;font-size:9pt}
      .print-check-head>div,.print-check-row>div{padding:1.8mm;display:flex;align-items:center}
      .print-check-head>div{justify-content:center;text-align:center}
      .print-check-head>div:not(:last-child),.print-check-row>div:not(:last-child){border-right:.25mm solid #bbb}
      .print-check-row>div:first-child,.print-check-row>div:nth-child(2),.print-check-row>div:last-child{justify-content:center;text-align:center}
      .print-check-row.check-pending{background:#fff8e8}
      .print-check-row.check-done{background:#e8f4eb;color:#597061}
      .check-empty{padding:20mm;text-align:center;color:#777}

      @media print{
        body{padding:0;background:#fff}
        .preview-toolbar{display:none!important}
        .sheet,.print-checklist{margin:0;box-shadow:none}
      }
    </style>
  </head>
  <body>${previewBar}${safeContent}</body>
  </html>`;
}

function escapeHtml(value=''){
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

async function makeRenderWindow(html){
  const child=new BrowserWindow({
    show:false,
    width:900,
    height:1200,
    autoHideMenuBar:true,
    webPreferences:{sandbox:true,contextIsolation:true}
  });
  await child.loadURL('data:text/html;charset=UTF-8,'+encodeURIComponent(printableDocument(html)));
  await new Promise(resolve=>setTimeout(resolve,400));
  return child;
}

async function openPrintPreview(name,html){
  const preview=new BrowserWindow({
    show:false,
    width:980,
    height:860,
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
    encodeURIComponent(printableDocument(html,{preview:true,title:name+' 인쇄 미리보기'}))
  );
  preview.once('ready-to-show',()=>{
    preview.center();
    preview.show();
    preview.focus();
  });
  if(!preview.isVisible()){
    preview.center();
    preview.show();
  }
  return {success:true,preview:true};
}

ipcMain.handle('jpg',async(_,name,html)=>{
  const r=await dialog.showSaveDialog(win,{
    defaultPath:name+'.jpg',
    filters:[{name:'JPG 이미지',extensions:['jpg']}]
  });
  if(r.canceled)return false;

  let child;
  try{
    child=await makeRenderWindow(html);
    const img=await child.webContents.capturePage();
    fs.writeFileSync(r.filePath,img.toJPEG(95));
    return true;
  }finally{
    if(child&&!child.isDestroyed())child.destroy();
  }
});

ipcMain.handle('pdf',async(_,name,html)=>{
  const r=await dialog.showSaveDialog(win,{
    defaultPath:name+'.pdf',
    filters:[{name:'PDF',extensions:['pdf']}]
  });
  if(r.canceled)return false;

  let child;
  try{
    child=await makeRenderWindow(html);
    const b=await child.webContents.printToPDF({
      printBackground:true,
      pageSize:'A4',
      landscape:false,
      margins:{top:0.4,bottom:0.4,left:0.4,right:0.4}
    });
    fs.writeFileSync(r.filePath,b);
    return true;
  }finally{
    if(child&&!child.isDestroyed())child.destroy();
  }
});

ipcMain.handle('print',async(_,name,html)=>{
  try{
    return await openPrintPreview(name,html);
  }catch(error){
    return {success:false,reason:error.message};
  }
});

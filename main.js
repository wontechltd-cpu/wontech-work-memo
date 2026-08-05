
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('path');
const fs=require('fs');

let win;

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

function printableDocument(content){
  const logoPath=path.join(__dirname,'assets','wontech-logo.jpg');
  const logoData=fs.existsSync(logoPath)
    ?'data:image/jpeg;base64,'+fs.readFileSync(logoPath).toString('base64')
    :'';
  const safeContent=content.replace(/src="[^"]*wontech-logo\.jpg"/gi,`src="${logoData}"`);

  return `<!doctype html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8">
    <style>
      @page{size:A4 portrait;margin:10mm}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff;font-family:"Malgun Gothic",sans-serif;color:#222}
      body{width:190mm}
      .sheet,.print-checklist{width:190mm;min-height:277mm;background:#fff;padding:3mm}
      .brand{display:flex;align-items:flex-end;border-bottom:2px solid #222;padding-bottom:2mm;gap:3mm}
      .brand-logo{width:48mm;height:auto;display:block}
      .date{margin-left:auto;font-size:9pt;font-weight:700;white-space:nowrap}
      .head,.task{display:grid;grid-template-columns:12mm 1fr 25mm;align-items:center;min-height:8mm;border-bottom:.25mm solid #bbb;font-size:9pt}
      .head{font-weight:800;background:#f3f3f3;border-bottom:.5mm solid #222;text-align:center}
      .head>*:not(:last-child),.task>*:not(:last-child){border-right:.25mm solid #bbb;height:100%;display:flex;align-items:center}
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
      .print-check-head>div:not(:last-child),.print-check-row>div:not(:last-child){border-right:.25mm solid #bbb}
      .print-check-head>div:first-child,.print-check-head>div:nth-child(2),.print-check-head>div:last-child,
      .print-check-row>div:first-child,.print-check-row>div:nth-child(2),.print-check-row>div:last-child{justify-content:center}
      .print-check-row.check-pending{background:#fff8e8}
      .print-check-row.check-done{background:#e8f4eb;color:#597061}
      .check-empty{padding:20mm;text-align:center;color:#777}
    </style>
  </head>
  <body>${safeContent}</body>
  </html>`;
}

async function makePrintWindow(html,{show=false}={}){
  const child=new BrowserWindow({
    show,
    width:900,
    height:1200,
    autoHideMenuBar:true,
    webPreferences:{sandbox:true}
  });

  await child.loadURL('data:text/html;charset=UTF-8,'+encodeURIComponent(printableDocument(html)));
  await new Promise(resolve=>setTimeout(resolve,400));
  return child;
}

ipcMain.handle('jpg',async(_,name,html)=>{
  const r=await dialog.showSaveDialog(win,{
    defaultPath:name+'.jpg',
    filters:[{name:'JPG 이미지',extensions:['jpg']}]
  });
  if(r.canceled)return false;

  let child;
  try{
    child=await makePrintWindow(html);
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
    child=await makePrintWindow(html);
    const b=await child.webContents.printToPDF({
      printBackground:true,
      pageSize:'A4',
      margins:{top:0.4,bottom:0.4,left:0.4,right:0.4}
    });
    fs.writeFileSync(r.filePath,b);
    return true;
  }finally{
    if(child&&!child.isDestroyed())child.destroy();
  }
});

ipcMain.handle('print',async(_,name,html)=>{
  let child;
  try{
    child=await makePrintWindow(html,{show:true});
    child.center();
    child.focus();

    return await new Promise(resolve=>{
      child.webContents.print(
        {
          silent:false,
          printBackground:true,
          margins:{marginType:'default'},
          pageSize:'A4',
          landscape:false
        },
        (success,reason)=>resolve({success,reason})
      );
    });
  }catch(error){
    return {success:false,reason:error.message};
  }finally{
    if(child&&!child.isDestroyed())child.destroy();
  }
});

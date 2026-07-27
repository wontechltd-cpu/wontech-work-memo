const {app,BrowserWindow,ipcMain,dialog} = require('electron');
const path=require('path'); const fs=require('fs');
let win;
function create(){win=new BrowserWindow({width:330,height:500,minWidth:300,minHeight:420,alwaysOnTop:true,autoHideMenuBar:true,backgroundColor:'#f7f4eb',webPreferences:{preload:path.join(__dirname,'preload.js')}});win.loadFile('index.html');}
app.whenReady().then(create); app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
ipcMain.handle('top',(_,v)=>{win.setAlwaysOnTop(v);return win.isAlwaysOnTop()});

function printableDocument(content){
  const logoData='data:image/jpeg;base64,'+fs.readFileSync(path.join(__dirname,'assets','wontech-logo.jpg')).toString('base64');
  const safeContent=content.replace(/src="[^"]*wontech-logo\.jpg"/i,`src="${logoData}"`);
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><style>
  @page{size:80mm 120mm;margin:0}
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:"Malgun Gothic",sans-serif;color:#222}
  .sheet{width:80mm;min-height:120mm;padding:7mm 4mm 5mm;background:#fff}
  .brand{display:flex;align-items:flex-end;border-bottom:2px solid #222;padding-bottom:2mm}
  .brand-logo{width:39mm;height:auto;display:block}.date{margin-left:auto;font-size:7pt;font-weight:700;white-space:nowrap}
  .head,.task{display:grid;grid-template-columns:9mm 1fr 20mm;align-items:center;min-height:7mm;border-bottom:.25mm solid #bbb;font-size:8pt}
  .head{font-weight:800;background:#f3f3f3;border-bottom:.5mm solid #222;text-align:center}
  .head>*:not(:last-child),.task>*:not(:last-child){border-right:.25mm solid #bbb;height:100%;display:flex;align-items:center}
  .num{justify-content:center}.text{padding:1.5mm;border:0;width:100%;font:inherit}.status{padding:1.5mm;text-align:center}
  .task.done{background:#e4f3e8;color:#53705b}.task.pending{background:#fff3dc}
  .remove,.footer-actions,.empty{display:none}
  </style></head><body>${safeContent}</body></html>`;
}

async function makePrintWindow(html){
  const child=new BrowserWindow({show:false,width:800,height:1200,webPreferences:{sandbox:true}});
  await child.loadURL('data:text/html;charset=UTF-8,'+encodeURIComponent(printableDocument(html)));
  await new Promise(resolve=>setTimeout(resolve,250));
  return child;
}

ipcMain.handle('jpg',async(_,name,html)=>{
  const r=await dialog.showSaveDialog(win,{defaultPath:name+'.jpg',filters:[{name:'JPG 이미지',extensions:['jpg']}]});
  if(r.canceled)return false;
  const child=await makePrintWindow(html);
  const img=await child.webContents.capturePage();
  fs.writeFileSync(r.filePath,img.toJPEG(95));
  child.destroy();
  return true;
});
ipcMain.handle('pdf',async(_,name,html)=>{
  const r=await dialog.showSaveDialog(win,{defaultPath:name+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]});
  if(r.canceled)return false;
  const child=await makePrintWindow(html);
  const b=await child.webContents.printToPDF({printBackground:true,pageSize:{width:80000,height:120000},margins:{marginType:'none'}});
  fs.writeFileSync(r.filePath,b);
  child.destroy();
  return true;
});
ipcMain.handle('print',async(_,name,html)=>{
  const child=await makePrintWindow(html);
  const result=await new Promise(resolve=>{
    child.webContents.print({silent:false,printBackground:true},(success,reason)=>resolve({success,reason}));
  });
  child.destroy();
  return result;
});

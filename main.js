const {app,BrowserWindow,ipcMain,dialog} = require('electron');
const path=require('path'); const fs=require('fs');
let win;
function create(){win=new BrowserWindow({width:330,height:500,minWidth:300,minHeight:420,alwaysOnTop:true,autoHideMenuBar:true,backgroundColor:'#f7f4eb',webPreferences:{preload:path.join(__dirname,'preload.js')}});win.loadFile('index.html');}
app.whenReady().then(create); app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
ipcMain.handle('top',(_,v)=>{win.setAlwaysOnTop(v);return win.isAlwaysOnTop()});
ipcMain.handle('jpg',async(_,name)=>{const r=await dialog.showSaveDialog(win,{defaultPath:name+'.jpg',filters:[{name:'JPG 이미지',extensions:['jpg']}]});if(r.canceled)return false;await new Promise(x=>setTimeout(x,150));const img=await win.webContents.capturePage();fs.writeFileSync(r.filePath,img.toJPEG(95));return true});
ipcMain.handle('pdf',async(_,name)=>{const r=await dialog.showSaveDialog(win,{defaultPath:name+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]});if(r.canceled)return false;const b=await win.webContents.printToPDF({printBackground:true,pageSize:{width:80000,height:120000},margins:{marginType:'none'}});fs.writeFileSync(r.filePath,b);return true});
ipcMain.handle('print',()=>win.webContents.print({silent:false,printBackground:true}));

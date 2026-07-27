const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desk',{
  top:v=>ipcRenderer.invoke('top',v),
  jpg:(name,html)=>ipcRenderer.invoke('jpg',name,html),
  pdf:(name,html)=>ipcRenderer.invoke('pdf',name,html),
  print:(name,html)=>ipcRenderer.invoke('print',name,html)
});

const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desk',{
  top:v=>ipcRenderer.invoke('top',v),
  quoteWindow:open=>ipcRenderer.invoke('quote-window',open),
  jpg:(name,html,options)=>ipcRenderer.invoke('jpg',name,html,options),
  pdf:(name,html,options)=>ipcRenderer.invoke('pdf',name,html,options),
  print:(name,html,options)=>ipcRenderer.invoke('print',name,html,options)
});

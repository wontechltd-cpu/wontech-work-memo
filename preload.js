const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('desk',{
  top:v=>ipcRenderer.invoke('top',v),
  quoteWindow:open=>ipcRenderer.invoke('quote-window',open),
  attachQuoteFile:(quoteId,oldStoredName)=>ipcRenderer.invoke('quote-attach-file',quoteId,oldStoredName),
  attachDroppedQuoteFile:(file,quoteId,oldStoredName)=>{
    const filePath=webUtils.getPathForFile(file);
    return ipcRenderer.invoke('quote-attach-dropped-file',quoteId,oldStoredName,filePath);
  },
  openQuoteFile:(quoteId,attachment)=>ipcRenderer.invoke('quote-open-file',quoteId,attachment),
  removeQuoteFile:storedName=>ipcRenderer.invoke('quote-remove-file',storedName),
  exportQuotesExcel:(name,rows)=>ipcRenderer.invoke('quote-export-excel',name,rows),
  jpg:(name,html,options)=>ipcRenderer.invoke('jpg',name,html,options),
  pdf:(name,html,options)=>ipcRenderer.invoke('pdf',name,html,options),
  print:(name,html,options)=>ipcRenderer.invoke('print',name,html,options)
});

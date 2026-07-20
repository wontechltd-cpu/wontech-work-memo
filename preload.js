const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desk',{top:v=>ipcRenderer.invoke('top',v),jpg:n=>ipcRenderer.invoke('jpg',n),pdf:n=>ipcRenderer.invoke('pdf',n),print:()=>ipcRenderer.invoke('print')});

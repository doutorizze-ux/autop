const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openWhatsappWindow: (channelKey, label) => ipcRenderer.invoke('open-whatsapp-window', { channelKey, label }),
    isElectron: true,
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openWhatsappWindow: (channelKey, label, signatureOptions) =>
        ipcRenderer.invoke('open-whatsapp-window', { channelKey, label, ...(signatureOptions || {}) }),
    updateWhatsappSignature: (channelKey, signatureOptions) =>
        ipcRenderer.invoke('update-whatsapp-signature', { channelKey, ...(signatureOptions || {}) }),
    isElectron: true,
});


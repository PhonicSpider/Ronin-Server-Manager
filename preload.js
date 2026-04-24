const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // For sending data TO main (One-way)
    send: (channel, data) => {
        let validChannels = ['save-servers', 'log-to-system', 'start-server', 'stop-server', 'save-servers', 'open-folder'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    // For receiving data FROM main (Listening)
    receive: (channel, func) => {
        let validChannels = ['console-out', 'server-status-updated', 'load-servers'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    // For asking main for data and getting a result (Two-way)
    invoke: (channel, data) => {
        let validChannels = ['get-servers', 'get-settings', 'check-admin']; // Add your invoke channels here
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    }
});

// Expose logToSystem directly
contextBridge.exposeInMainWorld('logToSystem', (msg) => {
    ipcRenderer.send('log-to-system', msg);
});
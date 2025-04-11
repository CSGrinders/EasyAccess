import { app, BrowserWindow } from 'electron';
const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: { nodeIntegration: true }
    });
    win.loadURL('http://localhost:3000').then(r => console.log("loaded"));
};
app.whenReady().then(() => {
    createWindow();
});

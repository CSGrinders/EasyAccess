import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { saveAuthTokens, getAuthTokens, clearAuthTokens } from './token_storage';
import dotenv from 'dotenv';
import ElectronGoogleOAuth2 from '@getstation/electron-google-oauth2';


dotenv.config();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: true
        }

    });
    console.log('window created');

    win.loadURL('http://localhost:3000').then(r => console.log("loaded"));
    win.once('ready-to-show', () => {
        win.show()
        win.webContents.openDevTools({ mode: 'right' })
    })
};

app.whenReady().then(() => {
    createWindow();
});

ipcMain.handle('google-auth', async (event) => {
    if (!clientId || !clientSecret) {
        throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables");
    }
    const myApiOauth = new ElectronGoogleOAuth2(
        clientId,
        clientSecret,
        ['https://www.googleapis.com/auth/drive.metadata.readonly'],
        { successRedirectURL: 'https://www.alesgsanudoo.com/en' }, // TODO: redirect uri...
    );
    const token = await myApiOauth.openAuthWindowAndGetTokens();
    console.log("Access Token: ", token.access_token);
    return token;
});

ipcMain.handle('save-auth-tokens', async (event, tokens) => {
    saveAuthTokens(tokens);
});

ipcMain.handle('get-auth-tokens', async (event) => {
    return getAuthTokens();
});

ipcMain.handle('clear-auth-tokens', async (event) => {
    clearAuthTokens();
});

ipcMain.handle('read-directory', async (_e, dirPath: string) => {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true })
    return Promise.all(items.map(async item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        path: path.join(dirPath, item.name),
        size: (await fs.promises.stat(path.join(dirPath, item.name))).size,
        modifiedTime: (await fs.promises.stat(path.join(dirPath, item.name))).mtimeMs
    })))
})

ipcMain.handle('read-file', async (_e, filePath: string) => {
    return fs.promises.readFile(filePath, 'utf8')
})
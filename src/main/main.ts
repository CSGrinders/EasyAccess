import { app, BrowserWindow, ipcMain } from 'electron';
import dotenv from 'dotenv';


dotenv.config();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

import ElectronGoogleOAuth2 from '@getstation/electron-google-oauth2';

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: __dirname + '/preload.js'
        }
    });
    console.log('window created');

    win.loadURL('http://localhost:3000').then(r => console.log("loaded"));
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

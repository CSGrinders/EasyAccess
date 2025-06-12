import { Dropbox } from 'dropbox';

import dotenv from 'dotenv';
dotenv.config();

export const authenticateDropbox = async (authorizationCode: string) => {
    try {
        if (!process.env.DROPBOX_KEY || !process.env.DROPBOX_SECRET || !process.env.DROPBOX_REDIRECT_URI) {
            throw new Error('Missing required Dropbox environment variables');
        }
        const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: authorizationCode,
                grant_type: 'authorization_code',
                client_id: process.env.DROPBOX_KEY || '',
                client_secret: process.env.DROPBOX_SECRET || '',
                redirect_uri: process.env.DROPBOX_REDIRECT_URI || ''
            })
        });

        const tokenData = await tokenResponse.json();

        const client = new Dropbox({ accessToken: tokenData.access_token, fetch });
        console.log('Token data:', tokenData);
        const accountInfo = await client.usersGetCurrentAccount();
        const accountId = accountInfo.result.email;
        console.log(accountInfo.result.email); 

        return {
            accountId: accountId,
            refreshToken: tokenData.refresh_token || null,
            accessToken: tokenData.access_token || null
        };
    } catch (error) {
        console.error('Error during Google authentication:', error);
        throw new Error('Failed to authenticate with Google');
    }   
};

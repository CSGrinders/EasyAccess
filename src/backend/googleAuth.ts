import { google } from 'googleapis';

import dotenv from 'dotenv';
dotenv.config();

export const authenticateWithGoogle = async (authorizationCode: string) => {
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:5173/callback'
        );
        const { tokens } = await oauth2Client.getToken(authorizationCode);
        console.log('Tokens received:', tokens);
        oauth2Client.setCredentials(tokens);
        oauth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token) {
                // store the refresh_token in my database!
                console.log(tokens.refresh_token);
            }
            console.log(tokens.access_token);
        });

        let email = null;

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();
        if (data.email) email = data.email;

        return {
            accountId: email,
            refreshToken: tokens.refresh_token || null,
            accessToken: tokens.access_token || null
        };
    } catch (error) {
            console.error('Error during Google authentication:', error);
            throw new Error('Failed to authenticate with Google');
        }   
    return {
        accountId: null,
        refreshToken: null,
        accessToken: null
    };
};

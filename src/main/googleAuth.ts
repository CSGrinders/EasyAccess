import ElectronGoogleOAuth2 from '@getstation/electron-google-oauth2';
import { AuthTokens, isValidToken } from './token_storage'; 

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_SCOPE = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive'
]
const SUCCESS_REDIRECT_URL = 'https://www.alesgsanudoo.com/en'; // TODO: redirect uri...

const GOOGLE_STORE = 'gauthTokens';

export async function authenticateGoogle(): Promise<AuthTokens | null> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables");
    }
    const myApiOauth = new ElectronGoogleOAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_SCOPE,
        { successRedirectURL: SUCCESS_REDIRECT_URL }, // TODO: redirect uri...
    );
    const authToken = await myApiOauth.openAuthWindowAndGetTokens();
    const validatedTokens: AuthTokens = {
        access_token: authToken.access_token || '',
        refresh_token: authToken.refresh_token || '',
        expiry_date: authToken.expiry_date || 0,
    };

    // Check if the token is valid
    if (!isValidToken(validatedTokens)) {
        console.error('Invalid token received from Google OAuth');
        return null;
    }

    return validatedTokens;
}

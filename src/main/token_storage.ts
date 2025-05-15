import Store from 'electron-store';
import { CloudType } from "../types/cloudType";
import dotenv from 'dotenv';
import { authenticateGoogle } from './googleAuth';

dotenv.config();

const GOOGLE_STORE = 'gauthTokens';
const DROPBOX_STORE = 'dropAuthTokens';
const ONEDRIVE_STORE = 'oneAuthTokens';

let googleToken: AuthTokens | null = null;
let dropToken: AuthTokens | null = null;
let oneToken: AuthTokens | null = null;

function setGoogleToken(token: AuthTokens | null) {
  googleToken = token;
}

function getGoogleToken(): AuthTokens | null {
  return googleToken;
}

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
};


const store = new Store<{ authTokens: AuthTokens }>();

// Load the token from the store or from the cloud and set it in the variable
// call this function when cloud token is needed
export async function loadAuthTokens(cloudType: CloudType): Promise<void> {
  if (cloudType == CloudType.GoogleDrive) {
    console.log('Cloud type is GoogleDrive');
    // check if already loaded
    if (googleToken) {
      console.log('Google token already loaded');
      return;
    }
    console.log('Loading Google token');

    // Check if tokens exist in store
    var tokens = store.get(GOOGLE_STORE) as AuthTokens | null;
    if (tokens) {
      console.log('Tokens loaded from store');
    } else {
      console.log('No tokens found in store, pull from cloud');
      
      // Authenticate with Google
      const validatedTokens = await authenticateGoogle();

      // save tokens to store
      store.set(GOOGLE_STORE, validatedTokens);
      tokens = validatedTokens;
    }

    setGoogleToken(tokens);
  } else if (cloudType == CloudType.Dropbox) {
    console.log('Cloud type is Dropbox');
    const tokens = store.get(DROPBOX_STORE) as AuthTokens | undefined;
    if (tokens) {
      console.log('Tokens loaded from store');
    } else {
      console.log('No tokens found in store, pull from cloud');
      // TODO: implement dropbox auth
    }
  } else if (cloudType == CloudType.OneDrive) {
    console.log('Cloud type is OneDrive');
    const tokens = store.get(ONEDRIVE_STORE) as AuthTokens | undefined;
    if (tokens) {
      console.log('Tokens loaded from store');
    } else {
      console.log('No tokens found in store, pull from cloud');
      // TODO: implement onedrive auth
    }
  }
}

/**
 * Validates the given auth tokens.
 */
export function isValidToken(tokens: AuthTokens): boolean {
  if (!tokens.access_token || tokens.access_token.trim() === '') {
    return false; // Missing or empty access token
  }

  if (!tokens.expiry_date || tokens.expiry_date < Date.now()) {
    return false; // Token is expired
  }

  return true; // Token is valid
}
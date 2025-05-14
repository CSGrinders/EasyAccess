import Store from 'electron-store';

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
};


const store = new Store<{ authTokens: AuthTokens }>();

// Save tokens
export function saveAuthTokens(tokens: AuthTokens): void {
    // Validate tokens
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
        throw new Error('Invalid tokens');
    }
    
    store.set('authTokens', tokens);
    console.log('Tokens saved to store');
}

// Get tokens
export function getAuthTokens(): AuthTokens | null {
  const tokens = store.get('authTokens') as AuthTokens | undefined;
  return tokens ?? null;
}

// Clear tokens 
export function clearAuthTokens(): void {
  store.delete('authTokens');
  console.log('Tokens cleared from store');
}

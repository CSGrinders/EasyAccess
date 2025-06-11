import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { a } from 'framer-motion/dist/types.d-CtuPurYT';
import { authenticateWithGoogle } from './googleAuth';

export enum CloudType {
    GoogleDrive = 'GoogleDrive',
    Dropbox = 'Dropbox',
    OneDrive = 'OneDrive',
}

const app = express();
const port = 3001;

// Your Supabase project URL and anon/public key
const SUPABASE_URL = 'https://lliuckljienxmohsoitv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaXVja2xqaWVueG1vaHNvaXR2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTg1OTY2OCwiZXhwIjoyMDYxNDM1NjY4fQ.IkKI14345sALCvapqhxWHFZ2ortcbdoD3uArwOMudW4'
// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Middleware to parse JSON request body
app.use(express.json());

const insertRefreshToken = async (accountId: string, cloudType: string, userKey: string, refreshToken: string) => {
  const { data, error } = await supabase.rpc('insert_secret', {
    name: `${accountId}_${cloudType}_${userKey}`,
    secret: refreshToken
  });
  if (error) {
    throw new Error(`Failed to insert secret: ${error.message}`);
  }
  console.log(`Secret inserted with ID: ${data}`);
  return data;
};

app.post('/connect-new-account', async (req, res) => {
  // Handle the connection of a new account
  const { cloudType, authorizationCode, userKey } = req.body;

  console.log('Connecting new account:');
  console.log('Cloud Type:', cloudType);
  console.log('Authorization Code:', authorizationCode);
  console.log('User Key:', userKey);

  // get auth token / refresh token from the authorization code
  // TODO: Implement the logic to exchange the authorization code for a refresh token and email
  let accountId = null;
  let refreshToken = null;
  let accessToken = null;
  switch (cloudType) {
    case CloudType.GoogleDrive:
      console.log('Google cloud type selected, returning refresh token');
      // send the refresh token to the Google API to get an auth token
      const response = await authenticateWithGoogle(authorizationCode);
      accountId = response.accountId;
      refreshToken = response.refreshToken;
      accessToken = response.accessToken;
      break;
    case CloudType.Dropbox:
      console.log('Dropbox cloud type selected, returning refresh token');
      // {accountId, refreshToken} = await authenticateDropbox(authorizationCode);
      break;
    case CloudType.OneDrive:
      console.log('OneDrive cloud type selected, returning refresh token');
      // {accountId, refreshToken} = await authenticateOneDrive(authorizationCode);
      break;
    default:
      console.error('Unsupported cloud type:', cloudType);
      return res.status(400).json({ error: 'Unsupported cloud type' });
  } 

  if (!accountId || !refreshToken) {
    console.error('Failed to retrieve account ID or refresh token');
    return res.status(400).json({ error: 'Failed to retrieve account ID or refresh token' });
  }

  // Insert the refresh token into the database
  try {
    await insertRefreshToken(accountId, cloudType, userKey, refreshToken);
  } catch (error) {
    console.error('Error inserting refresh token:', error);
    return res.status(500).json({ error: 'Failed to insert refresh token' });
  }

  return res.json({ accountId: accountId,
    refreshToken: refreshToken,
    accessToken: accessToken,
    message: 'New account connected successfully'
  });
});

// POST endpoint at /get-new-token
app.post('/get-new-token', async (req, res) => {
  // Access the JSON data sent in the request body
  const receivedData = req.body;

  const { accountId, cloudType, userKey } = receivedData;

  console.log('Received data:', receivedData);
  console.log('Account ID:', accountId);
  console.log('Cloud Type:', cloudType);
  console.log('User Key:', userKey);

  const { data, error } = await supabase.rpc('read_secret', {
    secret_name: `${accountId}_${cloudType}_${userKey}`
  });

  if (error) {
    throw new Error(`Failed to read secret: ${error.message}`);
  }

  console.log(`Secret read with ID: ${data}`);

  if (!data) {
    console.error('No refresh token found for the given account ID and cloud type');
    return res.status(404).json({ error: 'Refresh token not found' });
  }

  const refreshToken = data;

  let authToken = null;

  // TODO : Implement the logic to exchange the refresh token for an auth token based on the cloud type
  switch (cloudType) {
    case 'google':
      console.log('Google cloud type selected, returning refresh token');
      // send the refresh token to the Google API to get an auth token
      authToken = refreshToken; // Placeholder for actual token retrieval logic
      break;
    case 'dropbox':
      console.log('Dropbox cloud type selected, returning refresh token');
      authToken = refreshToken; // Placeholder for actual token retrieval logic
      break;
    case 'onedrive':
      console.log('OneDrive cloud type selected, returning refresh token');
      authToken = refreshToken; // Placeholder for actual token retrieval logic
      break;
    default:
      console.error('Unsupported cloud type:', cloudType);
      return res.status(400).json({ error: 'Unsupported cloud type' });
  } 

  // Send the fetched data as the response
  return res.json({ authToken: authToken });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
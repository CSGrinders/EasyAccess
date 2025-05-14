
import { useState } from 'react'
import axios from 'axios'

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const handleLogin = async () => {
    console.log('Login clicked')
    setLoading(true)
    try {
        const token = await (window as any).electronAPI.googleAuth();
        setToken(token.access_token);
        await (window as any).electronAPI.saveAuthTokens(token);
        console.log("Token: ", token);
    } catch (error) {
      console.error('Login error:', error)
      setError('An unexpected error occurred. Please try again.')
    }
    setLoading(false)
  }

  const handleFetchTokens = async () => {
    console.log('getSavedTokens clicked')
    setLoading(true)
    try {
        const token = await (window as any).electronAPI.getAuthTokens();
        console.log("Token: ", token);
        console.log("Token scope: ", token.scope);
        setToken(token.access_token);
    } catch (error) {
      console.error('getSavedTokens error:', error)
      setError('An unexpected error occurred. Please try again.')
    }
    setLoading(false)
  }

  const requestDriveFiles = async () => {
    console.log('Request Drive Files clicked')
    setLoading(true)
    try {
      const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
  
      console.log('Files:', response.data);
    } catch (error) {
      console.error('Error fetching drive files:', error)
      setError('An unexpected error occurred. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col min-h-screen justify-center items-center px-6 py-12 bg-gradient-to-b from-background-start-rgb to-background-end-rgb">
      <section className="w-full text-center space-y-6">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-blue-600 via-green-500 to-indigo-400 bg-clip-text text-transparent inline-block mb-20">
          Welcome to EasyAccess
        </h1>
      </section>

      <button
          onClick={handleLogin}
          className="flex items-center justify-center space-x-3 px-6 py-3 bg-white text-gray-700 font-semibold rounded-md shadow hover:shadow-lg hover:bg-gray-100 transition"
      >
        <span className="text-lg">Sign in with Google</span>
      </button>
      <button
          onClick={handleFetchTokens}
          className="flex items-center justify-center space-x-3 px-6 py-3 bg-white text-gray-700 font-semibold rounded-md shadow hover:shadow-lg hover:bg-gray-100 transition"
      >
        <span className="text-lg">Get Saved Tokens</span>
      </button>
      {token && (
        <div className="flex flex-col mt-4 justify-center items-center">
          <h2 className="text-lg font-semibold">Access Token:</h2>
          <p className="text-sm text-gray-600">{token}</p>
          <button
            onClick={requestDriveFiles}
            className="flex items-center justify-center space-x-3 px-6 py-3 bg-white text-gray-700 font-semibold rounded-md shadow hover:shadow-lg hover:bg-gray-100 transition"
          >
            <span className="text-lg">Request Drive Files</span>
          </button>
        </div>
      )}
    </div>
  )
}

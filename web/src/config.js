const url = import.meta.env.VITE_API_URL || 'http://localhost:8000'

if (import.meta.env.PROD && url.includes('localhost')) {
  console.error('[config] VITE_API_URL is still localhost in production! Set a real API URL in .env.production')
}

export const API_BASE = url

const configuredUrl = import.meta.env.VITE_API_URL || ''
const nativeFallbackUrl = import.meta.env.VITE_NATIVE_API_URL || 'http://192.168.1.29:8000'

const isCapacitorNative =
  typeof window !== 'undefined' &&
  !!(window?.Capacitor?.isNativePlatform?.())

const isLocalHost =
  !isCapacitorNative &&
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)

const isLoopbackApi =
  configuredUrl.includes('localhost') ||
  configuredUrl.includes('127.0.0.1') ||
  configuredUrl.includes('[::1]') ||
  configuredUrl.includes('://::1')

let url
if (isCapacitorNative) {
  url = configuredUrl && !isLoopbackApi ? configuredUrl : nativeFallbackUrl
} else if (isLocalHost) {
  url = configuredUrl || 'http://localhost:8001'
} else {
  url = configuredUrl || ''
}

export const API_BASE = url

const nativeApiCandidates = [
  configuredUrl && !isLoopbackApi ? configuredUrl : null,
  nativeFallbackUrl,
].filter(Boolean)

export const API_BASES = isCapacitorNative
  ? [...new Set(nativeApiCandidates)]
  : [API_BASE]

export const API_URL = (
  typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')
    ? window.location.origin
    : (import.meta.env.VITE_API_URL || 'http://localhost:5000')
).replace(/\/+$/, '');

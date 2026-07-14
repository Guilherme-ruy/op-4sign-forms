import axios from 'axios';

const getBaseURL = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && envUrl.includes('localhost')) {
      return envUrl.replace('localhost', hostname);
    }
  }

  return envUrl;
};

const api = axios.create({
  baseURL: getBaseURL(),
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && config.baseURL?.includes('localhost')) {
      config.baseURL = config.baseURL.replace('localhost', hostname);
    }

    const token = localStorage.getItem('token');
    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Interceptor de resposta: redireciona para /login quando o token expirar (401)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      typeof window !== 'undefined' &&
      error?.response?.status === 401 &&
      !window.location.pathname.startsWith('/login') &&
      !window.location.pathname.startsWith('/public') &&
      !window.location.pathname.startsWith('/reset-password') &&
      !window.location.pathname.startsWith('/accept-invite') &&
      !window.location.pathname.startsWith('/forgot-password')
    ) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;

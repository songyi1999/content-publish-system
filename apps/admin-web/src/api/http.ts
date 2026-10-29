import axios from 'axios';

export const http = axios.create({ baseURL: '/api', timeout: 15_000 });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('cps.token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cps.token');
      if (location.pathname !== '/login') location.href = '/login';
    }
    return Promise.reject(err);
  },
);

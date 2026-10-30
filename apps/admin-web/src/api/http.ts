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
      if (!location.hash.startsWith('#/login')) location.href = '/#/login';
    }
    return Promise.reject(err);
  },
);

/** 文件下载（如日志 CSV 导出）：带鉴权取回 Blob */
export async function getRaw(url: string): Promise<Blob> {
  const token = localStorage.getItem('cps.token');
  const res = await fetch(`/api${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`下载失败 ${res.status}`);
  return res.blob();
}

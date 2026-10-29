import { defineStore } from 'pinia';
import type { LoginResult } from '@cps/shared';
import { http } from '../api/http';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('cps.token') || '',
    username: localStorage.getItem('cps.username') || '',
    role: localStorage.getItem('cps.role') || '',
  }),
  actions: {
    async login(username: string, password: string): Promise<void> {
      const res = await http.post<never, LoginResult>('/auth/login', { username, password });
      this.token = res.accessToken;
      this.username = res.username;
      this.role = res.role;
      localStorage.setItem('cps.token', res.accessToken);
      localStorage.setItem('cps.username', res.username);
      localStorage.setItem('cps.role', res.role);
    },
    logout(): void {
      this.token = '';
      this.username = '';
      this.role = '';
      localStorage.removeItem('cps.token');
      localStorage.removeItem('cps.username');
      localStorage.removeItem('cps.role');
    },
  },
});

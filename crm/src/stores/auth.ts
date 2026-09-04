import { defineStore } from "pinia";
import { crmApi, readToken, writeToken } from "@/lib/api";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    initialized: false,
    loading: false,
    token: readToken(),
    displayName: "Operator",
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    async initialize() {
      if (this.initialized) return;
      if (!this.token) {
        this.initialized = true;
        return;
      }
      try {
        const me = await crmApi.me();
        this.displayName = me.display_name || "Operator";
      } catch {
        writeToken(null);
        this.token = null;
      }
      this.initialized = true;
    },
    async login(login: string, password: string) {
      this.loading = true;
      try {
        const body = await crmApi.login(login, password);
        writeToken(body.token);
        this.token = body.token;
        this.displayName = "Operator";
      } finally {
        this.loading = false;
      }
    },
    logout() {
      writeToken(null);
      this.token = null;
    },
  },
});

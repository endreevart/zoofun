<template>
  <div class="min-h-screen flex items-center justify-center p-6 bg-canvas">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="w-14 h-14 rounded-2xl bg-accent text-white flex items-center justify-center font-bold text-xl mx-auto mb-4 shadow-soft">
          Z
        </div>
        <h1 class="text-2xl font-bold m-0 text-ink">ZOOFUN CRM</h1>
        <p class="text-sm text-muted mt-2">Только для оператора</p>
      </div>
      <section class="crm-panel">
        <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
          <label class="flex flex-col gap-2 text-sm font-semibold text-muted">
            Логин
            <InputText v-model="login" autocomplete="username" required class="w-full" />
          </label>
          <label class="flex flex-col gap-2 text-sm font-semibold text-muted">
            Пароль
            <Password v-model="password" :feedback="false" toggle-mask autocomplete="current-password" input-class="w-full" class="w-full" />
          </label>
          <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
          <Button type="submit" label="Войти" :loading="auth.loading" icon="pi pi-sign-in" class="w-full" severity="contrast" />
        </form>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import Button from "primevue/button";
import Message from "primevue/message";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const login = ref("");
const password = ref("");
const error = ref("");

async function onSubmit() {
  error.value = "";
  try {
    await auth.login(login.value, password.value);
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    await router.push(redirect);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Ошибка входа";
  }
}
</script>

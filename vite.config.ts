import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// A conexão com o Supabase vem de duas variáveis de ambiente. Além dos nomes com VITE_,
// aceitamos os nomes que o próprio painel do Supabase sugere ao copiar (SUPABASE_URL e
// SUPABASE_PUBLISHABLE_KEY). Só estes nomes são lidos: a chave secreta nunca entra no site.
const NOMES_URL = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'];
const NOMES_CHAVE = [
  'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const primeiro = (nomes: string[]) => nomes.map((n) => (env[n] ?? '').trim()).find((v) => v) ?? '';
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(primeiro(NOMES_URL)),
      __SUPABASE_CHAVE__: JSON.stringify(primeiro(NOMES_CHAVE)),
    },
    build: { chunkSizeWarningLimit: 900 },
    test: { environment: 'happy-dom', include: ['src/**/*.test.ts'] },
  };
});

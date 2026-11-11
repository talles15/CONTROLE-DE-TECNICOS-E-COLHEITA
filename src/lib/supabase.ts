import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// aceita o valor colado com espaços, aspas ou com o "NOME=" na frente
const limpar = (v: string | undefined): string =>
  (v ?? '').trim().replace(/^[A-Z_]+\s*=\s*/, '').replace(/^["']|["']$/g, '').trim();

const url = limpar(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const chave = limpar(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Motivos pelos quais o Supabase não foi ligado (vazio = tudo certo). Nunca inclui os valores. */
export const pendencias: string[] = [];
if (!url) pendencias.push('VITE_SUPABASE_URL não foi encontrada');
else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
  pendencias.push('VITE_SUPABASE_URL deve ser a Project URL, no formato https://xxxxxxxx.supabase.co');
}
if (!chave) pendencias.push('VITE_SUPABASE_ANON_KEY não foi encontrada');
else if (/^sb_secret_/.test(chave) || chave.length <= 20) {
  pendencias.push(
    /^sb_secret_/.test(chave)
      ? 'VITE_SUPABASE_ANON_KEY está com a chave secreta: troque pela Publishable key (sb_publishable_…)'
      : 'VITE_SUPABASE_ANON_KEY parece incompleta: cole a Publishable key inteira',
  );
}

/** null = variáveis não configuradas → o sistema abre em modo demonstração. */
export const supabase: SupabaseClient | null = pendencias.length === 0 ? createClient(url, chave) : null;

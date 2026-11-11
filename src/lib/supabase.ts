import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const chave = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** null = variáveis não configuradas → o sistema abre em modo demonstração. */
export const supabase: SupabaseClient | null =
  /^https?:\/\//.test(url) && chave.length > 20 && !url.includes('SEU-PROJETO') ? createClient(url, chave) : null;

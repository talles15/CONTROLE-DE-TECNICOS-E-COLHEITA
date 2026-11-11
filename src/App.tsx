import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { FichaCampo } from './components/FichaCampo';
import { ProvedorDados, useDados } from './lib/dados';
import { ABAS, ir, useRota } from './lib/rota';
import { DemoStore, SupabaseStore, type Store } from './lib/store';
import { pendencias, supabase } from './lib/supabase';
import Calendario from './pages/Calendario';
import Campos from './pages/Campos';
import Importar from './pages/Importar';
import Internalizacao from './pages/Internalizacao';
import Login from './pages/Login';
import Mapa from './pages/Mapa';
import Programacao from './pages/Programacao';
import Tecnicos from './pages/Tecnicos';

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const usuario = sessao?.user.id ?? null;
  const store = useMemo<Store | null>(() => {
    if (!supabase) return new DemoStore(typeof localStorage !== 'undefined' ? localStorage : null);
    return usuario ? new SupabaseStore(supabase) : null;
  }, [usuario]);

  if (supabase && sessao === undefined) return <div className="tela-centro"><div className="muted">Carregando…</div></div>;
  if (!store) return <Login />;
  return (
    <ProvedorDados store={store} onSair={supabase ? () => void supabase!.auth.signOut() : undefined}>
      <Casca email={sessao?.user.email ?? null} />
    </ProvedorDados>
  );
}

function Casca({ email }: { email: string | null }) {
  const rota = useRota();
  const { store, alertas } = useDados();
  const urgentes = alertas.filter((a) => a.tipo !== 'proximos').length;
  const ficha = rota.params.ficha;
  const fecharFicha = () => {
    const { ficha: _f, ...resto } = rota.params;
    ir(rota.aba, resto);
  };

  return (
    <>
      <div className="topo">
        {store.modo === 'demo' && (
          <div className="faixa-demo">
            <b>Modo demonstração</b> — Supabase ainda não configurado: os dados ficam só neste navegador e não são compartilhados com a equipe.
            <div>Falta na Vercel: {pendencias.join(' · ')}. Depois de corrigir, publique de novo (Redeploy).</div>
          </div>
        )}
        <div className="topo-in">
          <div className="topo-linha">
            <div>
              <h1>Controle de Técnicos e Colheita</h1>
              <div className="sub">Campos cooperantes · Safra 26/27</div>
            </div>
            {email && supabase && (
              <div className="btns">
                <span className="sub">{email}</span>
                <button className="btn" onClick={() => void supabase!.auth.signOut()}>Sair</button>
              </div>
            )}
          </div>
          <nav className="abas" aria-label="Seções">
            {ABAS.map((a) => (
              <button key={a.id} className={'aba' + (rota.aba === a.id ? ' on' : '')} onClick={() => ir(a.id)}>
                {a.rotulo}
                {a.id === 'calendario' && urgentes > 0 && <span className="cont" title="Alertas de colheita">{urgentes}</span>}
              </button>
            ))}
          </nav>
        </div>
      </div>
      <main className="wrap">
        {rota.aba === 'calendario' && <Calendario />}
        {rota.aba === 'campos' && <Campos />}
        {rota.aba === 'programacao' && <Programacao params={rota.params} />}
        {rota.aba === 'internalizacao' && <Internalizacao />}
        {rota.aba === 'mapa' && <Mapa />}
        {rota.aba === 'tecnicos' && <Tecnicos />}
        {rota.aba === 'importar' && <Importar />}
      </main>
      {ficha && <FichaCampo campoId={ficha} onFechar={fecharFicha} />}
    </>
  );
}

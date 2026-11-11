import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) {
      setErro(
        /invalid login/i.test(error.message)
          ? 'E-mail ou senha incorretos.'
          : /fetch|network/i.test(error.message)
            ? 'Sem conexão com o Supabase. Confira a internet e tente de novo.'
            : error.message,
      );
    }
  }

  return (
    <div className="tela-centro">
      <form className="card login" onSubmit={entrar}>
        <h1>Controle de Técnicos e Colheita</h1>
        <p className="sub" style={{ margin: '4px 0 16px' }}>Campos cooperantes · Safra 26/27</p>
        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro && <div className="erro-txt" role="alert">{erro}</div>}
        <button className="btn primary" type="submit" disabled={enviando} style={{ width: '100%', justifyContent: 'center' }}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="sub" style={{ marginTop: 12 }}>O acesso é criado pelo administrador no painel do Supabase.</p>
      </form>
    </div>
  );
}

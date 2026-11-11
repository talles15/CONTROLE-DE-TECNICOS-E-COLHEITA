import { useState } from 'react';
import { Modal } from '../components/ui';
import { useDados } from '../lib/dados';
import { somaDias } from '../lib/dates';
import type { NovoTecnico } from '../lib/store';
import type { Tecnico } from '../lib/types';
import { telefoneWhats } from '../lib/whatsapp';

const CORES = ['#2a78d6', '#eb6834', '#1a9a6c', '#8a5cd6', '#c2410c', '#0e7490', '#b4539a', '#6b7a1c', '#b83232', '#4b5fbf'];

export default function Tecnicos() {
  const d = useDados();
  const [edit, setEdit] = useState<Tecnico | 'novo' | null>(null);
  const amanha = somaDias(d.hoje, 1);
  const cont = (id: string, dia: string) => d.dados.programacoes.filter((p) => p.tecnico_id === id && p.data === dia && p.status !== 'cancelado').length;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Técnicos de campo</h2>
          <div className="sub">O telefone é usado no botão “Abrir no WhatsApp” da programação. A cor identifica o técnico nas telas.</div>
        </div>
        <button className="btn primary" onClick={() => setEdit('novo')}>+ Novo técnico</button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Telefone / WhatsApp</th><th>Cidade base</th><th>Função</th><th className="n">Campos hoje</th><th className="n">Campos amanhã</th><th>Situação</th><th>Observações</th><th /></tr></thead>
          <tbody>
            {d.dados.tecnicos.map((t) => (
              <tr key={t.id} className={t.ativo ? '' : 'off'}>
                <td className="nowrap"><span className="tec-chip"><i style={{ background: t.cor }} />{t.nome}</span></td>
                <td className="nowrap">{t.telefone ?? '—'}{t.telefone && !telefoneWhats(t.telefone) && <span className="badge" title="Use DDD + número" style={{ marginLeft: 6 }}>nº inválido</span>}</td>
                <td>{t.cidade_base ?? '—'}</td>
                <td>{t.funcao ?? '—'}</td>
                <td className="n">{cont(t.id, d.hoje)}</td>
                <td className="n">{cont(t.id, amanha)}</td>
                <td>{t.ativo ? 'Ativo' : 'Inativo'}</td>
                <td>{t.observacoes ?? ''}</td>
                <td className="n"><button className="btn mini" onClick={() => setEdit(t)}>Editar</button></td>
              </tr>
            ))}
            {d.dados.tecnicos.length === 0 && <tr><td colSpan={9} className="empty">Nenhum técnico cadastrado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <FormTecnico tecnico={edit === 'novo' ? null : edit} corSugerida={CORES[d.dados.tecnicos.length % CORES.length]} onFim={() => setEdit(null)} />}
    </section>
  );
}

function FormTecnico({ tecnico, corSugerida, onFim }: { tecnico: Tecnico | null; corSugerida: string; onFim: () => void }) {
  const d = useDados();
  const [f, setF] = useState<NovoTecnico>(
    tecnico ?? { nome: '', telefone: null, cidade_base: null, funcao: null, cor: corSugerida, ativo: true, observacoes: null },
  );
  const txt = (k: 'nome' | 'telefone' | 'cidade_base' | 'funcao' | 'observacoes') => ({
    value: f[k] ?? '',
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
  });
  const telOk = !f.telefone || !!telefoneWhats(f.telefone);

  async function salvar() {
    const nome = f.nome.trim();
    if (!nome) return d.avisar('Informe o nome do técnico.', 'erro');
    const limpo = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const r = await d.salvarTecnico({
      ...f, nome, telefone: limpo(f.telefone), cidade_base: limpo(f.cidade_base), funcao: limpo(f.funcao), observacoes: limpo(f.observacoes),
    });
    if (r) onFim();
  }

  return (
    <Modal titulo={tecnico ? 'Editar técnico' : 'Novo técnico'} onFechar={onFim}>
      <div className="form">
        <div className="campo"><label htmlFor="tNome">Nome</label><input id="tNome" autoFocus {...txt('nome')} /></div>
        <div className="campo">
          <label htmlFor="tTel">Telefone / WhatsApp</label>
          <input id="tTel" type="tel" placeholder="(64) 99999-0000" {...txt('telefone')} />
          <div className="hint" style={telOk ? undefined : { color: 'var(--critical)' }}>{telOk ? 'DDD + número' : 'Número incompleto: use DDD + número.'}</div>
        </div>
        <div className="campo"><label htmlFor="tCid">Cidade base</label><input id="tCid" {...txt('cidade_base')} /></div>
        <div className="campo"><label htmlFor="tFun">Função</label><input id="tFun" placeholder="Técnico de campo, amostrador…" {...txt('funcao')} /></div>
        <div className="campo"><label htmlFor="tCor">Cor</label><input id="tCor" type="color" value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} /></div>
        <div className="campo"><label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo (aparece na programação)</label></div>
        <div className="campo largo"><label htmlFor="tObs">Observações</label><textarea id="tObs" {...txt('observacoes')} /></div>
      </div>
      <div className="btns" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <div className="btns">
          <button className="btn primary" onClick={() => void salvar()}>Salvar</button>
          <button className="btn" onClick={onFim}>Cancelar</button>
        </div>
        {tecnico && (
          <button className="btn perigo" onClick={async () => {
            if (confirm(`Excluir ${tecnico.nome}? As programações dele também serão apagadas. Para manter o histórico, prefira desmarcar “Ativo”.`)) {
              if (await d.excluirTecnico(tecnico.id)) onFim();
            }
          }}>Excluir</button>
        )}
      </div>
    </Modal>
  );
}

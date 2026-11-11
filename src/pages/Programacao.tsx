import { useEffect, useMemo, useState } from 'react';
import { descCampo, Modal, ordCampo, SeletorCampo, Sit, TecChip } from '../components/ui';
import { useDados } from '../lib/dados';
import { br, diaSemanaLongo, ehIso, somaDias } from '../lib/dates';
import { baixar, copiar, n0, semAcento } from '../lib/format';
import { abrirFicha, ir } from '../lib/rota';
import { ATIVIDADES, type Atividade, type Campo, type Programacao as Prog, type Tecnico } from '../lib/types';
import { linkWhats, textoGeral, textoTecnico, type ItemProg } from '../lib/whatsapp';

interface Sugestao {
  campo: Campo;
  motivo: string;
  atividade: Atividade;
}

export default function Programacao({ params }: { params: Record<string, string> }) {
  const d = useDados();
  const amanha = somaDias(d.hoje, 1);
  const data = ehIso(params.data) ? params.data : amanha;
  const setData = (v: string) => v && ir('programacao', { data: v });

  const [campoSel, setCampoSel] = useState<string | null>(params.campo ?? null);
  const [tecSel, setTecSel] = useState('');
  const [ativ, setAtiv] = useState<Atividade>(params.atividade === 'coleta_pre' ? 'coleta_pre' : 'colheita_pre');
  const [obs, setObs] = useState('');
  const [texto, setTexto] = useState<{ titulo: string; corpo: string; tecnico: Tecnico | null } | null>(null);

  useEffect(() => {
    if (params.campo) setCampoSel(params.campo);
    if (params.atividade === 'coleta_pre' || params.atividade === 'colheita_pre') setAtiv(params.atividade);
  }, [params.campo, params.atividade]);

  const ativos = useMemo(() => d.dados.campos.filter((c) => c.ativo && !c.colheita_fim), [d.dados.campos]);
  const doDia = useMemo(() => d.dados.programacoes.filter((p) => p.data === data), [d.dados.programacoes, data]);
  const validos = doDia.filter((p) => p.status !== 'cancelado');

  const itensDe = (tecId: string): ItemProg[] =>
    doDia
      .filter((p) => p.tecnico_id === tecId)
      .map((p) => ({ prog: p, campo: d.campoPorId.get(p.campo_id)!, resumo: d.resumos.get(p.campo_id) }))
      .filter((i) => i.campo)
      .sort((a, b) => ordCampo(a.campo, b.campo));

  // técnicos ativos + inativos que ainda tenham algo neste dia
  const tecnicos = d.dados.tecnicos.filter((t) => t.ativo || doDia.some((p) => p.tecnico_id === t.id));

  const sugestoes = useMemo<Sugestao[]>(() => {
    const jaTem = new Set(validos.map((p) => p.campo_id));
    const out = new Map<string, Sugestao>();
    const aviso = d.dados.config.avisoDias;
    for (const x of d.dados.dessecacoes) {
      const c = d.campoPorId.get(x.campo_id);
      if (!c || !c.ativo || c.colheita_fim || !x.data_provavel_colheita || jaTem.has(c.id)) continue;
      const p = x.data_provavel_colheita;
      if (p === data) out.set(c.id, { campo: c, motivo: `Colheita provável neste dia (dessecado em ${br(x.data)})`, atividade: 'colheita_pre' });
      else if (p > data && p <= somaDias(data, Math.max(1, aviso)) && !out.has(c.id)) {
        out.set(c.id, { campo: c, motivo: `Véspera: colheita provável em ${br(p)} — fazer pré-colheita`, atividade: 'coleta_pre' });
      } else if (p < data && !c.colheita_inicio && !out.has(c.id)) {
        out.set(c.id, { campo: c, motivo: `Colheita provável era ${br(p)} e o início ainda não foi registrado`, atividade: 'colheita_pre' });
      }
    }
    for (const c of d.dados.campos) {
      if (!c.ativo || c.colheita_fim || !c.colheita_inicio || c.colheita_inicio > data || jaTem.has(c.id) || out.has(c.id)) continue;
      out.set(c.id, { campo: c, motivo: `Em colheita desde ${br(c.colheita_inicio)}`, atividade: 'colheita_pre' });
    }
    return [...out.values()].sort((a, b) => ordCampo(a.campo, b.campo));
  }, [d.dados, d.campoPorId, validos, data]);

  async function adicionar(campoId: string | null, tecnicoId: string, atividade: Atividade, observacoes: string | null) {
    if (!tecnicoId) return d.avisar('Escolha o técnico.', 'erro');
    if (!campoId) return d.avisar('Escolha o campo.', 'erro');
    const ok = await d.salvarProgramacoes([{ data, tecnico_id: tecnicoId, campo_id: campoId, atividade, observacoes, status: 'planejado' }], 'Campo programado.');
    if (ok) {
      setCampoSel(null);
      setObs('');
      if (params.campo) ir('programacao', { data });
    }
  }

  async function copiarAnterior() {
    const ant = somaDias(data, -1);
    const base = d.dados.programacoes.filter((p) => p.data === ant && p.status !== 'cancelado');
    const novos = base.filter((p) => {
      const c = d.campoPorId.get(p.campo_id);
      const t = d.tecnicoPorId.get(p.tecnico_id);
      return c && t && c.ativo && t.ativo && !c.colheita_fim && !doDia.some((x) => x.tecnico_id === p.tecnico_id && x.campo_id === p.campo_id);
    });
    if (!novos.length) return d.avisar(`Nada para copiar de ${br(ant)}.`, 'erro');
    await d.salvarProgramacoes(
      novos.map((p) => ({ data, tecnico_id: p.tecnico_id, campo_id: p.campo_id, atividade: p.atividade, observacoes: p.observacoes, status: 'planejado' as const })),
      `${novos.length} atividade(s) copiada(s) de ${br(ant)}.`,
    );
  }

  const abrirTexto = (t: Tecnico) => setTexto({ titulo: `Mensagem para ${t.nome}`, corpo: textoTecnico(data, t, itensDe(t.id)), tecnico: t });
  const abrirGeral = () =>
    setTexto({
      titulo: 'Programação geral do dia',
      corpo: textoGeral(data, d.dados.tecnicos.map((t) => ({ tecnico: t, itens: itensDe(t.id) }))),
      tecnico: null,
    });

  const responsaveis = validos
    .map((p) => ({ p, c: d.campoPorId.get(p.campo_id), t: d.tecnicoPorId.get(p.tecnico_id) }))
    .filter((x): x is { p: Prog; c: Campo; t: Tecnico } => !!x.c && !!x.t)
    .sort((a, b) => ordCampo(a.c, b.c));

  if (!d.dados.tecnicos.length) {
    return (
      <div className="card">
        <h2>Cadastre os técnicos primeiro</h2>
        <p className="sub">A programação distribui campos entre os técnicos de campo.</p>
        <button className="btn primary" onClick={() => ir('tecnicos')}>Cadastrar técnicos</button>
      </div>
    );
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div className="dia-nav">
            <button className="btn" onClick={() => setData(somaDias(data, -1))} aria-label="Dia anterior">‹</button>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Dia da programação" />
            <button className="btn" onClick={() => setData(somaDias(data, 1))} aria-label="Próximo dia">›</button>
            <button className={'btn' + (data === d.hoje ? ' primary' : '')} onClick={() => setData(d.hoje)}>Hoje</button>
            <button className={'btn' + (data === amanha ? ' primary' : '')} onClick={() => setData(amanha)}>Amanhã</button>
            <span className="titulo">{diaSemanaLongo(data)}, {br(data)}</span>
          </div>
          <div className="btns">
            <button className="btn" onClick={() => void copiarAnterior()}>Copiar do dia anterior</button>
            <button className="btn primary" onClick={abrirGeral} disabled={!validos.length}>Texto geral do dia</button>
          </div>
        </div>
        <div className="sub">
          {validos.length
            ? `${validos.length} atividade(s) para ${new Set(validos.map((p) => p.tecnico_id)).size} técnico(s) · ${n0([...new Set(validos.map((p) => p.campo_id))].reduce((s, id) => s + (d.campoPorId.get(id)?.area_mapa ?? 0), 0))} ha`
            : 'Nenhum campo programado para este dia.'}
        </div>
      </section>

      <section className="card">
        <h2>Adicionar campo à programação</h2>
        <div className="form larga" style={{ marginTop: 10 }}>
          <div className="campo" style={{ gridColumn: 'span 2' }}>
            <label>Campo</label>
            <SeletorCampo campos={ativos} valor={campoSel} onEscolher={setCampoSel} />
          </div>
          <div className="campo">
            <label htmlFor="pgTec">Técnico</label>
            <select id="pgTec" value={tecSel} onChange={(e) => setTecSel(e.target.value)}>
              <option value="">Escolha…</option>
              {d.dados.tecnicos.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="pgAtiv">Atividade</label>
            <select id="pgAtiv" value={ativ} onChange={(e) => setAtiv(e.target.value as Atividade)}>
              {(Object.keys(ATIVIDADES) as Atividade[]).map((a) => <option key={a} value={a}>{ATIVIDADES[a].curto}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="pgObs">Observação</label>
            <input id="pgObs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="opcional" />
          </div>
          <div className="btns">
            <button className="btn primary" onClick={() => void adicionar(campoSel, tecSel, ativ, obs.trim() || null)}>Adicionar</button>
          </div>
        </div>
      </section>

      {sugestoes.length > 0 && <Sugestoes itens={sugestoes} tecnicos={d.dados.tecnicos.filter((t) => t.ativo)} onAdd={(s, tec, a) => void adicionar(s.campo.id, tec, a, null)} />}

      <div className="quadro">
        {tecnicos.map((t) => {
          const itens = itensDe(t.id);
          const txt = textoTecnico(data, t, itens);
          const wa = linkWhats(t.telefone, txt);
          const temAtivos = itens.some((i) => i.prog.status !== 'cancelado');
          return (
            <div className="tec-card" key={t.id} style={{ borderTopColor: t.cor }} data-tecnico={t.nome}>
              <header>
                <div><b>{t.nome}</b>{!t.ativo && <span className="badge" style={{ marginLeft: 6 }}>inativo</span>}<div className="sub">{[t.funcao, t.cidade_base, t.telefone].filter(Boolean).join(' · ')}</div></div>
                <span className="badge">{itens.filter((i) => i.prog.status !== 'cancelado').length} campo(s)</span>
              </header>
              {itens.length === 0 && <div className="sub" style={{ marginBottom: 8 }}>Sem campos neste dia.</div>}
              {itens.map((it) => <ItemCard key={it.prog.id} it={it} />)}
              <div className="btns">
                <button className="btn mini" disabled={!temAtivos} onClick={() => abrirTexto(t)}>Ver texto</button>
                <button className="btn mini" disabled={!temAtivos} onClick={async () => d.avisar((await copiar(txt)) ? 'Texto copiado.' : 'Não foi possível copiar.', 'ok')}>Copiar</button>
                <button className="btn mini" disabled={!temAtivos} onClick={() => baixar(nomeArquivo(data, t.nome), txt)}>Baixar .txt</button>
                {wa && temAtivos
                  ? <a className="btn mini whats" href={wa} target="_blank" rel="noreferrer">Abrir no WhatsApp</a>
                  : <button className="btn mini" disabled title={t.telefone ? 'Sem campos neste dia' : 'Cadastre o telefone do técnico'}>Abrir no WhatsApp</button>}
              </div>
            </div>
          );
        })}
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Quem está em qual campo</h2>
        <div className="sub" style={{ marginBottom: 10 }}>{br(data)} · {responsaveis.length} atividade(s)</div>
        <div className="tbl-wrap" style={{ maxHeight: 420 }}>
          <table>
            <thead><tr><th>Campo</th><th>Cliente · Fazenda · Cidade</th><th>Cultivar</th><th className="n">Área (ha)</th><th>Técnico responsável</th><th>Atividade</th><th>Situação</th></tr></thead>
            <tbody>
              {responsaveis.map(({ p, c, t }) => (
                <tr key={p.id} className="clic" onClick={() => abrirFicha(c.id)}>
                  <td><b>{c.num_campo}</b> <span className="muted">{c.categoria_colher}</span></td>
                  <td>{descCampo(c)}</td>
                  <td>{c.produto}</td>
                  <td className="n">{n0(c.area_mapa)}</td>
                  <td><TecChip t={t} /></td>
                  <td>{ATIVIDADES[p.atividade].curto}</td>
                  <td><Sit s={d.resumos.get(c.id)!.situacao} /></td>
                </tr>
              ))}
              {responsaveis.length === 0 && <tr><td colSpan={7} className="empty">Ninguém programado para este dia.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {texto && (
        <Modal titulo={texto.titulo} sub={`${diaSemanaLongo(data)}, ${br(data)}`} onFechar={() => setTexto(null)}>
          <textarea className="texto-prev" data-testid="texto-whats" value={texto.corpo} onChange={(e) => setTexto({ ...texto, corpo: e.target.value })} rows={16} />
          <div className="sub" style={{ margin: '6px 0 12px' }}>Você pode ajustar o texto antes de enviar. Os asteriscos viram negrito no WhatsApp.</div>
          <div className="btns">
            <button className="btn primary" onClick={async () => d.avisar((await copiar(texto.corpo)) ? 'Texto copiado.' : 'Não foi possível copiar.')}>Copiar texto</button>
            <button className="btn" onClick={() => baixar(nomeArquivo(data, texto.tecnico?.nome ?? 'equipe'), texto.corpo)}>Baixar .txt</button>
            {texto.tecnico && linkWhats(texto.tecnico.telefone, texto.corpo) && (
              <a className="btn whats" href={linkWhats(texto.tecnico.telefone, texto.corpo)!} target="_blank" rel="noreferrer">Abrir no WhatsApp de {texto.tecnico.nome}</a>
            )}
            {!texto.tecnico && <a className="btn whats" href={`https://wa.me/?text=${encodeURIComponent(texto.corpo)}`} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a>}
          </div>
        </Modal>
      )}
    </>
  );
}

const nomeArquivo = (data: string, nome: string): string =>
  `programacao_${data}_${semAcento(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.txt`;

function ItemCard({ it }: { it: ItemProg }) {
  const d = useDados();
  const { prog: p, campo: c } = it;
  const [obs, setObs] = useState(p.observacoes ?? '');
  useEffect(() => setObs(p.observacoes ?? ''), [p.observacoes]);
  return (
    <div className={'item' + (p.status === 'cancelado' ? ' cancelado' : '')} data-campo={c.num_campo}>
      <div className="l1">
        <b><button className="lk" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }} onClick={() => abrirFicha(c.id)}>{c.num_campo}</button> <span className="muted" style={{ fontWeight: 400 }}>{c.categoria_colher} · {n0(c.area_mapa)} ha</span></b>
        <button className="btn mini perigo" aria-label={`Remover ${c.num_campo}`} onClick={() => void d.excluirProgramacao(p.id)}>Remover</button>
      </div>
      <div className="l2">{descCampo(c)}{c.produto ? ` · ${c.produto}` : ''}</div>
      <div className="ctl">
        <select value={p.atividade} aria-label="Atividade" onChange={(e) => void d.atualizarProgramacao(p.id, { atividade: e.target.value as Atividade })}>
          {(Object.keys(ATIVIDADES) as Atividade[]).map((a) => <option key={a} value={a}>{ATIVIDADES[a].curto}</option>)}
        </select>
        <input value={obs} placeholder="Observação para o técnico" aria-label="Observação" onChange={(e) => setObs(e.target.value)}
          onBlur={() => (obs.trim() || null) !== p.observacoes && void d.atualizarProgramacao(p.id, { observacoes: obs.trim() || null })} />
      </div>
    </div>
  );
}

function Sugestoes({ itens, tecnicos, onAdd }: { itens: Sugestao[]; tecnicos: Tecnico[]; onAdd: (s: Sugestao, tecnicoId: string, a: Atividade) => void }) {
  const [esc, setEsc] = useState<Record<string, { tec: string; ativ?: Atividade }>>({});
  return (
    <section className="card" data-testid="sugestoes">
      <h2>Sugestões para este dia ({itens.length})</h2>
      <div className="sub" style={{ marginBottom: 10 }}>Campos com colheita provável, véspera de colheita ou já em colheita que ainda não têm técnico neste dia.</div>
      <div className="tbl-wrap" style={{ maxHeight: 320 }}>
        <table>
          <thead><tr><th>Campo</th><th>Local</th><th>Motivo</th><th>Técnico</th><th>Atividade</th><th /></tr></thead>
          <tbody>
            {itens.map((s) => {
              const e = esc[s.campo.id] ?? { tec: '' };
              const a = e.ativ ?? s.atividade;
              return (
                <tr key={s.campo.id}>
                  <td className="nowrap"><b>{s.campo.num_campo}</b> <span className="muted">{n0(s.campo.area_mapa)} ha</span></td>
                  <td>{descCampo(s.campo)}</td>
                  <td>{s.motivo}</td>
                  <td>
                    <select className="inp" aria-label={`Técnico para ${s.campo.num_campo}`} value={e.tec} onChange={(ev) => setEsc({ ...esc, [s.campo.id]: { ...e, tec: ev.target.value } })}>
                      <option value="">Escolha…</option>
                      {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="inp" aria-label={`Atividade para ${s.campo.num_campo}`} value={a} onChange={(ev) => setEsc({ ...esc, [s.campo.id]: { ...e, ativ: ev.target.value as Atividade } })}>
                      {(Object.keys(ATIVIDADES) as Atividade[]).map((k) => <option key={k} value={k}>{ATIVIDADES[k].curto}</option>)}
                    </select>
                  </td>
                  <td className="n"><button className="btn mini primary" onClick={() => onAdd(s, e.tec, a)}>Adicionar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

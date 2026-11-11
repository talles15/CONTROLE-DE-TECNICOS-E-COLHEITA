import { useMemo, useState } from 'react';
import { descCampo, ordCampo, Sit, TecChip } from '../components/ui';
import { useDados } from '../lib/dados';
import { br, diaSemana, diaSemanaLongo, diaSemanaN, dn, iso, MESES, somaDias } from '../lib/dates';
import { n0 } from '../lib/format';
import { abrirFicha, ir } from '../lib/rota';
import { ORDEM_SITUACAO, SITUACOES, type Alerta, type TipoAlerta } from '../lib/status';
import { ATIVIDADES, type Campo } from '../lib/types';

type Camada = 'dess' | 'prog' | 'colh' | 'prev';
const CAMADAS: Record<Camada, { rotulo: string; cor: string }> = {
  dess: { rotulo: 'Dessecados', cor: 'var(--st-dessecado)' },
  prog: { rotulo: 'Colheita programada', cor: 'var(--st-programada)' },
  colh: { rotulo: 'Em colheita', cor: 'var(--st-colheita)' },
  prev: { rotulo: 'Previsão da planilha', cor: 'var(--st-previsao)' },
};
const ORDEM: Camada[] = ['colh', 'prog', 'dess', 'prev'];
/** campos mostrados em cada dia do calendário; o restante vira "+N campos" (o clique no dia lista todos) */
const MAX_POR_DIA = 4;

const TITULOS: Record<TipoAlerta, string> = {
  atrasado: 'Atrasados — data provável passou',
  hoje: 'Colheita provável hoje',
  vespera: 'Véspera — encaminhar pré-colheita',
  proximos: 'Próximos 7 dias',
};

export default function Calendario() {
  const d = useDados();
  const { hoje } = d;
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [sel, setSel] = useState<string | null>(hoje);
  const [vis, setVis] = useState<Record<Camada, boolean>>({ dess: true, prog: true, colh: true, prev: false });

  // eventos por dia e camada
  const eventos = useMemo(() => {
    const m = new Map<string, Record<Camada, Map<string, Campo>>>();
    const add = (dia: string, cam: Camada, c: Campo) => {
      let e = m.get(dia);
      if (!e) m.set(dia, (e = { dess: new Map(), prog: new Map(), colh: new Map(), prev: new Map() }));
      e[cam].set(c.id, c);
    };
    for (const x of d.dados.dessecacoes) {
      const c = d.campoPorId.get(x.campo_id);
      if (!c || !c.ativo) continue;
      add(x.data, 'dess', c);
      const p = x.data_provavel_colheita;
      if (p && !(c.colheita_inicio && c.colheita_inicio <= p) && !(c.colheita_fim && c.colheita_fim < p)) add(p, 'prog', c);
    }
    for (const c of d.dados.campos) {
      if (!c.ativo) continue;
      if (c.colheita_inicio) {
        if (c.colheita_inicio > hoje) add(c.colheita_inicio, 'prog', c);
        const fim = c.colheita_fim ?? hoje;
        for (let k = dn(c.colheita_inicio); k <= dn(fim) && k - dn(c.colheita_inicio) < 120; k++) add(iso(k), 'colh', c);
      }
      if (c.data_colheita_prevista && d.resumos.get(c.id)?.situacao === 'plantado') add(c.data_colheita_prevista, 'prev', c);
    }
    // técnico programado para colher em dia futuro, em campo que ainda não começou
    for (const p of d.dados.programacoes) {
      const c = d.campoPorId.get(p.campo_id);
      if (!c || !c.ativo || p.status === 'cancelado' || p.atividade !== 'colheita_pre' || p.data < hoje) continue;
      if (c.colheita_fim || (c.colheita_inicio && c.colheita_inicio <= p.data)) continue;
      add(p.data, 'prog', c);
    }
    return m;
  }, [d.dados, d.campoPorId, d.resumos, hoje]);

  const progPorDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of d.dados.programacoes) if (p.status !== 'cancelado') m.set(p.data, (m.get(p.data) ?? 0) + 1);
    return m;
  }, [d.dados.programacoes]);

  const dias = useMemo(() => {
    const k1 = dn(mes + '-01');
    const ini = k1 - ((diaSemanaN(k1) + 6) % 7);
    const [a, m] = mes.split('-').map(Number);
    const kUlt = dn(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`) - 1;
    const fim = kUlt + ((7 - diaSemanaN(kUlt)) % 7);
    const out: string[] = [];
    for (let k = ini; k <= fim; k++) out.push(iso(k));
    return out;
  }, [mes]);

  const mudaMes = (delta: number) => {
    const [a, m] = mes.split('-').map(Number);
    const t = a * 12 + (m - 1) + delta;
    setMes(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`);
  };

  const cont = useMemo(() => {
    const m = new Map(ORDEM_SITUACAO.map((s) => [s, { n: 0, ha: 0 }]));
    for (const c of d.dados.campos) {
      if (!c.ativo) continue;
      const x = m.get(d.resumos.get(c.id)!.situacao)!;
      x.n++;
      x.ha += c.area_mapa;
    }
    return m;
  }, [d.dados.campos, d.resumos]);

  const grupos = (['atrasado', 'hoje', 'vespera', 'proximos'] as TipoAlerta[])
    .map((t) => ({ tipo: t, itens: d.alertas.filter((a) => a.tipo === t) }))
    .filter((g) => g.itens.length);

  if (!d.dados.campos.length) {
    return (
      <div className="card">
        <h2>Nenhum campo cadastrado</h2>
        <p className="sub">Comece subindo a planilha de planting na aba “Importar campos”.</p>
        <button className="btn primary" onClick={() => ir('importar')}>Importar campos</button>
      </div>
    );
  }

  const evSel = sel ? eventos.get(sel) : undefined;
  const progsSel = sel ? d.dados.programacoes.filter((p) => p.data === sel && p.status !== 'cancelado') : [];

  return (
    <>
      <div className="alertas">
        {grupos.length === 0 && (
          <div className="alerta">
            <h3>Sem alertas de colheita</h3>
            <div className="sub">Nenhum campo dessecado com colheita provável nos próximos 7 dias. Registre a dessecação na ficha do campo para ativar o aviso.</div>
          </div>
        )}
        {grupos.map((g) => <GrupoAlerta key={g.tipo} tipo={g.tipo} itens={g.itens} />)}
      </div>

      <div className="kpis">
        {ORDEM_SITUACAO.map((s) => (
          <div className="kpi" key={s}>
            <div className="k"><span className="pt" style={{ background: SITUACOES[s].cor }} />{SITUACOES[s].rotulo}</div>
            <div className="v">{n0(cont.get(s)!.n)}</div>
            <div className="s">{n0(cont.get(s)!.ha)} ha</div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <div className="cal-nav">
            <button className="btn" onClick={() => mudaMes(-1)} aria-label="Mês anterior">‹</button>
            <div className="mes">{MESES[Number(mes.slice(5)) - 1]} de {mes.slice(0, 4)}</div>
            <button className="btn" onClick={() => mudaMes(1)} aria-label="Próximo mês">›</button>
            <button className="btn" onClick={() => { setMes(hoje.slice(0, 7)); setSel(hoje); }}>Hoje</button>
          </div>
          <div className="camadas">
            {(Object.keys(CAMADAS) as Camada[]).map((c) => (
              <label key={c}>
                <input type="checkbox" checked={vis[c]} onChange={(e) => setVis({ ...vis, [c]: e.target.checked })} />
                <i style={{ background: CAMADAS[c].cor }} />{CAMADAS[c].rotulo}
              </label>
            ))}
          </div>
        </div>
        <div className="cal">
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((s) => <div className="dsem" key={s}>{s}</div>)}
          {dias.map((dia) => {
            const e = eventos.get(dia);
            const nProg = progPorDia.get(dia) ?? 0;
            return (
              <button key={dia} data-dia={dia}
                className={'dia' + (dia.slice(0, 7) !== mes ? ' fora' : '') + (dia === hoje ? ' hoje' : '') + (dia === sel ? ' sel' : '')}
                onClick={() => setSel(dia)}>
                <span className="nd">
                  <span>{Number(dia.slice(8))}</span>
                  {nProg > 0 && <span className="tecs" title="Atividades programadas para técnicos">{nProg} prog.</span>}
                </span>
                {(() => {
                  if (!e) return null;
                  // um bloco por campo: nº do campo + cultivar, e o agricultor na linha de baixo
                  const itens = ORDEM.filter((c) => vis[c]).flatMap((c) => [...e[c].values()].sort(ordCampo).map((campo) => ({ c, campo })));
                  const mostra = itens.slice(0, MAX_POR_DIA);
                  const resto = itens.length - mostra.length;
                  return (
                    <>
                      {mostra.map(({ c, campo }) => (
                        <span key={c + campo.id} className={'ev ' + c}
                          title={`${CAMADAS[c].rotulo}: ${campo.num_campo} · ${campo.produto ?? 'sem cultivar'} · ${campo.cliente ?? 'sem agricultor'}`}>
                          <span className="l1"><b>{campo.num_campo}</b>{campo.produto && <span className="det"> · {campo.produto}</span>}</span>
                          {campo.cliente && <span className="l2">{campo.cliente}</span>}
                        </span>
                      ))}
                      {resto > 0 && <span className="ev mais">+{resto} campo{resto > 1 ? 's' : ''}</span>}
                    </>
                  );
                })()}
              </button>
            );
          })}
        </div>
      </section>

      {sel && (
        <section className="card dia-det" data-testid="dia-detalhe">
          <div className="card-head">
            <div>
              <h2 className="cap1">{diaSemanaLongo(sel)}, {br(sel)}</h2>
              <div className="sub">{sel === hoje ? 'Hoje' : sel === somaDias(hoje, 1) ? 'Amanhã' : ''}</div>
            </div>
            <button className="btn primary" onClick={() => ir('programacao', { data: sel })}>Programar técnicos neste dia</button>
          </div>
          {ORDEM.filter((c) => vis[c] && evSel && evSel[c].size).map((c) => (
            <div key={c}>
              <h3><i style={{ background: CAMADAS[c].cor }} />{CAMADAS[c].rotulo} ({evSel![c].size})</h3>
              <TabelaDia campos={[...evSel![c].values()].sort(ordCampo)} dia={sel} />
            </div>
          ))}
          {(!evSel || ORDEM.every((c) => !vis[c] || !evSel[c].size)) && <div className="empty">Nenhum campo neste dia nas camadas selecionadas.</div>}
          {progsSel.length > 0 && (
            <>
              <h3>Técnicos programados ({progsSel.length})</h3>
              <div className="tbl-wrap" style={{ maxHeight: 260 }}>
                <table>
                  <thead><tr><th>Técnico</th><th>Campo</th><th>Local</th><th>Atividade</th></tr></thead>
                  <tbody>
                    {progsSel.map((p) => {
                      const t = d.tecnicoPorId.get(p.tecnico_id);
                      const c = d.campoPorId.get(p.campo_id);
                      if (!t || !c) return null;
                      return (
                        <tr key={p.id} className="clic" onClick={() => abrirFicha(c.id)}>
                          <td><TecChip t={t} /></td><td><b>{c.num_campo}</b></td><td>{descCampo(c)}</td><td>{ATIVIDADES[p.atividade].curto}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function TabelaDia({ campos, dia }: { campos: Campo[]; dia: string }) {
  const d = useDados();
  return (
    <div className="tbl-wrap" style={{ maxHeight: 300 }}>
      <table>
        <thead><tr><th>Campo</th><th>Cliente · Fazenda · Cidade</th><th>Cultivar</th><th className="n">Área (ha)</th><th>Situação</th><th>Técnico no dia</th></tr></thead>
        <tbody>
          {campos.map((c) => {
            const tecs = d.dados.programacoes.filter((p) => p.campo_id === c.id && p.data === dia && p.status !== 'cancelado');
            return (
              <tr key={c.id} className="clic" onClick={() => abrirFicha(c.id)}>
                <td><b>{c.num_campo}</b> <span className="muted">{c.categoria_colher}</span></td>
                <td>{descCampo(c)}</td>
                <td>{c.produto}</td>
                <td className="n">{n0(c.area_mapa)}</td>
                <td><Sit s={d.resumos.get(c.id)!.situacao} /></td>
                <td>{tecs.length ? tecs.map((p) => { const t = d.tecnicoPorId.get(p.tecnico_id); return t ? <TecChip key={p.id} t={t} /> : null; }) : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GrupoAlerta({ tipo, itens }: { tipo: TipoAlerta; itens: Alerta[] }) {
  const d = useDados();
  const [tudo, setTudo] = useState(false);
  const mostra = tudo ? itens : itens.slice(0, 5);
  const quando = (a: Alerta) =>
    a.faltam < 0 ? `era ${br(a.provavel)} (${-a.faltam} d atrás)` : a.faltam === 0 ? 'hoje' : a.faltam === 1 ? `amanhã, ${br(a.provavel)}` : `${br(a.provavel)} (${diaSemana(a.provavel)}, em ${a.faltam} d)`;
  return (
    <div className={'alerta ' + tipo} data-alerta={tipo}>
      <h3><span>{TITULOS[tipo]}</span><span className="qt">{itens.length}</span></h3>
      {tipo === 'vespera' && <div className="sub">Colheita provável chegando: mande alguém fazer a pré-colheita na área.</div>}
      <ul>
        {mostra.map((a) => {
          // dia sugerido para a visita: a véspera da colheita (ou hoje, se já passou)
          const dia = a.faltam <= 1 ? d.hoje : somaDias(a.provavel, -1);
          return (
            <li key={a.dessecacao.id}>
              <div>
                <button className="lk" onClick={() => abrirFicha(a.campo.id)}>{a.campo.num_campo}</button>{' '}
                <span className="sub">{[a.campo.propriedade, a.campo.cidade].filter(Boolean).join(' · ')}</span>
                <div className="sub">
                  Colheita provável {quando(a)}
                  {a.dessecacao.area_ha ? ` · ${n0(a.dessecacao.area_ha)} ha dessecados` : ''}
                </div>
                {a.programados.length > 0 && (
                  <div style={{ marginTop: 3 }}>
                    {a.programados.map((p) => <TecChip key={p.prog.id} t={p.tecnico} extra={br(p.prog.data).slice(0, 5)} />)}
                  </div>
                )}
              </div>
              {a.programados.length === 0 && (
                <button className="btn mini primary" onClick={() => ir('programacao', { data: dia, campo: a.campo.id, atividade: 'coleta_pre' })}>Programar</button>
              )}
            </li>
          );
        })}
      </ul>
      {itens.length > 5 && <button className="btn mini" style={{ marginTop: 8 }} onClick={() => setTudo(!tudo)}>{tudo ? 'Mostrar menos' : `Ver todos (${itens.length})`}</button>}
    </div>
  );
}

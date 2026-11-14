import { Fragment, useMemo, useState } from 'react';
import { Sit } from '../components/ui';
import { useDados } from '../lib/dados';
import { brCurto } from '../lib/dates';
import { baixar, csv, n0, n1, semAcento } from '../lib/format';
import { rankear, relatorioColheita, type CampoRank, type CooperadoRank } from '../lib/ranking';
import { abrirFicha } from '../lib/rota';
import { motivoDescarte } from '../lib/types';

type Col = 'intern' | 'colhido' | 'aprov' | 'pot' | 'area' | 'desc' | 'nome';
const pct = (v: number | null) => (v == null ? '—' : `${n1(v)}%`);

export default function Ranking() {
  const d = useDados();
  const P = d.dados.config.params;
  const R = useMemo(() => rankear(d.dados.campos, d.reais, d.resumos), [d.dados.campos, d.reais, d.resumos]);
  const [ord, setOrd] = useState<{ col: Col; desc: boolean }>({ col: 'intern', desc: true });
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [semEntrega, setSemEntrega] = useState(true);

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const val = (g: CooperadoRank): number | string => {
      switch (ord.col) {
        case 'colhido': return g.colhidoSc;
        case 'aprov': return g.aprovPct ?? -1;
        case 'pot': return g.potContaSc;
        case 'area': return g.area;
        case 'desc': return g.scDescartado;
        case 'nome': return g.nome;
        default: return g.internSc;
      }
    };
    const f = R.cooperados.filter((g) => (semEntrega || g.posicao != null || g.potContaSc > 0) && (!q || semAcento(g.nome).includes(q)));
    // a ordem "por volume internalizado" já vem pronta do ranking
    if (ord.col === 'intern') return ord.desc ? f : [...f].reverse();
    return [...f].sort((a, b) => {
      const x = val(a), y = val(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt');
      return (ord.desc ? -r : r) || (a.posicao ?? 1e9) - (b.posicao ?? 1e9);
    });
  }, [R, ord, busca, semEntrega]);

  const maxIntern = Math.max(1, ...R.cooperados.map((g) => g.internSc));
  const th = (col: Col, rotulo: string, n = true, dica?: string) => (
    <th className={'ord' + (n ? ' n' : '')} title={dica} onClick={() => setOrd({ col, desc: ord.col === col ? !ord.desc : col !== 'nome' })}>
      {rotulo}{ord.col === col ? (ord.desc ? ' ▾' : ' ▴') : ''}
    </th>
  );

  function exportarRanking() {
    const r = (v: number | null, casas = 0) => (v == null ? null : +v.toFixed(casas));
    const l: (string | number | null)[][] = [[
      'Posição', 'Cooperado', 'Campos', 'Colhidos', 'Em colheita', 'Descartados sem colher', 'A colher', 'Área (ha)', 'Potencial total (sc)',
      'Potencial dos campos encerrados ou em colheita (sc)', 'Colhido e entregue (sc)', 'Aprovado e internalizado (sc)', 'Participação (%)', 'Aproveitamento (%)',
      'Área descartada (ha)', 'Volume descartado (sc)',
    ]];
    for (const g of R.cooperados) {
      l.push([g.posicao, g.nome, g.campos.length, g.nColhidos, g.nEmColheita, g.nDescartados, g.nAColher, r(g.area, 1), r(g.potencialSc), r(g.potContaSc),
        r(g.colhidoSc), r(g.internSc), r(g.participacao, 1), r(g.aprovPct, 1), r(g.areaDescartada, 1), r(g.scDescartado)]);
    }
    baixar(`ranking_cooperados_${d.hoje}.csv`, csv(l), 'text/csv;charset=utf-8');
  }
  function exportarRelatorio() {
    const itens = R.cooperados.flatMap((g) => g.campos).sort((a, b) => a.campo.num_campo.localeCompare(b.campo.num_campo, 'pt', { numeric: true }));
    baixar(`relatorio_colheita_descartes_${d.hoje}.csv`, csv(relatorioColheita(itens)), 'text/csv;charset=utf-8');
  }

  const nDescartes = R.motivos.reduce((s, m) => s + m.campos, 0);

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Ranking de cooperados</h2>
            <div className="sub">Quem mais contribuiu com a produção, pelo volume aprovado e internalizado, e quanto do potencial de cada um virou semente. Clique no cooperado para ver campo a campo.</div>
          </div>
          <div className="btns">
            <button className="btn" onClick={exportarRanking}>Exportar ranking (CSV)</button>
            <button className="btn primary" onClick={exportarRelatorio}>Relatório de colheita e descartes (CSV)</button>
          </div>
        </div>
      </section>

      <div className="kpis" data-testid="kpis-ranking">
        <Kpi k="Cooperados com entrega" v={`${R.comEntrega} de ${R.cooperados.length}`} s="com volume lançado nos campos" />
        <Kpi k="Colhido e entregue na UBS" v={n0(R.colhidoSc) + ' sc'} s={`${n1((R.colhidoSc * P.kg) / 1000)} t`} />
        <Kpi k="Aprovado e internalizado" v={n0(R.internSc) + ' sc'} s={R.colhidoSc > 0 ? `${n1((R.internSc / R.colhidoSc) * 100)}% do entregue` : ''} cls="hl" />
        <Kpi k="Aproveitamento geral" v={pct(R.aprovPct)} s={`internalizado ÷ potencial de ${n0(R.potContaSc)} sc`} />
        <Kpi k="Descartado" v={n0(R.scDescartado) + ' sc'} s={`${n0(R.areaDescartada)} ha em ${nDescartes} campo(s)`} cls={R.scDescartado > 0 ? 'warn' : ''} />
      </div>

      <section className="card">
        <div className="btns" style={{ marginBottom: 12 }}>
          <input className="search" placeholder="Buscar cooperado…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <label className="check"><input type="checkbox" checked={semEntrega} onChange={(e) => setSemEntrega(e.target.checked)} /> Mostrar quem ainda não entregou</label>
          <span className="sub">Ordene clicando no título da coluna (volume ou aproveitamento).</span>
        </div>
        <div className="tbl-wrap">
          <table data-testid="tabela-ranking" className="quebra">
            <thead><tr>
              <th className="n">#</th>{th('nome', 'Cooperado', false)}<th>Campos</th>{th('area', 'Área (ha)')}
              {th('pot', 'Potencial (sc)', true, 'Área × sc/ha × aproveitamento da aba Internalização, só dos campos já colhidos, em colheita ou descartados')}
              {th('colhido', 'Colhido e entregue (sc)')}{th('intern', 'Aprovado e internalizado (sc)')}
              {th('aprov', 'Aproveitamento', true, 'Aprovado e internalizado ÷ potencial')}{th('desc', 'Descartado (sc)')}
            </tr></thead>
            <tbody>
              {lista.map((g) => {
                const sel = aberto === g.chave;
                return (
                  <Fragment key={g.chave}>
                    <tr className={'clic' + (sel ? ' sel' : '')} data-cooperado={g.nome} onClick={() => setAberto(sel ? null : g.chave)} aria-expanded={sel}>
                      <td className="n"><b>{g.posicao != null ? `${g.posicao}º` : '—'}</b></td>
                      <td><b>{g.nome}</b></td>
                      <td className="nowrap">{g.campos.length}<span className="muted"> · {resumoCampos(g)}</span></td>
                      <td className="n">{n0(g.area)}</td>
                      <td className="n">{g.potContaSc > 0 ? n0(g.potContaSc) : '—'}{g.potencialSc - g.potContaSc > 0.5 && <div className="muted">de {n0(g.potencialSc)} no total</div>}</td>
                      <td className="n">{g.colhidoSc > 0 ? n0(g.colhidoSc) : '—'}</td>
                      <td className="n">
                        {g.internSc > 0 ? <b>{n0(g.internSc)}</b> : '—'}
                        {g.internSc > 0 && <div className="medidor" title={`${n1(g.participacao)}% de tudo o que foi internalizado`}><i style={{ width: `${(g.internSc / maxIntern) * 100}%` }} /><span>{n1(g.participacao)}%</span></div>}
                      </td>
                      <td className="n">
                        {pct(g.aprovPct)}
                        {g.aprovPct != null && <div className="medidor aprov"><i style={{ width: `${Math.min(100, g.aprovPct)}%` }} /></div>}
                      </td>
                      <td className="n">{g.scDescartado > 0 ? <>{n0(g.scDescartado)}<div className="muted">{n0(g.areaDescartada)} ha</div></> : '—'}</td>
                    </tr>
                    {sel && <tr className="detalhe"><td colSpan={9}><Detalhe g={g} /></td></tr>}
                  </Fragment>
                );
              })}
              {lista.length === 0 && <tr><td colSpan={9} className="empty">{R.cooperados.length ? 'Nenhum cooperado encontrado.' : 'Nenhum campo cadastrado ainda.'}</td></tr>}
              {lista.length > 0 && (
                <tr className="tot">
                  <td colSpan={3}>Total ({R.cooperados.length} cooperados)</td><td className="n">{n0(R.cooperados.reduce((s, g) => s + g.area, 0))}</td>
                  <td className="n">{n0(R.potContaSc)}</td><td className="n">{n0(R.colhidoSc)}</td><td className="n">{n0(R.internSc)}</td><td className="n">{pct(R.aprovPct)}</td><td className="n">{n0(R.scDescartado)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {R.motivos.length > 0 && (
        <section className="card">
          <h2>Descartes por motivo</h2>
          <div className="sub" style={{ marginBottom: 10 }}>Volume previsto que deixou de vir: campos descartados sem colher e a parte que ficou para trás nos descartes parciais.</div>
          <div className="tbl-wrap">
            <table data-testid="tabela-motivos">
              <thead><tr><th>Motivo</th><th className="n">Campos</th><th className="n">Área descartada (ha)</th><th className="n">Volume descartado (sc)</th><th className="n">% do descartado</th></tr></thead>
              <tbody>
                {R.motivos.map((m) => (
                  <tr key={m.motivo}><td>{m.motivo}</td><td className="n">{m.campos}</td><td className="n">{n1(m.area)}</td><td className="n">{n0(m.sc)}</td><td className="n">{R.scDescartado > 0 ? pct((m.sc / R.scDescartado) * 100) : '—'}</td></tr>
                ))}
                <tr className="tot"><td>Total</td><td className="n">{nDescartes}</td><td className="n">{n1(R.areaDescartada)}</td><td className="n">{n0(R.scDescartado)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card note">
        <h2>Como o ranking é calculado</h2>
        <ul>
          <li><b>Posição</b>: pelo volume <b>aprovado e internalizado</b> na UBS, somando os lançamentos das fichas de todos os campos do cooperado. A barra mostra a participação dele no total.</li>
          <li><b>Potencial</b> = área do campo × sc/ha × aproveitamento, os dois da aba Internalização ({n0(P.scHa)} sc/ha e {n0(P.aprov)}%, ou o ajuste feito por campo lá). É o volume que o campo deveria internalizar. Só entram os campos já colhidos, em colheita ou descartados; campo ainda por colher não pesa contra o cooperado.</li>
          <li><b>Aproveitamento</b> = aprovado e internalizado ÷ potencial. Quem internaliza exatamente o previsto fica com 100%; acima disso, entregou mais que o esperado. É o que permite comparar quem tinha muita área e entregou pouco com quem tinha pouca área e entregou tudo. Campo descartado sem colher conta com o potencial inteiro e zero de entrega.</li>
          <li>Com a colheita em andamento e a área colhida lançada, o potencial considera só a área já colhida. A produtividade informada pelo produtor não entra aqui: ela continua só na ficha do campo.</li>
          <li><b>Descartado</b>: no descarte direto, a internalização prevista do campo inteiro (área × sc/ha × {n0(P.aprov)}%). No descarte parcial, o que sobrou: pela área colhida lançada ou, sem ela, projetado pelo volume internalizado (previsto − internalizado).</li>
        </ul>
      </section>
    </>
  );
}

function resumoCampos(g: CooperadoRank): string {
  return [
    g.nColhidos ? `${g.nColhidos} colhido(s)` : null, g.nEmColheita ? `${g.nEmColheita} em colheita` : null,
    g.nDescartados ? `${g.nDescartados} descartado(s)` : null, g.nAColher ? `${g.nAColher} a colher` : null,
  ].filter(Boolean).join(' · ');
}

function Kpi({ k, v, s, cls }: { k: string; v: string; s?: string; cls?: string }) {
  return <div className={'kpi ' + (cls ?? '')}><div className="k">{k}</div><div className="v">{v}</div><div className="s">{s}</div></div>;
}

/** Campo a campo: o que o cooperado tinha de potencial e o que de fato entregou. */
function Detalhe({ g }: { g: CooperadoRank }) {
  const descarte = (x: CampoRank) => {
    const c = x.campo;
    if (!c.descarte) return <span className="muted">—</span>;
    return (
      <span title={c.encerramento_obs ?? undefined}>
        <span className="badge desc">{c.descarte === 'total' ? 'sem colher' : 'parcial'}</span> {motivoDescarte(c.descarte_motivo)}
        <div className="muted">≈ {n0(x.real.scDescartado)} sc · {n0(x.real.areaDescartada)} ha</div>
      </span>
    );
  };
  return (
    <div className="detalhe-in" data-testid="detalhe-cooperado">
      <div className="sub" style={{ marginBottom: 8 }}>
        <b>{g.nome}</b> — {g.campos.length} campo(s), {n0(g.area)} ha. Potencial de {n0(g.potContaSc)} sc nos campos já trabalhados; internalizou {n0(g.internSc)} sc ({pct(g.aprovPct)}).
        {g.potencialSc - g.potContaSc > 0.5 && <> Ainda tem {n0(g.potencialSc - g.potContaSc)} sc de potencial em campos por colher.</>}
      </div>
      <div className="tbl-wrap" style={{ maxHeight: 360 }}>
        <table>
          <thead><tr>
            <th>Campo</th><th>Fazenda · Cidade</th><th>Cultivar</th><th className="n">Área (ha)</th><th>Situação</th><th>Colheita</th>
            <th className="n">Potencial (sc)</th><th className="n">Entregue (sc)</th><th className="n">Internalizado (sc)</th><th className="n">Aproveitamento</th><th>Descarte</th>
          </tr></thead>
          <tbody>
            {g.campos.map((x) => {
              const c = x.campo;
              return (
                <tr key={c.id} className="clic" data-campo={c.num_campo} onClick={() => abrirFicha(c.id)}>
                  <td className="nowrap"><b>{c.num_campo}</b> <span className="muted">{c.categoria_colher}</span></td>
                  <td>{[c.propriedade, c.cidade].filter(Boolean).join(' · ')}</td>
                  <td>{c.produto}</td>
                  <td className="n">{n1(x.real.areaCampo)}</td>
                  <td><Sit s={x.situacao} /></td>
                  <td className="nowrap">{c.colheita_inicio ? `${brCurto(c.colheita_inicio)} → ${c.colheita_fim ? brCurto(c.colheita_fim) : '…'}` : <span className="muted">—</span>}</td>
                  <td className="n">{n0(x.potencialSc)}{x.emAndamento && x.potContaSc < x.potencialSc - 0.5 && <div className="muted">{n0(x.potContaSc)} na área colhida</div>}</td>
                  <td className="n">{x.real.lancamentos.length ? n0(x.colhidoSc) : '—'}</td>
                  <td className="n">{x.real.lancamentos.length ? n0(x.internSc) : '—'}</td>
                  <td className="n">{pct(x.aprovPct)}{x.aprovPct != null && <div className="medidor aprov"><i style={{ width: `${Math.min(100, x.aprovPct)}%` }} /></div>}</td>
                  <td>{descarte(x)}</td>
                </tr>
              );
            })}
            <tr className="tot"><td colSpan={3}>Total</td><td className="n">{n1(g.area)}</td><td colSpan={2} /><td className="n">{n0(g.potencialSc)}</td><td className="n">{n0(g.colhidoSc)}</td><td className="n">{n0(g.internSc)}</td><td className="n">{pct(g.aprovPct)}</td><td>{g.scDescartado > 0 ? `≈ ${n0(g.scDescartado)} sc` : ''}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

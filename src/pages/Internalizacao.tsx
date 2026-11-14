import { useEffect, useMemo, useRef, useState, type MouseEvent as RME } from 'react';
import { BarraFiltros, CelulaEd, passa, useFiltros, valorDim } from '../components/ui';
import { useDados } from '../lib/dados';
import { br, brCurto, diaSemana, diaSemanaN, dn, iso, segunda } from '../lib/dates';
import { baixar, csv, n0, n1, num, semAcento } from '../lib/format';
import { areaDe, inicioColheita, marcasY, maxBonito, ORIGENS, projetar, type DiaProj, type Unidade } from '../lib/projecao';
import { abrirFicha } from '../lib/rota';
import { CONFIG_PADRAO, type AreaBase, type Campo, type Parametros } from '../lib/types';

const GRUPOS: [string, string][] = [
  ['produto', 'Cultivar (Produto)'], ['obtentor', 'Obtentor'], ['categoria_colher', 'Categoria a colher'], ['cidade', 'Cidade'],
  ['cliente', 'Cliente'], ['acao', 'Ação (SIGEF)'], ['proprio_terceiro', 'Próprio/Terceiro'],
];
const eixo = (v: number) => (v >= 1e6 ? n1(v / 1e6).replace(/,0$/, '') + ' mi' : v >= 1000 ? n0(v / 1000) + ' mil' : n0(v));
// rótulo do 1º dia só quando a próxima segunda-feira está longe o bastante para não encavalar
const rotular = (k: number, i: number) => diaSemanaN(k) === 1 || (i === 0 && (8 - diaSemanaN(k)) % 7 >= 3);
const brk = (k: number) => br(iso(k));
const brsk = (k: number) => brCurto(iso(k));
const wdk = (k: number) => diaSemana(iso(k));

function useLargura(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const f = () => setW(Math.max(el.clientWidth, 600));
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export default function Internalizacao() {
  const d = useDados();
  const P = d.dados.config.params;
  const [filtros, setFiltros] = useFiltros('ctc_filtros_intern');
  const [selDia, setSelDia] = useState<number | null>(null);
  const [busca, setBusca] = useState('');

  const setP = (patch: Partial<Parametros>) => d.salvarConfig({ ...d.dados.config, params: { ...P, ...patch } });
  const ativos = useMemo(() => d.dados.campos.filter((c) => c.ativo), [d.dados.campos]);
  const filtrados = useMemo(() => ativos.filter((c) => passa(c, filtros)), [ativos, filtros]);
  // campo descartado sem colher sai da projeção; no descarte parcial só entra a área de fato colhida
  const descartada = useMemo(() => new Map([...d.reais].map(([id, r]) => [id, r.areaDescartada])), [d.reais]);
  const R = useMemo(() => projetar(filtrados, d.provaveis, P, descartada), [filtrados, d.provaveis, P, descartada]);

  const { unidades, dias, total, semData } = R;
  const area = unidades.reduce((s, u) => s + u.area, 0);
  const bruto = unidades.reduce((s, u) => s + u.bruto, 0);
  const pico = dias.reduce<DiaProj | null>((m, x) => (x.aprov > (m?.aprov ?? -1) ? x : m), null);
  const d50 = dias.find((x) => x.pct >= 0.5);
  const d90 = dias.find((x) => x.pct >= 0.9);
  const acima = P.cap > 0 ? dias.filter((x) => x.aprov > P.cap) : [];
  const ex100 = 100 * P.scHa;
  const ex = (ex100 * P.aprov) / 100;
  const diaSel = selDia == null ? null : (dias.find((x) => x.k === selDia) ?? null);
  // realizado: volume aprovado e internalizado lançado nas fichas dos campos filtrados
  const realizado = filtrados.reduce((s, c) => s + (d.reais.get(c.id)?.internSc ?? 0), 0);
  const comVolume = filtrados.filter((c) => (d.reais.get(c.id)?.lancamentos.length ?? 0) > 0).length;

  const numP = (k: keyof Parametros, min?: number) => ({
    type: 'number' as const,
    value: String(P[k]),
    onChange: (e: { target: { value: string } }) => {
      const v = num(e.target.value);
      if (v == null) return;
      setP({ [k]: min != null && v < min ? min : v } as Partial<Parametros>);
    },
  });

  function csvDiario() {
    const l: (string | number)[][] = [['Data', 'Dia', 'Área colhida (ha)', 'Sacos potenciais', 'Sacos aproveitados', 'Toneladas', 'Acumulado (sc)', 'Acumulado (%)', 'Campos colhendo']];
    for (const x of dias) l.push([brk(x.k), wdk(x.k), +x.ha.toFixed(2), Math.round(x.bruto), Math.round(x.aprov), +((x.aprov * P.kg) / 1000).toFixed(1), Math.round(x.acc), +(x.pct * 100).toFixed(1), x.itens.length]);
    baixar(`internalizacao_diaria_${d.hoje}.csv`, csv(l), 'text/csv;charset=utf-8');
  }
  function csvCampos() {
    const l: (string | number | null)[][] = [['Campo', 'Cat.', 'Cliente', 'Fazenda', 'Cidade', 'Cultivar', 'Área (ha)', 'Início', 'Origem', 'Fim', 'Dias', 'ha/dia', 'sc/ha', 'Aprov. %', 'Sacos potenciais', 'Sacos aproveitados']];
    for (const u of [...unidades].sort((a, b) => a.t0 - b.t0)) {
      const c = u.campo;
      l.push([c.num_campo, c.categoria_colher, c.cliente, c.propriedade, c.cidade, c.produto, +u.area.toFixed(2), brk(u.ini), ORIGENS[u.origem], brk(u.fim), +u.ndias.toFixed(1), +u.haDia.toFixed(1), u.scHa, u.aprov, Math.round(u.bruto), Math.round(u.aprovSc)]);
    }
    baixar(`internalizacao_campos_${d.hoje}.csv`, csv(l), 'text/csv;charset=utf-8');
  }

  return (
    <>
      <section className="card panel">
        <div className="card-head">
          <div>
            <h2>Painel de parâmetros (editável)</h2>
            <div className="sub">Altere os valores para simular cenários. Tudo é recalculado na hora e fica salvo para toda a equipe.</div>
          </div>
          <div className="btns">
            <button className="btn" onClick={() => setP({ ...CONFIG_PADRAO.params })}>Restaurar parâmetros padrão</button>
            <button className="btn" onClick={() => {
              const ids = d.dados.campos.filter((c) => c.ov_inicio || c.ov_ha_dia != null || c.ov_sc_ha != null || c.ov_aprov != null || !c.incluir_projecao).map((c) => c.id);
              if (!ids.length) return d.avisar('Não há ajustes por campo.');
              if (confirm(`Limpar os ajustes de ${ids.length} campo(s)?`)) void d.atualizarCampos(ids, { ov_inicio: null, ov_ha_dia: null, ov_sc_ha: null, ov_aprov: null, incluir_projecao: true }, 'Ajustes por campo limpos.');
            }}>Limpar ajustes por campo</button>
          </div>
        </div>
        <div className="params">
          <div className="param"><label htmlFor="pHaDia">Capacidade de colheita por campo (ha/dia)</label><input id="pHaDia" min={1} step={5} {...numP('haDia', 1)} /><div className="hint">Padrão: 120 ha/dia</div></div>
          <div className="param"><label htmlFor="pScHa">Produtividade média (sc/ha)</label><input id="pScHa" min={0} step={1} {...numP('scHa', 0)} /><div className="hint">Padrão: 65 sc/ha</div></div>
          <div className="param"><label htmlFor="pAprov">Aproveitamento estimado (%)</label><input id="pAprov" min={0} max={100} step={1} {...numP('aprov', 0)} /><div className="hint">Padrão: 70%</div></div>
          <div className="param"><label htmlFor="pKg">Peso do saco (kg)</label><input id="pKg" min={1} step={1} {...numP('kg', 1)} /><div className="hint">Padrão: 60 kg (usado nas toneladas)</div></div>
          <div className="param"><label htmlFor="pArea">Área considerada</label>
            <select id="pArea" value={P.area} onChange={(e) => setP({ area: e.target.value as AreaBase })}>
              <option value="area_mapa">Área MAPA</option><option value="area_projetada">Área Projetada</option><option value="area_real">Área Real</option>
            </select>
            <div className="hint">Coluna da planilha usada como área do campo</div></div>
          <div className="param"><label htmlFor="pDesloc">Antecipar (−) / atrasar (+) colheita (dias)</label><input id="pDesloc" step={1} {...numP('desloc')} /><div className="hint">Vale para datas vindas da planilha (ex.: chuva = +3)</div></div>
          <div className="param"><label htmlFor="pCap">Capacidade de recebimento da UBS (sc/dia)</label><input id="pCap" min={0} step={500} {...numP('cap', 0)} /><div className="hint">0 = não mostrar. Marca dias acima da capacidade</div></div>
          <div className="param"><label htmlFor="pPres">Plantio presumido p/ campos sem data</label><input id="pPres" type="date" value={P.pres} onChange={(e) => setP({ pres: e.target.value })} /><div className="hint">Vazio = campos sem data ficam fora. Colheita = plantio + ciclo</div></div>
        </div>
        <div className="formula">
          Exemplo com os parâmetros atuais: um campo de <b>100 ha</b> é colhido em <b>{n1(100 / P.haDia)} dia(s)</b>; rende <b>{n0(ex100)} sc</b> se 100% aproveitado, e <b>{n0(ex)} sc</b> com {n0(P.aprov)}% de aproveitamento ({n1((ex * P.kg) / 1000)} t).
        </div>
      </section>

      <section className="card">
        <div className="card-head" style={{ marginBottom: 8 }}>
          <div><h2>Filtros</h2><div className="sub">Restringem quais campos entram na projeção.</div></div>
        </div>
        <BarraFiltros campos={ativos} filtros={filtros} onMudar={setFiltros} />
      </section>

      <div className="kpis">
        <Kpi k="Área em colheita" v={n0(area) + ' ha'} s={`${unidades.length} campos`} />
        <Kpi k="Sacos potenciais (100%)" v={n0(bruto) + ' sc'} s={`${n0(P.scHa)} sc/ha (média do painel)`} />
        <Kpi k="Sacos aproveitados" v={n0(total) + ' sc'} s={`${n1((total * P.kg) / 1000)} t · aproveitamento ${n0(bruto ? (total / bruto) * 100 : 0)}%`} cls="hl" />
        <Kpi k="Internalizado real (UBS)" v={n0(realizado) + ' sc'} s={comVolume ? `${n0(total ? (realizado / total) * 100 : 0)}% do estimado · ${comVolume} campo(s) com volume lançado` : 'lance o volume colhido na ficha do campo'} />
        <Kpi k="Período de colheita" v={dias.length ? `${brsk(dias[0].k)} → ${brsk(dias[dias.length - 1].k)}` : '—'} s={dias.length ? `${dias.length} dias corridos` : ''} />
        <Kpi k="Pico diário" v={pico ? n0(pico.aprov) + ' sc' : '—'} s={pico ? `${brk(pico.k)} (${wdk(pico.k)}) · ${n0(pico.ha)} ha` : ''} />
        <Kpi k="Média diária" v={n0(dias.length ? total / dias.length : 0) + ' sc/dia'} s={`50% até ${d50 ? brsk(d50.k) : '—'} · 90% até ${d90 ? brsk(d90.k) : '—'}`} />
        {P.cap > 0 && <Kpi k="Dias acima da capacidade UBS" v={`${acima.length} dia(s)`} s={acima.length ? `excedente total ${n0(acima.reduce((s, x) => s + x.aprov - P.cap, 0))} sc` : `capacidade ${n0(P.cap)} sc/dia`} cls={acima.length ? 'warn' : ''} />}
        <Kpi k="Fora da projeção (sem data)" v={`${semData.length} campos`} s={`${n0(semData.reduce((s, c) => s + areaDe(c, P), 0))} ha sem data de plantio`} />
      </div>

      <section className="card">
        <div className="card-head">
          <div><h2>Sacos aproveitados por dia</h2><div className="sub">Clique em uma barra para ver quais campos estão colhendo naquele dia.</div></div>
          <div className="legend">
            <span><i style={{ background: 'var(--series-1)' }} />Sacos aproveitados/dia</span>
            {P.cap > 0 && <><span><i style={{ background: 'var(--series-2)' }} />Dia acima da capacidade UBS</span><span><i className="line" />Capacidade UBS</span></>}
          </div>
        </div>
        <GraficoDiario dias={dias} cap={P.cap} sel={selDia} hoje={dn(d.hoje)} onSel={(k) => setSelDia(selDia === k ? null : k)} />
      </section>

      {diaSel && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Campos colhendo em {brk(diaSel.k)} ({wdk(diaSel.k)})</h2>
              <div className="sub">{diaSel.itens.length} campo(s) · {n0(diaSel.ha)} ha · {n0(diaSel.aprov)} sc aproveitados ({n1((diaSel.aprov * P.kg) / 1000)} t)</div>
            </div>
            <button className="btn" onClick={() => setSelDia(null)}>Fechar</button>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 360 }}>
            <table>
              <thead><tr><th>Campo</th><th>Cliente</th><th>Cidade</th><th>Cultivar</th><th>Cat.</th><th className="n">ha no dia</th><th className="n">Sacos pot.</th><th className="n">Sacos aprov.</th><th>Colheita do campo</th></tr></thead>
              <tbody>
                {[...diaSel.itens].sort((a, b) => b.aprov - a.aprov).map((it) => (
                  <tr key={it.u.campo.id} className="clic" onClick={() => abrirFicha(it.u.campo.id)}>
                    <td><b>{it.u.campo.num_campo}</b></td><td>{it.u.campo.cliente}</td><td>{it.u.campo.cidade}</td><td>{it.u.campo.produto}</td><td>{it.u.campo.categoria_colher}</td>
                    <td className="n">{n1(it.ha)}</td><td className="n">{n0(it.bruto)}</td><td className="n">{n0(it.aprov)}</td>
                    <td>{brsk(it.u.ini)} → {brsk(it.u.fim)} ({n1(it.u.ndias)} d)</td>
                  </tr>
                ))}
                <tr className="tot"><td colSpan={5}>Total do dia</td><td className="n">{n1(diaSel.ha)}</td><td className="n">{n0(diaSel.bruto)}</td><td className="n">{n0(diaSel.aprov)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <div><h2>Produção aproveitada acumulada</h2><div className="sub">{dias.length ? `Total de ${n0(total)} sc (${n1((total * P.kg) / 1000)} t) entre ${brk(dias[0].k)} e ${brk(dias[dias.length - 1].k)}.` : ''}</div></div>
        </div>
        <GraficoAcumulado dias={dias} total={total} />
      </section>

      <section className="card">
        <div className="card-head">
          <div><h2>Sacos aproveitados por semana</h2><div className="sub">Semanas de segunda a domingo. Cor mais escura = mais sacos.</div></div>
          <div className="param" style={{ minWidth: 200 }}><label htmlFor="pGrupo">Abrir por</label>
            <select id="pGrupo" value={P.grupo} onChange={(e) => setP({ grupo: e.target.value })}>
              {GRUPOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select></div>
        </div>
        <TabelaSemanal dias={dias} grupo={GRUPOS.some(([k]) => k === P.grupo) ? P.grupo : 'produto'} />
      </section>

      <section className="card">
        <details className="sec">
          <summary>Tabela diária</summary>
          <div className="btns" style={{ margin: '10px 0' }}><button className="btn" onClick={csvDiario}>Exportar CSV (diário)</button></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Data</th><th>Dia</th><th className="n">Área (ha)</th><th className="n">Sacos pot.</th><th className="n">Sacos aprov.</th><th className="n">Toneladas</th><th className="n">Acumulado</th><th className="n">%</th><th className="n">Campos</th></tr></thead>
              <tbody>
                {dias.map((x) => (
                  <tr key={x.k} className={'clic' + (P.cap > 0 && x.aprov > P.cap ? ' over' : '')} onClick={() => setSelDia(x.k)}>
                    <td>{brk(x.k)}</td><td>{wdk(x.k)}</td><td className="n">{n1(x.ha)}</td><td className="n">{n0(x.bruto)}</td><td className="n">{n0(x.aprov)}</td>
                    <td className="n">{n1((x.aprov * P.kg) / 1000)}</td><td className="n">{n0(x.acc)}</td><td className="n">{n0(x.pct * 100)}%</td><td className="n">{x.itens.length}</td>
                  </tr>
                ))}
                {dias.length > 0 && <tr className="tot"><td colSpan={2}>Total</td><td className="n">{n0(area)}</td><td className="n">{n0(bruto)}</td><td className="n">{n0(total)}</td><td className="n">{n1((total * P.kg) / 1000)}</td><td colSpan={3} /></tr>}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="card">
        <div className="card-head">
          <div><h2>Programação por campo</h2>
            <div className="sub">Células amarelas são editáveis por campo (início da colheita, ha/dia, sc/ha, aproveitamento). Desmarque “Incluir” para tirar o campo da projeção. Em branco = usa o painel.</div></div>
          <div className="btns"><input className="search" placeholder="Buscar campo, cliente, cultivar, cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} /><button className="btn" onClick={csvCampos}>Exportar CSV (campos)</button></div>
        </div>
        <TabelaCampos campos={filtrados} unidades={unidades} busca={busca} P={P} />
      </section>

      <section className="card note">
        <h2>Como a projeção é calculada</h2>
        <ul>
          <li><b>Início da colheita</b>, por prioridade: colheita já iniciada (ficha do campo) → início digitado na tabela acima → data provável da dessecação (dessecação + dias) → “Data colheita” da planilha mais o deslocamento do painel → plantio presumido + ciclo.</li>
          <li>Cada campo colhe no máximo a <b>capacidade em ha/dia</b> a partir do início. Ex.: 156 ha a 120 ha/dia → 120 ha no 1º dia e 36 ha no 2º. Campos com colheita encerrada têm a área distribuída pelos dias realmente colhidos.</li>
          <li>Linhas da planilha com o mesmo nº de campo e a mesma categoria a colher já entram somadas como um único campo.</li>
          <li><b>Sacos potenciais</b> = ha colhidos × sc/ha. <b>Sacos aproveitados</b> = sacos potenciais × aproveitamento %. Toneladas = sacos × peso do saco ÷ 1000.</li>
          <li>Campos sem data ficam fora da projeção, a menos que se informe um plantio presumido no painel ou um início na tabela de campos.</li>
        </ul>
      </section>
    </>
  );
}

function Kpi({ k, v, s, cls }: { k: string; v: string; s?: string; cls?: string }) {
  return <div className={'kpi ' + (cls ?? '')}><div className="k">{k}</div><div className="v">{v}</div><div className="s">{s}</div></div>;
}

function GraficoDiario({ dias, cap, sel, hoje, onSel }: { dias: DiaProj[]; cap: number; sel: number | null; hoje: number; onSel: (k: number) => void }) {
  const [ref, W] = useLargura();
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  if (!dias.length) return <div className="chart" ref={ref}><div className="empty">Nenhum campo com data de colheita nos filtros atuais.</div></div>;
  const H = 320, m = { l: 58, r: 14, t: 14, b: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ymax = maxBonito(Math.max(...dias.map((x) => x.aprov), cap || 0) * 1.05);
  const bw = iw / dias.length, barW = Math.max(2, Math.min(18, bw * 0.72));
  const y = (v: number) => m.t + ih - (v / ymax) * ih;
  const mover = (e: RME<SVGRectElement>, i: number) => {
    const r = ref.current!.getBoundingClientRect();
    setTip({ i, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const t = tip ? dias[tip.i] : null;
  const iHoje = hoje - dias[0].k;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sacos aproveitados por dia" onMouseLeave={() => setTip(null)}>
        {marcasY(ymax).map((v) => (
          <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" /><text x={m.l - 8} y={y(v) + 4} textAnchor="end">{eixo(v)}</text></g>
        ))}
        <text x={12} y={m.t + ih / 2} transform={`rotate(-90 12 ${m.t + ih / 2})`} textAnchor="middle">sacos/dia</text>
        {iHoje >= 0 && iHoje < dias.length && (
          <g><line x1={m.l + bw * iHoje + bw / 2} x2={m.l + bw * iHoje + bw / 2} y1={m.t} y2={m.t + ih} stroke="var(--axis)" strokeDasharray="3 3" />
            <text x={m.l + bw * iHoje + bw / 2 + 4} y={m.t + 10}>hoje</text></g>
        )}
        {dias.map((x, i) => {
          const cx = m.l + bw * i + bw / 2;
          const x0 = cx - barW / 2, y0 = y(x.aprov), h = m.t + ih - y0, r = Math.min(4, barW / 2, h);
          return (
            <g key={x.k}>
              {x.aprov > 0 && (
                <path d={`M${x0},${m.t + ih} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barW - r} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} V${m.t + ih} Z`}
                  fill={cap > 0 && x.aprov > cap ? 'var(--series-2)' : 'var(--series-1)'} opacity={sel != null && sel !== x.k ? 0.45 : 1} />
              )}
              {rotular(x.k, i) && (
                <><line x1={cx} x2={cx} y1={m.t + ih} y2={m.t + ih + 4} stroke="var(--axis)" /><text x={cx} y={m.t + ih + 17} textAnchor="middle">{brsk(x.k)}</text></>
              )}
            </g>
          );
        })}
        <line x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} stroke="var(--axis)" />
        <text x={m.l + iw / 2} y={H - 6} textAnchor="middle">marcas nas segundas-feiras</text>
        {cap > 0 && (
          <><line x1={m.l} x2={W - m.r} y1={y(cap)} y2={y(cap)} stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={m.l + 6} y={y(cap) - 6} style={{ fill: 'var(--text-primary)', paintOrder: 'stroke', stroke: 'var(--surface-1)', strokeWidth: 3 }}>Capacidade UBS {n0(cap)} sc/dia</text></>
        )}
        {dias.map((x, i) => (
          <rect key={x.k} data-dia={iso(x.k)} x={m.l + bw * i} y={m.t} width={bw} height={ih} fill="transparent" style={{ cursor: 'pointer' }}
            onMouseMove={(e) => mover(e, i)} onClick={() => onSel(x.k)} />
        ))}
      </svg>
      {t && tip && (
        <div className="tip" style={{ left: tip.x + 14 + 200 > W ? tip.x - 210 : tip.x + 14, top: tip.y + 14 }}>
          <div className="t">{brk(t.k)} ({wdk(t.k)})</div>
          <div className="r"><span>Sacos aproveitados</span><b>{n0(t.aprov)}</b></div>
          <div className="r"><span>Sacos potenciais</span><b>{n0(t.bruto)}</b></div>
          <div className="r"><span>Área colhida</span><b>{n0(t.ha)} ha</b></div>
          <div className="r"><span>Campos colhendo</span><b>{t.itens.length}</b></div>
          <div className="r"><span>Acumulado</span><b>{n0(t.acc)} ({n0(t.pct * 100)}%)</b></div>
          {cap > 0 && t.aprov > cap && <div className="warn">▲ {n0(t.aprov - cap)} sc acima da capacidade</div>}
        </div>
      )}
    </div>
  );
}

function GraficoAcumulado({ dias, total }: { dias: DiaProj[]; total: number }) {
  const [ref, W] = useLargura();
  if (!dias.length || !(total > 0)) return <div className="chart" ref={ref}><div className="empty">Sem dados.</div></div>;
  const H = 260, m = { l: 58, r: 46, t: 14, b: 34 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ymax = maxBonito(total);
  const x = (i: number) => m.l + (dias.length === 1 ? iw / 2 : (iw * i) / (dias.length - 1));
  const y = (v: number) => m.t + ih - (v / ymax) * ih;
  const linha = dias.map((dd, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(dd.acc).toFixed(1)}`).join(' ');
  const areaP = `${linha} L${x(dias.length - 1).toFixed(1)},${m.t + ih} L${x(0).toFixed(1)},${m.t + ih} Z`;
  const marcos = [0.25, 0.5, 0.75, 0.9].map((p) => ({ p, i: dias.findIndex((dd) => dd.pct >= p) })).filter((q) => q.i >= 0);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Produção aproveitada acumulada">
        {marcasY(ymax).map((v) => (
          <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" /><text x={m.l - 8} y={y(v) + 4} textAnchor="end">{eixo(v)}</text></g>
        ))}
        <path d={areaP} fill="var(--series-1)" opacity={0.12} />
        <path d={linha} fill="none" stroke="var(--series-1)" strokeWidth={2} />
        {dias.map((dd, i) => rotular(dd.k, i) && (
          <g key={dd.k}><line x1={x(i)} x2={x(i)} y1={m.t + ih} y2={m.t + ih + 4} stroke="var(--axis)" /><text x={x(i)} y={m.t + ih + 17} textAnchor="middle">{brsk(dd.k)}</text></g>
        ))}
        {marcos.map(({ p, i }) => (
          <g key={p}><circle cx={x(i)} cy={y(dias[i].acc)} r={4} fill="var(--surface-1)" stroke="var(--series-1)" strokeWidth={2} />
            <text x={x(i) + 7} y={y(dias[i].acc) + 14} style={{ fill: 'var(--text-primary)', paintOrder: 'stroke', stroke: 'var(--surface-1)', strokeWidth: 3 }}>{n0(p * 100)}% em {brsk(dias[i].k)}</text></g>
        ))}
        <line x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} stroke="var(--axis)" />
      </svg>
    </div>
  );
}

function TabelaSemanal({ dias, grupo }: { dias: DiaProj[]; grupo: string }) {
  const { semanas, linhas, totSem, max } = useMemo(() => {
    const sem = new Set<number>();
    const mapa = new Map<string, Map<number, number>>();
    const tot = new Map<number, number>();
    for (const x of dias) {
      const s = segunda(x.k);
      for (const it of x.itens) {
        if (!(it.aprov > 0)) continue;
        sem.add(s);
        const g = valorDim(it.u.campo, grupo);
        if (!mapa.has(g)) mapa.set(g, new Map());
        const mg = mapa.get(g)!;
        mg.set(s, (mg.get(s) ?? 0) + it.aprov);
        tot.set(s, (tot.get(s) ?? 0) + it.aprov);
      }
    }
    const semanas = [...sem].sort((a, b) => a - b);
    const linhas = [...mapa.entries()].map(([g, mg]) => ({ g, mg, total: [...mg.values()].reduce((s, v) => s + v, 0) })).sort((a, b) => b.total - a.total);
    let max = 0;
    for (const l of linhas) for (const v of l.mg.values()) max = Math.max(max, v);
    return { semanas, linhas, totSem: tot, max };
  }, [dias, grupo]);
  if (!semanas.length) return <div className="empty">Sem dados.</div>;
  const cor = (v: number) => (v > 0 ? { background: `color-mix(in srgb, var(--series-1) ${Math.round(8 + 62 * (v / max))}%, transparent)` } : undefined);
  return (
    <div className="tbl-wrap heat">
      <table>
        <thead><tr><th>{GRUPOS.find(([k]) => k === grupo)?.[1]}</th>{semanas.map((s) => <th key={s} className="n">{brsk(s)}</th>)}<th className="n">Total</th></tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.g}><td className="nowrap">{l.g}</td>
              {semanas.map((s) => { const v = l.mg.get(s) ?? 0; return <td key={s} className="c" style={cor(v)}>{v > 0 ? n0(v) : ''}</td>; })}
              <td className="n"><b>{n0(l.total)}</b></td></tr>
          ))}
          <tr className="tot"><td>Total</td>{semanas.map((s) => <td key={s} className="n">{n0(totSem.get(s) ?? 0)}</td>)}<td className="n">{n0([...totSem.values()].reduce((a, b) => a + b, 0))}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function TabelaCampos({ campos, unidades, busca, P }: { campos: Campo[]; unidades: Unidade[]; busca: string; P: Parametros }) {
  const d = useDados();
  const porId = useMemo(() => new Map(unidades.map((u) => [u.campo.id, u])), [unidades]);
  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const f = q ? campos.filter((c) => semAcento([c.num_campo, c.cliente, c.produto, c.cidade, c.propriedade].filter(Boolean).join(' ')).includes(q)) : campos;
    const chave = (c: Campo) => porId.get(c.id)?.t0 ?? inicioColheita(c, d.provaveis.get(c.id), P)?.k ?? Infinity;
    return [...f].sort((a, b) => chave(a) - chave(b) || a.num_campo.localeCompare(b.num_campo, 'pt', { numeric: true }));
  }, [campos, busca, porId, d.provaveis, P]);
  const patch = (c: Campo, p: Partial<Campo>) => void d.atualizarCampos([c.id], p);
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Incluir</th><th>Campo</th><th>Cliente</th><th>Cidade</th><th>Cultivar</th><th>Cat.</th><th className="n">Área (ha)</th>
          <th>Início</th><th>Origem</th><th>Início manual</th><th className="n">ha/dia</th><th className="n">sc/ha</th><th className="n">Aprov. %</th>
          <th>Fim</th><th className="n">Dias</th><th className="n">Sacos aprov.</th></tr></thead>
        <tbody>
          {lista.map((c) => {
            const u = porId.get(c.id);
            return (
              <tr key={c.id} className={c.incluir_projecao ? '' : 'off'}>
                <td><input type="checkbox" checked={c.incluir_projecao} aria-label={`Incluir ${c.num_campo}`} onChange={(e) => patch(c, { incluir_projecao: e.target.checked })} /></td>
                <td><button className="btn mini" onClick={() => abrirFicha(c.id)}>{c.num_campo}</button></td>
                <td>{c.cliente}</td><td>{c.cidade}</td><td>{c.produto}</td><td>{c.categoria_colher}</td>
                <td className="n">{n1(areaDe(c, P))}</td>
                <td className="nowrap">{u ? brk(u.ini) : <span className="muted">sem data</span>}</td>
                <td>{u ? <span className={'badge' + (u.origem === 'manual' || u.origem === 'real' ? ' man' : u.origem === 'presumida' || u.origem === 'dessecacao' ? ' pres' : '')}>{ORIGENS[u.origem]}</span> : ''}</td>
                <td><CelulaEd tipo="date" valor={c.ov_inicio ?? ''} onGravar={(v) => patch(c, { ov_inicio: v || null })} rotulo={`Início manual ${c.num_campo}`} /></td>
                <td className="n"><CelulaEd tipo="number" valor={c.ov_ha_dia} placeholder={String(P.haDia)} onGravar={(v) => patch(c, { ov_ha_dia: num(v) })} rotulo={`ha/dia ${c.num_campo}`} /></td>
                <td className="n"><CelulaEd tipo="number" valor={c.ov_sc_ha} placeholder={String(P.scHa)} onGravar={(v) => patch(c, { ov_sc_ha: num(v) })} rotulo={`sc/ha ${c.num_campo}`} /></td>
                <td className="n"><CelulaEd tipo="number" valor={c.ov_aprov} placeholder={String(P.aprov)} onGravar={(v) => patch(c, { ov_aprov: num(v) })} rotulo={`Aproveitamento ${c.num_campo}`} /></td>
                <td className="nowrap">{u ? brk(u.fim) : ''}</td>
                <td className="n">{u ? n1(u.ndias) : ''}</td>
                <td className="n">{u ? n0(u.aprovSc) : ''}</td>
              </tr>
            );
          })}
          {lista.length === 0 && <tr><td colSpan={16} className="empty">Nenhum campo nos filtros atuais.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

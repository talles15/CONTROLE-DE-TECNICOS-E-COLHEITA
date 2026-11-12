import { useEffect, useRef, useState, type MouseEvent as RME } from 'react';
import { CelulaEd, Modal } from '../components/ui';
import { useDados } from '../lib/dados';
import { br } from '../lib/dates';
import { baixar, csv, n0, n1, n2f as n2, num } from '../lib/format';
import { metaInternDe, scPorSc200, type LinhaMeta, type SituacaoMeta } from '../lib/metas';
import { maxBonito } from '../lib/projecao';
import { ir } from '../lib/rota';
import type { NovaMeta } from '../lib/store';
import { CONFIG_PADRAO, type ParametrosMetas } from '../lib/types';

const SITUACAO: Record<SituacaoMeta, { rotulo: string; cls: string; icone: string }> = {
  alerta: { rotulo: 'Falta volume a colher', cls: 'ruim', icone: '▲' },
  no_caminho: { rotulo: 'Dá para fechar', cls: 'medio', icone: '●' },
  atingida: { rotulo: 'Meta atingida', cls: 'bom', icone: '✔' },
  sem_meta: { rotulo: 'Sem meta', cls: '', icone: '' },
};
const sinal = (v: number, casas: (x: number) => string = n0) => (v > 0 ? '+' : '') + casas(v);
const eixo = (v: number) => (Math.abs(v) >= 1000 ? n0(v / 1000) + ' mil' : n0(v));

export default function Metas() {
  const d = useDados();
  const R = d.resumoMetas;
  const P = d.dados.config.params;
  const M = d.dados.config.metas;
  const [edit, setEdit] = useState<LinhaMeta | 'nova' | null>(null);

  const setM = (patch: Partial<ParametrosMetas>) => d.salvarConfig({ ...d.dados.config, metas: { ...M, ...patch } });
  const numM = (k: keyof ParametrosMetas, min: number, max?: number) => ({
    type: 'number' as const,
    value: String(M[k]),
    onChange: (e: { target: { value: string } }) => {
      const v = num(e.target.value);
      if (v == null) return;
      setM({ [k]: Math.min(max ?? Infinity, Math.max(min, v)) } as Partial<ParametrosMetas>);
    },
  });

  const comMeta = R.linhas.filter((l) => l.metaIntern != null && l.metaIntern > 0);
  const semMeta = R.linhas.filter((l) => !(l.metaIntern != null && l.metaIntern > 0));
  const painel = [...comMeta, ...semMeta.filter((l) => l.intern > 0)];
  const kg1 = scPorSc200(M.pms, P.kg) * P.kg;

  /** grava só os big bags planejados, mantendo o resto da meta da cultivar */
  function gravarBB(l: LinhaMeta, texto: string) {
    const bb = num(texto);
    if (bb != null && bb < 0) return d.avisar('Informe um nº de big bags válido.', 'erro');
    if (bb == null && !l.meta) return;
    void d.salvarMeta({ ...baseMeta(l), meta_sc200: bb == null ? null : bb * M.sc200PorBB }, `Meta de ${l.cultivar} salva.`);
  }

  function exportar() {
    const l: (string | number | null)[][] = [[
      'Cultivar', 'Big bags planejados', 'Sacos de 200 mil', 'Semente pronta (sc)', 'PMS (g)', 'Rendimento UBS (%)', 'Meta internalização (sc)',
      'Internalizado (sc)', 'GAP (sc)', '% atingimento', 'Falta internalizar (sc)', 'Campos a colher', 'Área a colher (ha)', 'Previsto a colher (sc)',
      'Saldo (sc)', 'Área necessária (ha)', 'Big bags prontos', 'Big bags projetados', 'Situação',
    ]];
    const r = (v: number | null, casas = 0) => (v == null ? null : +v.toFixed(casas));
    for (const x of R.linhas) {
      l.push([x.cultivar, r(x.metaBB, 1), r(x.metaSc200), r(x.metaSc60), x.pms, x.rend, r(x.metaIntern), r(x.intern), r(x.gap), r(x.pct, 1), r(x.falta),
        x.camposAColher, r(x.areaDisp, 1), r(x.scDisp), r(x.saldo), r(x.areaNecessaria, 1), r(x.bbProntos, 1), r(x.bbProjetados, 1), SITUACAO[x.situacao].rotulo]);
    }
    baixar(`metas_cultivar_${d.hoje}.csv`, csv(l), 'text/csv;charset=utf-8');
  }

  return (
    <>
      <section className="dash" data-testid="dash-metas">
        <div className="dash-faixa">
          <h2>Acompanhamento de internalização e produção</h2>
          <span>Safra 26/27</span>
        </div>
        <div className="dash-kpis">
          <div><span>Data</span><b className="menor">{br(d.hoje)}</b></div>
          <div><span>Meta total · sc {n0(P.kg)} kg</span><b>{n0(R.metaIntern)}</b><small>matéria-prima bruta a internalizar</small></div>
          <div className="dest"><span>Total internalizado · sc {n0(P.kg)} kg</span><b>{n0(R.intern)}</b><small>{R.pct != null ? `${n1(R.pct)}% da meta` : 'aprovado e internalizado na UBS'}</small></div>
          <div>
            <span>GAP total</span>
            <b>{R.metaIntern > 0 ? sinal(R.gap) : '—'}{R.metaIntern > 0 && <i className={'seta ' + (R.gap >= 0 ? 'bom' : 'ruim')} aria-label={R.gap >= 0 ? 'acima da meta' : 'abaixo da meta'}>{R.gap >= 0 ? '▲' : '▼'}</i>}</b>
            <small>{R.gap >= 0 ? 'acima da meta' : `ainda há ≈ ${n0(R.scDisp)} sc a colher (${n0(R.areaDisp)} ha)`}</small>
          </div>
        </div>
      </section>

      {d.dados.faltaMigracao && <div className="caixa-info atencao">As metas só podem ser gravadas depois de rodar <b>supabase/migrations/0002_colheita_real_e_metas.sql</b> no SQL Editor do Supabase.</div>}

      {R.alertas.length > 0 && (
        <section className="alerta atrasado" data-testid="alerta-metas" style={{ marginBottom: 16 }}>
          <h3><span>▲ Demanda maior que o disponível para colher</span><span className="qt">{R.alertas.length}</span></h3>
          <div className="sub">O que falta internalizar nestas cultivares é mais do que os campos ainda por colher devem entregar.</div>
          <ul>
            {R.alertas.map((l) => (
              <li key={l.chave} data-cultivar={l.cultivar} style={{ flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 260px' }}>
                  <button className="lk" onClick={() => setEdit(l)}>{l.cultivar}</button> — faltam <b>{n0(l.falta)} sc</b> para a meta e só há{' '}
                  <b>{n0(l.scDisp)} sc</b> previstos em {n1(l.areaDisp)} ha a colher ({l.camposAColher} campo(s)).
                  {' '}Déficit de <b>{n0(-(l.saldo ?? 0))} sc</b>{l.areaNecessaria != null && <> — seria preciso colher {n0(l.areaNecessaria)} ha</>}.
                </span>
                <span className="muted">cobre {n0(l.cobertura ?? 0)}% da meta · ≈ {n0(l.bbProjetados)} de {n0(l.metaBB ?? 0)} big bags</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {R.linhas.length === 0 ? (
        <section className="card">
          <h2>Nenhuma cultivar ainda</h2>
          <p className="sub">As cultivares aparecem aqui sozinhas a partir dos campos cadastrados. Importe a planilha de planting ou cadastre uma meta manualmente.</p>
          <div className="btns"><button className="btn primary" onClick={() => ir('importar')}>Importar campos</button><button className="btn" onClick={() => setEdit('nova')}>+ Cultivar sem campo</button></div>
        </section>
      ) : (
        <>
          <div className="dash-duas">
            <section className="card">
              <div className="card-head"><div><h2>Meta × internalizado por cultivar</h2><div className="sub">Sacos de {n0(P.kg)} kg, do maior para o menor atingimento.</div></div></div>
              <div className="tbl-wrap" style={{ maxHeight: 560 }}>
                <table data-testid="tabela-dash">
                  <thead><tr><th>Cultivar</th><th className="n">Meta sc {n0(P.kg)} kg intern.</th><th className="n">Total intern.</th><th className="n">GAP</th><th className="n">% atingimento</th></tr></thead>
                  <tbody>
                    {painel.map((l) => (
                      <tr key={l.chave} className="clic" onClick={() => setEdit(l)}>
                        <td className="nowrap">{l.cultivar}</td>
                        <td className="n">{l.metaIntern != null ? n2(l.metaIntern) : '—'}</td>
                        <td className="n">{n2(l.intern)}</td>
                        <td className={'n ' + (l.gap == null ? '' : l.gap >= 0 ? 'pos' : 'neg')}>{l.gap != null ? sinal(l.gap, n2) : '—'}</td>
                        <td className="n">{l.pct != null ? n2(l.pct) : '—'}</td>
                      </tr>
                    ))}
                    {painel.length === 0 && <tr><td colSpan={5} className="empty">Informe os big bags planejados na tabela abaixo para montar o painel.</td></tr>}
                    {painel.length > 0 && <tr className="tot"><td>Total</td><td className="n">{n2(R.metaIntern)}</td><td className="n">{n2(R.intern)}</td>
                      <td className="n">{R.metaIntern > 0 ? sinal(R.gap, n2) : '—'}</td><td className="n">{R.pct != null ? n2(R.pct) : '—'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div><h2>Total realizado × GAP</h2><div className="sub">GAP à esquerda do zero = falta internalizar; à direita = passou da meta.</div></div>
                <div className="legend"><span><i style={{ background: 'var(--meta-real)' }} />Total realizado</span><span><i style={{ background: 'var(--meta-gap)' }} />Total GAP</span></div>
              </div>
              <GraficoGap linhas={painel} />
            </section>
          </div>

          <section className="card">
            <div className="card-head">
              <div>
                <h2>Metas e disponibilidade por cultivar</h2>
                <div className="sub">Digite os <b>big bags planejados</b> na célula amarela (ou clique em “Detalhes” para PMS, rendimento, meta manual e big bags prontos). O sistema calcula a matéria-prima bruta a internalizar e compara com o que ainda há para colher.</div>
              </div>
              <div className="btns"><button className="btn" onClick={() => setEdit('nova')}>+ Cultivar sem campo</button><button className="btn" onClick={exportar}>Exportar CSV</button></div>
            </div>
            <div className="tbl-wrap">
              <table data-testid="tabela-metas" className="quebra">
                <thead><tr>
                  <th>Cultivar</th><th className="n">Big bags planejados</th><th className="n">Meta de intern. (sc)</th><th className="n">Internalizado (sc)</th><th className="n">Falta (sc)</th>
                  <th className="n">Ainda a colher (sc)</th><th className="n">Saldo (sc)</th><th className="n">Cobertura</th>
                  <th className="n">Big bags prontos</th><th className="n">Big bags projetados</th><th>Situação</th><th />
                </tr></thead>
                <tbody>
                  {R.linhas.map((l) => {
                    const s = SITUACAO[l.situacao];
                    return (
                      <tr key={l.chave} data-cultivar={l.cultivar} className={l.situacao === 'alerta' ? 'over' : ''}>
                        <td className="nowrap"><b>{l.cultivar}</b><div className="muted">{l.campos ? `${l.campos} campo(s) · ${n0(l.areaTotal)} ha` : 'sem campos cadastrados'}</div></td>
                        <td className="n">
                          {l.bbDeduzido
                            ? <span className="muted" title="Deduzido da meta de internalização digitada">≈ {n0(l.metaBB ?? 0)}</span>
                            : <CelulaEd tipo="number" valor={l.metaBB == null ? null : +l.metaBB.toFixed(2)} onGravar={(v) => gravarBB(l, v)} rotulo={`Big bags planejados ${l.cultivar}`} />}
                        </td>
                        <td className="n">{l.metaIntern != null ? n0(l.metaIntern) : '—'}{l.metaManual && <span className="badge man" style={{ marginLeft: 6 }} title="Meta de internalização digitada à mão">manual</span>}</td>
                        <td className="n">{n0(l.intern)}{l.pct != null && <div className="muted">{n1(l.pct)}%</div>}</td>
                        <td className="n">{l.metaIntern != null ? n0(l.falta) : '—'}</td>
                        <td className="n">{n0(l.scDisp)}<div className="muted">{n0(l.areaDisp)} ha · {l.camposAColher} campo(s)</div></td>
                        <td className={'n ' + (l.saldo == null || l.situacao === 'atingida' ? '' : l.saldo >= 0 ? 'pos' : 'neg')}>{l.saldo == null ? '—' : l.situacao === 'atingida' ? '—' : sinal(l.saldo)}</td>
                        <td className="n">{l.cobertura != null ? `${n0(l.cobertura)}%` : '—'}</td>
                        <td className="n">{l.bbProntos > 0 ? n0(l.bbProntos) : '—'}{l.pctProducao != null && l.bbProntos > 0 && <div className="muted">{n1(l.pctProducao)}%</div>}</td>
                        <td className="n">{l.intern + l.scDisp > 0 ? n0(l.bbProjetados) : '—'}</td>
                        <td>{l.situacao !== 'sem_meta'
                          ? <span className={'sit-meta ' + s.cls} title={l.situacao === 'alerta' ? 'A demanda é maior que a área/volume ainda disponível para colher' : undefined}><i>{s.icone}</i>{s.rotulo}</span>
                          : <span className="muted">Sem meta</span>}</td>
                        <td className="n"><button className="btn mini" aria-label={`Detalhes ${l.cultivar}`} onClick={() => setEdit(l)}>Detalhes</button></td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td>Total</td><td className="n">{n0(R.metaBB)}</td><td className="n">{n0(R.metaIntern)}</td><td className="n">{n0(R.intern)}</td>
                    <td className="n">{n0(R.linhas.reduce((s, l) => s + l.falta, 0))}</td><td className="n">{n0(R.scDisp)}<div className="muted">{n0(R.areaDisp)} ha</div></td>
                    <td colSpan={2} /><td className="n">{R.bbProntos > 0 ? n0(R.bbProntos) : '—'}</td><td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="card panel">
        <div className="card-head">
          <div><h2>Parâmetros da conversão (editável)</h2><div className="sub">Valem para todas as cultivares; PMS e rendimento podem ser ajustados por cultivar em “Detalhes”.</div></div>
          <button className="btn" onClick={() => setM({ ...CONFIG_PADRAO.metas })}>Restaurar padrão</button>
        </div>
        <div className="params">
          <div className="param"><label htmlFor="mBB">Sacos de 200 mil sementes por big bag</label><input id="mBB" min={1} step={1} {...numM('sc200PorBB', 1)} /><div className="hint">Padrão: 25 (big bag de 5 milhões de sementes)</div></div>
          <div className="param"><label htmlFor="mPms">Peso de mil sementes — PMS (g)</label><input id="mPms" min={1} step={1} {...numM('pms', 1)} /><div className="hint">Padrão: 180 g → saco de 200 mil = {n1(kg1)} kg</div></div>
          <div className="param"><label htmlFor="mRend">Rendimento do beneficiamento na UBS (%)</label><input id="mRend" min={1} max={100} step={1} {...numM('rendUbs', 1, 100)} /><div className="hint">Padrão: 75% da matéria-prima vira semente pronta</div></div>
        </div>
        <div className="formula">
          Exemplo com os parâmetros atuais: <b>100 big bags</b> = {n0(100 * M.sc200PorBB)} sacos de 200 mil = <b>{n0(100 * M.sc200PorBB * scPorSc200(M.pms, P.kg))} sc</b> de semente pronta →
          é preciso internalizar <b>{n0(metaInternDe(100 * M.sc200PorBB, M.pms, M.rendUbs, P.kg))} sc</b> de matéria-prima bruta ({n1((metaInternDe(100 * M.sc200PorBB, M.pms, M.rendUbs, P.kg) * P.kg) / 1000)} t).
        </div>
      </section>

      <section className="card note">
        <h2>Como esta aba é calculada</h2>
        <ul>
          <li><b>Meta de internalização</b> = big bags × sacos de 200 mil por big bag × peso do saco de 200 mil (PMS × 0,2 kg) ÷ {n0(P.kg)} kg ÷ rendimento do beneficiamento. Uma meta digitada à mão em “Detalhes” vale no lugar do cálculo.</li>
          <li><b>Total internalizado</b> = soma do volume <i>aprovado e internalizado</i> lançado na ficha de cada campo da cultivar. <b>GAP</b> = internalizado − meta. <b>% atingimento</b> = internalizado ÷ meta.</li>
          <li><b>Ainda a colher</b> = área dos campos ativos ainda não finalizados, descontada a área colhida já lançada (sem área lançada, o sistema estima pelo volume entregue). Em sacos, é essa área × sc/ha × aproveitamento, usando a produtividade do produtor quando informada e, senão, os valores da aba Internalização ({n0(P.scHa)} sc/ha e {n0(P.aprov)}%).</li>
          <li><b>Alerta</b>: aparece quando o que falta para a meta é maior que o volume ainda a colher. <b>Saldo</b> = ainda a colher − falta. <b>Cobertura</b> = (internalizado + ainda a colher) ÷ meta.</li>
          <li><b>Big bags projetados</b> = (internalizado + ainda a colher) × rendimento ÷ peso de um big bag.</li>
        </ul>
      </section>

      {edit && <FormMeta linha={edit === 'nova' ? null : edit} onFim={() => setEdit(null)} />}
    </>
  );
}

/** Meta completa de uma linha, para regravar mudando só um pedaço. */
function baseMeta(l: LinhaMeta): NovaMeta {
  const m = l.meta;
  return {
    cultivar: m?.cultivar ?? l.cultivar, meta_sc200: m?.meta_sc200 ?? null, pms_g: m?.pms_g ?? null, rend_ubs: m?.rend_ubs ?? null,
    meta_intern_sc: m?.meta_intern_sc ?? null, bb_ubs: m?.bb_ubs ?? null, bb_tolling: m?.bb_tolling ?? null, observacoes: m?.observacoes ?? null,
  };
}

function FormMeta({ linha, onFim }: { linha: LinhaMeta | null; onFim: () => void }) {
  const d = useDados();
  const P = d.dados.config.params;
  const M = d.dados.config.metas;
  const m = linha?.meta ?? null;
  const s = (v: number | null | undefined, casas = 2) => (v == null ? '' : String(+v.toFixed(casas)));
  const [f, setF] = useState({
    cultivar: linha?.cultivar ?? '',
    bb: s(m?.meta_sc200 != null ? m.meta_sc200 / M.sc200PorBB : null),
    sc200: s(m?.meta_sc200, 0),
    pms: s(m?.pms_g), rend: s(m?.rend_ubs), manual: s(m?.meta_intern_sc),
    bbUbs: s(m?.bb_ubs), bbTol: s(m?.bb_tolling), obs: m?.observacoes ?? '',
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((a) => ({ ...a, [k]: v }));
  // big bags e sacos de 200 mil andam juntos: digitar um preenche o outro
  const setBB = (v: string) => {
    const n = num(v);
    setF((a) => ({ ...a, bb: v, sc200: n == null ? '' : s(n * M.sc200PorBB, 0) }));
  };
  const setSc200 = (v: string) => {
    const n = num(v);
    setF((a) => ({ ...a, sc200: v, bb: n == null ? '' : s(n / M.sc200PorBB) }));
  };

  const sc200 = num(f.sc200);
  const pms = num(f.pms) ?? M.pms;
  const rend = num(f.rend) ?? M.rendUbs;
  const manual = num(f.manual);
  const fator = scPorSc200(pms, P.kg);
  const calculada = sc200 != null ? metaInternDe(sc200, pms, rend, P.kg) : null;
  const meta = manual ?? calculada;

  async function salvar() {
    const cultivar = f.cultivar.trim();
    if (!cultivar) return d.avisar('Informe a cultivar.', 'erro');
    if (num(f.pms) != null && pms <= 0) return d.avisar('PMS inválido.', 'erro');
    if (num(f.rend) != null && (rend <= 0 || rend > 100)) return d.avisar('O rendimento deve ficar entre 1 e 100%.', 'erro');
    if ([sc200, manual, num(f.bbUbs), num(f.bbTol)].some((v) => v != null && v < 0)) return d.avisar('Os valores não podem ser negativos.', 'erro');
    setSalvando(true);
    const r = await d.salvarMeta({
      cultivar: m?.cultivar ?? cultivar, meta_sc200: sc200, pms_g: num(f.pms), rend_ubs: num(f.rend), meta_intern_sc: manual,
      bb_ubs: num(f.bbUbs), bb_tolling: num(f.bbTol), observacoes: f.obs.trim() || null,
    }, `Meta de ${cultivar} salva.`);
    setSalvando(false);
    if (r) onFim();
  }

  return (
    <Modal titulo={linha ? `Meta — ${linha.cultivar}` : 'Nova cultivar'} sub={linha ? `${linha.campos} campo(s) · ${n0(linha.areaTotal)} ha · ${n0(linha.intern)} sc internalizados` : 'Use para cultivares que ainda não têm campo cadastrado.'} onFechar={onFim}>
      <div className="form">
        {!linha && (
          <div className="campo largo">
            <label htmlFor="fmCult">Cultivar</label>
            <input id="fmCult" autoFocus value={f.cultivar} onChange={(e) => set('cultivar', e.target.value)} placeholder="mesmo nome usado na coluna Produto dos campos" />
          </div>
        )}
        <div className="campo">
          <label htmlFor="fmBB">Big bags planejados (semente pronta)</label>
          <input id="fmBB" type="number" min={0} step="any" value={f.bb} onChange={(e) => setBB(e.target.value)} />
          <div className="hint">1 big bag = {n0(M.sc200PorBB)} sacos de 200 mil sementes</div>
        </div>
        <div className="campo">
          <label htmlFor="fmSc200">ou em sacos de 200 mil sementes</label>
          <input id="fmSc200" type="number" min={0} step="any" value={f.sc200} onChange={(e) => setSc200(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="fmPms">PMS desta cultivar (g)</label>
          <input id="fmPms" type="number" min={1} step="any" placeholder={`padrão: ${n0(M.pms)}`} value={f.pms} onChange={(e) => set('pms', e.target.value)} />
          <div className="hint">Saco de 200 mil = {n1(pms * 0.2)} kg</div>
        </div>
        <div className="campo">
          <label htmlFor="fmRend">Rendimento do beneficiamento (%)</label>
          <input id="fmRend" type="number" min={1} max={100} step="any" placeholder={`padrão: ${n0(M.rendUbs)}`} value={f.rend} onChange={(e) => set('rend', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="fmManual">Meta de internalização manual (sc {n0(P.kg)} kg)</label>
          <input id="fmManual" type="number" min={0} step="any" placeholder={calculada != null ? `calculada: ${n0(calculada)}` : 'opcional'} value={f.manual} onChange={(e) => set('manual', e.target.value)} />
          <div className="hint">Em branco = usa o cálculo. Preenchida, vale no lugar dele.</div>
        </div>
        <div className="campo">
          <label htmlFor="fmBbUbs">Big bags prontos — UBS</label>
          <input id="fmBbUbs" type="number" min={0} step="any" value={f.bbUbs} onChange={(e) => set('bbUbs', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="fmBbTol">Big bags prontos — tolling</label>
          <input id="fmBbTol" type="number" min={0} step="any" value={f.bbTol} onChange={(e) => set('bbTol', e.target.value)} />
        </div>
        <div className="campo largo">
          <label htmlFor="fmObs">Observações</label>
          <input id="fmObs" value={f.obs} onChange={(e) => set('obs', e.target.value)} />
        </div>
      </div>
      <div className="resultado" style={{ marginTop: 12 }} data-testid="conta-meta">
        {sc200 != null && <>{n0(sc200 / M.sc200PorBB)} big bags = {n0(sc200)} sacos de 200 mil = {n0(sc200 * fator)} sc de semente pronta. </>}
        Meta de internalização: <b>{meta != null ? `${n0(meta)} sc` : '—'}</b>
        {meta != null && <span className="sub"> · {n1((meta * P.kg) / 1000)} t de matéria-prima bruta{manual != null ? ' (digitada à mão)' : ` · rendimento ${n0(rend)}%`}</span>}
      </div>
      {linha && linha.metaIntern != null && linha.metaIntern > 0 && (
        <div className="info" style={{ marginTop: 12 }}>
          <div><span>Internalizado</span>{n0(linha.intern)} sc ({n1(linha.pct ?? 0)}%)</div>
          <div><span>Falta internalizar</span>{n0(linha.falta)} sc</div>
          <div><span>Ainda a colher</span>{n1(linha.areaDisp)} ha · {n0(linha.scDisp)} sc previstos</div>
          <div><span>Área necessária para fechar</span>{linha.areaNecessaria != null ? `${n0(linha.areaNecessaria)} ha` : '—'}</div>
          <div><span>Big bags possíveis com o que já entrou</span>{n0(linha.bbPossiveis)}</div>
          <div><span>Big bags projetados (com o que falta colher)</span>{n0(linha.bbProjetados)} de {n0(linha.metaBB ?? 0)}</div>
        </div>
      )}
      <div className="btns" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <div className="btns">
          <button className="btn primary" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar meta'}</button>
          <button className="btn" onClick={onFim}>Cancelar</button>
        </div>
        {m && <button className="btn perigo" onClick={async () => { if (confirm(`Apagar a meta de ${m.cultivar}?`) && (await d.excluirMeta(m.id))) onFim(); }}>Apagar meta</button>}
      </div>
    </Modal>
  );
}

/** Barras horizontais: realizado a partir do zero; GAP negativo para a esquerda, positivo empilhado à direita. */
function GraficoGap({ linhas }: { linhas: LinhaMeta[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const f = () => setW(Math.max(el.clientWidth, 360));
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dados = [...linhas].sort((a, b) => b.intern - a.intern || (a.gap ?? 0) - (b.gap ?? 0));
  if (!dados.length) return <div className="chart" ref={ref}><div className="empty">Sem metas ou volumes lançados ainda.</div></div>;

  const linhaH = 26, m = { l: Math.min(150, Math.max(70, ...dados.map((l) => l.cultivar.length * 6.6 + 14))), r: 16, t: 8, b: 40 };
  const H = m.t + dados.length * linhaH + m.b;
  const iw = W - m.l - m.r;
  // o passo das marcas considera os dois lados do zero, para não encavalar os rótulos
  const maior = Math.max(1, ...dados.map((l) => l.intern + Math.max(0, l.gap ?? 0)));
  const menor = Math.min(0, ...dados.map((l) => l.gap ?? 0));
  const passo = maxBonito((maior - menor) / Math.max(3, Math.min(7, Math.floor(iw / 80))));
  const maxPos = Math.ceil(maior / passo - 1e-9) * passo;
  const minNeg = menor < 0 ? -Math.ceil(-menor / passo - 1e-9) * passo : 0;
  const x = (v: number) => m.l + ((v - minNeg) / (maxPos - minNeg)) * iw;
  const marcas: number[] = [];
  for (let v = minNeg; v <= maxPos + 1e-6; v += passo) marcas.push(Math.abs(v) < 1e-6 ? 0 : v);
  const barH = 14;
  const barra = (x0: number, x1: number, y: number, cor: string, pontaDir: boolean) => {
    const w = x1 - x0;
    if (w < 0.5) return null;
    const r = Math.min(4, w);
    const d = pontaDir
      ? `M${x0},${y} H${x1 - r} Q${x1},${y} ${x1},${y + r} V${y + barH - r} Q${x1},${y + barH} ${x1 - r},${y + barH} H${x0} Z`
      : `M${x1},${y} H${x0 + r} Q${x0},${y} ${x0},${y + r} V${y + barH - r} Q${x0},${y + barH} ${x0 + r},${y + barH} H${x1} Z`;
    return <path d={d} fill={cor} />;
  };
  const mover = (e: RME<SVGRectElement>, i: number) => {
    const r = ref.current!.getBoundingClientRect();
    setTip({ i, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const t = tip ? dados[tip.i] : null;

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Total realizado e GAP por cultivar" onMouseLeave={() => setTip(null)}>
        {marcas.map((v) => (
          <g key={v}><line x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke="var(--grid)" /><text x={x(v)} y={H - m.b + 15} textAnchor="middle">{eixo(v)}</text></g>
        ))}
        <text x={m.l + iw / 2} y={H - 6} textAnchor="middle">sacos de 60 kg — realizado e GAP</text>
        {dados.map((l, i) => {
          const y = m.t + i * linhaH + (linhaH - barH) / 2;
          const gap = l.gap ?? 0;
          const fimReal = x(l.intern);
          return (
            <g key={l.chave} opacity={tip && tip.i !== i ? 0.5 : 1}>
              <text x={m.l - 8} y={y + barH - 3} textAnchor="end" style={{ fill: 'var(--text-primary)' }}>{l.cultivar.length > 21 ? l.cultivar.slice(0, 20) + '…' : l.cultivar}</text>
              {barra(x(0) + 1, fimReal, y, 'var(--meta-real)', true)}
              {gap < 0 && barra(x(gap), x(0) - 1, y, 'var(--meta-gap)', false)}
              {gap > 0 && barra(fimReal + 2, x(l.intern + gap), y, 'var(--meta-gap)', true)}
            </g>
          );
        })}
        <line x1={x(0)} x2={x(0)} y1={m.t} y2={H - m.b} stroke="var(--axis)" />
        {dados.map((l, i) => (
          <rect key={l.chave} data-barra={l.cultivar} x={0} y={m.t + i * linhaH} width={W} height={linhaH} fill="transparent" onMouseMove={(e) => mover(e, i)} />
        ))}
      </svg>
      {t && tip && (
        <div className="tip" style={{ left: tip.x + 14 + 220 > W ? Math.max(0, tip.x - 230) : tip.x + 14, top: tip.y + 14 }}>
          <div className="t">{t.cultivar}</div>
          <div className="r"><span>Total realizado</span><b>{n0(t.intern)} sc</b></div>
          <div className="r"><span>Meta de internalização</span><b>{t.metaIntern != null ? `${n0(t.metaIntern)} sc` : '—'}</b></div>
          <div className="r"><span>GAP</span><b>{t.gap != null ? `${sinal(t.gap)} sc` : '—'}</b></div>
          <div className="r"><span>Atingimento</span><b>{t.pct != null ? `${n1(t.pct)}%` : '—'}</b></div>
          <div className="r"><span>Ainda a colher</span><b>{n0(t.scDisp)} sc</b></div>
          {t.situacao === 'alerta' && <div className="warn">▲ faltam {n0(-(t.saldo ?? 0))} sc além do disponível</div>}
        </div>
      )}
    </div>
  );
}

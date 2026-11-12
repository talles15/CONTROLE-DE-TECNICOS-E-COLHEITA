import { Fragment, useState } from 'react';
import { useDados } from '../lib/dados';
import { br, dataProvavel, diaSemana, somaDias } from '../lib/dates';
import { baixar, csv, n0, n1, n2, num } from '../lib/format';
import { haversine } from '../lib/geo';
import { chaveCampo } from '../lib/importPlanting';
import { ir } from '../lib/rota';
import { ATIVIDADES, STATUS_PROG, type Atividade, type Campo, type CampoPlanilha, type ColheitaDia, type Programacao, type Tecnico } from '../lib/types';
import { aprovadoKg, deKg, paraKg, UNIDADES, type Unidade } from '../lib/realizado';
import { linkMapa } from '../lib/whatsapp';
import { ControlesProg } from './ProgControles';
import { Modal, Sit, TecChip } from './ui';

export function FichaCampo({ campoId, onFechar }: { campoId: string; onFechar: () => void }) {
  const d = useDados();
  const campo = d.campoPorId.get(campoId);
  const [editando, setEditando] = useState(false);
  if (!campo) {
    return <Modal titulo="Campo não encontrado" onFechar={onFechar}><p className="sub">Ele pode ter sido excluído.</p></Modal>;
  }
  const r = d.resumos.get(campo.id)!;
  const { ubs } = d.dados.config;
  const dist = campo.latitude != null && campo.longitude != null ? haversine(ubs.lat, ubs.lng, campo.latitude, campo.longitude) : null;
  const mapa = linkMapa(campo);

  return (
    <Modal
      titulo={<>Campo {campo.num_campo} <span className="badge">cat. {campo.categoria_colher ?? '—'}</span></>}
      sub={<><Sit s={r.situacao} />{!campo.ativo && <> · <span className="badge">inativo</span></>}</>}
      onFechar={onFechar}
    >
      <div className="info">
        <div><span>Cliente</span>{campo.cliente ?? '—'}</div>
        <div><span>Fazenda</span>{campo.propriedade ?? '—'}</div>
        <div><span>Cidade</span>{[campo.cidade, campo.uf].filter(Boolean).join('/') || '—'}</div>
        <div><span>Cultivar</span>{campo.produto ?? '—'}</div>
        <div><span>Obtentor · Biotec.</span>{[campo.obtentor, campo.biotec].filter(Boolean).join(' · ') || '—'}</div>
        <div><span>Talhão</span>{campo.talhao ?? '—'}</div>
        <div><span>Área MAPA · projetada</span>{n1(campo.area_mapa)} ha · {n1(campo.area_projetada)} ha</div>
        <div><span>Plantio · ciclo</span>{br(campo.data_plantio)} · {campo.ciclo ?? '—'} dias</div>
        <div><span>Colheita prevista (planilha)</span>{br(campo.data_colheita_prevista)}</div>
        <div><span>Expectativa</span>{n2(campo.expectativa_sc)} sc</div>
        <div><span>Distância da {ubs.nome}</span>{dist != null ? `${n1(dist)} km em linha reta` : 'sem coordenada'}</div>
        <div><span>Localização</span>{mapa ? <a href={mapa} target="_blank" rel="noreferrer">Abrir no Google Maps</a> : '—'}</div>
      </div>
      {campo.observacoes && <p className="sub" style={{ marginTop: 8 }}>Obs.: {campo.observacoes}</p>}

      {campo.linhas.length > 1 && (
        <details className="sec secao">
          <summary>Linhas da planilha reunidas neste campo ({campo.linhas.length})</summary>
          <div className="tbl-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Pedido</th><th>Peneira</th><th>Cat. plantada</th><th>Talhão</th><th className="n">Área MAPA</th><th>Plantio</th><th>Colheita</th></tr></thead>
              <tbody>
                {campo.linhas.map((l, i) => (
                  <tr key={i}><td>{l.pedido ?? '—'}</td><td>{l.peneira ?? '—'}</td><td>{l.categoria_plantada ?? '—'}</td><td>{l.talhao ?? '—'}</td>
                    <td className="n">{n1(l.area_mapa)}</td><td>{br(l.data_plantio)}</td><td>{br(l.data_colheita)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <Dessecacao campo={campo} />
      <Colheita key={`${campo.colheita_inicio}|${campo.colheita_fim}`} campo={campo} />

      <ColheitaReal key={'real' + campo.id} campo={campo} />
      <HistoricoTecnicos key={'hist' + campo.id} campo={campo} />

      <div className="secao">
        {editando ? (
          <FormCampo campo={campo} onFim={() => setEditando(false)} />
        ) : (
          <div className="btns">
            <button className="btn" onClick={() => setEditando(true)}>Editar dados do campo</button>
            <button className="btn" onClick={() => void d.atualizarCampos([campo.id], { ativo: !campo.ativo }, campo.ativo ? 'Campo inativado.' : 'Campo reativado.')}>
              {campo.ativo ? 'Inativar campo' : 'Reativar campo'}
            </button>
            <button className="btn perigo" onClick={async () => {
              if (confirm(`Excluir o campo ${campo.num_campo}? As dessecações e programações dele também serão apagadas.`)) {
                if (await d.excluirCampo(campo.id)) onFechar();
              }
            }}>Excluir campo</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Dessecacao({ campo }: { campo: Campo }) {
  const d = useDados();
  const r = d.resumos.get(campo.id)!;
  const [data, setData] = useState(d.hoje);
  const [area, setArea] = useState('');
  const [dias, setDias] = useState('');
  const [obs, setObs] = useState('');
  const nDias = num(dias);
  const provavel = dataProvavel(data || null, nDias);
  const nArea = num(area);
  const excede = nArea != null && campo.area_mapa > 0 && r.areaDessecada + nArea > campo.area_mapa * 1.02;

  async function registrar() {
    if (!data) return d.avisar('Informe a data da dessecação.', 'erro');
    if (nDias != null && (nDias < 0 || nDias > 120)) return d.avisar('Dias até a colheita deve ficar entre 0 e 120.', 'erro');
    const ok = await d.salvarDessecacoes([
      { campo_id: campo.id, data, area_ha: nArea, dias_para_colheita: nDias == null ? null : Math.round(nDias), observacoes: obs.trim() || null },
    ]);
    if (ok) {
      setArea('');
      setObs('');
    }
  }

  return (
    <div className="secao">
      <h3>Dessecação</h3>
      {r.dessecacoes.length > 0 && (
        <div className="tbl-wrap" style={{ maxHeight: 200, marginBottom: 12 }}>
          <table>
            <thead><tr><th>Dessecado em</th><th className="n">Área (ha)</th><th className="n">Dias</th><th>Colheita provável</th><th>Obs.</th><th /></tr></thead>
            <tbody>
              {r.dessecacoes.map((x) => (
                <tr key={x.id}>
                  <td className="nowrap">{br(x.data)}</td>
                  <td className="n">{x.area_ha != null ? n1(x.area_ha) : '—'}</td>
                  <td className="n">{x.dias_para_colheita ?? '—'}</td>
                  <td className="nowrap">{x.data_provavel_colheita ? <b>{br(x.data_provavel_colheita)} ({diaSemana(x.data_provavel_colheita)})</b> : '—'}</td>
                  <td>{x.observacoes ?? ''}</td>
                  <td className="n"><button className="btn mini perigo" onClick={() => confirm('Excluir esta dessecação?') && void d.excluirDessecacao(x.id)}>Excluir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="form">
        <div className="campo">
          <label htmlFor="dsData">Data da dessecação</label>
          <input id="dsData" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="dsDias">Dias até a colheita</label>
          <input id="dsDias" type="number" min={0} max={120} step={1} placeholder="ex.: 5" value={dias} onChange={(e) => setDias(e.target.value)} />
          <div className="hint">Opcional. Soma à data da dessecação.</div>
        </div>
        <div className="campo">
          <label htmlFor="dsArea">Área dessecada (ha)</label>
          <input id="dsArea" type="number" min={0} step="0.1" placeholder={`até ${n1(campo.area_mapa)}`} value={area} onChange={(e) => setArea(e.target.value)} />
          <div className="hint">Opcional. Use para dessecação parcial.</div>
        </div>
        <div className="campo">
          <label htmlFor="dsObs">Observação</label>
          <input id="dsObs" value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>
      <div className="btns" style={{ marginTop: 12 }}>
        <div className="resultado" data-testid="provavel">
          Colheita provável: <b>{provavel ? `${br(provavel)} (${diaSemana(provavel)})` : '—'}</b>
          {provavel && <span className="sub"> · aviso de pré-colheita em {br(somaDias(provavel, -d.dados.config.avisoDias))}</span>}
        </div>
        <button className="btn primary" onClick={() => void registrar()}>Registrar dessecação</button>
      </div>
      {excede && <div className="erro-txt">A soma das áreas dessecadas passa da área do campo ({n1(campo.area_mapa)} ha).</div>}
    </div>
  );
}

function Colheita({ campo }: { campo: Campo }) {
  const d = useDados();
  const [ini, setIni] = useState(campo.colheita_inicio ?? '');
  const [fim, setFim] = useState(campo.colheita_fim ?? '');
  const gravar = (i: string, f: string, msg: string) => {
    if (f && !i) return d.avisar('Informe o início antes do fim da colheita.', 'erro');
    if (i && f && f < i) return d.avisar('O fim não pode ser antes do início.', 'erro');
    setIni(i);
    setFim(f);
    void d.atualizarCampos([campo.id], { colheita_inicio: i || null, colheita_fim: f || null }, msg);
  };
  const tecHoje = d.dados.programacoes
    .filter((p) => p.campo_id === campo.id && p.data === d.hoje && p.status !== 'cancelado')
    .map((p) => d.tecnicoPorId.get(p.tecnico_id))
    .filter((t) => !!t);
  return (
    <div className="secao">
      <h3>Colheita</h3>
      {tecHoje.length > 0 && <div className="sub" style={{ marginBottom: 8 }}>Técnico(s) hoje: {tecHoje.map((t) => <TecChip key={t!.id} t={t!} />)}</div>}
      <div className="form">
        <div className="campo">
          <label htmlFor="coIni">Início da colheita</label>
          <input id="coIni" type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="coFim">Fim da colheita</label>
          <input id="coFim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="btns">
          <button className="btn primary" onClick={() => gravar(ini, fim, 'Colheita atualizada.')}>Salvar datas</button>
          {!campo.colheita_inicio && <button className="btn" onClick={() => gravar(d.hoje, '', 'Colheita iniciada.')}>Iniciar hoje</button>}
          {campo.colheita_inicio && !campo.colheita_fim && <button className="btn" onClick={() => gravar(campo.colheita_inicio!, d.hoje, 'Colheita finalizada.')}>Finalizar hoje</button>}
          {(campo.colheita_inicio || campo.colheita_fim) && <button className="btn" onClick={() => gravar('', '', 'Datas de colheita limpas.')}>Limpar</button>}
        </div>
      </div>
    </div>
  );
}

const LS_UNIDADE = 'ctc_unidade_volume';
function unidadeSalva(): Unidade {
  try {
    const v = localStorage.getItem(LS_UNIDADE);
    if (v === 'kg' || v === 'sc' || v === 't') return v;
  } catch {
    /* sem armazenamento */
  }
  return 'kg';
}

/** Volume colhido dia a dia (o que conversa com as outras abas) e, à parte, a produtividade do produtor (só informativa). */
function ColheitaReal({ campo }: { campo: Campo }) {
  const d = useDados();
  const P = d.dados.config.params;
  const r = d.reais.get(campo.id)!;
  const [un, setUn] = useState<Unidade>(unidadeSalva);
  const [edit, setEdit] = useState<string | null>(null);
  const [data, setData] = useState(d.hoje);
  const [colhido, setColhido] = useState('');
  const [aprovado, setAprovado] = useState('');
  const [area, setArea] = useState('');
  const [obs, setObs] = useState('');
  const [prod, setProd] = useState(campo.prod_real_sc_ha == null ? '' : String(campo.prod_real_sc_ha));

  const trocarUn = (u: Unidade) => {
    setUn(u);
    try {
      localStorage.setItem(LS_UNIDADE, u);
    } catch {
      /* sem armazenamento */
    }
  };
  const vol = (kg: number) => (un === 'kg' ? n0(kg) : n1(deKg(kg, un, P.kg)));
  const limpar = () => {
    setEdit(null);
    setColhido('');
    setAprovado('');
    setArea('');
    setObs('');
  };
  const editar = (l: ColheitaDia) => {
    const txt = (kg: number) => String(+deKg(kg, un, P.kg).toFixed(un === 'kg' ? 0 : 3));
    setEdit(l.id);
    setData(l.data);
    setColhido(txt(l.colhido_kg));
    setAprovado(l.aprovado_kg == null ? '' : txt(l.aprovado_kg));
    setArea(l.area_ha == null ? '' : String(l.area_ha));
    setObs(l.observacoes ?? '');
  };

  async function lancar() {
    const vC = num(colhido), vA = num(aprovado), vHa = num(area);
    if (!data) return d.avisar('Informe o dia da colheita.', 'erro');
    if (vC == null || vC < 0) return d.avisar('Informe o volume colhido no dia.', 'erro');
    if (vA != null && (vA < 0 || vA > vC)) return d.avisar('O volume aprovado não pode ser maior que o colhido.', 'erro');
    if (vHa != null && vHa < 0) return d.avisar('Área colhida inválida.', 'erro');
    const ok = await d.salvarColheitas([{
      ...(edit ? { id: edit } : {}), campo_id: campo.id, data,
      colhido_kg: paraKg(vC, un, P.kg), aprovado_kg: vA == null ? null : paraKg(vA, un, P.kg),
      area_ha: vHa, observacoes: obs.trim() || null,
    }], edit ? 'Lançamento corrigido.' : 'Volume colhido lançado.');
    if (ok) limpar();
  }
  function gravarProd() {
    const v = num(prod);
    if (v != null && v < 0) return d.avisar('Produtividade inválida.', 'erro');
    if (v === campo.prod_real_sc_ha) return;
    void d.atualizarCampos([campo.id], { prod_real_sc_ha: v }, v == null ? 'Produtividade do produtor removida.' : 'Produtividade do produtor salva.');
  }

  const temVolume = r.lancamentos.length > 0;
  const emAndamento = !campo.colheita_fim;
  const areaExcede = r.areaColhida != null && r.areaCampo > 0 && r.areaColhida > r.areaCampo * 1.02;

  return (
    <div className="secao" data-testid="colheita-real">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <h3>Volume colhido, aprovado e internalizado</h3>
          <div className="sub">Lance o volume a cada dia de colheita. O volume aprovado e internalizado é o que alimenta as abas Metas e Internalização.</div>
        </div>
        <label className="un">
          <span>Volumes em</span>
          <select value={un} onChange={(e) => trocarUn(e.target.value as Unidade)} aria-label="Unidade dos volumes">
            {(Object.keys(UNIDADES) as Unidade[]).map((u) => <option key={u} value={u}>{u === 'sc' ? `sacos de ${n0(P.kg)} kg` : UNIDADES[u]}</option>)}
          </select>
        </label>
      </div>
      {d.dados.faltaMigracao && <div className="caixa-info atencao">Para gravar volumes e produtividade, rode antes o arquivo <b>supabase/migrations/0002_colheita_real_e_metas.sql</b> no SQL Editor do Supabase.</div>}

      <div className="reais">
        <div className="real"><span>Colhido e entregue na UBS</span><b>{n0(r.colhidoSc)} sc</b><small>{n1(r.colhidoKg / 1000)} t · {r.dias} dia(s) lançado(s)</small></div>
        <div className="real dest" data-testid="internalizado"><span>Aprovado e internalizado</span><b>{n0(r.internSc)} sc</b><small>{r.aprovadoDoEntreguePct != null ? `${n1(r.aprovadoDoEntreguePct)}% do entregue` : 'sem lançamentos'}{r.internScHa != null ? ` · ${n1(r.internScHa)} sc/ha` : ''}</small></div>
        {emAndamento && campo.ativo && <div className="real"><span>Ainda a colher</span><b>{n1(r.areaRestante)} ha</b><small>≈ {n0(r.scRestante)} sc a internalizar{r.restanteEstimado ? ' · área estimada pelo volume' : ''}</small></div>}
      </div>

      <h3 style={{ marginTop: 14 }}>{edit ? 'Corrigir lançamento' : 'Lançar volume do dia'}</h3>
      <div className="form">
        <div className="campo">
          <label htmlFor="crData">Dia</label>
          <input id="crData" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="crColhido">Volume colhido ({un})</label>
          <input id="crColhido" type="number" min={0} step="any" value={colhido} onChange={(e) => setColhido(e.target.value)} />
          <div className="hint">O que saiu do campo e chegou à UBS no dia.</div>
        </div>
        <div className="campo">
          <label htmlFor="crAprov">Aprovado e internalizado ({un})</label>
          <input id="crAprov" type="number" min={0} step="any" placeholder="igual ao colhido" value={aprovado} onChange={(e) => setAprovado(e.target.value)} />
          <div className="hint">Em branco = tudo aprovado. Preencha se parte foi para grão.</div>
        </div>
        <div className="campo">
          <label htmlFor="crArea">Área colhida no dia (ha)</label>
          <input id="crArea" type="number" min={0} step="0.1" placeholder="opcional" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="crObs">Observação</label>
          <input id="crObs" value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
        <div className="btns">
          <button className="btn primary" onClick={() => void lancar()}>{edit ? 'Salvar correção' : 'Lançar volume'}</button>
          {edit && <button className="btn" onClick={limpar}>Cancelar</button>}
        </div>
      </div>
      {areaExcede && <div className="erro-txt">A soma das áreas colhidas ({n1(r.areaColhida!)} ha) passa da área do campo ({n1(r.areaCampo)} ha).</div>}

      {temVolume && (
        <div className="tbl-wrap" style={{ maxHeight: 260, marginTop: 12 }}>
          <table>
            <thead><tr><th>Dia</th><th className="n">Colhido ({un})</th><th className="n">Aprovado ({un})</th><th className="n">% aprovado</th><th className="n">Área (ha)</th><th className="n">sc/ha</th><th>Obs.</th><th /></tr></thead>
            <tbody>
              {[...r.lancamentos].reverse().map((l) => {
                const ap = aprovadoKg(l);
                return (
                  <tr key={l.id} className={edit === l.id ? 'sel' : ''}>
                    <td className="nowrap">{br(l.data)} ({diaSemana(l.data)})</td>
                    <td className="n">{vol(l.colhido_kg)}</td>
                    <td className="n">{vol(ap)}</td>
                    <td className="n">{l.colhido_kg > 0 ? `${n0((ap / l.colhido_kg) * 100)}%` : '—'}</td>
                    <td className="n">{l.area_ha != null ? n1(l.area_ha) : '—'}</td>
                    <td className="n">{l.area_ha ? n1(ap / P.kg / l.area_ha) : '—'}</td>
                    <td>{l.observacoes ?? ''}</td>
                    <td className="n nowrap">
                      <button className="btn mini" onClick={() => editar(l)}>Corrigir</button>{' '}
                      <button className="btn mini perigo" aria-label={`Excluir lançamento de ${br(l.data)}`} onClick={() => confirm('Excluir este lançamento?') && void d.excluirColheita(l.id)}>Excluir</button>
                    </td>
                  </tr>
                );
              })}
              <tr className="tot"><td>Total</td><td className="n">{vol(r.colhidoKg)}</td><td className="n">{vol(r.internKg)}</td>
                <td className="n">{r.aprovadoDoEntreguePct != null ? `${n0(r.aprovadoDoEntreguePct)}%` : '—'}</td>
                <td className="n">{r.areaColhida != null ? n1(r.areaColhida) : '—'}</td><td className="n">{r.internScHa != null ? n1(r.internScHa) : '—'}</td><td colSpan={2} /></tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="informativo" data-testid="prod-produtor">
        <h3>Produtividade do produtor <span className="badge">só informativo</span></h3>
        <div className="sub">Fica registrada apenas nesta ficha, para dar uma noção de quanto do potencial da área deixou de ir para a UBS. Não entra nas metas, na internalização nem nas outras telas.</div>
        <div className="form" style={{ marginTop: 10 }}>
          <div className="campo">
            <label htmlFor="crProd">Produtividade do produtor (sc/ha)</label>
            <input id="crProd" type="number" min={0} step="0.1" placeholder="informada pelo produtor" value={prod}
              onChange={(e) => setProd(e.target.value)} onBlur={gravarProd} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            <div className="hint">Produtividade geral da área, em sacos de {n0(P.kg)} kg por hectare.</div>
          </div>
        </div>
        {r.potencialSc != null && r.prodHa != null ? (
          <div className="reais" style={{ marginTop: 10 }}>
            <div className="real"><span>Potencial da área</span><b>{n0(r.potencialSc)} sc</b><small>{n1(r.prodHa)} sc/ha × {n1(r.areaBase)} ha{r.parcial ? ' já colhidos' : ''}</small></div>
            <div className="real" data-testid="nao-enviado"><span>Deixou de ir para a UBS</span><b>{r.naoEnviadoSc != null ? `${n0(r.naoEnviadoSc)} sc` : '—'}</b>
              <small>{r.naoEnviadoSc != null && r.potencialSc > 0 ? `${n1((r.naoEnviadoSc / r.potencialSc) * 100)}% do potencial · potencial − entregue` : 'aparece depois do 1º lançamento de volume'}</small></div>
            <div className="real" data-testid="aprov-semente"><span>Aproveitamento para semente</span><b>{r.aprovPct != null ? `${n1(r.aprovPct)}%` : '—'}</b><small>aprovado e internalizado ÷ potencial</small></div>
          </div>
        ) : (
          <div className="sub" style={{ marginTop: 8 }}>Informe a produtividade que o produtor passar para ver o potencial da área e quanto dele deixou de ir para a UBS.</div>
        )}
        {temVolume && emAndamento && !r.parcial && r.potencialSc != null && <div className="sub" style={{ marginTop: 6 }}>Colheita em andamento: a comparação está sendo feita contra o campo inteiro. Informe a área colhida nos lançamentos para ver o parcial, ou finalize a colheita.</div>}
      </div>
    </div>
  );
}

interface ResumoTec {
  tecnico: Tecnico | undefined;
  id: string;
  dias: Record<Atividade, number>;
  primeiro: string;
  ultimo: string;
}

/** Quem foi escalado para o campo ao longo do tempo (colheita e pré-colheita), sem limite de datas. */
function HistoricoTecnicos({ campo }: { campo: Campo }) {
  const d = useDados();
  const [alterando, setAlterando] = useState<string | null>(null);
  const todos = d.dados.programacoes.filter((p) => p.campo_id === campo.id).sort((a, b) => b.data.localeCompare(a.data));
  const validos = todos.filter((p) => p.status !== 'cancelado');
  const futuros = validos.filter((p) => p.data >= d.hoje);

  const porTec = new Map<string, ResumoTec>();
  for (const p of validos) {
    let x = porTec.get(p.tecnico_id);
    if (!x) porTec.set(p.tecnico_id, (x = { tecnico: d.tecnicoPorId.get(p.tecnico_id), id: p.tecnico_id, dias: { colheita_pre: 0, coleta_pre: 0 }, primeiro: p.data, ultimo: p.data }));
    x.dias[p.atividade]++;
    if (p.data < x.primeiro) x.primeiro = p.data;
    if (p.data > x.ultimo) x.ultimo = p.data;
  }
  const resumo = [...porTec.values()].sort((a, b) => a.primeiro.localeCompare(b.primeiro));
  const quando = (p: Programacao) => (p.data > d.hoje ? 'futuro' : p.data === d.hoje ? 'hoje' : 'passado');

  function exportar() {
    const l: (string | number | null)[][] = [['Campo', 'Data', 'Dia', 'Técnico', 'Atividade', 'Andamento', 'Observação']];
    for (const p of [...todos].reverse()) {
      l.push([campo.num_campo, br(p.data), diaSemana(p.data), d.tecnicoPorId.get(p.tecnico_id)?.nome ?? '(excluído)', ATIVIDADES[p.atividade].curto, STATUS_PROG[p.status], p.observacoes]);
    }
    baixar(`historico_tecnicos_${campo.num_campo}.csv`, csv(l), 'text/csv;charset=utf-8');
  }

  return (
    <div className="secao" data-testid="historico-tecnicos">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <h3>Histórico de técnicos no campo</h3>
          <div className="sub">
            {validos.length
              ? `${validos.length} escala(s) de ${resumo.length} técnico(s), de ${br(validos[validos.length - 1].data)} a ${br(validos[0].data)}${futuros.length ? ` · ${futuros.length} de hoje em diante` : ''}.`
              : todos.length ? 'Só há escalas canceladas.' : 'Nenhuma programação para este campo.'}
          </div>
        </div>
        <div className="btns">
          {todos.length > 0 && <button className="btn" onClick={exportar}>Exportar CSV</button>}
          <button className="btn" onClick={() => ir('programacao', { data: somaDias(d.hoje, 1), campo: campo.id })}>Programar técnico</button>
        </div>
      </div>
      {resumo.length > 0 && (
        <div className="hist-tecs">
          {resumo.map((x) => (
            <div className="hist-tec" key={x.id} style={{ borderLeftColor: x.tecnico?.cor }}>
              <b>{x.tecnico?.nome ?? 'Técnico excluído'}</b>
              <span>{[x.dias.colheita_pre ? `${x.dias.colheita_pre}× colheita` : null, x.dias.coleta_pre ? `${x.dias.coleta_pre}× pré-colheita` : null].filter(Boolean).join(' · ')}</span>
              <small>{x.primeiro === x.ultimo ? br(x.primeiro) : `${br(x.primeiro)} a ${br(x.ultimo)}`}</small>
            </div>
          ))}
        </div>
      )}
      {todos.length > 0 && (
        <div className="tbl-wrap" style={{ maxHeight: 420, marginTop: 8 }}>
          <table>
            <thead><tr><th>Data</th><th>Técnico</th><th>Atividade</th><th>Andamento</th><th>Obs.</th><th /></tr></thead>
            <tbody>
              {todos.map((p) => {
                const t = d.tecnicoPorId.get(p.tecnico_id);
                return (
                  <Fragment key={p.id}>
                    <tr className={p.status === 'cancelado' ? 'off' : ''} data-quando={quando(p)}>
                      <td className="nowrap">{br(p.data)} ({diaSemana(p.data)}){p.data === d.hoje && <span className="badge man" style={{ marginLeft: 6 }}>hoje</span>}</td>
                      <td>{t ? <TecChip t={t} /> : '—'}</td>
                      <td>{ATIVIDADES[p.atividade].curto}</td>
                      <td><span className={'badge' + (p.status === 'realizado' ? ' feito' : '')}>{STATUS_PROG[p.status]}</span></td>
                      <td>{p.observacoes ?? ''}</td>
                      <td className="n nowrap">
                        <button className="btn mini" onClick={() => setAlterando(alterando === p.id ? null : p.id)}>{alterando === p.id ? 'Pronto' : 'Alterar'}</button>{' '}
                        <button className="btn mini perigo" aria-label={`Remover programação de ${br(p.data)}`}
                          onClick={() => (p.data >= d.hoje || confirm(`Remover do histórico a escala de ${br(p.data)}? Para manter o registro, prefira marcar como cancelada.`)) && void d.excluirProgramacao(p.id)}>Remover</button>
                      </td>
                    </tr>
                    {alterando === p.id && (
                      <tr><td colSpan={6}><div className="item" style={{ margin: 0 }}><ControlesProg prog={p} /></div></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const VAZIO: CampoPlanilha = {
  chave: '', num_campo: '', cliente: null, propriedade: null, cidade: null, uf: 'GO', produto: null, obtentor: null, biotec: null,
  peneira: null, categoria_plantada: null, categoria_colher: 'S1', tipo_contrato: null, vendedor: null, uso_semente: null,
  proprio_terceiro: null, acao: null, autorizacao: null, contrato: null, talhao: null, data_plantio: null, ciclo: null,
  data_colheita_prevista: null, data_floracao: null, area_mapa: 0, area_projetada: 0, area_real: 0, expectativa_sc: 0,
  toneladas_mapa: 0, latitude: null, longitude: null, linhas: [],
};

/** Cadastro manual / edição dos dados básicos do campo. */
export function FormCampo({ campo, onFim }: { campo?: Campo; onFim: () => void }) {
  const d = useDados();
  const [f, setF] = useState<Record<string, string>>(() => {
    const b = campo ?? VAZIO;
    const s = (v: unknown) => (v == null ? '' : String(v));
    return {
      num_campo: s(b.num_campo), categoria_colher: s(b.categoria_colher), cliente: s(b.cliente), propriedade: s(b.propriedade),
      cidade: s(b.cidade), uf: s(b.uf), produto: s(b.produto), obtentor: s(b.obtentor), talhao: s(b.talhao),
      area_mapa: s(b.area_mapa || ''), data_plantio: s(b.data_plantio), ciclo: s(b.ciclo), data_colheita_prevista: s(b.data_colheita_prevista),
      expectativa_sc: s(b.expectativa_sc || ''), latitude: s(b.latitude), longitude: s(b.longitude), observacoes: s(campo?.observacoes),
    };
  });
  const [salvando, setSalvando] = useState(false);
  const inp = (k: string, rotulo: string, tipo = 'text', extra: Record<string, unknown> = {}) => (
    <div className="campo">
      <label htmlFor={'fc_' + k}>{rotulo}</label>
      <input id={'fc_' + k} type={tipo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
    </div>
  );

  async function salvar() {
    const t = (k: string) => f[k].trim() || null;
    if (!t('num_campo')) return d.avisar('Informe o nº do campo.', 'erro');
    // aceita o par copiado do Google Maps ("-18.792100, -52.615300") colado no campo da latitude
    const par = /^\s*(-?\d{1,2}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)\s*$/.exec(f.latitude);
    const lat = par ? Number(par[1]) : num(f.latitude);
    const lng = par ? Number(par[2]) : num(f.longitude);
    if ((lat == null) !== (lng == null)) return d.avisar('Preencha latitude e longitude (ou deixe as duas em branco).', 'erro');
    if (lat != null && (Math.abs(lat) > 90 || Math.abs(lng!) > 180)) return d.avisar('Coordenada inválida. Use graus decimais, ex.: -17.494824 e -51.600491.', 'erro');
    const plantio = t('data_plantio');
    const ciclo = num(f.ciclo);
    const area = num(f.area_mapa) ?? 0;
    const basico = {
      num_campo: t('num_campo')!, categoria_colher: t('categoria_colher'), cliente: t('cliente'), propriedade: t('propriedade'),
      cidade: t('cidade')?.toUpperCase() ?? null, uf: t('uf')?.toUpperCase() ?? null, produto: t('produto'), obtentor: t('obtentor'), talhao: t('talhao'),
      area_mapa: area, data_plantio: plantio, ciclo: ciclo == null ? null : Math.round(ciclo),
      data_colheita_prevista: t('data_colheita_prevista') ?? (plantio && ciclo != null ? somaDias(plantio, Math.round(ciclo)) : null),
      expectativa_sc: num(f.expectativa_sc) ?? 0, latitude: lat, longitude: lng,
    };
    setSalvando(true);
    let ok = false;
    if (campo) {
      ok = await d.atualizarCampos([campo.id], { ...basico, observacoes: t('observacoes') }, 'Campo atualizado.');
    } else {
      const novo: CampoPlanilha = { ...VAZIO, ...basico, area_projetada: area, toneladas_mapa: 0, chave: '' };
      novo.chave = chaveCampo(novo);
      if (d.dados.campos.some((c) => c.chave === novo.chave)) {
        setSalvando(false);
        return d.avisar('Já existe um campo com esse nº e essa categoria a colher.', 'erro');
      }
      const r = await d.importarCampos([novo]);
      ok = !!r;
      if (ok) d.avisar('Campo cadastrado.');
    }
    setSalvando(false);
    if (ok) onFim();
  }

  return (
    <>
      <h3>{campo ? 'Editar dados do campo' : 'Novo campo'}</h3>
      <div className="form">
        {inp('num_campo', 'Nº do campo', 'text', { disabled: !!campo })}
        {inp('categoria_colher', 'Categoria a colher', 'text', { disabled: !!campo, placeholder: 'S1, S2, C2…' })}
        {inp('cliente', 'Cliente')}
        {inp('propriedade', 'Fazenda')}
        {inp('cidade', 'Cidade')}
        {inp('uf', 'UF', 'text', { maxLength: 2 })}
        {inp('produto', 'Cultivar')}
        {inp('obtentor', 'Obtentor')}
        {inp('talhao', 'Talhão')}
        {inp('area_mapa', 'Área MAPA (ha)', 'number', { min: 0, step: '0.1' })}
        {inp('expectativa_sc', 'Expectativa (sc)', 'number', { min: 0, step: '1' })}
        {inp('data_plantio', 'Data de plantio', 'date')}
        {inp('ciclo', 'Ciclo (dias)', 'number', { min: 1, step: '1' })}
        {inp('data_colheita_prevista', 'Colheita prevista', 'date')}
        {inp('latitude', 'Latitude (ou o par do Google Maps)', 'text', { placeholder: '-17.494824  ou  -17.494824, -51.600491' })}
        {inp('longitude', 'Longitude (graus decimais)', 'text', { placeholder: '-51.600491', inputMode: 'decimal' })}
        {campo && <div className="campo largo">
          <label htmlFor="fc_obs">Observações</label>
          <textarea id="fc_obs" value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        </div>}
      </div>
      {campo && <p className="sub">Ao reimportar a planilha, os dados que vêm dela (cliente, áreas, datas, coordenadas…) voltam a valer.</p>}
      <div className="btns" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        <button className="btn" onClick={onFim}>Cancelar</button>
      </div>
    </>
  );
}

import { useState } from 'react';
import { useDados } from '../lib/dados';
import { br, dataProvavel, diaSemana, somaDias } from '../lib/dates';
import { n1, n2, num } from '../lib/format';
import { haversine } from '../lib/geo';
import { chaveCampo } from '../lib/importPlanting';
import { ir } from '../lib/rota';
import { ATIVIDADES, type Campo, type CampoPlanilha } from '../lib/types';
import { linkMapa } from '../lib/whatsapp';
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
  const progs = d.dados.programacoes.filter((p) => p.campo_id === campo.id).sort((a, b) => b.data.localeCompare(a.data));
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

      <div className="secao">
        <div className="card-head" style={{ marginBottom: 8 }}>
          <h3>Técnicos programados</h3>
          <button className="btn" onClick={() => ir('programacao', { data: somaDias(d.hoje, 1), campo: campo.id })}>Programar técnico</button>
        </div>
        {progs.length === 0 ? <div className="sub">Nenhuma programação para este campo.</div> : (
          <div className="tbl-wrap" style={{ maxHeight: 220 }}>
            <table>
              <thead><tr><th>Data</th><th>Técnico</th><th>Atividade</th><th>Obs.</th></tr></thead>
              <tbody>
                {progs.slice(0, 30).map((p) => {
                  const t = d.tecnicoPorId.get(p.tecnico_id);
                  return (
                    <tr key={p.id} className={p.status === 'cancelado' ? 'off' : ''}>
                      <td className="nowrap">{br(p.data)} ({diaSemana(p.data)})</td>
                      <td>{t ? <TecChip t={t} /> : '—'}</td>
                      <td>{ATIVIDADES[p.atividade].curto}</td>
                      <td>{p.observacoes ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    const lat = num(f.latitude);
    const lng = num(f.longitude);
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
        {inp('latitude', 'Latitude (graus decimais)', 'text', { placeholder: '-17.494824', inputMode: 'decimal' })}
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

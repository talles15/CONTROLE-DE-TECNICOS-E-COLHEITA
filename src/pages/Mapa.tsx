import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { BarraFiltros, ordCampo, passa, SeletorCampo, Sit, useFiltros, valorDim } from '../components/ui';
import { useDados } from '../lib/dados';
import { baixar, csv, n0, n1, num } from '../lib/format';
import { faixaDe, haversine, posicoes, rotulosFaixas, volumePorFaixa, type ItemVolume } from '../lib/geo';
import { areaDe, sacosCampo } from '../lib/projecao';
import { abrirFicha } from '../lib/rota';
import { encerrado, ORDEM_SITUACAO, SITUACOES, type Situacao } from '../lib/status';
import type { Campo } from '../lib/types';

type Metrica = 'exp' | 'aprov' | 'ton' | 'area';
const METRICAS: Record<Metrica, { rotulo: string; un: string }> = {
  exp: { rotulo: 'Expectativa de produção da planilha (sc)', un: 'sc' },
  aprov: { rotulo: 'Sacos aproveitados (parâmetros da internalização)', un: 'sc' },
  ton: { rotulo: 'Toneladas aproveitadas', un: 't' },
  area: { rotulo: 'Área (ha)', un: 'ha' },
};
const GRUPOS: [string, string][] = [['produto', 'Cultivar'], ['obtentor', 'Obtentor'], ['categoria_colher', 'Categoria a colher'], ['cidade', 'Cidade'], ['cliente', 'Cliente']];
// cores fixas (o fundo do mapa é sempre claro)
const CORES: Record<Situacao, string> = { plantado: '#8a897f', dessecado: '#d98a00', programada: '#2a78d6', em_colheita: '#0c8a2c', colhido: '#3d4657', descartado: '#b83232' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Ponto {
  campo: Campo;
  lat: number | null;
  lng: number | null;
  aprox: boolean;
  dist: number | null;
  faixa: number | null;
  valor: number;
  grupo: string;
  sit: Situacao;
}
interface Selecao {
  grupo: string | null;
  faixa: number | 'sem' | null;
}

export default function Mapa() {
  const d = useDados();
  const { config } = d.dados;
  const { ubs, faixas, params: P } = config;
  const [filtros, setFiltros] = useFiltros('ctc_filtros_mapa');
  const [metrica, setMetrica] = useState<Metrica>('exp');
  const [grupo, setGrupo] = useState('produto');
  const [acumulado, setAcumulado] = useState(false);
  const [soPendente, setSoPendente] = useState(false);
  const [aproximar, setAproximar] = useState(false);
  const [sel, setSel] = useState<Selecao | null>(null);
  const [foco, setFoco] = useState<{ id: string; n: number } | null>(null);

  const ativos = useMemo(() => d.dados.campos.filter((c) => c.ativo), [d.dados.campos]);

  const pontos = useMemo<Ponto[]>(() => {
    const pos = posicoes(ativos, aproximar);
    const valor = (c: Campo): number => {
      if (metrica === 'exp') return c.expectativa_sc;
      if (metrica === 'area') return areaDe(c, P);
      const s = sacosCampo(c, P).aprov;
      return metrica === 'ton' ? (s * P.kg) / 1000 : s;
    };
    return ativos
      .filter((c) => passa(c, filtros) && (!soPendente || !encerrado(c)))
      .map((c) => {
        const p = pos.get(c.id);
        const dist = p ? haversine(ubs.lat, ubs.lng, p.lat, p.lng) : null;
        return {
          campo: c, lat: p?.lat ?? null, lng: p?.lng ?? null, aprox: p?.aprox ?? false, dist,
          faixa: dist == null ? null : faixaDe(dist, faixas), valor: valor(c), grupo: valorDim(c, grupo), sit: d.resumos.get(c.id)!.situacao,
        };
      });
  }, [ativos, filtros, soPendente, aproximar, metrica, grupo, P, ubs.lat, ubs.lng, faixas, d.resumos]);

  const tabela = useMemo(() => {
    const itens: ItemVolume[] = pontos.map((p) => ({ grupo: p.grupo, faixa: p.faixa, valor: p.valor }));
    return volumePorFaixa(itens, faixas.length, acumulado);
  }, [pontos, faixas.length, acumulado]);
  const rotulos = rotulosFaixas(faixas, acumulado);

  const naSelecao = useCallback(
    (p: Ponto): boolean => {
      if (!sel) return true;
      if (sel.grupo != null && p.grupo !== sel.grupo) return false;
      if (sel.faixa === 'sem') return p.faixa == null;
      if (sel.faixa != null) return p.faixa != null && (acumulado ? p.faixa <= sel.faixa : p.faixa === sel.faixa);
      return true;
    },
    [sel, acumulado],
  );

  const comPos = pontos.filter((p) => p.dist != null);
  const semPosicaoAtivos = pontos.filter((p) => p.dist == null && p.sit !== 'plantado').sort((a, b) => ordCampo(a.campo, b.campo));
  const volPos = comPos.reduce((s, p) => s + p.valor, 0);
  const volTot = pontos.reduce((s, p) => s + p.valor, 0);
  const distMedia = volPos > 0 ? comPos.reduce((s, p) => s + p.valor * p.dist!, 0) / volPos : 0;
  const maisLonge = comPos.reduce<Ponto | null>((m, p) => (p.dist! > (m?.dist ?? -1) ? p : m), null);
  const un = METRICAS[metrica].un;
  const fmt = (v: number) => (metrica === 'ton' ? n1(v) : n0(v));
  const max = Math.max(1, ...tabela.linhas.flatMap((l) => (acumulado ? [l.total] : [...l.faixas, l.semCoord])));
  const cor = (v: number) => (v > 0 ? { background: `color-mix(in srgb, var(--series-1) ${Math.round(8 + 62 * Math.min(1, v / max))}%, transparent)` } : undefined);
  const selecionados = sel ? pontos.filter(naSelecao).sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9)) : [];
  const ehSel = (g: string | null, f: number | 'sem' | null) => !!sel && sel.grupo === g && sel.faixa === f;
  const alternar = (g: string | null, f: number | 'sem' | null) => setSel(ehSel(g, f) ? null : { grupo: g, faixa: f });

  function exportar() {
    const l: (string | number | null)[][] = [['Campo', 'Cat. a colher', 'Cliente', 'Fazenda', 'Cidade', 'Cultivar', 'Situação', `Distância da ${ubs.nome} (km)`, 'Faixa', 'Posição', METRICAS[metrica].rotulo]];
    const rf = rotulosFaixas(faixas, false);
    for (const p of [...pontos].sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9))) {
      l.push([p.campo.num_campo, p.campo.categoria_colher, p.campo.cliente, p.campo.propriedade, p.campo.cidade, p.campo.produto, SITUACOES[p.sit].rotulo,
        p.dist == null ? null : +p.dist.toFixed(1), p.faixa == null ? 'sem coordenada' : rf[p.faixa], p.dist == null ? '' : p.aprox ? 'aproximada (município)' : 'coordenada do campo', +p.valor.toFixed(1)]);
    }
    baixar(`campos_por_distancia_${d.hoje}.csv`, csv(l), 'text/csv;charset=utf-8');
  }

  return (
    <>
      <section className="card">
        <div className="card-head" style={{ marginBottom: 8 }}>
          <div>
            <h2>Mapa dos campos e volume por distância</h2>
            <div className="sub">Referência: <b>{ubs.nome}</b> ({ubs.lat.toFixed(6)}, {ubs.lng.toFixed(6)}). Distâncias em linha reta.</div>
          </div>
          <button className="btn" onClick={exportar}>Exportar CSV (campos e distâncias)</button>
        </div>
        <BarraFiltros campos={ativos} filtros={filtros} onMudar={setFiltros} />
        <div className="form" style={{ marginTop: 12 }}>
          <div className="campo" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="mMet">Volume mostrado</label>
            <select id="mMet" value={metrica} onChange={(e) => setMetrica(e.target.value as Metrica)}>
              {(Object.keys(METRICAS) as Metrica[]).map((m) => <option key={m} value={m}>{METRICAS[m].rotulo}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="mGrupo">Abrir por</label>
            <select id="mGrupo" value={grupo} onChange={(e) => { setGrupo(e.target.value); setSel(null); }}>
              {GRUPOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="mVisao">Visão</label>
            <select id="mVisao" value={acumulado ? 'acc' : 'faixa'} onChange={(e) => { setAcumulado(e.target.value === 'acc'); setSel(null); }}>
              <option value="faixa">Por faixa (10–20 km, 20–50 km…)</option>
              <option value="acc">Acumulada (até X km)</option>
            </select>
          </div>
          <label className="check"><input type="checkbox" checked={soPendente} onChange={(e) => setSoPendente(e.target.checked)} /> Só volume ainda não colhido</label>
          <label className="check"><input type="checkbox" checked={aproximar} onChange={(e) => setAproximar(e.target.checked)} /> Posicionar campos sem coordenada pela média do município</label>
        </div>
      </section>

      <div className="kpis">
        <div className="kpi hl"><div className="k">Volume com posição</div><div className="v">{fmt(volPos)} {un}</div><div className="s">{comPos.length} campos no mapa</div></div>
        <div className={'kpi' + (pontos.length - comPos.length ? ' warn' : '')}><div className="k">Sem coordenada</div><div className="v">{pontos.length - comPos.length} campos</div><div className="s">{fmt(volTot - volPos)} {un} fora das faixas</div></div>
        <div className="kpi"><div className="k">Distância média (ponderada pelo volume)</div><div className="v">{n1(distMedia)} km</div><div className="s">até a {ubs.nome}</div></div>
        <div className="kpi"><div className="k">Campo mais distante</div><div className="v">{maisLonge ? n1(maisLonge.dist!) + ' km' : '—'}</div><div className="s">{maisLonge ? `${maisLonge.campo.num_campo} · ${maisLonge.campo.cidade ?? ''}` : ''}</div></div>
      </div>

      <section className="card">
        <div className="form larga" style={{ marginBottom: 12 }}>
          <div className="campo" style={{ gridColumn: 'span 2' }}>
            <label>Localizar campo no mapa</label>
            <SeletorCampo campos={ativos} valor={foco?.id ?? null} placeholder="Digite o nº do campo, agricultor ou fazenda…"
              onEscolher={(id) => {
                if (!id) return setFoco(null);
                const p = pontos.find((x) => x.campo.id === id);
                if (!p) return d.avisar('Esse campo está fora dos filtros atuais. Limpe os filtros para localizá-lo.', 'erro');
                if (p.lat == null) {
                  d.avisar(`O campo ${p.campo.num_campo} não tem coordenada, por isso não aparece no mapa. Preencha na ficha do campo.`, 'erro');
                  return abrirFicha(id);
                }
                setFoco({ id, n: Date.now() });
              }} />
          </div>
        </div>
        {semPosicaoAtivos.length > 0 && (
          <div className="caixa-info atencao" data-testid="sem-coordenada">
            <b>{semPosicaoAtivos.length} campo(s) com dessecação ou colheita não aparecem no mapa por falta de coordenada:</b>{' '}
            {semPosicaoAtivos.map((p) => (
              <button key={p.campo.id} className="btn mini" style={{ margin: '2px 4px 2px 0' }} onClick={() => abrirFicha(p.campo.id)} title="Abrir a ficha para preencher a coordenada">
                {p.campo.num_campo} · <Sit s={p.sit} />
              </button>
            ))}
            <div className="sub" style={{ marginTop: 4 }}>Clique no campo, depois em “Editar dados do campo”, e cole a latitude e a longitude (pode ser o par copiado do Google Maps).</div>
          </div>
        )}
        <MapaLeaflet pontos={pontos} naSelecao={naSelecao} temSel={!!sel} ubs={ubs} faixas={faixas} foco={foco} />
        <div className="legend" style={{ marginTop: 10 }}>
          {ORDEM_SITUACAO.map((s) => <span key={s}><i className="bola" style={{ background: CORES[s] }} />{SITUACOES[s].rotulo}</span>)}
          <span><i style={{ background: '#d03b3b', transform: 'rotate(45deg)' }} />{ubs.nome}</span>
          {aproximar && <span><i className="bola" style={{ background: 'transparent', border: '2px dashed var(--text-secondary)' }} />Posição aproximada (município)</span>}
          <span><i className="line" style={{ borderColor: '#1c5cab' }} />Anéis: {faixas.join(', ')} km</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Volume disponível por {GRUPOS.find(([k]) => k === grupo)?.[1].toLowerCase()} e distância da {ubs.nome}</h2>
            <div className="sub">{METRICAS[metrica].rotulo}. Clique em uma célula para destacar os campos no mapa e listá-los abaixo.</div>
          </div>
          {sel && <button className="btn" onClick={() => setSel(null)}>Limpar seleção</button>}
        </div>
        <div className="tbl-wrap heat" data-testid="tabela-distancia" style={{ maxHeight: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>{GRUPOS.find(([k]) => k === grupo)?.[1]}</th>
                {rotulos.map((r, i) => <th key={i} className="n">{r}</th>)}
                <th className="n">sem coordenada</th>
                <th className="n">Total</th>
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map((l) => (
                <tr key={l.grupo}>
                  <td className="nowrap"><button className="btn mini" onClick={() => alternar(l.grupo, null)}>{l.grupo}</button></td>
                  {l.faixas.map((v, i) => (
                    <td key={i} className={'c clic' + (ehSel(l.grupo, i) ? ' sel' : '')} style={cor(v)} onClick={() => alternar(l.grupo, i)}>{v > 0 ? fmt(v) : ''}</td>
                  ))}
                  <td className={'c clic' + (ehSel(l.grupo, 'sem') ? ' sel' : '')} onClick={() => alternar(l.grupo, 'sem')}>{l.semCoord > 0 ? fmt(l.semCoord) : ''}</td>
                  <td className="n"><b>{fmt(l.total)}</b></td>
                </tr>
              ))}
              {tabela.linhas.length === 0 && <tr><td colSpan={rotulos.length + 3} className="empty">Nenhum campo nos filtros atuais.</td></tr>}
              <tr className="tot">
                <td>Total</td>
                {tabela.total.faixas.map((v, i) => <td key={i} className={'n clic' + (ehSel(null, i) ? ' sel' : '')} style={{ cursor: 'pointer' }} onClick={() => alternar(null, i)}>{fmt(v)}</td>)}
                <td className="n" style={{ cursor: 'pointer' }} onClick={() => alternar(null, 'sem')}>{fmt(tabela.total.semCoord)}</td>
                <td className="n">{fmt(tabela.total.total)}</td>
              </tr>
              {tabela.total.total > 0 && (
                <tr>
                  <td className="muted">% do total</td>
                  {tabela.total.faixas.map((v, i) => <td key={i} className="n muted">{n1((v / tabela.total.total) * 100)}%</td>)}
                  <td className="n muted">{n1((tabela.total.semCoord / tabela.total.total) * 100)}%</td>
                  <td className="n muted">100%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sel && (
          <>
            <h3 style={{ marginTop: 16 }}>
              {selecionados.length} campo(s): {sel.grupo ?? 'todos'} · {sel.faixa === 'sem' ? 'sem coordenada' : sel.faixa == null ? 'todas as distâncias' : rotulos[sel.faixa]} — {fmt(selecionados.reduce((s, p) => s + p.valor, 0))} {un}
            </h3>
            <div className="tbl-wrap" style={{ maxHeight: 340 }}>
              <table>
                <thead><tr><th>Campo</th><th>Cliente · Fazenda</th><th>Cidade</th><th>Cultivar</th><th>Situação</th><th className="n">Distância</th><th className="n">{un}</th></tr></thead>
                <tbody>
                  {selecionados.map((p) => (
                    <tr key={p.campo.id} className="clic" onClick={() => abrirFicha(p.campo.id)}>
                      <td><b>{p.campo.num_campo}</b> <span className="muted">{p.campo.categoria_colher}</span></td>
                      <td>{[p.campo.cliente, p.campo.propriedade].filter(Boolean).join(' · ')}</td>
                      <td>{p.campo.cidade}</td><td>{p.campo.produto}</td>
                      <td><span className="sit"><i style={{ background: SITUACOES[p.sit].cor }} />{SITUACOES[p.sit].rotulo}</span></td>
                      <td className="n">{p.dist != null ? `${n1(p.dist)} km${p.aprox ? ' ≈' : ''}` : '—'}</td>
                      <td className="n">{fmt(p.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Referencia />
    </>
  );
}

function MapaLeaflet({ pontos, naSelecao, temSel, ubs, faixas, foco }: {
  pontos: Ponto[];
  naSelecao: (p: Ponto) => boolean;
  temSel: boolean;
  ubs: { nome: string; lat: number; lng: number };
  faixas: number[];
  foco: { id: string; n: number } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camadas = useRef<{ aneis: L.LayerGroup; campos: L.LayerGroup } | null>(null);
  const enquadrado = useRef('');
  const marcadores = useRef(new Map<string, L.CircleMarker>());

  useEffect(() => {
    if (!el.current || mapa.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([ubs.lat, ubs.lng], 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    camadas.current = { aneis: L.layerGroup().addTo(m), campos: L.layerGroup().addTo(m) };
    m.on('popupopen', (e) => {
      const b = e.popup.getElement()?.querySelector<HTMLButtonElement>('button[data-ficha]');
      if (b) b.onclick = () => abrirFicha(b.dataset.ficha!);
    });
    mapa.current = m;
    setTimeout(() => m.invalidateSize(), 50);
    return () => {
      m.remove();
      mapa.current = null;
      camadas.current = null;
    };
    // o mapa é criado uma única vez; posição e camadas são atualizadas nos efeitos abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UBS e anéis
  useEffect(() => {
    const c = camadas.current;
    if (!c) return;
    c.aneis.clearLayers();
    for (const km of faixas) {
      L.circle([ubs.lat, ubs.lng], { radius: km * 1000, color: '#1c5cab', weight: 1.3, fill: false, dashArray: '6 5', interactive: false }).addTo(c.aneis);
      L.marker([ubs.lat + km / 111.19, ubs.lng], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<span class="rotulo-anel">${km} km</span>` }),
      }).addTo(c.aneis);
    }
    L.marker([ubs.lat, ubs.lng], {
      icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="ubs-pino"></div>' }),
      zIndexOffset: 1000, title: ubs.nome,
    }).bindPopup(`<b>${esc(ubs.nome)}</b><br>Ponto de referência das distâncias`).addTo(c.aneis);
  }, [ubs.lat, ubs.lng, ubs.nome, faixas]);

  // campos
  useEffect(() => {
    const c = camadas.current;
    const m = mapa.current;
    if (!c || !m) return;
    c.campos.clearLayers();
    marcadores.current.clear();
    const limites: L.LatLngTuple[] = [[ubs.lat, ubs.lng]];
    // campos com dessecação/colheita são desenhados por último, para ficarem por cima dos demais
    const ordem = [...pontos].sort((a, b) => ORDEM_SITUACAO.indexOf(a.sit) - ORDEM_SITUACAO.indexOf(b.sit));
    for (const p of ordem) {
      if (p.lat == null || p.lng == null) continue;
      const dentro = naSelecao(p);
      limites.push([p.lat, p.lng]);
      const mk = L.circleMarker([p.lat, p.lng], {
        radius: temSel && dentro ? 8 : 6,
        color: temSel && dentro ? '#0b0b0b' : '#ffffff',
        weight: temSel && dentro ? 2 : 1.2,
        dashArray: p.aprox ? '3 3' : undefined,
        fillColor: CORES[p.sit],
        fillOpacity: dentro ? (p.aprox ? 0.55 : 0.92) : 0.15,
        opacity: dentro ? 1 : 0.25,
      });
      const cp = p.campo;
      mk.bindPopup(
        `<b>Campo ${esc(cp.num_campo)}</b> · cat. ${esc(cp.categoria_colher ?? '—')}<br>` +
          `${esc([cp.cliente, cp.propriedade].filter(Boolean).join(' · '))}<br>` +
          `${esc(cp.cidade ?? '')} · ${esc(cp.produto ?? '')}<br>` +
          `${esc(n1(cp.area_mapa))} ha · ${esc(SITUACOES[p.sit].rotulo)}<br>` +
          `<b>${esc(n1(p.dist ?? 0))} km</b> da ${esc(ubs.nome)}${p.aprox ? ' (posição aproximada)' : ''}<br>` +
          `<button data-ficha="${esc(cp.id)}">Abrir ficha do campo</button>`,
      );
      mk.bindTooltip(cp.num_campo, { direction: 'top', offset: [0, -6] });
      marcadores.current.set(cp.id, mk);
      if (dentro && temSel) mk.addTo(c.campos).bringToFront();
      else mk.addTo(c.campos);
    }
    // enquadra quando muda o conjunto de campos (não a cada clique de seleção)
    const chave = `${ubs.lat},${ubs.lng}|${limites.length}`;
    if (enquadrado.current !== chave && limites.length > 1) {
      enquadrado.current = chave;
      m.fitBounds(L.latLngBounds(limites).pad(0.08), { maxZoom: 11 });
    }
  }, [pontos, naSelecao, temSel, ubs.lat, ubs.lng, ubs.nome]);

  // "Localizar campo": aproxima e abre o balão do campo escolhido
  useEffect(() => {
    const mk = foco ? marcadores.current.get(foco.id) : null;
    if (!mk || !mapa.current) return;
    mapa.current.setView(mk.getLatLng(), Math.max(mapa.current.getZoom(), 12));
    mk.bringToFront();
    mk.openPopup();
  }, [foco]);

  return <div className="mapa" ref={el} data-testid="mapa" />;
}

function Referencia() {
  const d = useDados();
  const { config } = d.dados;
  const [nome, setNome] = useState(config.ubs.nome);
  const [lat, setLat] = useState(String(config.ubs.lat));
  const [lng, setLng] = useState(String(config.ubs.lng));
  const [fx, setFx] = useState(config.faixas.join(', '));
  const [aviso, setAviso] = useState(String(config.avisoDias));

  function aplicar() {
    const la = num(lat), lo = num(lng);
    if (la == null || lo == null || Math.abs(la) > 90 || Math.abs(lo) > 180) return d.avisar('Coordenada inválida. Use graus decimais, ex.: -17.494824 e -51.600491.', 'erro');
    const lista = [...new Set(fx.split(/[;,\s]+/).map((x) => num(x)).filter((x): x is number => x != null && x > 0))].sort((a, b) => a - b);
    if (!lista.length) return d.avisar('Informe ao menos uma distância em km.', 'erro');
    const av = num(aviso);
    d.salvarConfig({ ...config, ubs: { nome: nome.trim() || 'UBS', lat: la, lng: lo }, faixas: lista, avisoDias: av != null && av >= 1 ? Math.round(av) : 1 });
    d.avisar('Referência atualizada.');
  }

  return (
    <section className="card">
      <details className="sec">
        <summary>Configurar ponto de referência, faixas e aviso</summary>
        <div className="form" style={{ marginTop: 12 }}>
          <div className="campo"><label htmlFor="rNome">Nome do ponto</label><input id="rNome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="campo"><label htmlFor="rLat">Latitude</label><input id="rLat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
          <div className="campo"><label htmlFor="rLng">Longitude</label><input id="rLng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></div>
          <div className="campo"><label htmlFor="rFx">Faixas de distância (km)</label><input id="rFx" value={fx} onChange={(e) => setFx(e.target.value)} /><div className="hint">Separadas por vírgula</div></div>
          <div className="campo"><label htmlFor="rAv">Aviso de pré-colheita (dias antes)</label><input id="rAv" type="number" min={1} max={7} value={aviso} onChange={(e) => setAviso(e.target.value)} /><div className="hint">Usado nos alertas do calendário</div></div>
          <div className="btns"><button className="btn primary" onClick={aplicar}>Aplicar</button></div>
        </div>
      </details>
    </section>
  );
}

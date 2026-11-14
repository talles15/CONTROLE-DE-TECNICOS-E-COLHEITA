import { useMemo, useState } from 'react';
import { FormCampo } from '../components/FichaCampo';
import { Modal, ordCampo, Sit, TecChip } from '../components/ui';
import { useDados } from '../lib/dados';
import { br, somaDias } from '../lib/dates';
import { csv, baixar, n0, n1, semAcento } from '../lib/format';
import { abrirFicha, ir } from '../lib/rota';
import { ORDEM_SITUACAO, SITUACOES, type Situacao } from '../lib/status';
import { DESCARTES, motivoDescarte, type Campo } from '../lib/types';

type Col = 'campo' | 'cliente' | 'cidade' | 'produto' | 'area' | 'prev' | 'dess' | 'prov' | 'sit' | 'intern';

export default function Campos() {
  const d = useDados();
  const [busca, setBusca] = useState('');
  const [sit, setSit] = useState<Situacao | ''>('');
  const [cidade, setCidade] = useState('');
  const [inativos, setInativos] = useState(false);
  const [ord, setOrd] = useState<{ col: Col; desc: boolean }>({ col: 'campo', desc: false });
  const [novo, setNovo] = useState(false);

  const cidades = useMemo(() => [...new Set(d.dados.campos.map((c) => c.cidade).filter((c): c is string => !!c))].sort(), [d.dados.campos]);
  const amanha = somaDias(d.hoje, 1);
  const tecDe = useMemo(() => {
    const m = new Map<string, { id: string; quando: string }[]>();
    for (const p of d.dados.programacoes) {
      if (p.status === 'cancelado' || (p.data !== d.hoje && p.data !== amanha)) continue;
      if (!m.has(p.campo_id)) m.set(p.campo_id, []);
      m.get(p.campo_id)!.push({ id: p.tecnico_id, quando: p.data === d.hoje ? 'hoje' : 'amanhã' });
    }
    return m;
  }, [d.dados.programacoes, d.hoje, amanha]);

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const val = (c: Campo): string | number => {
      const r = d.resumos.get(c.id)!;
      switch (ord.col) {
        case 'cliente': return c.cliente ?? '';
        case 'cidade': return c.cidade ?? '';
        case 'produto': return c.produto ?? '';
        case 'area': return c.area_mapa;
        case 'prev': return c.data_colheita_prevista ?? '9';
        case 'dess': return r.ultimaDessecacao ?? '9';
        case 'prov': return r.provavel ?? '9';
        case 'sit': return ORDEM_SITUACAO.indexOf(r.situacao);
        case 'intern': return d.reais.get(c.id)?.internSc ?? 0;
        default: return '';
      }
    };
    const f = d.dados.campos.filter((c) => {
      if (!inativos && !c.ativo) return false;
      if (sit && d.resumos.get(c.id)!.situacao !== sit) return false;
      if (cidade && c.cidade !== cidade) return false;
      if (q && !semAcento([c.num_campo, c.cliente, c.propriedade, c.cidade, c.produto, c.talhao].filter(Boolean).join(' ')).includes(q)) return false;
      return true;
    });
    f.sort((a, b) => {
      if (ord.col === 'campo') return ordCampo(a, b) * (ord.desc ? -1 : 1);
      const x = val(a), y = val(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt');
      return (r || ordCampo(a, b)) * (ord.desc ? -1 : 1);
    });
    return f;
  }, [d.dados.campos, d.resumos, d.reais, busca, sit, cidade, inativos, ord]);

  const th = (col: Col, rotulo: string, n = false) => (
    <th className={'ord' + (n ? ' n' : '')} onClick={() => setOrd({ col, desc: ord.col === col ? !ord.desc : false })}>
      {rotulo}{ord.col === col ? (ord.desc ? ' ▾' : ' ▴') : ''}
    </th>
  );

  function exportar() {
    const linhas: (string | number | null)[][] = [[
      'Campo', 'Categoria a colher', 'Cliente', 'Fazenda', 'Cidade', 'UF', 'Cultivar', 'Área MAPA (ha)', 'Colheita prevista (planilha)',
      'Última dessecação', 'Área dessecada (ha)', 'Colheita provável', 'Início colheita', 'Fim colheita', 'Situação',
      'Colhido (sc)', 'Aprovado e internalizado (sc)', 'Área ainda a colher (ha)',
      'Tipo de descarte', 'Motivo do descarte', 'Data do descarte', 'Área descartada (ha)', 'Volume descartado (sc)', 'Observações do encerramento',
    ]];
    for (const c of lista) {
      const r = d.resumos.get(c.id)!;
      const x = d.reais.get(c.id)!;
      linhas.push([c.num_campo, c.categoria_colher, c.cliente, c.propriedade, c.cidade, c.uf, c.produto, c.area_mapa, br(c.data_colheita_prevista),
        br(r.ultimaDessecacao), r.areaDessecada || null, br(r.provavel), br(c.colheita_inicio), br(c.colheita_fim), SITUACOES[r.situacao].rotulo,
        x.lancamentos.length ? Math.round(x.colhidoSc) : null, x.lancamentos.length ? Math.round(x.internSc) : null, +x.areaRestante.toFixed(1),
        c.descarte ? DESCARTES[c.descarte] : null, motivoDescarte(c.descarte_motivo) || null, c.descarte_data ? br(c.descarte_data) : null,
        c.descarte ? +x.areaDescartada.toFixed(1) : null, c.descarte ? Math.round(x.scDescartado) : null, c.encerramento_obs]);
    }
    baixar(`campos_${d.hoje}.csv`, csv(linhas), 'text/csv;charset=utf-8');
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Campos</h2>
          <div className="sub">{n0(lista.length)} de {n0(d.dados.campos.length)} campos · {n0(lista.reduce((s, c) => s + c.area_mapa, 0))} ha. Clique em um campo para registrar dessecação, colheita, volume colhido ou programar técnico.</div>
        </div>
        <div className="btns">
          <button className="btn primary" onClick={() => setNovo(true)}>+ Novo campo</button>
          <button className="btn" onClick={() => ir('importar')}>Importar planilha</button>
          <button className="btn" onClick={exportar}>Exportar CSV</button>
          <button className="btn" onClick={() => ir('ranking')}>Relatório de colheita e descartes</button>
        </div>
      </div>
      <div className="btns" style={{ marginBottom: 12 }}>
        <input className="search" placeholder="Buscar campo, cliente, fazenda, cultivar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="search" style={{ minWidth: 170 }} value={sit} onChange={(e) => setSit(e.target.value as Situacao | '')} aria-label="Situação">
          <option value="">Todas as situações</option>
          {ORDEM_SITUACAO.map((s) => <option key={s} value={s}>{SITUACOES[s].rotulo}</option>)}
        </select>
        <select className="search" style={{ minWidth: 170 }} value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade">
          <option value="">Todas as cidades</option>
          {cidades.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              {th('campo', 'Campo')}{th('cliente', 'Cliente · Fazenda')}{th('cidade', 'Cidade')}{th('produto', 'Cultivar')}
              {th('area', 'Área (ha)', true)}{th('prev', 'Prev. planilha')}{th('dess', 'Dessecação')}{th('prov', 'Colheita provável')}{th('sit', 'Situação')}
              {th('intern', 'Internalizado (sc)', true)}
              <th>Técnico</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const r = d.resumos.get(c.id)!;
              const tecs = tecDe.get(c.id) ?? [];
              const x = d.reais.get(c.id)!;
              return (
                <tr key={c.id} className={'clic' + (c.ativo ? '' : ' off')} onClick={() => abrirFicha(c.id)}>
                  <td className="nowrap"><b>{c.num_campo}</b> <span className="muted">{c.categoria_colher}</span></td>
                  <td>{c.cliente}<div className="muted">{c.propriedade}</div></td>
                  <td className="nowrap">{c.cidade}</td>
                  <td>{c.produto}</td>
                  <td className="n">{n1(c.area_mapa)}</td>
                  <td className="nowrap">{br(c.data_colheita_prevista)}</td>
                  <td className="nowrap">{r.ultimaDessecacao ? <>{br(r.ultimaDessecacao)}{r.areaDessecada ? <span className="muted"> · {n0(r.areaDessecada)} ha</span> : null}</> : <span className="muted">—</span>}</td>
                  <td className="nowrap">{r.provavel ? <b>{br(r.provavel)}</b> : <span className="muted">—</span>}</td>
                  <td><Sit s={r.situacao} />{c.descarte && <div className="muted" title={c.encerramento_obs ?? undefined}>{c.descarte === 'parcial' ? 'descarte parcial · ' : ''}{motivoDescarte(c.descarte_motivo)}</div>}</td>
                  <td className="n">{x.lancamentos.length ? n0(x.internSc) : <span className="muted">—</span>}</td>
                  <td>{tecs.map((t, i) => { const x = d.tecnicoPorId.get(t.id); return x ? <TecChip key={i} t={x} extra={t.quando} /> : null; })}</td>
                </tr>
              );
            })}
            {lista.length === 0 && <tr><td colSpan={11} className="empty">Nenhum campo encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      {novo && <Modal titulo="Novo campo" onFechar={() => setNovo(false)}><FormCampo onFim={() => setNovo(false)} /></Modal>}
    </section>
  );
}

import { useState, type DragEvent } from 'react';
import { useDados } from '../lib/dados';
import { br } from '../lib/dates';
import { dadosDemo, dadosVazios } from '../lib/demoData';
import { n0, n1 } from '../lib/format';
import { ABA_PADRAO, compararImportacao, lerPlanting, type Comparacao, type ResultadoImportacao } from '../lib/importPlanting';
import { ir } from '../lib/rota';
import { DemoStore } from '../lib/store';

export default function Importar() {
  const d = useDados();
  const [res, setRes] = useState<ResultadoImportacao | null>(null);
  const [comp, setComp] = useState<Comparacao | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sobre, setSobre] = useState(false);
  const [inativar, setInativar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  async function abrir(arq: File | undefined) {
    if (!arq) return;
    setErro(null);
    setRes(null);
    setComp(null);
    setFeito(null);
    setNome(arq.name);
    if (!/\.xlsx$/i.test(arq.name)) return setErro('Envie o arquivo no formato .xlsx (Excel).');
    try {
      const r = lerPlanting(new Uint8Array(await arq.arrayBuffer()));
      if (!r.campos.length) return setErro(`A aba "${r.aba}" não tem nenhuma linha de campo.`);
      setRes(r);
      setComp(compararImportacao(r.campos, d.dados.campos));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    void abrir(e.dataTransfer.files[0]);
  };

  async function confirmar() {
    if (!res || !comp) return;
    setOcupado(true);
    const r = await d.importarCampos(res.campos);
    let extra = '';
    if (r && inativar && comp.ausentes.length) {
      if (await d.atualizarCampos(comp.ausentes.map((c) => c.id), { ativo: false })) extra = ` ${comp.ausentes.length} campo(s) ausente(s) foram inativados.`;
    }
    setOcupado(false);
    if (r) {
      setFeito(`Importação concluída: ${comp.novos.length} campo(s) novo(s) e ${comp.atualizados.length} atualizado(s).${extra}`);
      setRes(null);
      setComp(null);
    }
  }

  const demo = d.store instanceof DemoStore ? d.store : null;

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Importar campos em massa</h2>
            <div className="sub">Envie a planilha de planting (.xlsx). O sistema lê a aba <b>{ABA_PADRAO}</b> e mostra uma prévia antes de gravar.</div>
          </div>
        </div>
        <label className={'solta' + (sobre ? ' em' : '')} onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)} onDrop={soltar}>
          <input type="file" accept=".xlsx" data-testid="arquivo" onChange={(e) => { void abrir(e.target.files?.[0]); e.target.value = ''; }} />
          <b>Clique para escolher a planilha</b> ou arraste o arquivo para cá
          <div className="sub">{nome || 'PLANTING_CAMPOS_COOPERANTES_….xlsx'}</div>
        </label>
        <div className="caixa-info">
          <b>Dados sensíveis ficam de fora.</b> As colunas CPF/CNPJ, Inscrição Estadual e “Chave (IE|Produto)” são descartadas na leitura,
          dentro do seu navegador: não são enviadas ao banco de dados nem ao repositório.
        </div>
        {erro && <div className="erro-txt" role="alert">{erro}</div>}
        {feito && <div className="caixa-info" role="status">{feito} <button className="btn mini" onClick={() => ir('campos')}>Ver campos</button></div>}
      </section>

      {res && comp && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Prévia da importação</h2>
              <div className="sub">Aba “{res.aba}” · {n0(res.totalLinhas)} linhas lidas → {n0(res.campos.length)} campos (linhas com o mesmo nº de campo e a mesma categoria a colher são somadas).</div>
            </div>
            <div className="btns">
              <button className="btn primary" disabled={ocupado} onClick={() => void confirmar()}>{ocupado ? 'Gravando…' : 'Confirmar importação'}</button>
              <button className="btn" disabled={ocupado} onClick={() => { setRes(null); setComp(null); }}>Cancelar</button>
            </div>
          </div>
          <div className="kpis">
            <div className="kpi hl"><div className="k">Campos novos</div><div className="v">{n0(comp.novos.length)}</div><div className="s">serão cadastrados</div></div>
            <div className="kpi"><div className="k">Campos atualizados</div><div className="v">{n0(comp.atualizados.length)}</div><div className="s">dessecação, colheita e programação são mantidas</div></div>
            <div className={'kpi' + (comp.ausentes.length ? ' warn' : '')}><div className="k">Ausentes na planilha</div><div className="v">{n0(comp.ausentes.length)}</div><div className="s">cadastrados, mas fora do arquivo</div></div>
            <div className="kpi"><div className="k">Área MAPA</div><div className="v">{n0(res.campos.reduce((s, c) => s + c.area_mapa, 0))} ha</div><div className="s">{n0(res.campos.reduce((s, c) => s + c.expectativa_sc, 0))} sc de expectativa</div></div>
          </div>
          {res.colunasIgnoradas.length > 0 && <div className="caixa-info">Colunas descartadas por conterem dado sensível: <b>{res.colunasIgnoradas.join(', ')}</b>.</div>}
          {res.avisos.map((a) => <div className="caixa-info atencao" key={a}>{a}</div>)}
          {comp.ausentes.length > 0 && (
            <div className="caixa-info atencao">
              <label className="check"><input type="checkbox" checked={inativar} onChange={(e) => setInativar(e.target.checked)} />
                Inativar os {comp.ausentes.length} campo(s) que não estão mais na planilha ({comp.ausentes.slice(0, 8).map((c) => c.num_campo).join(', ')}{comp.ausentes.length > 8 ? '…' : ''})</label>
            </div>
          )}
          <div className="tbl-wrap" style={{ maxHeight: 420 }}>
            <table>
              <thead><tr><th>Campo</th><th>Cat. a colher</th><th>Cidade</th><th>Cultivar</th><th className="n">Área MAPA</th><th>Plantio</th><th>Colheita prevista</th><th>Coordenada</th><th className="n">Linhas</th><th>Situação</th></tr></thead>
              <tbody>
                {res.campos.map((c) => (
                  <tr key={c.chave}>
                    <td><b>{c.num_campo}</b></td><td>{c.categoria_colher}</td><td>{c.cidade}</td><td>{c.produto}</td>
                    <td className="n">{n1(c.area_mapa)}</td><td>{br(c.data_plantio)}</td><td>{br(c.data_colheita_prevista)}</td>
                    <td>{c.latitude != null ? 'sim' : <span className="muted">sem</span>}</td>
                    <td className="n">{c.linhas.length}</td>
                    <td>{comp.novos.includes(c) ? <span className="badge man">novo</span> : <span className="badge">atualiza</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {demo && (
        <section className="card">
          <h2>Modo demonstração</h2>
          <p className="sub">Estes botões só existem na demonstração e mexem apenas nos dados salvos neste navegador.</p>
          <div className="btns">
            <button className="btn" onClick={() => { if (confirm('Apagar tudo e começar com o sistema vazio?')) { demo.substituir(dadosVazios()); void d.recarregar(); } }}>Começar vazio</button>
            <button className="btn" onClick={() => { if (confirm('Restaurar os dados fictícios de exemplo?')) { demo.substituir(dadosDemo()); void d.recarregar(); } }}>Restaurar dados de exemplo</button>
          </div>
        </section>
      )}
    </>
  );
}

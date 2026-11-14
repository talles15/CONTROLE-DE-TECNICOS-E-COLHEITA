// Teste de ponta a ponta no modo demonstração (sem Supabase).
//   1) npm run build && npx vite preview --port 4173
//   2) npm run e2e            (usa uma planilha de exemplo gerada na hora)
//      PLANILHA=/caminho/arquivo.xlsx npm run e2e   (usa uma planilha real, que não vai para o repositório)
// Requer o Playwright instalado na máquina (npm i -D playwright && npx playwright install chromium).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const aqui = dirname(fileURLToPath(import.meta.url));
const saida = process.env.SAIDA ?? join(aqui, 'saida');
const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
mkdirSync(saida, { recursive: true });

/** Gera um .xlsx pequeno, com dados inventados, no formato da aba Base Planting. */
function planilhaExemplo() {
  const cab = ['Nº do campo', 'Cliente', 'Cidade', 'Estado', 'Propriedade', 'CPF/CNPJ', 'Inscrição Estadual', 'Produto', 'Data de Plantio', 'Ciclo',
    'Data colheita', 'Área Projetada', 'ÁREA MAPA', 'Talhão', 'Categoria a colher', 'Expectativa produção sc 200 mil', 'Latitude', 'Longitude'];
  const linhas = [
    ['E01', 'Cliente Exemplo A', 'RIO VERDE', 'GO', 'Fazenda Exemplo A', 11111111111, '00.000.000-0', 'CULT 70', 46285, 110, 46395, 156, 156, 'T.1', 'S1', 9360, 173000.0, 513600.0],
    ['E01', 'Cliente Exemplo A', 'RIO VERDE', 'GO', 'Fazenda Exemplo A', 11111111111, '00.000.000-0', 'CULT 70', 46285, 110, 46395, 44, 44, 'T.2', 'S1', 2640, 173000.0, 513600.0],
    ['E01', 'Cliente Exemplo A', 'RIO VERDE', 'GO', 'Fazenda Exemplo A', 11111111111, '00.000.000-0', 'CULT 70', 46285, 110, 46395, 30, 30, 'T.3', 'S2', 1800, 173000.0, 513600.0],
    ['E02', 'Cliente Exemplo B', 'MONTIVIDIU', 'GO', 'Fazenda Exemplo B', 22222222222, '00.000.000-1', 'CULT 74', 46290, 116, 46406, 300, 300, 'T.1', 'S1', 18000, 172000.5, 510000.5],
    ['E03', 'Cliente Exemplo C', 'JUSSARA', 'GO', 'Fazenda Exemplo C', 33333333333, '00.000.000-2', 'CULT 74', 46295, 120, 46415, 500, 500, 'T.9', 'S2', 30000, 160000.0, 512000.0],
    ['E04', 'Cliente Exemplo D', 'IPORA', 'GO', 'Fazenda Exemplo D', 44444444444, '00.000.000-3', 'CULT 80', null, 120, null, 80, 80, null, 'S1', 4800, null, null],
  ];
  const col = (i) => String.fromCharCode(65 + i);
  const cel = (v, i, r) => (v == null ? '' : typeof v === 'number' ? `<c r="${col(i)}${r}"><v>${v}</v></c>` : `<c r="${col(i)}${r}" t="inlineStr"><is><t>${v}</t></is></c>`);
  const xml = [cab, ...linhas].map((l, k) => `<row r="${k + 2}">${l.map((v, i) => cel(v, i, k + 2)).join('')}</row>`).join('');
  return Buffer.from(zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="x"><sheets><sheet name="Base Planting" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${xml}</sheetData></worksheet>`),
  }));
}

const real = process.env.PLANILHA;
const arquivo = real ?? join(saida, 'planting_exemplo.xlsx');
if (!real) writeFileSync(arquivo, planilhaExemplo());

const ok = (cond, msg) => {
  if (!cond) throw new Error('FALHOU: ' + msg);
  console.log('  ok  ' + msg);
};

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 950 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: Number(process.env.ESCALA ?? 1) });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));
p.on('dialog', (d) => d.accept());
const foto = (nome) => p.screenshot({ path: join(saida, nome + '.png'), fullPage: true });
const ir = async (aba) => { await p.goto(`${BASE}/#/${aba}`); await p.waitForTimeout(350); };

try {
  // "hoje" = 11/11/2026 (exemplo do pedido: dessecado em 11/11 + 5 dias)
  await p.clock.setFixedTime(new Date('2026-11-11T10:00:00-03:00'));
  await ir('importar');
  ok(await p.getByText('Modo demonstração').first().isVisible(), 'abre em modo demonstração sem Supabase configurado');
  await p.getByRole('button', { name: 'Começar vazio' }).click();
  await p.waitForTimeout(300);

  console.log('Técnicos');
  await ir('tecnicos');
  await p.getByRole('button', { name: '+ Novo técnico' }).click();
  await p.getByLabel('Nome').fill('Técnico E2E');
  await p.getByLabel('Telefone / WhatsApp').fill('(64) 99999-1234');
  await p.getByLabel('Cidade base').fill('RIO VERDE');
  await p.getByRole('button', { name: 'Salvar' }).click();
  await p.getByRole('cell', { name: 'Técnico E2E' }).waitFor();
  ok(true, 'cadastra técnico com telefone');
  await p.getByRole('button', { name: '+ Novo técnico' }).click();
  await p.getByLabel('Nome').fill('Técnico Dois');
  await p.getByRole('button', { name: 'Salvar' }).click();
  await p.getByRole('cell', { name: 'Técnico Dois' }).waitFor();

  console.log('Importação em massa');
  await ir('importar');
  await p.getByTestId('arquivo').setInputFiles(arquivo);
  await p.getByText('Prévia da importação').waitFor({ timeout: 20000 });
  const previa = await p.locator('main').innerText();
  ok(/CPF\/CNPJ, Inscrição Estadual/.test(previa), 'avisa que CPF/CNPJ e Inscrição Estadual foram descartados');
  if (!real) ok(/6 linhas lidas → 5 campos/.test(previa), 'soma linhas do mesmo campo e separa por categoria a colher (6 linhas → 5 campos)');
  else console.log('     ' + previa.match(/[\d.]+ linhas lidas → [\d.]+ campos/)?.[0]);
  await foto('1-importar-previa');
  await p.getByRole('button', { name: 'Confirmar importação' }).click();
  await p.getByText('Importação concluída').waitFor({ timeout: 20000 });
  const guardado = await p.evaluate(() => localStorage.getItem('ctc_demo_v1') ?? '');
  ok(!/cpf|cnpj|inscri[cç][aã]o estadual|11111111111|00\.000\.000-0/i.test(guardado.replace(/"acao":"[^"]*"/g, '')), 'nenhum CPF/CNPJ/IE foi gravado');
  const campos = JSON.parse(guardado).campos;
  const alvo = real ? campos.find((c) => c.latitude != null).num_campo : 'E02';

  console.log('Dessecação e data provável');
  await ir('campos');
  await p.getByPlaceholder('Buscar campo, cliente, fazenda, cultivar…').fill(alvo);
  await p.locator('tbody tr').first().click();
  await p.getByLabel('Data da dessecação').fill('2026-11-11');
  await p.getByLabel('Dias até a colheita').fill('5');
  await p.getByLabel('Área dessecada (ha)').fill('100');
  const prov = await p.getByTestId('provavel').innerText();
  ok(/16\/11\/2026/.test(prov), `11/11/2026 + 5 dias = 16/11/2026 (${prov.split('·')[0].trim()})`);
  ok(/15\/11\/2026/.test(prov), 'informa que o aviso de pré-colheita sai em 15/11/2026');
  await foto('2-ficha-dessecacao');
  await p.getByRole('button', { name: 'Registrar dessecação' }).click();
  await p.getByRole('cell', { name: /16\/11\/2026/ }).first().waitFor();
  await p.getByRole('button', { name: 'Fechar' }).click();

  console.log('Calendário e aviso de véspera');
  await ir('calendario');
  ok(await p.locator('[data-alerta="proximos"]').getByText(alvo, { exact: true }).isVisible(), 'em 11/11 o campo aparece em "Próximos 7 dias"');
  ok((await p.locator('[data-dia="2026-11-11"] .ev.dess').count()) === 1, 'calendário marca o campo como dessecado em 11/11');
  ok((await p.locator('[data-dia="2026-11-16"] .ev.prog').count()) === 1, 'calendário marca colheita programada em 16/11');
  await p.clock.setFixedTime(new Date('2026-11-15T08:00:00-03:00'));
  await p.reload();
  await p.waitForTimeout(400);
  const vespera = p.locator('[data-alerta="vespera"]');
  ok(await vespera.getByText(alvo, { exact: true }).isVisible(), 'em 15/11 (um dia antes) aparece o aviso de pré-colheita');
  ok(/amanhã, 16\/11\/2026/.test(await vespera.innerText()), 'o aviso informa colheita provável amanhã, 16/11/2026');
  await foto('3-calendario-alerta');

  console.log('Programação e texto do WhatsApp');
  await vespera.getByRole('button', { name: 'Programar' }).first().click();
  await p.waitForTimeout(300);
  ok(/data=2026-11-15/.test(p.url()), 'o botão Programar abre a programação do dia 15/11');
  ok((await p.getByTestId('campos-escolhidos').innerText()).includes(alvo), 'campo já vem escolhido');
  ok((await p.locator('#pgAtiv').inputValue()) === 'coleta_pre', 'atividade sugerida: passar pegando pré-colheita');
  await p.locator('#pgTec').selectOption({ label: 'Técnico E2E' });
  await p.locator('#pgObs').fill('Chegar cedo');
  await p.getByRole('button', { name: 'Adicionar', exact: true }).first().click();
  const cartao = p.locator('[data-tecnico="Técnico E2E"]');
  await cartao.locator(`[data-campo="${alvo}"]`).waitFor();
  ok(true, 'campo atribuído ao técnico');
  ok(await p.getByRole('row', { name: new RegExp(`${alvo}.*Técnico E2E.*Passar pegando pré-colheita`) }).isVisible(), 'quadro "quem está em qual campo" mostra o responsável');
  const wa = await cartao.getByRole('link', { name: 'Abrir no WhatsApp' }).getAttribute('href');
  ok(wa.startsWith('https://wa.me/5564999991234?text='), 'link do WhatsApp usa o telefone do técnico');
  await cartao.getByRole('button', { name: 'Ver texto' }).click();
  const texto = await p.getByTestId('texto-whats').inputValue();
  ok(texto.includes(`Campo ${alvo}*`) && texto.includes('PASSAR PEGANDO PRÉ-COLHEITA') && texto.includes('Obs.: Chegar cedo') && texto.includes('colheita provável 16/11/2026'), 'texto traz campo, atividade, observação e colheita provável');
  ok(texto.includes('https://www.google.com/maps?q=-'), 'texto traz o link do mapa');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Baixar .txt' }).last().click()]);
  ok(dl.suggestedFilename() === 'programacao_2026-11-15_tecnico-e2e.txt', 'gera o arquivo de texto ' + dl.suggestedFilename());
  writeFileSync(join(saida, 'mensagem.txt'), texto);
  await foto('4-programacao-texto');
  await p.getByRole('button', { name: 'Fechar' }).click();
  await ir('calendario');
  ok(await p.locator('[data-alerta="vespera"]').getByText('Técnico E2E').isVisible(), 'o aviso passa a mostrar o técnico programado');

  console.log('Colheita');
  await p.locator('[data-alerta="vespera"]').getByRole('button', { name: alvo, exact: true }).click();
  await p.getByLabel('Início da colheita').fill('2026-11-15');
  await p.getByRole('button', { name: 'Salvar datas' }).click();
  await p.getByText('Em colheita').first().waitFor();
  await p.getByRole('button', { name: 'Fechar' }).click();
  ok((await p.locator('[data-dia="2026-11-15"] .ev.colh').count()) === 1, 'calendário passa a mostrar o campo em colheita');

  console.log('Alterações ao longo do dia');
  await ir('programacao?data=2026-11-15');
  const item = () => p.locator(`[data-campo="${alvo}"]`);
  await item().getByRole('button', { name: 'Concluído' }).click();
  await p.locator('[data-tecnico="Técnico E2E"]').getByText('1 de 1 concluído(s)').waitFor();
  ok(true, 'marca a atividade como concluída e o cartão do técnico mostra o andamento');
  await p.locator('[data-tecnico="Técnico E2E"]').getByRole('button', { name: 'Ver texto' }).click();
  const texto2 = await p.getByTestId('texto-whats').inputValue();
  ok(texto2.includes('Atualizada às 08:00') && texto2.includes('Situação: CONCLUÍDO'), 'o texto reenviado no dia traz a hora da atualização e o que já foi concluído');
  await p.getByRole('button', { name: 'Fechar' }).click();
  await item().getByLabel(`Técnico responsável ${alvo}`).selectOption({ label: 'Técnico Dois' });
  await p.locator(`[data-tecnico="Técnico Dois"] [data-campo="${alvo}"]`).waitFor();
  ok((await p.locator(`[data-tecnico="Técnico E2E"] [data-campo="${alvo}"]`).count()) === 0, 'passa o campo de um técnico para outro');
  await item().getByLabel(`Dia ${alvo}`).fill('2026-11-16');
  await p.getByText(`Campo ${alvo} movido para 16/11/2026.`).waitFor();
  ok((await item().count()) === 0, 'move a atividade para outro dia (sai do dia 15)');
  await ir('programacao?data=2026-11-16');
  ok(await p.locator(`[data-tecnico="Técnico Dois"] [data-campo="${alvo}"]`).isVisible(), 'a atividade aparece no dia 16 com o novo técnico');
  await item().getByRole('button', { name: alvo, exact: true }).click();
  await p.getByRole('button', { name: 'Alterar' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Cancelado' }).click();
  await p.getByRole('dialog').locator('span.badge', { hasText: 'Cancelado' }).waitFor();
  ok(true, 'na ficha do campo dá para alterar a programação (cancelar)');
  await p.getByRole('dialog').getByRole('button', { name: 'Remover programação de 16/11/2026' }).click();
  await p.getByText('Nenhuma programação para este campo.').waitFor();
  ok(true, 'na ficha do campo dá para remover o técnico atribuído');
  await p.getByRole('button', { name: 'Fechar' }).click();
  await ir('calendario');
  await p.locator('[data-dia="2026-11-15"]').click();
  ok(/Colheita iniciada em 15\/11\/2026/.test(await p.getByTestId('dia-detalhe').innerText()), 'o calendário explica por que o campo aparece no dia');

  console.log('Vários campos para o mesmo técnico');
  await ir('programacao?data=2026-11-17');
  const busca = p.getByLabel('Campo', { exact: true });
  await busca.click();
  await p.locator('.sel-campo .op').first().click();
  await p.locator('.sel-campo .op').first().click();
  await p.locator('h2', { hasText: 'Adicionar campos' }).click();
  const chips = p.getByTestId('campos-escolhidos').locator('.chip-campo b');
  ok((await chips.count()) === 2, 'dá para escolher mais de um campo antes de adicionar');
  const [rota1, rota2] = [await chips.nth(0).innerText(), await chips.nth(1).innerText()];
  await p.locator('#pgTec').selectOption({ label: 'Técnico E2E' });
  await p.locator('#pgAtiv').selectOption('coleta_pre');
  await p.getByRole('button', { name: 'Adicionar 2 campos' }).click();
  await p.getByText('2 campos programados para Técnico E2E.').waitFor();
  const cartaoRota = p.locator('[data-tecnico="Técnico E2E"]');
  ok((await cartaoRota.locator('[data-campo]').count()) === 2, 'o mesmo técnico fica com os dois campos de pré-colheita no dia');
  await cartaoRota.getByRole('button', { name: 'Ver texto' }).click();
  const textoRota = await p.getByTestId('texto-whats').inputValue();
  ok(textoRota.includes(`Campo ${rota1}*`) && textoRota.includes(`Campo ${rota2}*`) && textoRota.includes('Total: 2 campo(s).') && (textoRota.match(/PASSAR PEGANDO PRÉ-COLHEITA/g) ?? []).length === 2,
    'a mensagem do técnico lista os dois campos para pegar pré-colheita');
  await p.getByRole('button', { name: 'Fechar' }).click();
  // nas sugestões também dá para marcar vários campos e mandar o mesmo técnico
  await ir('programacao?data=2026-11-16');
  const sug = p.getByTestId('sugestoes');
  if ((await sug.count()) && (await sug.locator('tbody tr').count()) >= 1) {
    await sug.getByLabel('Marcar todos').check();
    const n = await sug.locator('tbody tr').count();
    await sug.getByLabel('Técnico para os campos marcados').selectOption({ label: 'Técnico Dois' });
    await sug.getByRole('button', { name: 'Adicionar marcados' }).click();
    await p.locator('[data-tecnico="Técnico Dois"] [data-campo]').first().waitFor();
    ok((await p.locator('[data-tecnico="Técnico Dois"] [data-campo]').count()) === n, `sugestões: ${n} campo(s) marcados vão de uma vez para o mesmo técnico`);
  }

  console.log('Histórico de técnicos no campo');
  await ir('programacao?data=2026-11-18');
  await busca.click();
  await busca.fill(rota1);
  await p.locator('.sel-campo .op').first().click();
  await busca.press('Escape');
  await p.locator('#pgTec').selectOption({ label: 'Técnico Dois' });
  await p.locator('#pgAtiv').selectOption('colheita_pre');
  await p.getByRole('button', { name: 'Adicionar', exact: true }).first().click();
  await p.locator(`[data-tecnico="Técnico Dois"] [data-campo="${rota1}"]`).waitFor();
  await p.locator(`[data-tecnico="Técnico Dois"] [data-campo="${rota1}"]`).getByRole('button', { name: rota1, exact: true }).click();
  const hist = p.getByTestId('historico-tecnicos');
  const textoHist = await hist.innerText();
  ok(/2 escala\(s\) de 2 técnico\(s\), de 17\/11\/2026 a 18\/11\/2026/.test(textoHist), 'a ficha guarda o histórico: 2 escalas de 2 técnicos, de 17/11 a 18/11');
  ok(/Técnico E2E\s+1× pré-colheita/.test(textoHist) && /Técnico Dois\s+1× colheita/.test(textoHist), 'o resumo mostra quem foi escalado e para quê (colheita ou pré-colheita)');
  const [dlHist] = await Promise.all([p.waitForEvent('download'), hist.getByRole('button', { name: 'Exportar CSV' }).click()]);
  ok(dlHist.suggestedFilename() === `historico_tecnicos_${rota1}.csv`, 'exporta o histórico do campo em CSV');
  await foto('7-ficha-historico');
  await p.getByRole('button', { name: 'Fechar' }).click();

  console.log('Volume colhido e aproveitamento para semente');
  await ir('campos');
  await p.getByPlaceholder('Buscar campo, cliente, fazenda, cultivar…').fill(alvo);
  await p.locator('tbody tr').first().click();
  const ficha = p.getByTestId('colheita-real');
  await ficha.getByLabel('Produtividade do produtor (sc/ha)').fill('60');
  await ficha.getByLabel('Produtividade do produtor (sc/ha)').blur();
  await p.getByText('Produtividade do produtor salva.').waitFor();
  await ficha.getByLabel('Dia', { exact: true }).fill('2026-11-15');
  await ficha.getByLabel('Volume colhido (kg)').fill('180000');
  await ficha.getByLabel('Área colhida no dia (ha)').fill('100');
  await ficha.getByRole('button', { name: 'Lançar volume' }).click();
  await p.getByText('Volume colhido lançado.').waitFor();
  await ficha.getByLabel('Dia', { exact: true }).fill('2026-11-16');
  await ficha.getByLabel('Volume colhido (kg)').fill('120000');
  await ficha.getByLabel('Aprovado e internalizado (kg)').fill('90000');
  await ficha.getByLabel('Área colhida no dia (ha)').fill('50');
  await ficha.getByRole('button', { name: 'Lançar volume' }).click();
  await ficha.getByRole('row', { name: /16\/11\/2026/ }).waitFor();
  const resumoReal = await ficha.locator('.reais').first().innerText();
  // colhido 300.000 kg = 5.000 sc; aprovado 270.000 kg = 4.500 sc; potencial 150 ha × 60 sc/ha = 9.000 sc → 50%
  ok(/5\.000 sc/.test(resumoReal) && /4\.500 sc/.test(resumoReal) && /90,0% do entregue/.test(resumoReal), 'soma os lançamentos do dia a dia: 5.000 sc colhidos, 4.500 sc aprovados e internalizados');
  // a produtividade do produtor é só informativa: não muda o "ainda a colher" (150 ha × 65 sc/ha × 70% do painel)
  ok(/150,0 ha/.test(resumoReal) && /6\.825 sc a internalizar/.test(resumoReal), 'o que falta colher usa os parâmetros da Internalização, não a produtividade do produtor');
  const info = await p.getByTestId('prod-produtor').innerText();
  ok(/só informativo/i.test(info) && /9\.000 sc/.test(info) && /60,0 sc\/ha × 150,0 ha/.test(info), 'potencial = produtividade do produtor × área colhida (60 sc/ha × 150 ha = 9.000 sc), em um bloco só informativo');
  ok(/4\.000 sc/.test(await p.getByTestId('nao-enviado').innerText()), 'mostra quanto deixou de ir para a UBS: 9.000 − 5.000 entregues = 4.000 sc');
  ok(/50,0%/.test(await p.getByTestId('aprov-semente').innerText()), 'aproveitamento para semente = 4.500 ÷ 9.000 = 50,0%');
  await ficha.getByRole('row', { name: /16\/11\/2026/ }).getByRole('button', { name: 'Corrigir' }).click();
  await ficha.getByLabel('Aprovado e internalizado (kg)').fill('');
  await ficha.getByRole('button', { name: 'Salvar correção' }).click();
  await p.getByText('Lançamento corrigido.').waitFor();
  ok(/55,6%/.test(await p.getByTestId('aprov-semente').innerText()), 'corrigir um lançamento recalcula na hora (5.000 ÷ 9.000 = 55,6%)');
  await ficha.getByRole('row', { name: /16\/11\/2026/ }).getByRole('button', { name: 'Corrigir' }).click();
  await ficha.getByLabel('Aprovado e internalizado (kg)').fill('90000');
  await ficha.getByRole('button', { name: 'Salvar correção' }).click();
  await p.getByText('Lançamento corrigido.').last().waitFor();
  await foto('8-ficha-volume');
  await p.getByRole('button', { name: 'Fechar' }).click();
  const linhaCampo = await p.locator('tbody tr').first().innerText();
  ok(/4\.500/.test(linhaCampo) && !/%/.test(linhaCampo), 'a lista de campos leva só o volume internalizado; produtividade e aproveitamento ficam na ficha');

  console.log('Metas por cultivar');
  await ir('metas');
  const cultivar = campos.find((c) => c.num_campo === alvo).produto;
  const linhaMeta = p.getByTestId('tabela-metas').locator(`tr[data-cultivar="${cultivar}"]`);
  ok(await linhaMeta.isVisible(), 'as cultivares dos campos aparecem sozinhas na aba Metas');
  const bb = p.getByLabel(`Big bags planejados ${cultivar}`);
  if (!real) {
    // CULT 74: 4.500 sc internalizados; a colher (150 ha + 500 ha) × 65 sc/ha × 70% = 29.575 sc
    // (a produtividade de 60 sc/ha informada pelo produtor não entra nesta conta)
    await bb.fill('1000');
    await bb.press('Enter');
    await p.getByText(`Meta de ${cultivar} salva.`).waitFor();
    let linha = await linhaMeta.innerText();
    ok(/20\.000/.test(linha) && /15\.500/.test(linha) && /29\.575/.test(linha) && /Dá para fechar/.test(linha), '1.000 big bags → meta de 20.000 sc; faltam 15.500 e há 29.575 sc a colher: dá para fechar');
    ok((await p.getByTestId('alerta-metas').count()) === 0, 'sem alerta enquanto o que falta cabe no que há para colher');
    // PMS e aproveitamento próprios da cultivar, direto na tabela: 25.000 sc de 200 mil × 30 kg ÷ 60 ÷ 75% = 16.667; ÷ 80% = 15.625
    const pms = p.getByLabel(`PMS ${cultivar}`);
    const aprov = p.getByLabel(`Aproveitamento UBS ${cultivar}`);
    ok((await pms.getAttribute('placeholder')) === '180' && (await aprov.getAttribute('placeholder')) === '75', 'em branco, PMS e aproveitamento mostram o padrão (180 g e 75%)');
    await pms.fill('150');
    await pms.press('Enter');
    await p.getByText(`PMS de ${cultivar} salvo.`).waitFor();
    ok(/16\.667/.test(await linhaMeta.innerText()), 'PMS de 150 g só nesta cultivar → meta de internalização cai para 16.667 sc');
    await aprov.fill('80');
    await aprov.press('Enter');
    await p.getByText(`Aproveitamento de ${cultivar} salvo.`).waitFor();
    ok(/15\.625/.test(await linhaMeta.innerText()), 'aproveitamento de 80% só nesta cultivar → meta de 15.625 sc');
    const outra = p.getByTestId('tabela-metas').locator('tbody tr[data-cultivar]').filter({ hasNotText: cultivar }).first();
    ok((await outra.getByLabel(/^PMS /).inputValue()) === '' && (await outra.getByLabel(/^Aproveitamento UBS /).inputValue()) === '', 'as outras cultivares continuam no padrão');
    await aprov.fill('120');
    await aprov.press('Enter');
    await p.getByText('O aproveitamento deve ficar entre 1 e 100%.').waitFor();
    ok(true, 'recusa aproveitamento acima de 100%');
    await aprov.fill('');
    await aprov.press('Enter');
    await p.getByText(/aproveitamento voltou ao padrão \(75%\)/).waitFor();
    await pms.fill('');
    await pms.press('Enter');
    await p.getByText(/PMS voltou ao padrão \(180 g\)/).waitFor();
    ok(/20\.000/.test(await linhaMeta.innerText()), 'apagando os dois valores a cultivar volta ao padrão (meta de 20.000 sc)');
    await bb.fill('2000');
    await bb.press('Enter');
    await p.getByTestId('alerta-metas').waitFor();
    const alerta = await p.getByTestId('alerta-metas').innerText();
    ok(alerta.includes(cultivar) && /faltam 35\.500 sc/.test(alerta) && /29\.575 sc/.test(alerta) && /Déficit de 5\.925 sc/.test(alerta), '2.000 big bags → faltam 35.500 sc e só há 29.575 a colher: alerta com déficit de 5.925 sc');
    linha = await linhaMeta.innerText();
    ok(/Falta volume a colher/.test(linha) && /-5\.925/.test(linha), 'a linha da cultivar fica marcada com o saldo negativo');
    const dash = await p.getByTestId('dash-metas').innerText();
    ok(/40\.000/.test(dash) && /4\.500/.test(dash) && /-35\.500/.test(dash), 'painel: meta total 40.000, internalizado 4.500, GAP -35.500');
    ok(/40\.000,00/.test(await p.getByTestId('tabela-dash').innerText()) && /11,25/.test(await p.getByTestId('tabela-dash').innerText()), 'tabela do painel: meta, internalizado, GAP e 11,25% de atingimento');
  } else {
    await bb.fill('999999');
    await bb.press('Enter');
    await p.getByTestId('alerta-metas').waitFor();
    ok((await p.getByTestId('alerta-metas').innerText()).includes(cultivar), 'uma meta maior que o disponível gera o alerta da cultivar');
  }
  ok((await p.locator('.aba', { hasText: 'Metas' }).locator('.cont').innerText()) === '1', 'a aba Metas mostra o nº de cultivares em alerta');
  ok((await p.locator('[data-barra]').count()) >= 1, 'desenha o gráfico de realizado × GAP');
  await p.getByRole('button', { name: `Detalhes ${cultivar}` }).click();
  await p.getByLabel('Meta de internalização manual (sc 60 kg)').fill('4000');
  ok(/Meta de internalização: 4\.000 sc/.test(await p.getByTestId('conta-meta').innerText()), 'a meta de internalização pode ser digitada à mão');
  await p.getByRole('button', { name: 'Salvar meta' }).click();
  await p.getByTestId('alerta-metas').waitFor({ state: 'detached' });
  ok(/Meta atingida/.test(await linhaMeta.innerText()), 'com a meta manual de 4.000 sc a cultivar aparece como atingida e o alerta some');
  await p.getByRole('button', { name: `Detalhes ${cultivar}` }).click();
  await p.getByLabel('Meta de internalização manual (sc 60 kg)').fill('');
  await p.getByRole('button', { name: 'Salvar meta' }).click();
  await p.getByTestId('alerta-metas').waitFor();
  await foto('9-metas');

  console.log('Internalização');
  await ir('internalizacao');
  const kpis = await p.locator('.kpis').innerText();
  ok(/Sacos aproveitados/.test(kpis) && /Pico diário/.test(kpis), 'mostra os indicadores da estimativa');
  ok((await p.locator('.chart svg rect[data-dia]').count()) > 0, 'desenha o gráfico diário');
  ok(await p.getByRole('row', { name: new RegExp(alvo + '.*colheita iniciada') }).first().isVisible(), 'usa a colheita iniciada como início do campo');
  // 1.030 ha com data × 65 sc/ha × 70% = 46.865 sc (o campo sem data de plantio fica fora)
  if (!real) ok(/46\.865 sc/.test(kpis) && /1 campos/.test(kpis), 'total aproveitado = 1.030 ha × 65 sc/ha × 70% = 46.865 sc, com 1 campo fora por falta de data');
  ok(/Internalizado real \(UBS\)\s+4\.500 sc/.test(kpis), 'a internalização mostra o realizado lançado nos campos');
  await foto('5-internalizacao');

  console.log('Mapa');
  await ir('mapa');
  await p.waitForTimeout(600);
  const tab = await p.getByTestId('tabela-distancia').innerText();
  ok(/até 10 km/.test(tab) && /200–300 km/.test(tab) && /acima de 300 km/.test(tab) && /sem coordenada/.test(tab), 'tabela tem as faixas 10, 20, 50, 100, 200, 300 km e sem coordenada');
  ok((await p.locator('.leaflet-interactive').count()) > 0 && (await p.locator('.rotulo-anel').count()) === 6, 'mapa desenha os campos e os 6 anéis de distância');
  console.log('     ' + tab.split('\n').find((l) => l.startsWith('Total')).replace(/\t/g, ' | '));
  await foto('6-mapa');

  console.log('Descarte de campos');
  await ir('programacao?data=2026-11-17');
  await p.locator('[data-tecnico="Técnico E2E"]').getByRole('button', { name: 'Descartar', exact: false }).first().click();
  const desc = p.getByTestId('descarte');
  await desc.waitFor();
  ok(/foco=descarte/.test(p.url()), 'a programação tem a opção de descartar o campo, que abre a ficha no descarte');
  await desc.getByLabel('Descarte', { exact: true }).selectOption('total');
  await desc.getByRole('button', { name: 'Registrar descarte' }).click();
  await p.getByText('Escolha o motivo do descarte.').waitFor();
  ok(true, 'o motivo do descarte é obrigatório');
  ok((await desc.getByLabel('Motivo do descarte').locator('option').allInnerTexts()).join('|') === 'Escolha…|Qualidade|Clima|Negativa de colheita|Moega indisponível', 'motivos: Qualidade, Clima, Negativa de colheita e Moega indisponível');
  await desc.getByLabel('Motivo do descarte').selectOption('clima');
  await desc.getByLabel('Observações do encerramento').fill('Chuva na pré-colheita');
  await desc.getByRole('button', { name: 'Registrar descarte' }).click();
  await p.getByText('Campo descartado sem colher.').waitFor();
  await p.getByText(/escala\(s\) futura\(s\) deste campo foram canceladas/).waitFor();
  ok(/Descartado/.test(await p.getByRole('dialog').locator('.modal-head').innerText()), 'o campo descartado sem colher passa para a situação "Descartado" e as escalas futuras são canceladas');
  if (!real) ok(/200,0 ha/.test(await p.getByTestId('descarte-resumo').innerText()) && /9\.100 sc/.test(await p.getByTestId('descarte-resumo').innerText()), 'descarte direto: o campo inteiro (200 ha × 65 sc/ha × 70% = 9.100 sc) sai da conta');
  await p.getByRole('button', { name: 'Fechar' }).click();
  ok((await p.getByLabel('Campo', { exact: true }).count()) === 1, 'ficha fechada');

  // descarte parcial no campo que já tem volume: 300 ha, 150 ha colhidos lançados
  await ir('campos');
  await p.getByPlaceholder('Buscar campo, cliente, fazenda, cultivar…').fill(alvo);
  await p.locator('tbody tr').first().click();
  await desc.getByLabel('Descarte', { exact: true }).selectOption('total');
  await desc.getByLabel('Motivo do descarte').selectOption('qualidade');
  await desc.getByRole('button', { name: 'Registrar descarte' }).click();
  await p.getByText('Este campo já tem volume lançado: use “Descarte parcial”.').waitFor();
  ok(true, 'campo com volume lançado não pode ser descartado "sem colher"');
  await desc.getByLabel('Descarte', { exact: true }).selectOption('parcial');
  await desc.getByLabel('Data do descarte').fill('2026-11-16');
  await desc.getByLabel('Observações do encerramento').fill('Resto do talhão com dano mecânico');
  await desc.getByRole('button', { name: 'Registrar descarte' }).click();
  await p.getByText('Descarte parcial registrado.').waitFor();
  const resumoDesc = await p.getByTestId('descarte-resumo').innerText();
  ok(/Qualidade/.test(resumoDesc) && /150,0 ha/.test(resumoDesc) && /6\.825 sc/.test(resumoDesc), 'descarte parcial: sobraram 150 ha → 6.825 sc que deixaram de vir (150 ha × 65 sc/ha × 70%)');
  ok((await p.getByLabel('Fim da colheita').inputValue()) === '2026-11-16' && /descarte parcial/.test(await p.getByRole('dialog').locator('.modal-head').innerText()), 'a colheita fica finalizada na data do descarte e a ficha mostra "descarte parcial"');
  await foto('10-ficha-descarte');
  await p.getByRole('button', { name: 'Fechar' }).click();

  console.log('Volume descartado sai do disponível');
  await ir('metas');
  if (!real) {
    const alertaDesc = await p.getByTestId('alerta-metas').innerText();
    // CULT 74: sobra só o campo de 500 ha → 22.750 sc; faltam 35.500 → déficit de 12.750
    ok(/22\.750 sc/.test(alertaDesc) && /Déficit de 12\.750 sc/.test(alertaDesc), 'metas: o disponível da cultivar cai para 22.750 sc e o déficit sobe para 12.750 sc');
    ok(/1\.365/.test(await p.getByTestId('tabela-metas').locator('tr[data-cultivar="CULT 70"]').innerText()), 'metas: a cultivar do campo descartado direto fica só com os 30 ha restantes (1.365 sc)');
    await ir('internalizacao');
    ok(/30\.940 sc/.test(await p.locator('.kpis').innerText()), 'internalização: a projeção cai para 680 ha × 65 sc/ha × 70% = 30.940 sc');
  }

  console.log('Ranking de cooperados e relatório');
  await ir('ranking');
  const tabRank = p.getByTestId('tabela-ranking');
  const cooperado = campos.find((c) => c.num_campo === alvo).cliente;
  const linhaCoop = tabRank.locator(`tr[data-cooperado="${cooperado}"]`);
  const txtCoop = await linhaCoop.innerText();
  ok(/^1º/.test(txtCoop.trim()) && /4\.500/.test(txtCoop), 'o cooperado que mais internalizou fica em 1º (4.500 sc)');
  if (!real) {
    // potencial do campo encerrado: 300 ha × 65 sc/ha × 70% = 13.650 sc → 4.500 ÷ 13.650 = 33,0%
    ok(/13\.650/.test(txtCoop) && /33,0%/.test(txtCoop) && /6\.825/.test(txtCoop), 'aproveitamento = internalizado ÷ potencial com o aproveitamento da Internalização (4.500 ÷ 13.650 = 33,0%), com o descartado ao lado');
    const txtA = await tabRank.locator('tr[data-cooperado="Cliente Exemplo A"]').innerText();
    ok(/1 descartado/.test(txtA) && (txtA.match(/9\.100/g) ?? []).length === 2 && /0,0%/.test(txtA), 'quem teve campo descartado sem colher aparece com o potencial (200 ha × 65 × 70% = 9.100 sc) e 0% de aproveitamento');
    const kpisRank = await p.getByTestId('kpis-ranking').innerText();
    ok(/1 de 4/.test(kpisRank) && /15\.925 sc/.test(kpisRank), 'indicadores: 1 de 4 cooperados com entrega e 15.925 sc descartados');
    const motivos = await p.getByTestId('tabela-motivos').innerText();
    ok(/Clima\s+1\s+200,0\s+9\.100/.test(motivos) && /Qualidade\s+1\s+150,0\s+6\.825/.test(motivos), 'descartes por motivo: Clima 9.100 sc e Qualidade 6.825 sc');
  }
  await linhaCoop.click();
  const det = await p.getByTestId('detalhe-cooperado').innerText();
  ok(det.includes(alvo) && /Qualidade/.test(det) && /4\.500/.test(det), 'clicando no cooperado aparece campo a campo: potencial, entregue, internalizado e o descarte');
  await p.getByRole('columnheader', { name: /^Aproveitamento/ }).first().click();
  ok(/Aproveitamento ▾/.test(await tabRank.locator('thead').first().innerText()), 'dá para ordenar pelo aproveitamento');
  const [dlRel] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Relatório de colheita e descartes (CSV)' }).click()]);
  ok(dlRel.suggestedFilename() === 'relatorio_colheita_descartes_2026-11-15.csv', 'exporta o relatório ' + dlRel.suggestedFilename());
  const rel = readFileSync(await dlRel.path(), 'utf8');
  ok(/Início da colheita;Fim da colheita;Descartado direto \(sem colher\);Tipo de descarte;Motivo do descarte;Data do descarte;Observações/.test(rel), 'o relatório traz início, fim, descarte direto, motivo e observações');
  const linhaAlvo = rel.split('\r\n').find((l) => l.split(';')[1] === alvo);
  ok(/;15\/11\/2026;16\/11\/2026;Não;Descarte parcial \(colheu uma parte\);Qualidade;16\/11\/2026;Resto do talhão com dano mecânico;/.test(linhaAlvo), 'linha do descarte parcial: datas da colheita, "Não" para descarte direto, motivo e observação');
  ok(/;;;Sim;Descartado sem colher \(descarte direto\);Clima;15\/11\/2026;Chuva na pré-colheita;/.test(rel), 'linha do descarte direto: sem datas de colheita, "Sim", motivo e observação');
  writeFileSync(join(saida, 'relatorio.csv'), rel);
  await foto('11-ranking');

  ok(erros.length === 0, 'nenhum erro de JavaScript nas telas' + (erros.length ? ': ' + erros.join(' | ') : ''));
  console.log('\nTudo certo. Capturas em ' + saida);
} catch (e) {
  await foto('erro').catch(() => {});
  console.error('\n' + (e instanceof Error ? e.message : e));
  if (erros.length) console.error('Erros da página: ' + erros.join(' | '));
  process.exitCode = 1;
} finally {
  await navegador.close();
}

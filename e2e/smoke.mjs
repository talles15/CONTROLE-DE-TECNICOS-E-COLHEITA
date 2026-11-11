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
  ok((await p.getByLabel('Campo', { exact: true }).inputValue()).startsWith(alvo), 'campo já vem preenchido');
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

  console.log('Internalização');
  await ir('internalizacao');
  const kpis = await p.locator('.kpis').innerText();
  ok(/Sacos aproveitados/.test(kpis) && /Pico diário/.test(kpis), 'mostra os indicadores da estimativa');
  ok((await p.locator('.chart svg rect[data-dia]').count()) > 0, 'desenha o gráfico diário');
  ok(await p.getByRole('row', { name: new RegExp(alvo + '.*colheita iniciada') }).first().isVisible(), 'usa a colheita iniciada como início do campo');
  // 1.030 ha com data × 65 sc/ha × 70% = 46.865 sc (o campo sem data de plantio fica fora)
  if (!real) ok(/46\.865 sc/.test(kpis) && /1 campos/.test(kpis), 'total aproveitado = 1.030 ha × 65 sc/ha × 70% = 46.865 sc, com 1 campo fora por falta de data');
  await foto('5-internalizacao');

  console.log('Mapa');
  await ir('mapa');
  await p.waitForTimeout(600);
  const tab = await p.getByTestId('tabela-distancia').innerText();
  ok(/até 10 km/.test(tab) && /200–300 km/.test(tab) && /acima de 300 km/.test(tab) && /sem coordenada/.test(tab), 'tabela tem as faixas 10, 20, 50, 100, 200, 300 km e sem coordenada');
  ok((await p.locator('.leaflet-interactive').count()) > 0 && (await p.locator('.rotulo-anel').count()) === 6, 'mapa desenha os campos e os 6 anéis de distância');
  console.log('     ' + tab.split('\n').find((l) => l.startsWith('Total')).replace(/\t/g, ' | '));
  await foto('6-mapa');

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

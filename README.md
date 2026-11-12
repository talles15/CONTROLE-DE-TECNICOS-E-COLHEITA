# Controle de Técnicos e Colheita — Safra 26/27

Sistema web para acompanhar a colheita dos campos cooperantes: dessecação, colheita provável, aviso de pré-colheita,
programação diária dos técnicos (com mensagem pronta para o WhatsApp), volume colhido real e aproveitamento para semente,
estimativa de internalização, metas de produção por cultivar e mapa dos campos em relação à UBS.

- **Tela:** hospedada na Vercel.
- **Dados e login:** Supabase (banco PostgreSQL na nuvem).
- **Este repositório é público e não contém nenhum dado de campo, cliente ou fazenda.** Tudo fica no Supabase.

## O que tem em cada aba

| Aba | Para que serve |
|---|---|
| **Calendário** | Visão geral do mês: campos **dessecados**, com **colheita programada** e **em colheita**. No topo, os alertas: véspera de colheita (mandar alguém fazer a pré-colheita), colheita provável hoje, atrasados e próximos 7 dias. |
| **Campos** | Lista com busca e filtros. Clicando no campo abre a ficha: registrar dessecação (data, área opcional e dias até a colheita), iniciar/finalizar colheita, **lançar o volume colhido dia a dia**, informar a **produtividade do produtor**, ver o **histórico de técnicos** escalados e editar dados. |
| **Programação** | Planejamento do dia (padrão: amanhã). Distribui campos entre os técnicos, informando se vai **colher e retirar pré-colheita** ou **passar pegando pré-colheita**. Dá para escolher **vários campos de uma vez para o mesmo técnico** (roteiro de pré-colheita). Gera o texto para o WhatsApp (copiar, baixar `.txt` ou abrir direto na conversa do técnico). |
| **Internalização** | Estimativa de sacos por dia, acumulado e por semana, com painel de parâmetros (ha/dia, sc/ha, aproveitamento…), filtros e ajustes por campo. Mostra também o internalizado real já lançado. |
| **Metas** | Por cultivar: big bags de semente pronta planejados → meta de internalização de matéria-prima bruta, total internalizado, GAP e % de atingimento, com **alerta quando a demanda é maior que a área/volume ainda disponível para colher**. |
| **Mapa** | Posição dos campos, anéis de 10, 20, 50, 100, 200 e 300 km a partir da UBS e a tabela de **volume por cultivar em cada faixa de distância**. |
| **Técnicos** | Cadastro dos técnicos de campo (nome, telefone/WhatsApp, cidade base, função, cor, observações). |
| **Importar campos** | Sobe a planilha de planting (`.xlsx`, aba **Base Planting**) de uma vez, com prévia antes de gravar. |

### Como a data provável de colheita funciona

Na ficha do campo, informe a **data da dessecação** e os **dias até a colheita**. O sistema soma e mostra a data provável
(ex.: dessecado em 11/11/2026 + 5 dias = **16/11/2026**). Um dia antes (15/11) o campo aparece no alerta
**“Véspera — encaminhar pré-colheita”**, com o botão **Programar** para já escolher o técnico. A área dessecada é
opcional e permite registrar dessecações parciais (mais de uma por campo).

### Volume colhido, aprovado e internalizado

Na ficha do campo, seção **Volume colhido, aprovado e internalizado**:

- **Lançar volume do dia**: dia, volume colhido (em kg, sacos ou toneladas) e, se parte da carga foi para grão, o volume
  **aprovado e internalizado** na UBS (em branco = tudo aprovado). A área colhida no dia é opcional. Pode haver mais de
  um lançamento por dia, e cada um pode ser corrigido ou excluído.
- **Esses volumes são a informação principal**: só eles alimentam as outras telas (aba Metas, aba Internalização e
  lista de campos).
- **Produtividade do produtor (sc/ha)** — *só informativa*: a produtividade geral da área que o produtor passar fica
  registrada apenas na ficha. Com ela o sistema mostra o **potencial da área** (produtividade × área), **quanto deixou
  de ir para a UBS** (potencial − entregue) e o **aproveitamento para semente** (aprovado e internalizado ÷ potencial).
  Ela não entra nas metas, na projeção de internalização nem no cálculo do que ainda há para colher. Com a colheita em
  andamento e a área colhida lançada, a comparação é feita só sobre a área já colhida; finalizada, sobre o campo inteiro.

### Histórico de técnicos no campo

A ficha guarda todas as escalas do campo, sem limite de datas: quem foi, em que dia, se foi para **colher** ou para
**pegar pré-colheita** e o andamento (planejado, concluído, cancelado), com um resumo por técnico e exportação em CSV.
Para o registro não se perder, prefira **cancelar** uma escala antiga em vez de removê-la e **desativar** um técnico em
vez de excluí-lo (excluir o técnico apaga as escalas dele).

### Metas por cultivar

As cultivares aparecem sozinhas, a partir da coluna *Produto* dos campos. Para cada uma, informe os **big bags
planejados** (ou, em “Detalhes”, os sacos de 200 mil sementes, o PMS, o rendimento e os big bags já prontos):

```
sacos de 200 mil sementes = big bags × 25
semente pronta (sc 60 kg)  = sacos de 200 mil × (PMS × 0,2 kg) ÷ 60
meta de internalização     = semente pronta ÷ rendimento do beneficiamento (75%)
GAP                        = total internalizado − meta
```

Os três parâmetros (25 sacos por big bag, PMS de 180 g e rendimento de 75%) são editáveis na própria aba, e PMS e
rendimento podem ser ajustados por cultivar. Também dá para digitar a meta de internalização direto, à mão.
O **total internalizado** vem dos volumes aprovados lançados nas fichas dos campos.

O **alerta** aparece quando o que falta internalizar é maior que o volume previsto nos campos ainda por colher daquela
cultivar (área restante × sc/ha × aproveitamento da aba Internalização). A aba mostra o déficit em sacos, a área que seria necessária e
quantos big bags a projeção alcança.

## Como colocar no ar

Você precisa de duas contas gratuitas: [supabase.com](https://supabase.com) e [vercel.com](https://vercel.com).
Os nomes dos menus podem mudar um pouco conforme a versão dos painéis.

### 1. Supabase (banco de dados e login)

1. Crie um projeto novo (região **South America (São Paulo)**) e guarde a senha do banco.
2. **Crie os usuários primeiro:** *Authentication → Users → Add user → Create new user*. Informe e-mail e senha de cada
   pessoa e marque **Auto Confirm User**.
3. **Crie as tabelas:** *SQL Editor → New query*, cole todo o conteúdo de
   [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) e clique em **Run**.
   Na primeira execução, os usuários que você acabou de criar já ficam liberados para usar o sistema.
   Depois faça o mesmo com
   [`supabase/migrations/0002_colheita_real_e_metas.sql`](supabase/migrations/0002_colheita_real_e_metas.sql)
   (volume colhido, produtividade do produtor e metas por cultivar).
4. **Desligue o cadastro público:** *Authentication → Sign In / Providers* → desligue **Allow new users to sign up** e salve.
   (Em algumas versões do painel a opção fica dentro do provedor **Email**.)
5. Copie as duas informações de conexão no botão **Connect** (topo da tela) ou em *Settings → API Keys*:
   - **Project URL** (ex.: `https://abcdefgh.supabase.co`);
   - **Publishable key** (começa com `sb_publishable_…`). Em projetos antigos ela se chama **anon / public** e fica na
     aba *Legacy API Keys*. **Nunca** use a chave *secret* / `service_role` aqui.

**Já usa o sistema e está atualizando?** Rode só o arquivo `0002_colheita_real_e_metas.sql` no SQL Editor. Ele não
apaga nada e pode ser executado mais de uma vez. Enquanto isso não for feito, o sistema continua funcionando e mostra
um aviso no topo dizendo que falta atualizar o banco.

**Para liberar outra pessoa depois:** crie o usuário (passo 2) e inclua o e-mail dela em
*Table Editor → usuarios_liberados → Insert row*. Sem isso ela consegue fazer login, mas o sistema avisa que o e-mail
ainda não está liberado.

### 2. Vercel (a tela do sistema)

1. *Add New… → Project → Import Git Repository* e escolha `talles15/CONTROLE-DE-TECNICOS-E-COLHEITA`.
2. O tipo **Vite** é detectado sozinho. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

   | Nome | Valor |
   |---|---|
   | `SUPABASE_URL` | a *Project URL* do passo 5 |
   | `SUPABASE_PUBLISHABLE_KEY` | a *Publishable key* (ou *anon / public*) do passo 5 |

   São os mesmos nomes que o Supabase mostra no botão **Connect**. Também funcionam `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`. **Não cadastre a `SUPABASE_SECRET_KEY`.**

3. Clique em **Deploy**. A Vercel mostra o endereço do sistema (algo como `https://controle-de-tecnicos-e-colheita.vercel.app`).
   A cada alteração enviada ao repositório, ela publica de novo sozinha.
4. Se as variáveis forem cadastradas ou alteradas depois, faça um novo deploy (*Deployments → ⋯ → Redeploy*):
   elas só entram na hora da publicação.

### 3. Primeiro uso

1. Abra o endereço da Vercel e entre com o e-mail e a senha criados no Supabase.
2. Aba **Técnicos**: cadastre a equipe.
3. Aba **Importar campos**: envie a planilha de planting e confirme a prévia.

### Ver o sistema antes de configurar o Supabase

Sem as duas variáveis, o sistema abre em **modo demonstração**, com dados fictícios guardados só no navegador
(aparece uma faixa amarela no topo). Serve para conhecer as telas:

```bash
npm install
```

```bash
npm run dev
```

Depois é só abrir o endereço que aparecer no terminal (normalmente `http://localhost:5173`).

## Importação da planilha

- É lida somente a aba **Base Planting**, com o cabeçalho na 2ª linha (mesmo modelo da planilha de planting).
- **CPF/CNPJ, Inscrição Estadual e a coluna “Chave (IE|Produto)” são descartados na leitura**, dentro do navegador.
  Não são enviados ao banco e não existem colunas para eles.
- Linhas com o mesmo **nº de campo** viram um único campo, com áreas e expectativa somadas. Só ficam separadas quando a
  **categoria a colher** é diferente. Linhas “Não SIGEF” (sem número) também são separadas por cliente e cultivar.
- Plantio e colheita prevista usam a data mais cedo entre as linhas; a posição no mapa usa a primeira linha com coordenada.
- Coordenadas no formato da planilha (`173000.5` = 17°30'00.5"S) são convertidas automaticamente.
- **Reimportar é seguro:** os dados da planilha são atualizados e tudo o que foi lançado no sistema (dessecações,
  datas de colheita, programações, volumes colhidos, produtividade do produtor, ajustes da projeção) é mantido. Campos que saíram da planilha são apenas sinalizados,
  com opção de inativar.

## Segurança e privacidade

- O acesso exige login **e** o e-mail na tabela `usuarios_liberados`. Visitantes sem login não leem nada (RLS do Supabase).
- A chave *anon* que vai para a Vercel é pública por natureza; quem protege os dados são as regras do banco acima.
- O `.gitignore` bloqueia `.xlsx`, `.xls`, `.csv` e arquivos `.env`, para que planilhas e chaves não sejam enviadas por engano.

## Para quem for mexer no código

```
src/lib/        regras de negócio (importação, alertas, projeção, colheita real, metas, distâncias, texto do WhatsApp, acesso a dados)
src/pages/      uma tela por aba
src/components/ ficha do campo e componentes compartilhados
supabase/       esquema do banco (rodar os arquivos de migrations/ em ordem)
e2e/            teste de ponta a ponta (Playwright, modo demonstração)
```

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe o sistema localmente |
| `npm run build` | confere os tipos e gera a versão de produção em `dist/` |
| `npm test` | testes das regras de negócio |
| `npm run e2e` | teste de ponta a ponta (antes: `npm run build` e `npx vite preview --port 4173`) |

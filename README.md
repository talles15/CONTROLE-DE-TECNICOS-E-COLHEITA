# Controle de Técnicos e Colheita — Safra 26/27

Sistema web para acompanhar a colheita dos campos cooperantes: dessecação, colheita provável, aviso de pré-colheita,
programação diária dos técnicos (com mensagem pronta para o WhatsApp), estimativa de internalização e mapa dos campos
em relação à UBS.

- **Tela:** hospedada na Vercel.
- **Dados e login:** Supabase (banco PostgreSQL na nuvem).
- **Este repositório é público e não contém nenhum dado de campo, cliente ou fazenda.** Tudo fica no Supabase.

## O que tem em cada aba

| Aba | Para que serve |
|---|---|
| **Calendário** | Visão geral do mês: campos **dessecados**, com **colheita programada** e **em colheita**. No topo, os alertas: véspera de colheita (mandar alguém fazer a pré-colheita), colheita provável hoje, atrasados e próximos 7 dias. |
| **Campos** | Lista com busca e filtros. Clicando no campo abre a ficha: registrar dessecação (data, área opcional e dias até a colheita), iniciar/finalizar colheita, ver técnicos programados, editar dados. |
| **Programação** | Planejamento do dia (padrão: amanhã). Distribui campos entre os técnicos, informando se vai **colher e retirar pré-colheita** ou **passar pegando pré-colheita**. Gera o texto para o WhatsApp (copiar, baixar `.txt` ou abrir direto na conversa do técnico). |
| **Internalização** | Estimativa de sacos por dia, acumulado e por semana, com painel de parâmetros (ha/dia, sc/ha, aproveitamento…), filtros e ajustes por campo. |
| **Mapa** | Posição dos campos, anéis de 10, 20, 50, 100, 200 e 300 km a partir da UBS e a tabela de **volume por cultivar em cada faixa de distância**. |
| **Técnicos** | Cadastro dos técnicos de campo (nome, telefone/WhatsApp, cidade base, função, cor, observações). |
| **Importar campos** | Sobe a planilha de planting (`.xlsx`, aba **Base Planting**) de uma vez, com prévia antes de gravar. |

### Como a data provável de colheita funciona

Na ficha do campo, informe a **data da dessecação** e os **dias até a colheita**. O sistema soma e mostra a data provável
(ex.: dessecado em 11/11/2026 + 5 dias = **16/11/2026**). Um dia antes (15/11) o campo aparece no alerta
**“Véspera — encaminhar pré-colheita”**, com o botão **Programar** para já escolher o técnico. A área dessecada é
opcional e permite registrar dessecações parciais (mais de uma por campo).

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
4. **Desligue o cadastro público:** *Authentication → Sign In / Providers* → desmarque **Allow new users to sign up**.
5. Copie as duas informações de conexão em *Project Settings → API* (ou *API Keys*):
   - **Project URL** (ex.: `https://abcdefgh.supabase.co`);
   - chave **anon / public** (ou *Publishable key*). **Nunca** use a chave `service_role`/*secret* aqui.

**Para liberar outra pessoa depois:** crie o usuário (passo 2) e inclua o e-mail dela em
*Table Editor → usuarios_liberados → Insert row*. Sem isso ela consegue fazer login, mas o sistema avisa que o e-mail
ainda não está liberado.

### 2. Vercel (a tela do sistema)

1. *Add New… → Project → Import Git Repository* e escolha `talles15/CONTROLE-DE-TECNICOS-E-COLHEITA`.
2. O tipo **Vite** é detectado sozinho. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | a *Project URL* do passo 5 |
   | `VITE_SUPABASE_ANON_KEY` | a chave *anon / public* do passo 5 |

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
  datas de colheita, programações, ajustes da projeção) é mantido. Campos que saíram da planilha são apenas sinalizados,
  com opção de inativar.

## Segurança e privacidade

- O acesso exige login **e** o e-mail na tabela `usuarios_liberados`. Visitantes sem login não leem nada (RLS do Supabase).
- A chave *anon* que vai para a Vercel é pública por natureza; quem protege os dados são as regras do banco acima.
- O `.gitignore` bloqueia `.xlsx`, `.xls`, `.csv` e arquivos `.env`, para que planilhas e chaves não sejam enviadas por engano.

## Para quem for mexer no código

```
src/lib/        regras de negócio (importação, alertas, projeção, distâncias, texto do WhatsApp, acesso a dados)
src/pages/      uma tela por aba
src/components/ ficha do campo e componentes compartilhados
supabase/       esquema do banco
e2e/            teste de ponta a ponta (Playwright, modo demonstração)
```

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe o sistema localmente |
| `npm run build` | confere os tipos e gera a versão de produção em `dist/` |
| `npm test` | testes das regras de negócio |
| `npm run e2e` | teste de ponta a ponta (antes: `npm run build` e `npx vite preview --port 4173`) |

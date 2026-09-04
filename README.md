# LIIST

Aplicacao web de catalogo com carrinho e envio de pedido pelo WhatsApp. A primeira versao usa dados locais para validar a experiencia de compra e um painel interno para preparar integracoes por planilha, banco legado ou API.

## Rodar localmente

```bash
npm install
npm run dev
```

Os scripts usam Node 22 temporario via `npx`, porque o ambiente local atual tem Node 18 e o stack do projeto exige Node 22+.

## Configurar o Supabase em outro computador

O arquivo `.env.local` nao e enviado ao GitHub. Cada computador precisa criar o seu:

```powershell
Copy-Item .env.example .env.local
```

Depois, edite o `.env.local` e preencha os dois valores usando os dados do mesmo projeto no painel do Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-publica-anon
```

Use somente a chave publica `anon`. Nunca coloque a `service_role` no frontend. Depois de salvar o arquivo, encerre e execute `npm run dev` novamente.

## Estrutura principal

- `app/page.tsx`: experiencia do catalogo, carrinho e checkout.
- `app/operacao/page.tsx`: mapa de mesas e entrada da equipe operacional.
- `app/pedidos/page.tsx`: areas separadas de atendimento, cozinha e caixa.
- `app/globals.css`: layout responsivo e identidade visual.
- `supabase/schema.sql`: schema inicial para multiempresa, lojas, produtos, integracoes, sincronizacoes e pedidos.
- `.env.example`: modelo das variaveis locais necessarias para conectar ao Supabase.

## Fluxo de comandas

Depois do schema inicial, aplique as migrations da pasta `supabase` em ordem numerica. Para a operacao atual, as ultimas migrations obrigatorias sao:

1. `021_branch_access_tables_and_audit.sql`: acessos por filial, mesas e auditoria.
2. `022_multi_role_company_users.sql`: mais de uma funcao por usuario.
3. `023_operational_workflow.sql`: fluxo simplificado/completo, preparo e entrega por item, fechamento, pagamento e liberacao da mesa.

Execute somente o conteudo SQL no SQL Editor do Supabase. A funcao `supabase/functions/create-store-user/index.ts` deve ser publicada como Edge Function separadamente.

## Integracoes previstas

- Material de construcao: conector por banco legado com rotina agendada e botao manual de atualizacao de precos.
- Farmacia: conector por API externa com cache para estoque e precos.
- Outros segmentos: cadastro de loja, categorias e produtos no Supabase.

Para Cloudflare Pages, configure o build com Node 22+ e use o comando `npm run build`.

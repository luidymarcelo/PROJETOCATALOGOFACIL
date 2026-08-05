# Catalogo Facil

Aplicacao web de catalogo com carrinho e envio de pedido pelo WhatsApp. A primeira versao usa dados locais para validar a experiencia de compra e um painel interno para preparar integracoes por planilha, banco legado ou API.

## Rodar localmente

```bash
npm install
npm run dev
```

Os scripts usam Node 22 temporario via `npx`, porque o ambiente local atual tem Node 18 e o stack do projeto exige Node 22+.

## Estrutura principal

- `app/page.tsx`: experiencia do catalogo, carrinho, checkout e painel interno.
- `app/globals.css`: layout responsivo e identidade visual.
- `supabase/schema.sql`: schema inicial para multiempresa, lojas, produtos, integracoes, sincronizacoes e pedidos.

## Integracoes previstas

- Material de construcao: conector por banco legado com rotina agendada e botao manual de atualizacao de precos.
- Farmacia: conector por API externa com cache para estoque e precos.
- Outros segmentos: cadastro de loja, categorias e produtos no Supabase.

Para Cloudflare Pages, configure o build com Node 22+ e use o comando `npm run build`.

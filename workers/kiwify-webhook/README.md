# Kioku Kiwify webhook (Cloudflare Worker)

Worker que recebe os **webhooks de venda da Kiwify** e atualiza o plano do usuario
na tabela `public.profiles` do Supabase.

- `POST /` com o corpo JSON da Kiwify -> aplica/ignora e responde `200`.

O navegador nunca fala com este Worker: e uma chamada **servidor -> servidor** da
Kiwify. Por isso nao ha CORS. A autenticidade vem da **assinatura HMAC**.

> Nada aqui entra no build do app: o `tsconfig.json` do Kioku so inclui `src`, e o
> Vite so empacota o que e importado de `src`. Esta pasta e independente.
>
> Ainda **nao** esta ligado a nada em producao — e so o Worker, para revisao antes
> do deploy.

---

## 1. Como a seguranca funciona (leia antes de configurar)

A Kiwify **assina** cada webhook. Ela acrescenta `?signature=<hex>` na URL, onde:

```
signature = HMAC-SHA1(corpo_cru_da_requisicao, TOKEN_DO_WEBHOOK)   // em hexadecimal
```

O `TOKEN_DO_WEBHOOK` aparece no painel da Kiwify, na configuracao do webhook.
**Esse token e a CHAVE do HMAC** — ele nao chega "em texto" na requisicao, o que
chega e a assinatura calculada com ele. O Worker recalcula o HMAC sobre o corpo
cru e compara em tempo constante. Se nao bater -> `401` e nada acontece.

Voce define esse mesmo token como o secret `KIWIFY_WEBHOOK_TOKEN`.

**Fallback manual (opcional):** se preferir nao depender da assinatura, o Worker
tambem aceita o token estatico em `?token=<TOKEN>` na URL ou no cabecalho
`x-kiwify-webhook-token`. Use **um** dos dois caminhos:

- **Recomendado:** deixe a Kiwify assinar (so cole a URL do Worker e configure o
  token no painel). O `?signature=` vem automatico.
- **Manual:** ponha `?token=SEU_TOKEN` na URL do webhook.

> Suposicao: a Kiwify usa **HMAC-SHA1** em hex (esquema documentado por eles). Se o
> seu painel usar outro algoritmo, troque `SHA-1` em `hmacSha1Hex` (em `src/index.ts`)
> ou use o fallback `?token=`.

## 2. Eventos tratados

Os campos sao lidos de forma **defensiva** (varios nomes possiveis) e **logados**
para voce conferir com um webhook real. Suposicoes de campo:

| Dado | Campo principal | Alternativos |
|---|---|---|
| Produto | `Product.product_id` | `product.id`, `Product.id`, `product_id` |
| Email | `Customer.email` | `customer.email`, `email`, `buyer.email` |
| Evento | `webhook_event_type` | `event`, `type`, `webhook_event` |
| Status | `order_status` | `status`, `Subscription.status` |

Mapa de acao (casado por substring, em minusculas):

| Evento / status | Acao |
|---|---|
| compra aprovada / `paid`, assinatura renovada | seta o plano do produto |
| reembolso, chargeback, assinatura cancelada | seta `free` |
| assinatura atrasada (`late`/`overdue`) | **nao faz nada** (nao rebaixa) |
| produto fora do catalogo / outros (pix/boleto gerado, recusada) | ignora (`200`) |

Produtos:

- `f1353580-6912-11f1-b760-8b671470803c` -> `basic`
- `90a04bd0-6915-11f1-9476-47ac9f22b2c0` -> `advanced`

Status HTTP: `401` so para assinatura/token invalido; `500` so em erro real
(falha ao falar com o Supabase, para a Kiwify reenviar); `200` em tudo que e
tratado ou ignorado de proposito (a Kiwify nao fica reenviando).

## 3. SQL necessario (rode uma vez)

`profiles` nao guarda email, entao o Worker resolve email -> usuario via uma
funcao no Postgres. Rode **`db/set-plan-by-email.sql`** (na raiz do repo) no SQL
editor do Supabase. Ela cria `public.set_plan_by_email(email, plano)`
(`SECURITY DEFINER`, restrita ao service role) que acha o `auth.users.id` pelo
email e atualiza `profiles.plan`.

## 4. Instalar dependencias

```
cd workers/kiwify-webhook
npm install
```

## 5. Configurar os segredos

**Producao** (secrets no Cloudflare):

```
npx wrangler secret put SUPABASE_URL          # https://zsvxrbvxlxurendqaree.supabase.co
npx wrangler secret put SUPABASE_SECRET_KEY   # sb_secret_... (service role)
npx wrangler secret put KIWIFY_WEBHOOK_TOKEN  # token do webhook (painel Kiwify)
```

**Desenvolvimento local** (`wrangler dev`):

```
cp .dev.vars.example .dev.vars
# edite .dev.vars e preencha os tres valores
```

`.dev.vars` esta no `.gitignore`. **Nunca** o cometa.

## 6. Deploy

```
npx wrangler deploy
```

Anote a URL publicada, algo como
`https://kioku-kiwify-webhook.SEU-SUBDOMINIO.workers.dev`. Cole-a no painel da
Kiwify como a URL do webhook e configure o mesmo token de `KIWIFY_WEBHOOK_TOKEN`.

## 7. Testar (sem a Kiwify)

Usando o fallback de token estatico (mais simples para um teste manual):

```
curl -X POST "https://SEU-WORKER.workers.dev/?token=SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "webhook_event_type": "order_approved",
        "order_status": "paid",
        "Product": { "product_id": "f1353580-6912-11f1-b760-8b671470803c" },
        "Customer": { "email": "usuario@exemplo.com" }
      }'
```

Esperado: `200 ok` e `profiles.plan = 'basic'` para esse email (se o usuario
existir). Email sem usuario -> `200 ok: no matching user` (logado para conciliar).
Token errado -> `401`.

Para testar a assinatura real, calcule `HMAC-SHA1(corpo, token)` em hex e mande em
`?signature=`.

---

## Resumo dos segredos

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | `https://zsvxrbvxlxurendqaree.supabase.co` |
| `SUPABASE_SECRET_KEY` | a chave `sb_secret_...` (service role) |
| `KIWIFY_WEBHOOK_TOKEN` | o token do webhook no painel da Kiwify |

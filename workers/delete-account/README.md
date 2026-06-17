# Kioku delete-account (Cloudflare Worker)

Worker que exclui a **própria conta** do usuário autenticado, de forma
**irreversível**, usando a SECRET key (service role) para chamar a **Auth Admin
API** do Supabase. Substitui a antiga função SQL `delete_my_account` (este
projeto não permite que um `SECURITY DEFINER` faça `SET ROLE supabase_auth_admin`
para deletar de `auth.users`).

- `POST /` com `Authorization: Bearer <access_token do Supabase>` -> `200` em sucesso.

> Este Worker guarda a **service key** e poderia deletar qualquer usuário. Por
> isso ele SÓ apaga a conta do **próprio chamador**: o id vem somente do `sub` do
> JWT verificado, nunca de um parâmetro.

## Como funciona (na ordem)
1. **Valida o JWT** do Supabase por assinatura (JWKS / ES256), com a publishable
   key (`SUPABASE_ANON_KEY`) como `apikey` — igual ao ai-proxy/tts-proxy/image-proxy.
   Sem token / token inválido -> `401`.
2. Extrai `sub` (id) e `email` do token **verificado**.
3. **Guarda de plano pago** (defesa em profundidade): lê `profiles.plan` com a
   service key. Se `basic`/`advanced` -> `403` (`{"code":"paid_plan", ...}`) e
   **não apaga**. Só `free` (ou sem linha) prossegue.
4. **Limpa `pending_plans`** pelo email do token (best-effort, não bloqueia).
5. **`DELETE /auth/v1/admin/users/{sub}`** com a service key (hard delete) ->
   CASCATA para `profiles`/`decks`/`cards`/`review_logs`/`gamification`/
   `achievement_unlocks`/`usage_counters` e `auth.*`.

**Mídia:** já removida pelo **cliente** via Storage API ANTES desta chamada
(`src/features/account/deleteAccount.ts`, passo (b)). O Worker NÃO toca em Storage
(o Supabase proíbe DELETE direto em `storage.objects` via SQL/admin).

Status: `200` sucesso · `401` token inválido · `403` plano ativo (ou origem não
permitida) · `500` erros reais. Logs: só o `sub` (uuid) — nunca email nem segredos.

## 1. Instalar dependencias
```
cd workers/delete-account
npm install
```

## 2. Configurar os segredos
**Producao** (secrets no Cloudflare):
```
npx wrangler secret put SUPABASE_URL          # https://zsvxrbvxlxurendqaree.supabase.co
npx wrangler secret put SUPABASE_ANON_KEY     # publishable key (sb_publishable_...), p/ o JWKS
npx wrangler secret put SUPABASE_SECRET_KEY   # service role (sb_secret_...)
```
**Desenvolvimento local** (`wrangler dev`):
```
cp .dev.vars.example .dev.vars
# edite .dev.vars e preencha os tres valores
```
`.dev.vars` esta no `.gitignore`. **Nunca** o cometa. `ALLOWED_ORIGINS` (em
`wrangler.jsonc`) ja vem com o dominio de producao + `http://localhost:5173`.

## 3. Deploy
```
npx wrangler deploy
```
Anote a URL publicada (ex.: `https://kioku-delete-account.SEU-SUBDOMINIO.workers.dev`)
e configure-a no app como **`VITE_DELETE_ACCOUNT_URL`** (.env.local) e refaça o
build. O cliente envia o access token no header `Authorization: Bearer`.

## 4. Depois de confirmar que funciona
Solte a função SQL antiga (não é mais usada):
```sql
drop function if exists public.delete_my_account();
```

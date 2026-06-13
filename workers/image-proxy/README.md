# Kioku image proxy (Cloudflare Worker)

Pequeno Worker que guarda a chave da **OpenAI** no servidor e expoe um endpoint
para o app Kioku gerar imagens:

- `POST /` com `{ prompt, size?, quality? }` responde `{ image }` — a imagem em
  **PNG base64** (igual ao `b64_json` da OpenAI).

Usa o modelo **`gpt-image-1-mini`** (versao economica do GPT Image 1) no endpoint
`https://api.openai.com/v1/images/generations`. Os modelos `gpt-image` sempre
devolvem a imagem em base64, entao o Worker NAO envia `response_format`.

O navegador nunca recebe a chave: ele so fala com este Worker. A chave da OpenAI
fica como **Wrangler secret**, fora do codigo e fora do git.

> Nada aqui entra no build do app: o `tsconfig.json` do Kioku so inclui `src`,
> e o Vite so empacota o que e importado de `src`. Esta pasta e independente.
>
> Ainda **nao** esta ligado ao app — e so o Worker, para revisao antes do deploy.

---

## 1. Obter a chave da OpenAI

1. Em <https://platform.openai.com/api-keys>, crie uma **API key**.
2. Garanta que a conta tem credito/faturamento ativo e acesso aos modelos de
   imagem (`gpt-image-1-mini`).
3. Guarde o valor da chave para o passo 3.

## 2. Instalar dependencias

```
cd workers/image-proxy
npm install
```

## 3. Configurar a chave e as origens

**Producao** (secret no Cloudflare):

```
npx wrangler secret put OPENAI_API_KEY
# cole o valor da chave quando pedir
```

**Desenvolvimento local** (`wrangler dev`): copie o exemplo e preencha.

```
cp .dev.vars.example .dev.vars
# edite .dev.vars e coloque OPENAI_API_KEY=...
```

`.dev.vars` esta no `.gitignore`. **Nunca** o cometa.

`ALLOWED_ORIGINS` em `wrangler.jsonc` ja vem com o dominio de producao do Kioku e
o dev: `https://kioku.com.br,http://localhost:5173`. Ajuste se necessario.

## 4. Deploy do Worker

```
npx wrangler deploy
```

Anote a URL publicada, algo como
`https://kioku-image-proxy.SEU-SUBDOMINIO.workers.dev`.

## 5. Testar

```
curl -X POST https://kioku-image-proxy.SEU-SUBDOMINIO.workers.dev/ \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{ "prompt": "a minimalist orange fox logo, flat vector", "size": "1024x1024" }'
```

Resposta `200`: `{ "image": "<base64 do PNG>" }`. No navegador, use a imagem com
`data:image/png;base64,${image}`.

---

## Endpoints (referencia)

`POST /`

```json
{ "prompt": "um logo minimalista de raposa", "size": "1024x1024", "quality": "low" }
```

- `prompt` (obrigatorio): texto da imagem.
- `size` (opcional): `1024x1024` (padrao), `1536x1024`, `1024x1536` ou `auto`.
  Qualquer outro valor cai no padrao.
- `quality` (opcional): `low`, `medium`, `high` ou `auto`. Omitido = padrao da
  OpenAI. `low` e o mais barato.

resposta `200`:

```json
{ "image": "<base64 do PNG (b64_json)>" }
```

Erros voltam como `{ "error": "<mensagem>" }` com o status apropriado
(400 corpo invalido / prompt ausente, 403 origem nao permitida, 500 chave nao
configurada, 5xx falha da OpenAI).

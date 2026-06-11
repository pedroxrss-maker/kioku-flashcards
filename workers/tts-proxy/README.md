# Kioku TTS proxy (Cloudflare Worker)

Pequeno Worker que guarda a credencial do **Google Cloud Text-to-Speech** no
servidor e expoe dois endpoints para o app Kioku:

- `POST /synthesize` com `{ text, voiceName, languageCode, audioEncoding }`
  responde `{ audioContent }` (MP3 em base64, igual a REST do Google).
- `GET /voices` responde `{ voices: [...] }` (lista curada; opcional).

O navegador nunca recebe a credencial: ele so fala com este Worker. A chave do
Google fica como **Wrangler secret**, fora do codigo e fora do git.

> Nada aqui entra no build do app: o `tsconfig.json` do Kioku so inclui `src`,
> e o Vite so empacota o que e importado de `src`. Esta pasta e independente.

---

## 1. Habilitar a API no Google Cloud

1. Crie (ou escolha) um projeto no Google Cloud.
2. Habilite a **Cloud Text-to-Speech API** nesse projeto (Console: APIs e
   Servicos, ou `gcloud services enable texttospeech.googleapis.com`).
3. Garanta que o projeto tem faturamento ativo (a API exige).

## 2. Criar a credencial

Duas opcoes. A **(a)** e a mais simples e e a que este Worker ja implementa.

### Opcao (a), recomendada e implementada: API key

1. Console: APIs e Servicos > Credenciais > Criar credenciais > Chave de API.
2. **Restrinja a chave** a Cloud Text-to-Speech API (aba Restricoes de API).
   De preferencia restrinja tambem por aplicativo/IP quando possivel.
3. Guarde o valor da chave para o passo 4.

O Worker chama `POST /v1/text:synthesize?key=SUA_CHAVE`, que aceita API key.

### Opcao (b), alternativa: service account + OAuth

Mais robusta, porem mais codigo. Resumo se voce preferir este caminho:

1. Crie uma **service account** com o papel de uso da Text-to-Speech e gere uma
   chave **JSON**.
2. Guarde o JSON inteiro como secret (`wrangler secret put GOOGLE_SA_JSON`).
3. No Worker, gere um **JWT** (RS256, assinando com a `private_key` do JSON via
   Web Crypto), troque-o por um **access token** em
   `https://oauth2.googleapis.com/token` (grant `jwt-bearer`) e chame a API com
   `Authorization: Bearer <token>` (sem `?key=`). Faca cache do token (ele dura
   cerca de 1 hora).

Se adotar a (b), troque a montagem do `fetch` em `src/index.ts` (hoje usa
`?key=`) por `Authorization: Bearer` e remova o uso de `GOOGLE_TTS_API_KEY`.

## 3. Instalar dependencias

```
cd workers/tts-proxy
npm install
```

## 4. Configurar a credencial e as origens

**Producao** (secret no Cloudflare):

```
npx wrangler secret put GOOGLE_TTS_API_KEY
# cole o valor da chave quando pedir
```

**Desenvolvimento local** (`wrangler dev`): copie o exemplo e preencha.

```
cp .dev.vars.example .dev.vars
# edite .dev.vars e coloque GOOGLE_TTS_API_KEY=...
```

`.dev.vars` esta no `.gitignore`. **Nunca** o cometa.

Edite `ALLOWED_ORIGINS` em `wrangler.jsonc` para o seu dominio de producao do
Kioku, mantendo `http://localhost:5173` para desenvolvimento. Exemplo:

```jsonc
"vars": { "ALLOWED_ORIGINS": "https://kioku.exemplo.com,http://localhost:5173" }
```

## 5. Deploy do Worker

```
npx wrangler deploy
```

Anote a URL publicada, algo como
`https://kioku-tts-proxy.SEU-SUBDOMINIO.workers.dev`.

## 6. Apontar o app para o Worker

O app le `import.meta.env.VITE_TTS_PROXY_URL` em build (Vite assa o valor no
bundle). Defina a variavel **antes de buildar** o app:

```
# na raiz do repositorio, em .env.local (ja ignorado pelo git)
VITE_TTS_PROXY_URL=https://kioku-tts-proxy.SEU-SUBDOMINIO.workers.dev
```

Depois rebuilde e publique o app. Este repo publica a SPA pelo `wrangler.jsonc`
da raiz:

```
npm run build
npx wrangler deploy
```

(Se voce publica o Kioku por outra plataforma, defina `VITE_TTS_PROXY_URL` no
ambiente de build dela e rebuilde por la.)

## 7. Testar

1. Abra o Kioku, va em Configuracoes > Audio. Escolha uma voz e clique
   **Testar voz**: deve tocar uma frase curta.
2. Em um deck, use **Gerar audio** (e em um card, **Gerar audio**). O MP3 e
   salvo no Storage e toca na revisao.

Se a URL do Worker nao estiver configurada, o app mostra uma mensagem clara em
pt-BR em vez de quebrar.

---

## Endpoints (referencia)

`POST /synthesize`

```json
{ "text": "Hello", "voiceName": "en-US-Neural2-D", "languageCode": "en-US", "audioEncoding": "MP3" }
```

resposta `200`:

```json
{ "audioContent": "<base64 do MP3>" }
```

Erros voltam como `{ "error": "<mensagem>" }` com o status apropriado
(400 corpo invalido, 403 origem nao permitida, 5xx falha do Google).

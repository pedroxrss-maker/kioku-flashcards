# Kioku AI proxy (Cloudflare Worker)

Pequeno Worker que guarda a chave da API do **Google Gemini** no servidor e expoe
um endpoint para o app Kioku:

- `POST /` com `{ model, contents, systemInstruction?, generationConfig }`
  repassa a resposta JSON do Gemini como veio (o cliente le
  `candidates[0].content.parts[].text`).

O navegador nunca recebe a chave: ele so fala com este Worker. A chave do Google
fica como **Wrangler secret**, fora do codigo e fora do git.

> Nada aqui entra no build do app: o `tsconfig.json` do Kioku so inclui `src`,
> e o Vite so empacota o que e importado de `src`. Esta pasta e independente
> (e separada do `tts-proxy`, que cuida do audio).

---

## 1. Habilitar a API no Google e criar a chave

A forma mais simples e o **Google AI Studio**:

1. Acesse <https://aistudio.google.com/app/apikey>.
2. Clique em **Create API key** (crie ou escolha um projeto do Google Cloud).
3. Guarde o valor da chave para o passo 3.

Alternativa pelo **Google Cloud Console**: habilite a **Generative Language API**
(`gcloud services enable generativelanguage.googleapis.com`) no projeto e crie
uma **Chave de API** em APIs e Servicos > Credenciais. **Restrinja a chave** a
essa API (aba Restricoes de API) e, quando possivel, por aplicativo/IP.

O Worker autentica por **cabecalho** `x-goog-api-key: SUA_CHAVE` (a chave fica
fora da URL e dos logs), chamando
`POST /v1beta/models/{model}:generateContent`.

## 2. Instalar dependencias

```
cd workers/ai-proxy
npm install
```

## 3. Configurar a chave e as origens

**Producao** (secret no Cloudflare):

```
npx wrangler secret put GOOGLE_GEMINI_API_KEY
# cole o valor da chave quando pedir
```

**Desenvolvimento local** (`wrangler dev`): copie o exemplo e preencha.

```
cp .dev.vars.example .dev.vars
# edite .dev.vars e coloque GOOGLE_GEMINI_API_KEY=...
```

`.dev.vars` esta no `.gitignore`. **Nunca** o cometa.

Edite `ALLOWED_ORIGINS` em `wrangler.jsonc` para o seu dominio de producao do
Kioku, mantendo `http://localhost:5173` para desenvolvimento. Exemplo:

```jsonc
"vars": { "ALLOWED_ORIGINS": "https://kioku.exemplo.com,http://localhost:5173" }
```

## 4. Deploy do Worker

```
npx wrangler deploy
```

Anote a URL publicada, algo como
`https://kioku-ai-proxy.SEU-SUBDOMINIO.workers.dev`.

## 5. Apontar o app para o Worker

O app le `import.meta.env.VITE_AI_PROXY_URL` em build (Vite assa o valor no
bundle). Use a **raiz** do Worker (o endpoint e `POST /`). Defina a variavel
**antes de buildar** o app:

```
# na raiz do repositorio, em .env.local (ja ignorado pelo git)
VITE_AI_PROXY_URL=https://kioku-ai-proxy.SEU-SUBDOMINIO.workers.dev
```

Depois rebuilde e publique o app. Este repo publica a SPA pelo `wrangler.jsonc`
da raiz:

```
npm run build
npx wrangler deploy
```

(Se voce publica o Kioku por outra plataforma, defina `VITE_AI_PROXY_URL` no
ambiente de build dela e rebuilde por la.)

## 6. Testar

1. Abra o Kioku e va em **Gerar deck com IA** (ou use **Importar com IA** na
   pagina de decks). Descreva um tema e clique em **Gerar cards**.
2. Em uma revisao, com o card virado, abra o **Tutor IA** e peca uma explicacao.

Se a URL do Worker (ou uma chave local) nao estiver configurada, o app mostra uma
mensagem clara em pt-BR ("IA nao configurada...") em vez de quebrar.

---

## Endpoint (referencia)

`POST /`

```json
{
  "model": "gemini-2.5-flash-lite",
  "contents": [{ "role": "user", "parts": [{ "text": "Ola" }] }],
  "systemInstruction": { "parts": [{ "text": "Responda em pt-BR." }] },
  "generationConfig": { "maxOutputTokens": 1024 }
}
```

resposta `200`: o JSON do Gemini, repassado como veio:

```json
{ "candidates": [{ "content": { "parts": [{ "text": "..." }] } }] }
```

Erros voltam como `{ "error": "<mensagem>" }` com o status apropriado: `400`
corpo invalido ou `model`/`contents` ausentes, `403` origem nao permitida, `500`
chave ausente no servidor, `502` falha ao falar com o Google, e o status do
Google repassado (com a mensagem dele) quando o Gemini responde com erro.

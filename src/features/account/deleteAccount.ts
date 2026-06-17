/**
 * Exclusão de conta (IRREVERSÍVEL), na ordem fixa:
 *  (a) confirma a senha com signInWithPassword (aborta se errada);
 *  (b) limpa a mídia do usuário no Storage (best-effort, com a sessão AINDA válida);
 *  (c) chama o Worker delete-account (Authorization: Bearer) — ele valida o JWT,
 *      reconfere o plano e apaga via Auth Admin API (cascata + pending_plans);
 *  (d) limpa caches locais, faz signOut e volta para a landing.
 *
 * Se o Worker falhar, NÃO faz signOut: lança DeleteAccountError com mensagem
 * pt-BR para a UI exibir, deixando o usuário tentar de novo.
 */
import { supabase } from '../../lib/supabase';
import { MEDIA_BUCKET } from '../media/storage';
import { clearQueryCache } from '../../db/store';
import { db } from '../../db';

/** Worker que apaga a conta (guarda a service key + chama a Auth Admin API).
 *  Sem ele definido, a exclusão não está disponível. */
const DELETE_ACCOUNT_URL = import.meta.env.VITE_DELETE_ACCOUNT_URL;

/** Erro com mensagem pt-BR pronta para exibir ao usuário. */
export class DeleteAccountError extends Error {}

/** Lista (recursivamente) todos os caminhos de arquivo sob um prefixo do bucket. */
async function listAllFilePaths(prefix: string): Promise<string[]> {
  const PAGE = 1000;
  const paths: string[] = [];
  const folders: string[] = [prefix];
  while (folders.length > 0) {
    const folder = folders.pop() as string;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .list(folder, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error || !data) break; // best-effort
      for (const entry of data) {
        const full = `${folder}/${entry.name}`;
        // Pastas vêm com id === null; arquivos têm id não-nulo.
        if (entry.id === null) folders.push(full);
        else paths.push(full);
      }
      if (data.length < PAGE) break;
    }
  }
  return paths;
}

/** Remove toda a mídia do usuário (chunks), via Storage API. Best-effort: o que
 *  sobrar fica órfão (privado, inacessível) — não há backstop no servidor. */
async function removeUserMedia(uid: string): Promise<void> {
  const paths = await listAllFilePaths(uid);
  const CHUNK = 100;
  for (let i = 0; i < paths.length; i += CHUNK) {
    await supabase.storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + CHUNK));
  }
}

/**
 * Chama o Worker delete-account com o access token do usuário. O Worker valida o
 * JWT (o id a apagar vem só do `sub` do token), reconfere o plano (403 se pago) e
 * apaga a conta via Auth Admin API. Lança DeleteAccountError (pt-BR) em falha.
 */
async function callDeleteWorker(): Promise<void> {
  if (!DELETE_ACCOUNT_URL) {
    throw new DeleteAccountError('Exclusão de conta não está disponível no momento.');
  }
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) {
    throw new DeleteAccountError('Sessão expirada. Entre novamente.');
  }
  let res: Response;
  try {
    res = await fetch(DELETE_ACCOUNT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new DeleteAccountError('Não foi possível excluir a conta. Tente novamente.');
  }
  if (res.ok) return;

  // Erro: extrai code/message do corpo (quando JSON) para uma mensagem clara.
  let code = '';
  let message = '';
  try {
    const body = (await res.json()) as { code?: string; error?: string };
    code = body.code ?? '';
    message = body.error ?? '';
  } catch {
    /* corpo não-JSON: decide pelo status */
  }
  if (res.status === 403 && (code === 'paid_plan' || message.includes('plano ativo'))) {
    throw new DeleteAccountError(
      'Você tem um plano ativo. Cancele a assinatura na Kiwify antes de excluir a conta.',
    );
  }
  if (res.status === 401) {
    throw new DeleteAccountError('Sessão expirada. Entre novamente.');
  }
  throw new DeleteAccountError('Não foi possível excluir a conta. Tente novamente.');
}

export async function deleteMyAccount(email: string, password: string): Promise<void> {
  // (a) Confirma a senha re-autenticando.
  const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) throw new DeleteAccountError('Senha incorreta.');

  // (b) Limpa a mídia do usuário (best-effort, sessão ainda válida).
  try {
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (uid) await removeUserMedia(uid);
  } catch {
    /* best-effort: o que sobrar fica órfão (privado, inacessível) */
  }

  // (c) Apaga a conta no servidor: o Worker valida o JWT, reconfere o plano e
  //     apaga via Auth Admin API. Em falha, lança (NÃO desloga) p/ tentar de novo.
  await callDeleteWorker();

  // (d) Sucesso: limpa caches locais, desloga e volta para a landing.
  try {
    clearQueryCache();
  } catch {
    /* ignore */
  }
  try {
    await db.media.clear();
  } catch {
    /* ignore */
  }
  await supabase.auth.signOut();
  window.location.href = '/';
}

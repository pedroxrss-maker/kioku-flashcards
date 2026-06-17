/**
 * Exclusão de conta (IRREVERSÍVEL), na ordem fixa:
 *  (a) confirma a senha com signInWithPassword (aborta se errada);
 *  (b) limpa a mídia do usuário no Storage (best-effort, com a sessão AINDA válida);
 *  (c) chama a RPC delete_my_account() (apaga auth.users + cascata + pending_plans);
 *  (d) limpa caches locais, faz signOut e volta para a landing.
 *
 * Se a RPC falhar, NÃO faz signOut: lança DeleteAccountError com mensagem pt-BR
 * para a UI exibir, deixando o usuário tentar de novo.
 */
import { supabase } from '../../lib/supabase';
import { MEDIA_BUCKET } from '../media/storage';
import { clearQueryCache } from '../../db/store';
import { db } from '../../db';

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

/** Remove toda a mídia do usuário (chunks). Best-effort: o backstop da RPC limpa
 *  qualquer linha de storage.objects que sobrar. */
async function removeUserMedia(uid: string): Promise<void> {
  const paths = await listAllFilePaths(uid);
  const CHUNK = 100;
  for (let i = 0; i < paths.length; i += CHUNK) {
    await supabase.storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + CHUNK));
  }
}

function friendlyRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('plano ativo') || m.includes('basic') || m.includes('advanced')) {
    return 'Você tem um plano ativo. Cancele a assinatura na Kiwify antes de excluir a conta.';
  }
  return 'Não foi possível excluir a conta. Tente novamente.';
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
    /* best-effort: o backstop da RPC remove as linhas restantes */
  }

  // (c) Apaga a conta no servidor.
  const { error: rpcErr } = await supabase.rpc('delete_my_account');
  if (rpcErr) {
    // NÃO desloga: deixa o usuário ler a mensagem e tentar de novo.
    throw new DeleteAccountError(friendlyRpcError(rpcErr.message ?? ''));
  }

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

import { supabase } from '../../lib/supabase';
import { useQuery } from '../../db/store';
import { useAuth } from '../auth/AuthContext';

/** Uma amizade aceita, de list_friends(). */
export interface Friend {
  friend_id: string;
  /** id da LINHA de amizade (para remove_friendship). Pode faltar se o SQL
   *  atualizado de list_friends ainda nao foi aplicado. */
  friendship_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  since: string | null;
}

export interface FriendAchievement {
  key: string;
  unlocked_at: string;
}

/** Progresso de um amigo, de get_friend_progress(). */
export interface FriendProgress {
  friend_id: string;
  display_name: string | null;
  streak: number;
  total_xp: number;
  level: number;
  total_reviews: number;
  reviews_today: number;
  achievements: FriendAchievement[];
}

export async function fetchFriends(): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('list_friends');
  if (error) throw error;
  return (data as Friend[] | null) ?? [];
}

/** Lista de amigos do usuario (cacheada; invalidate() atualiza). */
export function useFriends() {
  const { user } = useAuth();
  return useQuery<Friend[]>(`friends:${user?.id ?? 'none'}`, fetchFriends, []);
}

async function fetchFriendProgress(friendId: string): Promise<FriendProgress | null> {
  const { data, error } = await supabase.rpc('get_friend_progress', { p_friend: friendId });
  if (error) throw error;
  // get_friend_progress RETURNS TABLE -> array com 0 ou 1 linha.
  const rows = (data as FriendProgress[] | null) ?? [];
  return rows[0] ?? null;
}

/** Progresso de UM amigo, cacheado por friend_id — varios carregam em paralelo. */
export function useFriendProgress(friendId: string) {
  return useQuery<FriendProgress | null>(
    `friend-progress:${friendId}`,
    () => fetchFriendProgress(friendId),
    null,
  );
}

/** Mensagem pt-BR limpa para erros de desfazer amizade / bloquear. */
export function friendActionError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('bloquear a si mesmo')) return 'Você não pode bloquear a si mesmo.';
  if (m.includes('so e possivel bloquear') || m.includes('só é possível bloquear'))
    return 'Só é possível bloquear quem é (ou foi) seu amigo.';
  if (m.includes('not authenticated')) return 'Faça login para continuar.';
  return 'Não foi possível concluir. Tente novamente.';
}

/** Uma pessoa que EU bloqueei, de list_blocked(). */
export interface Blocked {
  blocked_id: string;
  display_name: string | null;
  /** Foto, caso list_blocked seja atualizada para retorna-la (opcional). */
  avatar_url: string | null;
  blocked_at: string;
}

export async function fetchBlocked(): Promise<Blocked[]> {
  const { data, error } = await supabase.rpc('list_blocked');
  if (error) throw error;
  return (data as Blocked[] | null) ?? [];
}

/** Lista de bloqueados do usuario. So busca quando o componente e montado, ou
 *  seja, quando a secao Bloqueados e expandida (evita query no load da pagina). */
export function useBlocked() {
  const { user } = useAuth();
  return useQuery<Blocked[]>(`blocked:${user?.id ?? 'none'}`, fetchBlocked, []);
}

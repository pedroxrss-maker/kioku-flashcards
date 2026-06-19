import { supabase } from '../../lib/supabase';
import { useQuery } from '../../db/store';
import { useAuth } from '../auth/AuthContext';

/** Uma linha pendente de list_friend_invites() (recebida ou enviada). */
export interface FriendInvite {
  id: string;
  direction: 'incoming' | 'outgoing';
  other_id: string | null;
  other_email: string | null;
  display_name: string | null;
  /** Foto de perfil da outra parte (profiles.settings->>'profilePhoto'); null
   *  para convites por e-mail (pessoa sem conta) ou sem foto definida. */
  avatar_url: string | null;
  created_at: string;
}

export async function fetchInvites(): Promise<FriendInvite[]> {
  const { data, error } = await supabase.rpc('list_friend_invites');
  if (error) throw error;
  return (data as FriendInvite[] | null) ?? [];
}

/**
 * Query compartilhada dos convites pendentes do usuario. A pagina Amigos E o
 * badge do header assinam a MESMA chave, entao ha uma unica busca e um unico
 * cache que invalidate() atualiza (aceitar/recusar, apply_pending_friend_invites).
 */
export function useFriendInvites() {
  const { user } = useAuth();
  return useQuery<FriendInvite[]>(`friend-invites:${user?.id ?? 'none'}`, fetchInvites, []);
}

/** Rotulo da outra parte: nome, senao e-mail, senao um fallback generico. */
export function inviteLabel(i: FriendInvite): string {
  return i.display_name ?? i.other_email ?? 'Alguém';
}

/** Inicial para o avatar quando nao ha foto. */
export function avatarInitial(label: string): string {
  const c = label.trim()[0];
  return c ? c.toUpperCase() : '?';
}

/** Foto de perfil (url) se houver, senao um circulo com a inicial do label.
 *  Generico: usado por convites E pela lista de amigos (mesma fonte de foto). */
export function PersonAvatar({
  url,
  label,
  size = 36,
}: {
  url: string | null;
  label: string;
  size?: number;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="shrink-0 grid place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        background: 'var(--accent-soft)',
        color: 'var(--accent)',
        fontSize: Math.round(size * 0.39),
      }}
      aria-hidden
    >
      {avatarInitial(label)}
    </span>
  );
}

/** Avatar de um convite (reusa PersonAvatar). */
export function InviteAvatar({ invite, size = 36 }: { invite: FriendInvite; size?: number }) {
  return <PersonAvatar url={invite.avatar_url} label={inviteLabel(invite)} size={size} />;
}

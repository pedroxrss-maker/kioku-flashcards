import { useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../../lib/supabase';
import { PLAN_LABELS } from '../usage/limits';
import type { Plan } from '../usage/limits';
import { deleteMyAccount, DeleteAccountError } from './deleteAccount';

const CONFIRM_WORD = 'EXCLUIR';
// Onde o usuário gerencia/cancela a PRÓPRIA assinatura na Kiwify.
const KIWIFY_URL = 'https://dashboard.kiwify.com.br/minhas-compras';

/**
 * Modal de exclusão de conta. Bloqueia quando o plano é pago (manda cancelar na
 * Kiwify, com "Atualizar" para reler o plano após o webhook). Quando o plano é
 * gratuito, exige a senha + digitar EXCLUIR antes de apagar.
 */
export function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, plan: authPlan } = useAuth();
  const [plan, setPlan] = useState<Plan>(authPlan);
  const [refreshing, setRefreshing] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmWord, setConfirmWord] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaid = plan === 'basic' || plan === 'advanced';
  const wordOk = confirmWord.trim().toUpperCase() === CONFIRM_WORD;
  const canDelete = !isPaid && password.length > 0 && wordOk && !deleting;

  function handleClose() {
    if (deleting) return; // não fecha no meio da exclusão
    setPlan(authPlan);
    setPassword('');
    setConfirmWord('');
    setError(null);
    setRefreshing(false);
    onClose();
  }

  async function refreshPlan() {
    if (!user || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle();
      const p = (data?.plan as string | null) ?? null;
      setPlan(p === 'basic' || p === 'advanced' ? p : 'free');
    } catch {
      /* ignore: mantém o plano atual */
    } finally {
      setRefreshing(false);
    }
  }

  async function onConfirm() {
    if (!user?.email || !canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount(user.email, password);
      // Em caso de sucesso, deleteMyAccount já redireciona (window.location).
    } catch (e) {
      setDeleting(false);
      setError(
        e instanceof DeleteAccountError
          ? e.message
          : 'Não foi possível excluir a conta. Tente novamente.',
      );
    }
  }

  const footer = isPaid ? (
    <>
      <button type="button" className="btn btn-sm" onClick={handleClose}>
        Fechar
      </button>
      <button type="button" className="btn btn-sm" onClick={refreshPlan} disabled={refreshing}>
        {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{' '}
        Atualizar
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-sm" onClick={handleClose} disabled={deleting}>
        Cancelar
      </button>
      <button type="button" className="btn btn-accent btn-sm" onClick={onConfirm} disabled={!canDelete}>
        {deleting && <Loader2 size={14} className="animate-spin" />} Excluir conta
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={handleClose} title="Excluir minha conta" width={460} footer={footer}>
      {/* Aviso irreversível */}
      <div
        className="flex items-start gap-2.5 p-3 rounded-[var(--r-md)] mb-4"
        style={{
          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
        }}
      >
        <AlertTriangle size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <p className="text-sm" style={{ lineHeight: 1.5 }}>
          <b>Esta ação é permanente e não pode ser desfeita.</b> Serão apagados para sempre: seus
          decks, cards, histórico de revisões, mídias (áudios e imagens) e a sua conta.
        </p>
      </div>

      {isPaid ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ lineHeight: 1.5 }}>
            Você tem um plano ativo (<b>{PLAN_LABELS[plan]}</b>). Para não continuar sendo cobrado,{' '}
            <b>cancele a assinatura na Kiwify</b> antes de excluir a conta — o Kioku não cancela
            assinaturas da Kiwify por você.
          </p>
          <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
            Depois de cancelar na Kiwify, sua conta volta para o plano gratuito automaticamente. Isso
            pode levar alguns minutos. Clique em <b>Atualizar</b> para verificar e, quando estiver
            como gratuito, a exclusão fica liberada.
          </p>
          <a
            href={KIWIFY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm inline-flex items-center gap-1.5"
            style={{ color: 'var(--accent)' }}
          >
            Gerenciar assinatura na Kiwify <ExternalLink size={13} />
          </a>
          {error && (
            <p className="text-sm" style={{ color: 'var(--accent)' }} role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className="field-label" htmlFor="del-password">
              Sua senha
            </label>
            <input
              id="del-password"
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={deleting}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="del-word">
              Digite <b>{CONFIRM_WORD}</b> para confirmar
            </label>
            <input
              id="del-word"
              className="field"
              type="text"
              autoComplete="off"
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              placeholder={CONFIRM_WORD}
              disabled={deleting}
            />
          </div>
          {error && (
            <p className="text-sm" style={{ color: 'var(--accent)' }} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

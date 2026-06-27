/**
 * Banco de provas — leitura dos menus (vestibular -> disciplina -> topico).
 * Cada hook embrulha uma das funcoes SQL qb_* (db/question-bank-queries.sql) no
 * store de query do app (useQuery), com a chave derivada dos argumentos. Quando o
 * argumento obrigatorio falta, NAO busca (chave "...:none" + resultado vazio).
 */
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../db/store';
import type { QueryResult } from '../../db/store';

export interface VestibularCount {
  vestibular: string;
  total: number;
}
export interface DisciplinaCount {
  disciplina: string;
  total: number;
}
export interface TopicoCount {
  topico: string;
  total: number;
}

/** Chama uma RPC qb_* e devolve as linhas (ou [] / lanca o erro). */
async function rpcRows<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return (data as T[] | null) ?? [];
}

const EMPTY_V: VestibularCount[] = [];
const EMPTY_D: DisciplinaCount[] = [];
const EMPTY_T: TopicoCount[] = [];

/** Vestibulares presentes + contagem de cada um. */
export function useVestibulares(): QueryResult<VestibularCount[]> {
  return useQuery<VestibularCount[]>('qb:vestibulares', () => rpcRows('qb_vestibulares'), EMPTY_V);
}

/** Disciplinas de um vestibular + contagem. Nao busca sem `vestibular`. */
export function useDisciplinas(vestibular: string | null): QueryResult<DisciplinaCount[]> {
  return useQuery<DisciplinaCount[]>(
    vestibular ? `qb:disciplinas:${vestibular}` : 'qb:disciplinas:none',
    () =>
      vestibular
        ? rpcRows<DisciplinaCount>('qb_disciplinas', { p_vestibular: vestibular })
        : Promise.resolve(EMPTY_D),
    EMPTY_D,
  );
}

/** Topicos de uma disciplina/vestibular + contagem. Nao busca sem os dois. */
export function useTopicos(
  vestibular: string | null,
  disciplina: string | null,
): QueryResult<TopicoCount[]> {
  const ready = Boolean(vestibular && disciplina);
  return useQuery<TopicoCount[]>(
    ready ? `qb:topicos:${vestibular}:${disciplina}` : 'qb:topicos:none',
    () =>
      ready
        ? rpcRows<TopicoCount>('qb_topicos', { p_vestibular: vestibular, p_disciplina: disciplina })
        : Promise.resolve(EMPTY_T),
    EMPTY_T,
  );
}

import { useEffect, useState } from 'react';
import { useDados } from '../lib/dados';
import { br } from '../lib/dates';
import { ATIVIDADES, STATUS_PROG, type Atividade, type Programacao, type StatusProg } from '../lib/types';

/**
 * Controles para alterar uma programação já lançada: atividade, andamento,
 * técnico responsável, dia e observação. Cada mudança é gravada na hora.
 */
export function ControlesProg({ prog: p }: { prog: Programacao }) {
  const d = useDados();
  const [obs, setObs] = useState(p.observacoes ?? '');
  useEffect(() => setObs(p.observacoes ?? ''), [p.observacoes]);
  const tecnicos = d.dados.tecnicos.filter((t) => t.ativo || t.id === p.tecnico_id);
  const campo = d.campoPorId.get(p.campo_id)?.num_campo ?? '';

  return (
    <div className="ctl">
      <select value={p.atividade} aria-label="Atividade" onChange={(e) => void d.atualizarProgramacao(p.id, { atividade: e.target.value as Atividade })}>
        {(Object.keys(ATIVIDADES) as Atividade[]).map((a) => <option key={a} value={a}>{ATIVIDADES[a].curto}</option>)}
      </select>
      <div className="seg" role="group" aria-label={`Andamento ${campo}`}>
        {(Object.keys(STATUS_PROG) as StatusProg[]).map((s) => (
          <button key={s} type="button" className={'seg-b ' + s + (p.status === s ? ' on' : '')} aria-pressed={p.status === s}
            onClick={() => p.status !== s && void d.atualizarProgramacao(p.id, { status: s })}>
            {STATUS_PROG[s]}
          </button>
        ))}
      </div>
      <div className="duas">
        <label>
          <span>Técnico</span>
          <select value={p.tecnico_id} aria-label={`Técnico responsável ${campo}`}
            onChange={(e) => {
              const t = d.tecnicoPorId.get(e.target.value);
              if (t) void d.atualizarProgramacao(p.id, { tecnico_id: t.id }, `Campo ${campo} passado para ${t.nome}.`);
            }}>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <label>
          <span>Dia</span>
          <input type="date" value={p.data} aria-label={`Dia ${campo}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v && v !== p.data) void d.atualizarProgramacao(p.id, { data: v }, `Campo ${campo} movido para ${br(v)}.`);
            }} />
        </label>
      </div>
      <input value={obs} placeholder="Observação para o técnico" aria-label="Observação" onChange={(e) => setObs(e.target.value)}
        onBlur={() => (obs.trim() || null) !== p.observacoes && void d.atualizarProgramacao(p.id, { observacoes: obs.trim() || null })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </div>
  );
}

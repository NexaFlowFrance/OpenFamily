import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '../ui/Button';

interface Share {
  family_member_id: string;
  share_amount: number;
}

interface BudgetShareSplitterProps {
  members: Array<{ id: string; name: string; color: string }>;
  totalAmount: number;
  value: Share[];
  onChange: (shares: Share[]) => void;
}

type Mode = 'equitable' | 'manuel';

function distributeEquitably(
  checkedIds: string[],
  totalAmount: number
): Share[] {
  const n = checkedIds.length;
  if (n === 0) return [];
  const baseShare = Math.floor((totalAmount * 100) / n) / 100;
  const lastShare = Math.round((totalAmount - (n - 1) * baseShare) * 100) / 100;
  return checkedIds.map((id, i) => ({
    family_member_id: id,
    share_amount: i === n - 1 ? lastShare : baseShare,
  }));
}

export const BudgetShareSplitter: React.FC<BudgetShareSplitterProps> = ({
  members,
  totalAmount,
  value,
  onChange,
}) => {
  const [mode, setMode] = useState<Mode>('equitable');

  // Derive checked IDs from value
  const checkedIds = useMemo(
    () => new Set(value.map((s) => s.family_member_id)),
    [value]
  );

  // Map memberId -> share_amount for manual mode
  const shareMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of value) m[s.family_member_id] = s.share_amount;
    return m;
  }, [value]);

  // When mode switches to equitable, recalculate
  useEffect(() => {
    if (mode === 'equitable' && checkedIds.size > 0) {
      onChange(distributeEquitably([...checkedIds], totalAmount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // When totalAmount changes, recalculate if in equitable mode
  useEffect(() => {
    if (mode === 'equitable' && checkedIds.size > 0) {
      onChange(distributeEquitably([...checkedIds], totalAmount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount]);

  function toggleMember(id: string, checked: boolean) {
    const newIds = new Set(checkedIds);
    if (checked) {
      newIds.add(id);
    } else {
      newIds.delete(id);
    }

    if (mode === 'equitable') {
      onChange(distributeEquitably([...newIds], totalAmount));
    } else {
      // Manuel: keep existing amounts, add with 0 or remove
      if (checked) {
        onChange([...value, { family_member_id: id, share_amount: 0 }]);
      } else {
        onChange(value.filter((s) => s.family_member_id !== id));
      }
    }
  }

  function handleSelectAll() {
    const allIds = members.map((m) => m.id);
    if (mode === 'equitable') {
      onChange(distributeEquitably(allIds, totalAmount));
    } else {
      const existing = new Map(value.map((s) => [s.family_member_id, s.share_amount]));
      onChange(
        allIds.map((id) => ({
          family_member_id: id,
          share_amount: existing.get(id) ?? 0,
        }))
      );
    }
  }

  function handleNone() {
    onChange([]);
  }

  function handleManualChange(id: string, amount: number) {
    const updated = value.map((s) =>
      s.family_member_id === id ? { ...s, share_amount: amount } : s
    );
    onChange(updated);
  }

  // Running total for manuel mode
  const runningTotal = useMemo(
    () => value.reduce((acc, s) => acc + s.share_amount, 0),
    [value]
  );

  const totalMatches =
    Math.round(runningTotal * 100) === Math.round(totalAmount * 100);

  return (
    <div className="space-y-2">
      {/* Mode toggle + quick select */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button
            variant={mode === 'equitable' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('equitable')}
            type="button"
          >
            Équitable
          </Button>
          <Button
            variant={mode === 'manuel' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('manuel')}
            type="button"
          >
            Manuel
          </Button>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={handleSelectAll} type="button">
            Tout sélectionner
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNone} type="button">
            Aucun
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700" />

      {/* Member rows */}
      <div className="space-y-1">
        {members.map((member) => {
          const isChecked = checkedIds.has(member.id);
          const share = shareMap[member.id] ?? 0;

          return (
            <div
              key={member.id}
              className="flex items-center gap-3 py-1"
            >
              <input
                type="checkbox"
                id={`share-member-${member.id}`}
                checked={isChecked}
                onChange={(e) => toggleMember(member.id, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-current cursor-pointer"
              />
              {/* Color dot */}
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: member.color }}
              />
              <label
                htmlFor={`share-member-${member.id}`}
                className="flex-1 text-sm cursor-pointer select-none"
              >
                {member.name}
              </label>
              {/* Amount display / input */}
              {isChecked ? (
                mode === 'equitable' ? (
                  <span className="text-sm font-medium tabular-nums">
                    {share.toFixed(2)} €
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={share}
                      onChange={(e) =>
                        handleManualChange(member.id, parseFloat(e.target.value) || 0)
                      }
                      className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-0.5 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-sm">€</span>
                  </div>
                )
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700" />

      {/* Total row */}
      <div className="flex justify-end items-center gap-2 text-sm">
        <span className="text-gray-500">Total :</span>
        <span
          className={`font-semibold tabular-nums ${
            checkedIds.size === 0
              ? 'text-gray-400'
              : totalMatches
              ? 'text-green-600'
              : 'text-red-500'
          }`}
        >
          {runningTotal.toFixed(2)} € / {totalAmount.toFixed(2)} €
        </span>
        {checkedIds.size > 0 && (
          <span>{totalMatches ? '✓' : '✗'}</span>
        )}
      </div>
    </div>
  );
};

export default BudgetShareSplitter;

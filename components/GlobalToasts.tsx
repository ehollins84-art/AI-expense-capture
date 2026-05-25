import React, { useEffect, useState } from 'react';
import { Toast } from './Toast';
import { haptic } from '../lib/haptics';
import {
  consumeExpenseDeleted,
  consumeReceiptSaved,
  subscribeExpenseDeleted,
  subscribeReceiptSaved,
} from '../lib/uiSignals';
import { cancelPendingDelete } from '../lib/pendingDelete';
import type { Expense } from '../lib/types';

export function GlobalToasts() {
  const [savedToast, setSavedToast] = useState(false);
  const [undo, setUndo] = useState<Expense | null>(null);

  useEffect(() => {
    const offSaved = subscribeReceiptSaved(() => {
      if (consumeReceiptSaved() !== null) setSavedToast(true);
    });
    const offDeleted = subscribeExpenseDeleted(() => {
      const expense = consumeExpenseDeleted();
      if (expense) setUndo(expense);
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, []);

  return (
    <>
      <Toast
        visible={savedToast && !undo}
        message="Receipt saved"
        onHide={() => setSavedToast(false)}
      />
      <Toast
        visible={!!undo}
        message="Receipt deleted"
        duration={4000}
        onHide={() => setUndo(null)}
        action={{
          label: 'Undo',
          onPress: () => {
            if (!undo) return;
            cancelPendingDelete(undo.id);
            haptic.success();
          },
        }}
      />
    </>
  );
}

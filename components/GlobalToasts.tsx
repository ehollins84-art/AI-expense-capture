import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Toast } from './Toast';
import { haptic } from '../lib/haptics';
import {
  consumeExpenseDeleted,
  consumeReceiptSaved,
  subscribeExpenseDeleted,
  subscribeReceiptSaved,
} from '../lib/uiSignals';
import { cancelPendingDelete } from '../lib/pendingDelete';
import { checkForUpdate, downloadAndReload } from '../lib/updates';
import type { Expense } from '../lib/types';

export function GlobalToasts() {
  const [savedToast, setSavedToast] = useState(false);
  const [undo, setUndo] = useState<Expense | null>(null);
  // Name of a waiting OTA update (e.g. "v0.1.2"), null when none / dismissed.
  const [updateName, setUpdateName] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

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

  // On app load, quietly ask Expo whether a newer OTA bundle is waiting.
  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((update) => {
      if (!cancelled && update) setUpdateName(update.versionName);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyUpdate() {
    setUpdating(true);
    downloadAndReload().catch((e) => {
      // Download failed (e.g. offline). Drop back to a dismissed state and let
      // them try again next launch.
      setUpdating(false);
      haptic.error();
      Alert.alert(
        'Update failed',
        e instanceof Error ? e.message : 'Couldn\'t download the update. Try again later.',
      );
    });
  }

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
      {/* "Update available" prompt — only when nothing else is showing. Stays a
          while, can be dismissed with ×, or applied with the Update CTA. */}
      <Toast
        visible={!!updateName && !savedToast && !undo && !updating}
        message={`New version available — ${updateName}`}
        duration={12000}
        dismissible
        onHide={() => setUpdateName(null)}
        action={{ label: 'Update', onPress: applyUpdate }}
      />
      {/* While the new bundle downloads, before the app restarts into it. */}
      <Toast
        visible={updating}
        message="Updating…"
        duration={30000}
        onHide={() => {}}
      />
    </>
  );
}

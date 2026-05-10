/**
 * Auto-start (Login Items / Registry Run) wrapper.
 *
 * - Sadece Tauri webview içinde çalışır. PWA telefonda no-op.
 * - macOS: ~/Library/LaunchAgents/com.ludenlab.bkds.plist (LaunchAgent)
 * - Windows: HKCU\Software\Microsoft\Windows\CurrentVersion\Run
 *
 * Auto-start aktifken Mac/Windows boot olunca uygulama "--auto-start" arg'ı
 * ile başlar; lib.rs bu arg'ı görüp pencereyi gizli tutar (sessiz boot).
 * Tray icon her durumda görünür → kullanıcı oradan açar.
 */

const isInTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
};

export const useAutostart = () => {
  const enabled = useState<boolean | null>('luden-autostart-enabled', () => null);
  const busy = useState<boolean>('luden-autostart-busy', () => false);
  const errorMsg = useState<string | null>('luden-autostart-error', () => null);

  const refresh = async (): Promise<void> => {
    if (!isInTauri()) return;
    try {
      const { isEnabled } = await import('@tauri-apps/plugin-autostart');
      enabled.value = await isEnabled();
    } catch (err: any) {
      errorMsg.value = err?.message || 'Otomatik başlatma durumu okunamadı';
    }
  };

  const enable = async (): Promise<boolean> => {
    if (!isInTauri()) return false;
    busy.value = true;
    errorMsg.value = null;
    try {
      const { enable: doEnable } = await import('@tauri-apps/plugin-autostart');
      await doEnable();
      enabled.value = true;
      return true;
    } catch (err: any) {
      errorMsg.value = err?.message || 'Etkinleştirilemedi';
      return false;
    } finally {
      busy.value = false;
    }
  };

  const disable = async (): Promise<boolean> => {
    if (!isInTauri()) return false;
    busy.value = true;
    errorMsg.value = null;
    try {
      const { disable: doDisable } = await import('@tauri-apps/plugin-autostart');
      await doDisable();
      enabled.value = false;
      return true;
    } catch (err: any) {
      errorMsg.value = err?.message || 'Devre dışı bırakılamadı';
      return false;
    } finally {
      busy.value = false;
    }
  };

  const toggle = async (): Promise<void> => {
    if (enabled.value) {
      await disable();
    } else {
      await enable();
    }
  };

  return {
    enabled,
    busy,
    errorMsg,
    isInTauri,
    refresh,
    enable,
    disable,
    toggle,
  };
};

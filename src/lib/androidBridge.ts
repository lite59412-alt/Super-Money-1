// Android APK / WebView / Capacitor Shell & Process-by-Process Hardware Back Bridge

type BackHandler = () => boolean;

interface CapacitorStatusBarPlugin {
  setOverlaysWebView?: (opts: { overlay: boolean }) => Promise<void> | void;
  setBackgroundColor?: (opts: { color: string }) => Promise<void> | void;
  setStyle?: (opts: { style: 'DARK' | 'LIGHT' | 'DEFAULT' }) => Promise<void> | void;
}

interface CapacitorAppPlugin {
  addListener?: (
    eventName: 'backButton',
    listenerFunc: (data: { canGoBack?: boolean }) => void
  ) => Promise<{ remove: () => void }> | { remove: () => void };
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    StatusBar?: CapacitorStatusBarPlugin;
    App?: CapacitorAppPlugin;
  };
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
    __handleAndroidBack?: () => boolean;
  }
}

const backStack: { id: number; handler: BackHandler }[] = [];
let nextHandlerId = 1;
let initialized = false;
let backTrapReady = false;
let rootToastCallback: ((msg: string) => void) | null = null;
let lastBackEventTs = 0;

function isAndroidWebViewOrNative(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isCapacitorNative = Boolean(window.Capacitor?.isNativePlatform?.());
  const isAndroid = /Android/i.test(ua);
  const isWebView =
    /; wv\)/i.test(ua) ||
    /\bVersion\/[\d.]+.*Chrome\/[\d.]+ Mobile/i.test(ua) ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  return isCapacitorNative || (isAndroid && isWebView);
}

function measureCssInsetPx(cssVarExpr: string): number {
  if (typeof document === 'undefined' || !document.body) return 0;
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.top = '0';
  probe.style.left = '-9999px';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.paddingTop = cssVarExpr;
  document.body.appendChild(probe);
  const px = parseFloat(window.getComputedStyle(probe).paddingTop || '0') || 0;
  document.body.removeChild(probe);
  return Math.round(px);
}

function applySafeAreaInsets(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const measuredTop = measureCssInsetPx('env(safe-area-inset-top, 0px)');
  const measuredBottom = measureCssInsetPx('env(safe-area-inset-bottom, 0px)');
  const nativeLike = isAndroidWebViewOrNative();
  const isAndroidMobile = /Android/i.test(navigator.userAgent || '');

  // If Android WebView/Capacitor overlaps status bar (Android 14/15 edge-to-edge)
  // yet reports 0px for env(safe-area-inset-top), enforce a clean 30px top safe gap.
  let safeTopPx = measuredTop;
  if (nativeLike && measuredTop < 20) {
    safeTopPx = 30;
  } else if (isAndroidMobile && measuredTop > 0 && measuredTop < 24) {
    safeTopPx = 24;
  }

  let safeBottomPx = measuredBottom;
  if (nativeLike && measuredBottom < 8) {
    safeBottomPx = 10;
  }

  root.style.setProperty('--app-safe-top', `${safeTopPx}px`);
  root.style.setProperty('--app-safe-bottom', `${safeBottomPx}px`);
  if (nativeLike || isAndroidMobile) {
    root.dataset.androidApp = 'true';
  }
}

export function setAndroidRootBackNotice(cb: ((msg: string) => void) | null): void {
  rootToastCallback = cb;
}

/**
 * Register a LIFO back-button handler. Return `true` if the handler consumed
 * the back action (e.g., closed a modal, stepped back a tab, exited a game).
 */
export function registerBackHandler(handler: BackHandler): () => void {
  const id = nextHandlerId++;
  backStack.push({ id, handler });
  return () => {
    const idx = backStack.findIndex((item) => item.id === id);
    if (idx !== -1) {
      backStack.splice(idx, 1);
    }
  };
}

/**
 * Trigger step-by-step back navigation. Never exits the app on Back button press.
 */
export function triggerAndroidBack(): boolean {
  const now = Date.now();
  // Prevent duplicate double-fire when both popstate and native backButton fire together
  if (now - lastBackEventTs < 140) {
    return true;
  }
  lastBackEventTs = now;

  // Walk from topmost (most recently mounted) handler downwards
  for (let i = backStack.length - 1; i >= 0; i--) {
    try {
      const handled = backStack[i].handler();
      if (handled) {
        return true;
      }
    } catch {
      // continue to next handler
    }
  }

  // Already at root Home/Login screen — keep app open; user closes via phone Home button
  rootToastCallback?.('Home screen par hain · App minimize/band karne ke liye phone ka Home button dabayein');
  return true;
}

function ensureHistoryGuard(): void {
  if (typeof window === 'undefined') return;
  try {
    const state = window.history.state as { __grGuard?: string } | null;
    if (!state || state.__grGuard !== 'active') {
      window.history.replaceState({ __grGuard: 'root' }, '', window.location.href);
      window.history.pushState({ __grGuard: 'active' }, '', window.location.href);
    }
  } catch {
    // ignore restricted history environments
  }
}

/**
 * Initializes Android status-bar separation, safe-area variables,
 * and hardware Back button trapping for WebView, Capacitor, and Cordova.
 */
export function initAndroidShell(): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  // 1. Configure Capacitor StatusBar plugin cleanly if available at runtime
  try {
    const statusBar = window.Capacitor?.Plugins?.StatusBar;
    if (statusBar) {
      void statusBar.setOverlaysWebView?.({ overlay: false });
      void statusBar.setBackgroundColor?.({ color: '#071126' });
      void statusBar.setStyle?.({ style: 'DARK' });
    }
  } catch {
    // ignore if plugin unavailable
  }

  // 2. Measure and enforce top/bottom safe-area CSS custom properties
  applySafeAreaInsets();
  window.addEventListener('resize', applySafeAreaInsets, { passive: true });
  window.addEventListener('orientationchange', () => {
    window.setTimeout(applySafeAreaInsets, 180);
  });

  // 3. Trap Android WebView / Browser hardware Back button via History Sentinel
  if (!backTrapReady) {
    backTrapReady = true;
    ensureHistoryGuard();

    window.addEventListener('popstate', () => {
      triggerAndroidBack();
      // Immediately re-arm the guard entry so pressing Back again never exits WebView
      try {
        window.history.pushState({ __grGuard: 'active' }, '', window.location.href);
      } catch {
        // ignore
      }
    });

    // 4. Capacitor App plugin hardware Back button listener
    try {
      const capApp = window.Capacitor?.Plugins?.App;
      if (capApp?.addListener) {
        void capApp.addListener('backButton', () => {
          triggerAndroidBack();
        });
      }
    } catch {
      // ignore if Capacitor App plugin is not installed
    }

    // 5. Cordova / WebView document 'backbutton' event listener
    document.addEventListener(
      'backbutton',
      (ev: Event) => {
        ev.preventDefault();
        triggerAndroidBack();
      },
      false
    );

    // 6. Global bridge hook for custom Kotlin/Java WebView MainActivity
    window.__handleAndroidBack = triggerAndroidBack;
  }
}

import { registerSW } from 'virtual:pwa-register';

export function setupPWA({ onNeedRefresh, onOfflineReady } = {}) {
  const updateSW = registerSW({
    onNeedRefresh() {
      // prompt user to update
      if (onNeedRefresh) onNeedRefresh(updateSW);
      else {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = '';
        toast.append(document.createTextNode('New version available'));
        const btn = document.createElement('button');
        btn.textContent = 'Refresh';
        btn.style.cssText = 'background:none;border:none;color:#8ab4f8;font-weight:600;cursor:pointer;margin-left:8px';
        btn.onclick = () => updateSW(true);
        toast.append(btn);
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 6000);
      }
    },
    onOfflineReady() {
      if (onOfflineReady) onOfflineReady();
      else console.log('PWA offline ready');
    },
  });
  return updateSW;
}

// Install prompt handling
let deferredPrompt = null;
export function setupInstallPrompt() {
  const btn = document.createElement('button');
  btn.id = 'installBtn';
  btn.textContent = 'Install app';
  btn.style.cssText = 'position:fixed;bottom:72px;right:16px;background:#1a73e8;color:#fff;border:none;padding:10px 16px;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;display:none;z-index:999;';
  document.body.appendChild(btn);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.style.display = 'block';
  });

  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('install', outcome);
    deferredPrompt = null;
    btn.style.display = 'none';
  });

  window.addEventListener('appinstalled', () => {
    btn.style.display = 'none';
    deferredPrompt = null;
    console.log('PWA installed');
  });

  // hide if already standalone
  if (window.matchMedia('(display-mode: standalone)').matches) {
    btn.style.display = 'none';
  }
}

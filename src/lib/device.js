export function getDeviceId(storage = localStorage) {
  const KEY = 'calendarDeviceId';
  try {
    let id = storage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      storage.setItem(KEY, id);
    }
    return id;
  } catch {
    // fallback when storage unavailable (e.g. tests)
    return 'anon-' + Math.random().toString(36).slice(2, 8);
  }
}

import en from './en.json';
import kn from './kn.json';

const languages = { en, kn };
const STORAGE_KEY = 'trr-lang';

export function getLang() {
  if (typeof window === 'undefined') return 'en';
  return localStorage.getItem(STORAGE_KEY) || 'en';
}

export function setLang(lang) {
  localStorage.setItem(STORAGE_KEY, lang);
  window.dispatchEvent(new Event('langchange'));
}

/**
 * Translate key path like 'sos.getHelp'.
 * Interpolation: t('tracking.arrivingIn', { time: '4 min' })
 */
export function t(keyPath, params = {}) {
  const lang = getLang();
  const dict = languages[lang] || languages.en;
  const keys = keyPath.split('.');
  let val = keys.reduce((o, k) => o?.[k], dict);
  if (val == null) val = keys.reduce((o, k) => o?.[k], languages.en);
  if (typeof val !== 'string') return keyPath;
  return val.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`);
}

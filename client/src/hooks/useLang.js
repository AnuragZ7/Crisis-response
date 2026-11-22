import { useState, useEffect, useCallback } from 'react';
import { getLang, setLang as persistLang } from '../i18n/index.js';

export function useLang() {
  const [lang, setLangState] = useState(getLang);

  const setLang = useCallback((code) => {
    persistLang(code);
    setLangState(code);
  }, []);

  useEffect(() => {
    const handler = () => setLangState(getLang());
    window.addEventListener('langchange', handler);
    return () => window.removeEventListener('langchange', handler);
  }, []);

  return { lang, setLang };
}

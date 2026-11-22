import React from 'react';

export default function LangToggle({ lang, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="glass rounded-xl px-2.5 py-2 shadow-md transition-all hover:shadow-lg touch-target"
      style={{
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-display)',
        fontWeight: 'var(--font-weight-semibold)',
        fontSize: 'var(--font-size-xs)',
      }}
      aria-label={`Switch language to ${lang === 'en' ? 'Kannada' : 'English'}`}
      title={`Switch to ${lang === 'en' ? 'ಕನ್ನಡ' : 'English'}`}
    >
      {lang === 'en' ? 'ಕನ್ನಡ' : 'EN'}
    </button>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { t } from '../i18n/index.js';

export default function PlaceSearch({ onSelect, visible }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setOpen(data.length > 0);
      } catch { setResults([]); }
      setLoading(false);
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!visible) return null;

  return (
    <div ref={containerRef} className="fixed top-12 left-1/2 -translate-x-1/2 w-full max-w-md px-3"
      style={{ zIndex: 'var(--z-controls)' }}>
      <div className="glass rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center px-3 gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('location.searchPlaceholder')}
            className="flex-1 py-3 bg-transparent outline-none"
            style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-base)', fontFamily: 'var(--font-body)' }}
            aria-label={t('location.searchPlaceholder')}
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
              className="p-1 touch-target" style={{ color: 'var(--color-text-tertiary)' }} aria-label="Clear search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          {loading && <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-police)', borderTopColor: 'transparent' }}/>}
        </div>
        {open && (
          <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
            {results.map((r, i) => (
              <button key={i} className="w-full text-left px-4 py-3 transition-colors hover:bg-black/5 dark:hover:bg-white/5 touch-target"
                style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', borderBottom: i < results.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}
                onClick={() => { onSelect(r.lat, r.lng, r.displayName); setQuery(r.displayName.split(',')[0]); setOpen(false); }}>
                <div className="flex items-start gap-2">
                  <span style={{ color: 'var(--color-text-tertiary)' }}>📍</span>
                  <span className="line-clamp-2">{r.displayName}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { t, getLang } from '../i18n/index.js';
import ServiceSelector from './ServiceSelector';
import { FACILITY_TYPES } from '../utils/constants';

export default function BottomSheet({ isOpen, onClose, onRequestHelp, isMobile, layerVisibility, onToggleLayer, showLayers, address, hasLocation, loading, error }) {
  const [selectedService, setSelectedService] = useState(null);
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState('serious');
  const [numberOfVictims, setNumberOfVictims] = useState(1);
  const [specialtyNeeded, setSpecialtyNeeded] = useState('general');
  const [isMultiUnit, setIsMultiUnit] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState(null);

  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError('Speech recognition not supported in this browser');
      setTimeout(() => setSpeechError(null), 3000);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      const currentLang = getLang();
      recognition.lang = currentLang === 'kn' ? 'kn-IN' : 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setNote((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = (e) => {
        setIsListening(false);
        if (e.error !== 'no-speech') {
          setSpeechError(`Voice error: ${e.error}`);
          setTimeout(() => setSpeechError(null), 3000);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechError('Could not start voice input');
      setTimeout(() => setSpeechError(null), 3000);
    }
  };

  const handleClose = () => {
    setSelectedService(null);
    setNote('');
    setSeverity('serious');
    setNumberOfVictims(1);
    setSpecialtyNeeded('general');
    setIsMultiUnit(false);
    setIsListening(false);
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedService || !hasLocation) return;
    onRequestHelp(selectedService, note, {
      severity,
      numberOfVictims: Number(numberOfVictims) || 1,
      specialtyNeeded,
      isMultiUnit,
    });
  };

  const content = (
    <>
      {isMobile && (
        <div className="flex justify-center pt-3 pb-2" aria-hidden="true">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
        </div>
      )}

      <div className="flex items-center justify-between px-5 py-3">
        <h2 className="font-display font-bold" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)' }}>
          {t('sos.chooseService')}
        </h2>
        <button onClick={handleClose} className="p-2 rounded-xl touch-target" style={{ color: 'var(--color-text-secondary)' }} aria-label={t('common.close')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Address display */}
      {address && (
        <div className="px-5 pb-3">
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--color-surface-elevated)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            <span>📍</span>
            <span className="line-clamp-2">{address}</span>
          </div>
        </div>
      )}

      {!hasLocation && (
        <div className="px-5 pb-3">
          <div className="p-3 rounded-xl text-center" style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)', fontSize: 'var(--font-size-sm)' }}>
            ⚠️ {t('sos.needLocation')}
          </div>
        </div>
      )}

      <div className="px-5 pb-4">
        <ServiceSelector selected={selectedService} onSelect={setSelectedService} />
      </div>

      {/* Medical-specific triage options */}
      {selectedService === 'medical' && (
        <div className="px-5 pb-4 space-y-3">
          <div>
            <label className="block mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
              Severity / Triage Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'critical', label: 'Critical (ICU)', color: '#DC2626' },
                { id: 'serious', label: 'Serious', color: '#EA580C' },
                { id: 'minor', label: 'Minor', color: '#16A34A' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeverity(s.id)}
                  className={`py-2 px-1 text-xs rounded-xl font-medium border transition-all ${
                    severity === s.id
                      ? 'border-transparent text-white shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-white/5'
                  }`}
                  style={{ background: severity === s.id ? s.color : undefined }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                Specialty Needed
              </label>
              <select
                value={specialtyNeeded}
                onChange={(e) => setSpecialtyNeeded(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="general">General Emergency</option>
                <option value="trauma">Trauma Center</option>
                <option value="cardiac">Cardiac Unit</option>
                <option value="burns">Burn Unit</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                Victims Count
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={numberOfVictims}
                onChange={(e) => setNumberOfVictims(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* Fire multi-unit disaster incident toggle */}
      {selectedService === 'fire' && (
        <div className="px-5 pb-4">
          <label className="flex items-start gap-3 p-3 rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/20 cursor-pointer">
            <input
              type="checkbox"
              checked={isMultiUnit}
              onChange={(e) => setIsMultiUnit(e.target.checked)}
              className="mt-0.5 rounded accent-orange-600 w-4 h-4"
            />
            <div className="text-xs">
              <span className="font-bold text-orange-900 dark:text-orange-200 block">
                🚨 Major Disaster (Multi-Unit Response)
              </span>
              <span className="text-gray-600 dark:text-gray-400 block mt-0.5">
                Simultaneously dispatch 2 Fire Engines + 1 Ambulance + 1 Police Patrol as a coordinated strike team.
              </span>
            </div>
          </label>
        </div>
      )}

      <div className="px-5 pb-4">
        <div className="relative">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('sos.notePlaceholder')}
            className="w-full p-3 pr-12 rounded-xl resize-none"
            rows={2}
            maxLength={200}
            style={{
              background: 'var(--color-surface-elevated)',
              border: isListening ? '1.5px solid #EF4444' : '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-base)',
              fontFamily: 'var(--font-body)',
            }}
            aria-label={t('sos.notePlaceholder')}
          />
          {/* Web Speech API Microphone Button */}
          <button
            type="button"
            onClick={toggleVoiceInput}
            title={isListening ? 'Stop listening' : 'Speak description (English / Kannada)'}
            className={`absolute right-2.5 bottom-3 p-2 rounded-xl touch-target transition-all flex items-center justify-center ${
              isListening
                ? 'bg-red-600 text-white animate-pulse shadow-md ring-2 ring-red-400'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            aria-label="Voice input"
          >
            <span className="text-base">{isListening ? '🎙️' : '🎤'}</span>
          </button>
        </div>
        {isListening && (
          <div className="text-[11px] text-red-600 dark:text-red-400 font-semibold mt-1 flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
            <span>Listening ({getLang() === 'kn' ? 'Kannada' : 'English'})... Speak now</span>
          </div>
        )}
        {speechError && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1">
            ⚠️ {speechError}
          </div>
        )}
      </div>

      {error && (
        <div className="px-5 pb-3">
          <div className="p-2 rounded-lg text-center" style={{ background: 'var(--color-medical-soft)', color: 'var(--color-medical)', fontSize: 'var(--font-size-xs)' }}>
            {error}
          </div>
        </div>
      )}

      <div className="px-5 pb-4">
        <motion.button onClick={handleSubmit} disabled={!selectedService || !hasLocation || loading}
          className="w-full py-4 rounded-2xl font-display font-bold text-white touch-target"
          style={{ background: selectedService && hasLocation ? 'var(--color-emergency)' : 'var(--color-border)', fontSize: 'var(--font-size-md)', opacity: selectedService && hasLocation ? 1 : 0.5, boxShadow: selectedService && hasLocation ? 'var(--shadow-sos)' : 'none' }}
          whileHover={selectedService && hasLocation ? { scale: 1.02 } : {}} whileTap={selectedService && hasLocation ? { scale: 0.98 } : {}}
          aria-disabled={!selectedService || !hasLocation || loading}>
          {loading ? t('sos.requesting') : t('sos.requestHelp')}
        </motion.button>
      </div>

      {showLayers && (
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(FACILITY_TYPES).map(([type, info]) => (
              <button key={type} onClick={() => onToggleLayer(type)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs touch-target"
                style={{ background: layerVisibility[type] ? info.color : 'var(--color-surface-elevated)', color: layerVisibility[type] ? '#fff' : 'var(--color-text-secondary)', border: `1px solid ${layerVisibility[type] ? info.color : 'var(--color-border)'}`, fontFamily: 'var(--font-display)', fontWeight: 500 }}
                role="switch" aria-checked={layerVisibility[type]}>
                {info.emoji} {info.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 pb-5 text-center">
        <a href="tel:112" className="inline-flex items-center gap-2 px-4 py-2 rounded-full touch-target no-underline"
          style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', border: '1px solid var(--color-border)' }}>
          📞 {t('app.call112')}
        </a>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div className="fixed inset-0" style={{ zIndex: 'var(--z-sheet)', background: 'var(--color-scrim)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleClose} aria-hidden="true" />
            <motion.div className="fixed bottom-0 left-0 right-0 rounded-t-3xl"
              style={{ zIndex: 'var(--z-sheet)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-xl)', maxHeight: '85dvh', overflowY: 'auto' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              role="dialog" aria-modal="true">{content}</motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div className="fixed inset-0" style={{ zIndex: 'var(--z-sheet)', background: 'var(--color-scrim)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleClose} aria-hidden="true" />
          <motion.div className="fixed right-4 bottom-4 rounded-3xl glass-strong"
            style={{ zIndex: 'var(--z-sheet)', width: '380px', maxHeight: '85dvh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}
            initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog" aria-modal="true">{content}</motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

import React from 'react';
import { t } from '../i18n/index.js';
import { formatDistance } from '../utils/helpers';

const typeConfig = {
  medical: { icon: '🚑', label: 'tracking.ambulance', color: 'var(--color-medical)', bg: 'var(--color-medical-soft)' },
  fire: { icon: '🚒', label: 'tracking.fireEngine', color: 'var(--color-fire)', bg: 'var(--color-fire-soft)' },
  police: { icon: '🚔', label: 'tracking.patrol', color: 'var(--color-police)', bg: 'var(--color-police-soft)' },
};

export default function UnitCard({ type, unitId, facilityName, distanceMeters }) {
  const cfg = typeConfig[type] || typeConfig.medical;

  return (
    <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: cfg.bg, border: `1px solid ${cfg.color}20` }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.color + '20', fontSize: '24px' }}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold" style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>
          {t(cfg.label)} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-weight-normal)' }}>#{unitId}</span>
        </div>
        {facilityName && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {t('tracking.fromFacility', { facility: facilityName })}
          </div>
        )}
        {distanceMeters != null && (
          <div className="font-display font-medium mt-0.5" style={{ fontSize: 'var(--font-size-sm)', color: cfg.color }}>
            {t('tracking.distanceAway', { distance: formatDistance(distanceMeters) })}
          </div>
        )}
      </div>
    </div>
  );
}

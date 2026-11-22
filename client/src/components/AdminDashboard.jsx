import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminDashboard({ onClose }) {
  const [activeTab, setActiveTab] = useState('requests'); // requests | fleet | capacity | hazards | analytics
  const [data, setData] = useState({
    requests: [],
    units: [],
    facilities: [],
    shelters: [],
    dangerZones: [],
    blockages: [],
  });
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [overrideUnitId, setOverrideUnitId] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Fetch overview data
  const fetchData = useCallback(async () => {
    try {
      const [ovRes, anRes] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/analytics'),
      ]);
      if (ovRes.ok) {
        const ovData = await ovRes.json();
        setData(ovData);
      }
      if (anRes.ok) {
        const anData = await anRes.json();
        setAnalytics(anData);
      }
    } catch (e) {
      console.error('Failed to load admin data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const showToast = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Manual Dispatch Override
  const handleOverrideDispatch = async (requestId) => {
    if (!overrideUnitId) return;
    try {
      const res = await fetch('/api/admin/override-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, unitId: overrideUnitId }),
      });
      if (res.ok) {
        showToast('Unit successfully reassigned!');
        fetchData();
      } else {
        const err = await res.json();
        showToast(`Failed: ${err.error || 'Error'}`);
      }
    } catch {
      showToast('Dispatch override error');
    }
  };

  // Update Hospital Beds
  const handleUpdateHospital = async (facId, patchData) => {
    try {
      const res = await fetch(`/api/admin/facilities/${facId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchData),
      });
      if (res.ok) {
        showToast('Hospital capacity updated live');
        fetchData();
      }
    } catch {
      showToast('Failed to update hospital');
    }
  };

  // Update Shelter Occupancy
  const handleUpdateShelter = async (shId, patchData) => {
    try {
      const res = await fetch(`/api/admin/shelters/${shId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchData),
      });
      if (res.ok) {
        showToast('Shelter occupancy updated live');
        fetchData();
      }
    } catch {
      showToast('Failed to update shelter');
    }
  };

  // Remove blockage or danger zone
  const handleRemoveBlockage = async (id) => {
    await fetch(`/api/blockages/${id}`, { method: 'DELETE' });
    showToast('Blockage removed');
    fetchData();
  };

  const handleRemoveDangerZone = async (id) => {
    await fetch(`/api/danger-zones/${id}`, { method: 'DELETE' });
    showToast('Danger zone removed');
    fetchData();
  };

  // Filtered requests
  const filteredRequests = (data.requests || []).filter((r) => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-[650] flex flex-col bg-slate-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden font-sans">
      {/* Top Navbar */}
      <header className="px-6 py-3.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            ⚡
          </div>
          <div>
            <h1 className="font-display font-bold text-base tracking-tight flex items-center gap-2">
              <span>Tumakuru Command Dashboard</span>
              <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30">
                Live Open Access
              </span>
            </h1>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Emergency Services Coordination & Live Dispatch Controller
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-semibold">
            {[
              { id: 'requests', label: 'Requests', count: data.requests?.length },
              { id: 'fleet', label: 'Fleet & Units', count: data.units?.length },
              { id: 'capacity', label: 'Hospitals & Shelters', count: data.facilities?.length },
              { id: 'hazards', label: 'Hazards', count: (data.blockages?.length || 0) + (data.dangerZones?.length || 0) },
              { id: 'analytics', label: 'Analytics' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-xs font-bold'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-bold transition-all ml-2"
          >
            Exit Dashboard
          </button>
        </div>
      </header>

      {/* Toast Feedback */}
      <AnimatePresence>
        {feedbackMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[700] px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold shadow-xl border border-gray-700 flex items-center gap-2"
          >
            <span>ℹ️</span> {feedbackMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* TAB 1: REQUESTS */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Service:</span>
                {['all', 'medical', 'fire', 'police'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterType(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize border ${
                      filterType === st
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                        : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {st}
                  </button>
                ))}

                <span className="text-xs font-bold text-gray-500 ml-3">Status:</span>
                {['all', 'assigned', 'en_route', 'queued', 'completed'].map((ss) => (
                  <button
                    key={ss}
                    onClick={() => setFilterStatus(ss)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize border ${
                      filterStatus === ss
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {ss.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <span className="text-xs text-gray-500 font-medium">
                Showing {filteredRequests.length} incident records
              </span>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-800">
                    <th className="p-3">Incident / Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Address / Details</th>
                    <th className="p-3">Assigned Unit</th>
                    <th className="p-3">ETA & Dist</th>
                    <th className="p-3">Timeline & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredRequests.map((req) => {
                    const isSelected = selectedRequest?._id === req._id;
                    const assignedUnit = data.units.find((u) => u._id === req.assignedUnitId);
                    return (
                      <React.Fragment key={req._id}>
                        <tr
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${
                            isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">
                                {req.type === 'medical' ? '🚑' : req.type === 'fire' ? '🚒' : '🚓'}
                              </span>
                              <div>
                                <span className="font-bold text-gray-900 dark:text-gray-100 uppercase">
                                  {req.type} {req.isMultiUnit && '(MULTI-UNIT)'}
                                </span>
                                {req.severity && (
                                  <span
                                    className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      req.severity === 'critical'
                                        ? 'bg-red-500/20 text-red-600'
                                        : 'bg-orange-500/20 text-orange-600'
                                    }`}
                                  >
                                    {req.severity}
                                  </span>
                                )}
                                <div className="text-[10px] text-gray-500 font-mono">
                                  ID: {req._id.slice(-6)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                req.status === 'assigned'
                                  ? 'bg-blue-500/20 text-blue-600'
                                  : req.status === 'en_route'
                                  ? 'bg-amber-500/20 text-amber-600 animate-pulse'
                                  : req.status === 'arrived' || req.status === 'completed'
                                  ? 'bg-emerald-500/20 text-emerald-600'
                                  : 'bg-gray-500/20 text-gray-600'
                              }`}
                            >
                              {req.status}
                            </span>
                          </td>
                          <td className="p-3 max-w-xs truncate">
                            <div className="text-gray-800 dark:text-gray-200 font-medium">
                              {req.address || 'GPS Coordinates pinned'}
                            </div>
                            {req.note && (
                              <div className="text-[11px] text-gray-500 italic truncate">
                                "{req.note}"
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            {assignedUnit ? (
                              <div className="font-mono font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1">
                                <span>{assignedUnit.unitId}</span>
                                <span className="text-[10px] text-gray-500 font-normal">
                                  ({assignedUnit.status})
                                </span>
                              </div>
                            ) : req.assignedUnits?.length > 0 ? (
                              <span className="font-semibold text-orange-600">
                                {req.assignedUnits.map((u) => u.unitCode).join(', ')}
                              </span>
                            ) : (
                              <span className="text-gray-400">None (Queued)</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-gray-800 dark:text-gray-200">
                              {req.etaSeconds ? `${Math.round(req.etaSeconds / 60)} min` : '—'}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {req.distanceMeters ? `${(req.distanceMeters / 1000).toFixed(1)} km` : '—'}
                            </div>
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => setSelectedRequest(isSelected ? null : req)}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              {isSelected ? 'Hide Timeline' : 'View Timeline'}
                            </button>
                          </td>
                        </tr>

                        {/* Collapsible Incident Timeline & Manual Override */}
                        {isSelected && (
                          <tr className="bg-gray-50/70 dark:bg-gray-800/30">
                            <td colSpan="6" className="p-4 space-y-3">
                              <div className="flex items-start justify-between gap-4">
                                {/* Timeline Stepper */}
                                <div className="flex-1 space-y-2">
                                  <h4 className="font-bold text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                    Incident Timeline
                                  </h4>
                                  <div className="space-y-1.5 border-l-2 border-blue-400 pl-3">
                                    {req.timeline?.map((item, idx) => (
                                      <div key={idx} className="text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-blue-600 dark:text-blue-400 uppercase text-[10px]">
                                            {item.status}
                                          </span>
                                          <span className="text-[10px] text-gray-400">
                                            {new Date(item.timestamp).toLocaleTimeString()}
                                          </span>
                                        </div>
                                        {item.note && (
                                          <p className="text-gray-600 dark:text-gray-300 text-[11px]">
                                            {item.note}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Manual Dispatch Override Controller */}
                                <div className="w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 shadow-xs space-y-2">
                                  <h5 className="font-bold text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                    <span>⚙️</span> Manual Dispatch Override
                                  </h5>
                                  <p className="text-[10px] text-gray-500">
                                    Reassign an available or en-route unit directly to this incident.
                                  </p>
                                  <div className="flex gap-2">
                                    <select
                                      value={overrideUnitId}
                                      onChange={(e) => setOverrideUnitId(e.target.value)}
                                      className="flex-1 p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    >
                                      <option value="">Select Unit...</option>
                                      {data.units.map((u) => (
                                        <option key={u._id} value={u._id}>
                                          {u.unitId} ({u.type} - {u.status})
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => handleOverrideDispatch(req._id)}
                                      disabled={!overrideUnitId}
                                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs"
                                    >
                                      Reassign
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: FLEET & UNITS */}
        {activeTab === 'fleet' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.units.map((u) => (
              <div
                key={u._id}
                className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {u.type === 'ambulance' ? '🚑' : u.type === 'fire_engine' ? '🚒' : '🚓'}
                    </span>
                    <div>
                      <h4 className="font-mono font-bold text-sm text-gray-900 dark:text-gray-100">
                        {u.unitId}
                      </h4>
                      <span className="text-[10px] text-gray-500 uppercase">{u.type}</span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      u.status === 'available'
                        ? 'bg-emerald-500/20 text-emerald-600'
                        : 'bg-amber-500/20 text-amber-600'
                    }`}
                  >
                    {u.status}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Home Facility:</span>
                    <span className="font-medium truncate max-w-[160px]">
                      {u.homeFacilityId?.name || 'Tumakuru Depot'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Position Coordinates:</span>
                    <span className="font-mono text-[11px]">
                      {u.position?.coordinates ? `${u.position.coordinates[1].toFixed(4)}, ${u.position.coordinates[0].toFixed(4)}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Current Request:</span>
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                      {u.currentRequestId ? u.currentRequestId.slice(-6) : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: CAPACITY (HOSPITALS & SHELTERS EDITABLE) */}
        {activeTab === 'capacity' && (
          <div className="space-y-6">
            {/* Hospitals Editable Table */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <span>🏥</span> Tumakuru Major Hospitals (Live Beds & Capacity)
                  </h3>
                  <span className="text-xs text-gray-500">
                    Directly edit bed availability and staff counts below. Real-time atomic sync.
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-800">
                      <th className="p-3">Hospital Name</th>
                      <th className="p-3">ICU Beds (Avail / Total)</th>
                      <th className="p-3">General Beds</th>
                      <th className="p-3">Ventilators</th>
                      <th className="p-3">Ambulances</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.facilities
                      .filter((f) => f.type === 'hospital')
                      .map((hosp) => (
                        <tr key={hosp._id}>
                          <td className="p-3">
                            <span className="font-bold text-gray-900 dark:text-gray-100">
                              {hosp.name}
                            </span>
                            <div className="text-[10px] text-gray-500">{hosp.address}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                max={hosp.icuBedsTotal || 50}
                                defaultValue={hosp.icuBedsAvailable || 0}
                                id={`icu-${hosp._id}`}
                                className="w-16 p-1 rounded-lg border border-gray-300 dark:border-gray-700 text-xs text-center font-bold font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              />
                              <span className="text-gray-400">/ {hosp.icuBedsTotal || 0}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="0"
                              max={hosp.generalBedsTotal || 500}
                              defaultValue={hosp.generalBedsAvailable || 0}
                              id={`gen-${hosp._id}`}
                              className="w-16 p-1 rounded-lg border border-gray-300 dark:border-gray-700 text-xs text-center font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                            <span className="text-gray-400 ml-1">/ {hosp.generalBedsTotal || 0}</span>
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="0"
                              defaultValue={hosp.ventilators || 0}
                              id={`ven-${hosp._id}`}
                              className="w-14 p-1 rounded-lg border border-gray-300 dark:border-gray-700 text-xs text-center font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="0"
                              defaultValue={hosp.ambulancesAvailable || 0}
                              id={`amb-${hosp._id}`}
                              className="w-14 p-1 rounded-lg border border-gray-300 dark:border-gray-700 text-xs text-center font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => {
                                const icu = document.getElementById(`icu-${hosp._id}`).value;
                                const gen = document.getElementById(`gen-${hosp._id}`).value;
                                const ven = document.getElementById(`ven-${hosp._id}`).value;
                                const amb = document.getElementById(`amb-${hosp._id}`).value;
                                handleUpdateHospital(hosp._id, {
                                  icuBedsAvailable: icu,
                                  generalBedsAvailable: gen,
                                  ventilators: ven,
                                  ambulancesAvailable: amb,
                                });
                              }}
                              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shelters Editable Table */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div>
                <h3 className="font-display font-bold text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <span>⛺</span> Disaster Shelters & Relief Camps
                </h3>
                <span className="text-xs text-gray-500">
                  Update occupancy counts and available refugee capacity.
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-800">
                      <th className="p-3">Shelter Name</th>
                      <th className="p-3">Occupancy / Capacity</th>
                      <th className="p-3">Free Space</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.shelters.map((sh) => (
                      <tr key={sh._id}>
                        <td className="p-3">
                          <span className="font-bold text-gray-900 dark:text-gray-100">{sh.name}</span>
                          <div className="text-[10px] text-gray-500">{sh.address}</div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              defaultValue={sh.occupancy || 0}
                              id={`occ-${sh._id}`}
                              className="w-20 p-1 rounded-lg border border-gray-300 dark:border-gray-700 text-xs text-center font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                            <span className="text-gray-400">/ {sh.capacity}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {Math.max(0, (sh.capacity || 0) - (sh.occupancy || 0))} spots available
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              const occ = document.getElementById(`occ-${sh._id}`).value;
                              handleUpdateShelter(sh._id, { occupancy: occ });
                            }}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                          >
                            Update
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: HAZARDS & DANGER ZONES */}
        {activeTab === 'hazards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Road Blockages */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-red-600 flex items-center gap-2">
                  <span>🚧</span> Active Road Hazards & Blockages ({data.blockages?.length || 0})
                </h3>
              </div>
              <div className="space-y-2">
                {(!data.blockages || data.blockages.length === 0) && (
                  <p className="text-xs text-gray-500 py-4 text-center">No active road blockages.</p>
                )}
                {data.blockages?.map((b) => (
                  <div
                    key={b._id}
                    className="p-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-red-700 dark:text-red-300 capitalize">
                        {b.type.replace('_', ' ')}
                      </span>
                      <span className="text-gray-500 ml-2">Radius: {b.radius}m</span>
                      {b.note && <div className="text-[11px] text-gray-600 dark:text-gray-400">"{b.note}"</div>}
                    </div>
                    <button
                      onClick={() => handleRemoveBlockage(b._id)}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold text-[11px] hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger Zones */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-orange-600 flex items-center gap-2">
                  <span>⚠️</span> Declared Danger Zones ({data.dangerZones?.length || 0})
                </h3>
              </div>
              <div className="space-y-2">
                {(!data.dangerZones || data.dangerZones.length === 0) && (
                  <p className="text-xs text-gray-500 py-4 text-center">No active danger zones.</p>
                )}
                {data.dangerZones?.map((dz) => (
                  <div
                    key={dz._id}
                    className="p-3 rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/20 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-orange-800 dark:text-orange-200">
                        {dz.name || dz.type}
                      </span>
                      <div className="text-[10px] text-gray-500 capitalize">
                        Threat: {dz.severity} • Type: {dz.type}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveDangerZone(dz._id)}
                      className="px-2.5 py-1 rounded-lg bg-orange-600 text-white font-semibold text-[11px] hover:bg-orange-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ANALYTICS */}
        {activeTab === 'analytics' && analytics && (
          <div className="space-y-6">
            {/* Key Metric KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  Avg Response Time
                </span>
                <span className="font-display font-bold text-2xl text-blue-600 dark:text-blue-400 mt-1 block">
                  {Math.round(analytics.avgResponseTimeSeconds / 60)}m {analytics.avgResponseTimeSeconds % 60}s
                </span>
                <span className="text-[10px] text-gray-400">Time to dispatch & assign</span>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  p95 Response Time
                </span>
                <span className="font-display font-bold text-2xl text-purple-600 dark:text-purple-400 mt-1 block">
                  {Math.round(analytics.p95ResponseTimeSeconds / 60)}m {analytics.p95ResponseTimeSeconds % 60}s
                </span>
                <span className="text-[10px] text-gray-400">95% requests served under</span>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  Fleet Utilization
                </span>
                <span className="font-display font-bold text-2xl text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {analytics.unitUtilization?.ratePercent}%
                </span>
                <span className="text-[10px] text-gray-400">
                  {analytics.unitUtilization?.busy} busy of {analytics.unitUtilization?.total} units
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  Total Incidents Logged
                </span>
                <span className="font-display font-bold text-2xl text-gray-900 dark:text-gray-100 mt-1 block">
                  {data.requests?.length || 0}
                </span>
                <span className="text-[10px] text-gray-400">Tumakuru coverage bounds</span>
              </div>
            </div>

            {/* A* vs Dijkstra Benchmark Comparison */}
            <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs space-y-3">
              <h3 className="font-display font-bold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>⚡</span> Live Routing Algorithm Benchmark: A* (Heuristic) vs Dijkstra (Exhaustive)
              </h3>
              <p className="text-xs text-gray-500">
                Benchmarks run across multiple origin-destination pairs on the Tumakuru Road Graph.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-blue-700 dark:text-blue-300 text-sm">
                      A* Search (Haversine Heuristic)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500 text-white">
                      Recommended
                    </span>
                  </div>
                  <div className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
                    <div className="flex justify-between">
                      <span>Average Nodes Explored:</span>
                      <strong className="font-mono text-blue-600 dark:text-blue-400">
                        {analytics.algoComparison?.astar?.avgNodesExplored} nodes
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Computation Time:</span>
                      <strong className="font-mono text-blue-600 dark:text-blue-400">
                        {analytics.algoComparison?.astar?.avgTimeMs} ms
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-700 dark:text-gray-300 text-sm">
                      Dijkstra's Algorithm (Standard)
                    </span>
                    <span className="text-[10px] text-gray-500">Exhaustive Explorer</span>
                  </div>
                  <div className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
                    <div className="flex justify-between">
                      <span>Average Nodes Explored:</span>
                      <strong className="font-mono">
                        {analytics.algoComparison?.dijkstra?.avgNodesExplored} nodes
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Computation Time:</span>
                      <strong className="font-mono">
                        {analytics.algoComparison?.dijkstra?.avgTimeMs} ms
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Incidents by Service Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs space-y-3">
                <h4 className="font-display font-bold text-sm text-gray-900 dark:text-gray-100">
                  Requests by Emergency Type
                </h4>
                <div className="space-y-3 pt-2">
                  {[
                    { type: 'Medical (Ambulance)', count: analytics.requestsByType?.medical || 0, color: 'bg-red-500' },
                    { type: 'Fire & Rescue', count: analytics.requestsByType?.fire || 0, color: 'bg-orange-500' },
                    { type: 'Police Patrol', count: analytics.requestsByType?.police || 0, color: 'bg-blue-500' },
                  ].map((item) => {
                    const total = data.requests?.length || 1;
                    const pct = Math.round((item.count / total) * 100);
                    return (
                      <div key={item.type} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>{item.type}</span>
                          <span className="text-gray-500">{item.count} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                          <div className={`h-full ${item.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Incidents by Hour */}
              <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs space-y-3">
                <h4 className="font-display font-bold text-sm text-gray-900 dark:text-gray-100">
                  Incidents by Hour of Day (00:00 - 23:00)
                </h4>
                <div className="flex items-end gap-1 h-32 pt-4">
                  {analytics.requestsByHour?.map((cnt, hr) => {
                    const maxVal = Math.max(1, ...analytics.requestsByHour);
                    const heightPct = Math.max(8, (cnt / maxVal) * 100);
                    return (
                      <div key={hr} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                        <div
                          className="w-full bg-blue-500/80 hover:bg-blue-600 rounded-t-xs transition-all"
                          style={{ height: `${heightPct}%` }}
                        />
                        {hr % 4 === 0 && (
                          <span className="text-[8px] text-gray-400 font-mono">
                            {hr}h
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

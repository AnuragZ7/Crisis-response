import mongoose from 'mongoose';

const facilitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['hospital', 'fire_station', 'police'], required: true },
  position: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  address: String,
  phone: String,
  source: { type: String, default: 'OSM' },
  osmId: String,
  // Hospital capacity & resources (Demo labeled)
  icuBedsTotal: { type: Number, default: 0 },
  icuBedsAvailable: { type: Number, default: 0 },
  generalBedsTotal: { type: Number, default: 0 },
  generalBedsAvailable: { type: Number, default: 0 },
  ventilators: { type: Number, default: 0 },
  ambulancesTotal: { type: Number, default: 0 },
  ambulancesAvailable: { type: Number, default: 0 },
  hasTraumaCenter: { type: Boolean, default: false },
  hasBloodBank: { type: Boolean, default: false },
  hasBurnUnit: { type: Boolean, default: false },
  hasCardiacUnit: { type: Boolean, default: false },
  specialties: { type: [String], default: [] },
  isDemo: { type: Boolean, default: false },
});

facilitySchema.index({ position: '2dsphere' });
facilitySchema.index({ type: 1 });

export default mongoose.model('Facility', facilitySchema);

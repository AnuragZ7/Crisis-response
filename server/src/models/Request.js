import mongoose from 'mongoose';

const timelineSchema = new mongoose.Schema({
  status: String,
  timestamp: { type: Date, default: Date.now },
  note: String,
}, { _id: false });

const requestSchema = new mongoose.Schema({
  type: { type: String, enum: ['medical', 'fire', 'police'], required: true },
  note: { type: String, maxlength: 200 },
  severity: { type: String, enum: ['critical', 'serious', 'minor'], default: 'serious' },
  numberOfVictims: { type: Number, default: 1 },
  specialtyNeeded: { type: String, enum: ['trauma', 'cardiac', 'burns', 'general'], default: 'general' },
  destinationHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility' },
  bedReserved: { type: String, enum: ['icu', 'general', null], default: null },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  address: String,
  status: {
    type: String,
    enum: ['queued', 'assigned', 'en_route', 'arriving', 'arrived', 'completed', 'cancelled', 'unreachable'],
    default: 'queued',
  },
  blockageReportsCount: { type: Number, default: 0 },
  lastBlockageReportAt: { type: Date },
  assignedUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  isMultiUnit: { type: Boolean, default: false },
  assignedUnits: [{
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
    type: { type: String },
    unitCode: { type: String },
    status: { type: String, default: 'assigned' },
  }],
  route: {
    type: { type: String, enum: ['LineString'] },
    coordinates: { type: [[Number]], default: undefined }
  },
  etaSeconds: Number,
  distanceMeters: Number,
  trackingToken: { type: String, required: true, index: true },
  queuePosition: Number,
  timeline: { type: [timelineSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

requestSchema.index({ status: 1, type: 1 });
requestSchema.index({ createdAt: 1 });

export default mongoose.model('Request', requestSchema);

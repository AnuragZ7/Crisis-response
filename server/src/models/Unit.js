import mongoose from 'mongoose';

const unitSchema = new mongoose.Schema({
  type: { type: String, enum: ['ambulance', 'fire_engine', 'patrol'], required: true },
  unitId: { type: String, required: true, unique: true },
  homeFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true },
  status: {
    type: String,
    enum: ['available', 'assigned', 'en_route', 'on_scene', 'returning'],
    default: 'available',
  },
  position: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  heading: { type: Number, default: 0 },
  currentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
  routeProgress: { type: Number, default: 0 },
  routeCoordinates: { type: [[Number]], default: [] },
  returnRouteCoordinates: { type: [[Number]], default: [] },
  speed: { type: Number, default: 40 },
});

unitSchema.index({ position: '2dsphere' });
unitSchema.index({ type: 1, status: 1 });

export default mongoose.model('Unit', unitSchema);

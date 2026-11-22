import mongoose from 'mongoose';

const shelterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: String,
  phone: String,
  position: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  capacity: { type: Number, required: true, default: 300 },
  occupancy: { type: Number, default: 0 },
  amenities: { type: [String], default: ['food', 'clean_water', 'medical_first_aid', 'bedding'] },
  isDemo: { type: Boolean, default: true },
  demoLabel: { type: String, default: 'Demo shelter data' },
});

shelterSchema.index({ position: '2dsphere' });

export default mongoose.model('Shelter', shelterSchema);

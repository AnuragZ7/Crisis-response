import mongoose from 'mongoose';

const dangerZoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['flood', 'fire', 'accident', 'earthquake'],
    default: 'flood',
  },
  severity: {
    type: String,
    enum: ['extreme', 'high', 'moderate'],
    default: 'high',
  },
  polygon: {
    type: { type: String, enum: ['Polygon'], default: 'Polygon' },
    coordinates: { type: [[[Number]]], required: true }, // GeoJSON Polygon: array of linear rings [[lng, lat]]
  },
  createdAt: { type: Date, default: Date.now },
});

dangerZoneSchema.index({ polygon: '2dsphere' });

export default mongoose.model('DangerZone', dangerZoneSchema);

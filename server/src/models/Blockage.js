import mongoose from 'mongoose';

const blockageSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['flood', 'landslide', 'accident', 'collapsed_bridge', 'fire', 'fallen_tree', 'construction', 'other'],
    default: 'accident',
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  radius: { type: Number, default: 50 }, // meters
  note: { type: String, default: '' },
  source: {
    type: String,
    enum: ['admin', 'disaster', 'citizen'],
    default: 'admin',
  },
  verified: { type: Boolean, default: true },
  isHard: { type: Boolean, default: false },
  reportCount: { type: Number, default: 1 },
  linkedRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 2 * 60 * 60 * 1000) }, // 2 hours default
  createdAt: { type: Date, default: Date.now },
});

blockageSchema.index({ location: '2dsphere' });
blockageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB TTL index

export default mongoose.model('Blockage', blockageSchema);

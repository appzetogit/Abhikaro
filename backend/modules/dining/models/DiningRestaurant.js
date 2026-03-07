import mongoose from 'mongoose';

const diningRestaurantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Restaurant name is required'],
        trim: true
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    location: {
        type: String,
        required: true
    },
    distance: {
        type: String,
    },
    cuisine: {
        type: String,
    },
    price: {
        type: String,
    },
    image: {
        type: String,
        required: true
    },
    offer: {
        type: String,
    },
    deliveryTime: {
        type: String,
    },
    featuredDish: {
        type: String,
    },
    featuredPrice: {
        type: Number
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true
    },
    coordinates: {
        latitude: { type: Number },
        longitude: { type: Number }
    },
    isPopular: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

diningRestaurantSchema.pre('save', function (next) {
    if (!this.slug && this.name) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    }
    next();
});

const DiningRestaurant = mongoose.model('DiningRestaurant', diningRestaurantSchema);
export default DiningRestaurant;

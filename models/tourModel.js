const mongoose = require("mongoose");
const slugify = require("slugify");
// const User = require('./userModel');
// const validator = require('validator');

const tourSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A tour must have a name"],
      unique: true,
      trim: true,
      maxLength: [40, "A tour name must have less or equal to 40 characters"], // built-in validator
      minLength: [10, "A tour must have more or equal to 10 characters"], // built-in validator
      // validate: [validator.isAlpha, 'Tour name must only contain characters'], // third-party validator function
    },
    slug: String, // middleware-populated fields must appear in the schema
    duration: {
      type: Number,
      required: [true, "A tour must have a duration"],
    },
    maxGroupSize: {
      type: Number,
      required: [true, "A tour must have a maximum group size"],
    },
    difficulty: {
      type: String,
      required: [true, "A tour must have a difficulty"],
      enum: {
        values: ["easy", "medium", "difficult"],
        message: "A tour must have a difficulty: easy, medium, difficult",
      },
    },
    ratingsAverage: {
      type: Number,
      default: 4.5,
      min: [1, "Ratings must be above 1.0"],
      max: [5, "Ratings must be below or equal to 5.0"],
      set: (val) => Math.round(val * 10) / 10, // round to one decimal place
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: [true, "A tour must have a price"],
    },
    priceDiscount: {
      type: Number,
      validate: {
        // this is a custom validator
        validator: function (val) {
          return val < this.price; // 'this' only refers to new document creation, not an update
        },
      },
      message: "Discount price ({VALUE}) should be below the regular price",
    },
    summary: {
      type: String,
      trim: true,
      required: [true, "A tour must have a description"],
    },
    description: {
      type: String,
      trim: true,
    },
    imageCover: {
      type: String,
      required: [true, "A tour must have a cover image"],
    },
    images: [String],
    createdAt: {
      type: Date,
      default: Date.now(),
      select: false, // means the createdAt date is never included in query results
    },
    startDates: [Date],
    secretTour: {
      type: Boolean,
      default: false,
    },
    startLocation: {
      // GeoJSON
      type: {
        type: String,
        default: "Point",
        enum: ["Point"],
      },
      coordinates: [Number],
      address: String,
      description: String,
    },
    locations: [
      {
        type: {
          type: String,
          default: "Point",
          enum: ["Point"],
        },
        coordinates: [Number],
        address: String,
        description: String,
        day: Number,
      },
    ],
    guides: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// tourSchema.index({ price: 1 }); // 1 means ascending, -1 descending
tourSchema.index({ price: 1, ratingsAverage: -1 });
tourSchema.index({ slug: 1 });
tourSchema.index({ startLocation: "2dsphere" });

// Virtual properties
tourSchema.virtual("durationWeeks").get(function () {
  // we use regular function (not arrow) because we need the 'this' keyword
  return this.duration / 7;
});

// JOINing with 'virtual populate'
// How to include child documents, in this case reviews, that refer a tour
// We specify the name of the model (Review), the name of the review field containing the parent reference,
// and the local (tour) field that contains the reference
tourSchema.virtual("reviews", {
  ref: "Review",
  foreignField: "tour",
  localField: "_id",
});

// DOCUMENT MIDDLEWARE - .pre(...) runs BEFORE the event, e.g. .save() and .create()
// Note that 'save' event middlewares do not apply to functions like .insertMany and .findOneAndUpdate
// Note: any new fields created must appear in the schema, e.g. the slug field
tourSchema.pre("save", function (next) {
  // like Express, MongoDb middleware is a stack with a next() function
  this.slug = slugify(this.name, { lower: true }); // points to the current document being saved
  next();
});

// Lesson 151 - Tour Guides: Embedding technique
// If we wanted to embed the guides in the tours then we would need middleware to fetch the contents of
// each user document (whose id was stored in the guides array at the time of POSTing)
// Note that we would have to also write middleware to ensure that the same functionality happens on update
// tourSchema.pre('save', async function (next) {
//   const guidesPromises = this.guides.map(async (id) => await User.findById(id)); // array of promises
//   this.guides = await Promise.all(guidesPromises); // evaluate promises

//   next();
// });

// Can have multiple functions responding to the same hook (event)
// tourSchema.pre('save', (next) => {
//   console.log('Will save document...');
//   next();
// });

// More Document middleware - .post(...) runs AFTER the event, e.g. .save and .create
// post functions run after all the pre middleware functions have run
// Has access to the document and the next() function
// tourSchema.post('save', (doc, next) => {
//   console.log(doc);
//   next();
// });

// QUERY MIDDLEWARE
// tourSchema.pre('find', function (next) { // works for find() but not other functions like findById() or findOne()
tourSchema.pre(/^find/, function (next) {
  // use a regular expression: beginning with 'find'
  this.find({ secretTour: { $ne: true } }); // 'this' points to Query object, not a document

  this.start = Date.now(); // recording the start time of the query in an extra field called start
  next();
});

tourSchema.pre(/^find/, function (next) {
  this.populate({
    path: "guides",
    select: "-__v -passwordChangedAt",
  });

  next();
});

// tourSchema.post(/^find/, function (docs, next) {
//   console.log(`Query took ${Date.now() - this.start} milliseconds`);
//   // console.log(docs); // we have access to the documents that were returned
//   next();
// });

// AGGREGATION MIDDLEWARE - let's hide the secret tours
// tourSchema.pre('aggregate', function (next) {
//   this.pipleine().unshift({ $match: { secretTour: { $ne: true } } }); // add a new stage to the beginning of the pipeline array
//   console.log(this.pipeline()); // 'this' points to the aggregation object
//   next();
// });

// Create a Tour model from the schema
const Tour = mongoose.model("Tour", tourSchema);

module.exports = Tour;

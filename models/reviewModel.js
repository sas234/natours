const mongoose = require("mongoose");
const Tour = require("./tourModel");

const reviewSchema = new mongoose.Schema(
  {
    review: {
      type: String,
      required: [true, "Review cannot be empty"],
      trim: true,
      maxLength: [440, "A review must have less or equal to 140 characters"], // built-in validator
      minLength: [3, "A review must have more or equal to 3 characters"], // built-in validator
    },
    rating: {
      type: Number,
      default: 3,
      min: [1, "Rating must be between 1 and 5"],
      max: [5, "Rating must be between 1 and 5"],
    },
    createdAt: {
      type: Date,
      default: Date.now(),
      select: false, // means the createdAt date is never included in query results
    },
    tour: {
      type: mongoose.Schema.ObjectId,
      required: [true, "Review must be for a tour"],
      ref: "Tour",
    },
    user: {
      type: mongoose.Schema.ObjectId,
      required: [true, "Review must be by a user"],
      ref: "User",
    },
  },
  {
    toJSON: { virtuals: true }, // include virtual (calculated) fields in JSON output
    toObject: { virtuals: true }, // include virtual (calculated) fields in Object output
  }
);

// Don't allow the same user to review the same tour more than once
reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

// QUERY MIDDLEWARE
reviewSchema.pre(/^find/, function (next) {
  // if we want to populate tour and user
  // this.populate({
  //   path: 'tour',
  //   select: 'name',
  // }).populate({
  //   path: 'user',
  //   select: 'name photo',
  // });

  // we will just populate the user
  this.populate({
    path: "user",
    select: "name photo",
  });

  next();
});

// Add a static method on the reviewSchema to calculates ratingsAverage and ratingsQuantity
// Called with a tour id
reviewSchema.statics.calcAverageRatings = async function (tourId) {
  // We use the aggregation pipeline. In the following code, 'this' points to the model. Aggregate is called on the model
  const stats = await this.aggregate([
    {
      $match: { tour: tourId }, // tour refers to the review field
    },
    {
      $group: {
        _id: "$tour",
        nRating: { $sum: 1 },
        avgRating: { $avg: "$rating" },
      },
    },
  ]);

  if (stats.length > 0) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: stats[0].nRating,
      ratingsAverage: stats[0].avgRating,
    });
  } else {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: 0,
      ratingsAverage: 4.5,
    });
  }
};

// We would like to calculate review stats on triggers findByIdAndUpdate, findByIdAndDelete
reviewSchema.pre(/^findOneAnd/, async function (next) {
  // 'this' refers to the current query
  this.r = await this.findOne();
  // console.log(this.r);
  next();
});

reviewSchema.post(/^findOneAnd/, async function () {
  await this.r.constructor.calcAverageRatings(this.r.tour); // this.r calculated by the pre middleware above
});

reviewSchema.post("save", function () {
  // 'this' points to the review document being saved
  // We would like to call Review.calcAverageRatings(this.tour) but can't, as Review is not yet created
  // The way around this to call this.constructor (which is the model)
  this.constructor.calcAverageRatings(this.tour);
});

// Create a Review model from the schema
const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;

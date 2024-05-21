const crypto = require("crypto");
const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please tell us your name"],
    trim: true,
    maxLength: [40, "A user name must have less or equal to 40 characters"], // built-in validator
    minLength: [3, "A user name must have more or equal to 3 characters"], // built-in validator
  },
  email: {
    type: String,
    required: [true, "Please provide your email"],
    unique: true,
    lowercase: true, // transforms to lower case
    trim: true,
    validate: [validator.isEmail, "Please provide a valid email"],
  },
  photo: {
    type: String,
    default: "default.jpg",
  },
  role: {
    type: String,
    enum: ["user", "guide", "lead-guide", "admin"],
    default: "user",
  },
  password: {
    type: String,
    required: [true, "Please provide a password"],
    minLength: [8, "A password must have more or equal to 8 characters"],
    trim: true,
    select: false, // password is not output with queries
  },
  passwordConfirm: {
    type: String,
    required: [true, "Please confirm your password"],
    validate: {
      // Reminder: this only works on CREATE and SAVE!!!
      validator: function (el) {
        return el === this.password;
      },
      message: "Passwords are not the same",
    },
    trim: true,
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false,
  },
});

// query middleware
userSchema.pre(/^find/, function (next) {
  // use a regular expression: beginning with 'find'
  this.find({ active: { $ne: false } }); // 'this' points to Query object, not a document

  this.start = Date.now(); // recording the start time of the query in an extra field called start
  next();
});

// define some middleware to deal with passwords
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // check if password field was changed, return call next() if not)

  // hash the password using bcryptjs library - hash is an asynchronous function so we have to async/await
  this.password = await bcrypt.hash(this.password, 12); // 12 is the salt length

  this.passwordConfirm = undefined; // setting to undefined means it won't be persisted
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000; // 1 second to allow for delay in saving
  next();
});

// make a method on the schema for comparing a given password with the stored password
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = async function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    // convert from 2023-10-01T00:00:00.000Z format to unix seconds
    const changedTimeStamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );

    // console.log('>>> ', JWTTimestamp < changedTimeStamp);

    return JWTTimestamp < changedTimeStamp;
  }

  // if no passwordChangedAt then return false - means NOT changed
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  // Create a random token that we will send to the user's email
  // When he sends it back we will know it came from him
  const resetToken = crypto.randomBytes(32).toString("hex");

  // we need to save this so we can compare it to what the user provides - in the user record
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // console.log(
  //   `resetToken: ${resetToken}`,
  //   'crypto version: ',
  //   this.passwordResetToken,
  // );

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// Create a User model from the schema
const User = mongoose.model("User", userSchema);

module.exports = User;

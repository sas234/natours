const crypto = require("crypto");
const { promisify } = require("util"); // extracts the promisify function
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Email = require("../utils/email");

const signToken = (id) =>
  jwt.sign({ id: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);

  res.cookie("jwt", token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 3600 * 1000
    ),
    httpOnly: true, // prevents cross-site-scripting attacks - ensures cookie cannot be modified in browser
    secure: req.secure || req.headers["x-forwarded-proto"] === "https", // only works with https
  });

  // Remove password from the output (it is still in the document)
  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token, // sending them a token at signup logs them in
    data: {
      user: user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  // const newUser = await User.create(req.body); // bad practice as people could sneak in (e.g.) role = admin
  // more secure way is to capture the inputs we want...
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role,
  });

  const url = `${req.protocol}://${req.get("host")}/me`;
  // console.log(url);
  await new Email(newUser, url).sendWelcome();

  createSendToken(newUser, 201, req, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400)); // 400 is bad request
  }

  // 2) Check if the user exists and the password is correct
  // we need to specifically select the password as that is deselected in the model
  const user = await User.findOne({ email: email }).select("+password");
  // console.log(user, await user.correctPassword(password, user.password));

  if (!user || !(await user.correctPassword(password, user.password))) {
    // shortcuts if user doesn't exist
    return next(new AppError("Incorrect email or password", 401)); // 401 is unauthorised
  }

  // 3) If everything is ok, send the JWT to client
  createSendToken(user, 200, req, res);
});

exports.logout = (req, res) => {
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: "success" });
};

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if it's there
  let token; // otherwise token would be in block scope below
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError("You are not logged in. Please log in to get access", 401) // 401 is not authorised
    );
  }

  // 2) Verification - validate the token, has it been manipulated, or is it expired?
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if the user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError("The user belonging to this token no longer exists", 401)
    );
  }

  // 4) Check if user changed password after the JWT was issued
  // we will use an instance method on the model - see userModel.js
  if (await currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError("User recently changed password! Please log in again.", 401)
    );
  }

  // grant access to protected route
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// Only for rendered pages (i.e. not API routes), so token will be in a cookie. No errors!
exports.isLoggedIn = async (req, res, next) => {
  // 1) Getting token and check if it's there
  if (req.cookies.jwt) {
    try {
      // 1) verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      // 2) Check if the user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next();
      }

      // 3) Check if user changed password after the JWT was issued
      // we will use an instance method on the model - see userModel.js
      if (await currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }

      // THERE IS A LOGGED IN USER
      res.locals.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }

  next();
};

exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to perform this action", 403)
      );
    }

    next();
  };

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) User provides email in request. Get user based on posted email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError("There is no user with that email address", 404));
  }

  // 2) Generate random token (not a JWT token) - implemented as instance method on userSchema
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send token to user's email

  try {
    const resetURL = `${req.protocol}://${req.get(
      "host"
    )}/api/v1/users/resetPassword/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    });
  } catch (err) {
    // if there is an error sending the email then we want to reset the token and the expired property
    user.passwordResetToken = undefined; // means the field will be removed
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError("There was an error sending the email. Try again later", 500)
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError("Token is invalid or has expired", 400));
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user
  // this is performed in pre-save middleware in userModel.js

  // 4) Log the user in, send JWT
  createSendToken(user, 200, req, res);
});

// allows a logged in user to update their password without the forgetPassword and resetPassword process
// exports.updatePassword = (req, res, next) => {
//   // 1) Get the user from collection
//   // 2) Is the posted password correct?
//   // 3) If password is correct then update the password
//   // 4) Log the user in, send JWT
// };

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get the current user - user object supplied by the protect middleware
  const user = await User.findById(req.user.id).select("+password");

  // 2) Verify the supplied password
  if (
    !user ||
    !(await user.correctPassword(req.body.passwordCurrent, user.password))
  ) {
    return next(
      new AppError(
        "The password provided does not match the user password. Please try again.",
        401 // unauthorised
      )
    );
  }

  // Password is correct so save the new password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4) Log the user in, send JWT
  createSendToken(user, 200, req, res);
});

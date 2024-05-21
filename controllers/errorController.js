const AppError = require("../utils/appError");

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400); // 400 is 'bad request'
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.keyValue.name || Object.keys(err.keyPattern)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400); // 400 is 'bad request'
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);

  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError("Invalid token, Please log in again!", 401);

const handleJWTExpiredError = () =>
  new AppError("Your token has expired! Please log in again", 401);

const sendErrorDev = (err, req, res) => {
  if (req.originalUrl.startsWith("/api")) {
    // A) API
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  // B) RENDERED WEBSITE
  console.error("ERROR 💥 ", err);
  return res.status(err.statusCode).render("error", {
    title: "Something went wrong!",
    msg: err.message,
  });
};

const sendErrorProd = (err, req, res) => {
  if (req.originalUrl.startsWith("/api")) {
    // A) API
    // we only want to send operational (as defined in appError.js) errors to the client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }
    // send generic error message for programming and unknown errors
    // 1) Log error
    console.error("ERROR 💥 ", err);
    // 2) Send generic message
    return res.status(500).json({
      status: "error",
      message: "Something went very wrong!",
    });
  }

  // B) RENDERED WEBSITE
  if (err.isOperational) {
    // console.log(err);
    return res.status(err.statusCode).render("error", {
      title: "Something went wrong!",
      msg: err.message,
    });
  }

  // send generic error message for programming and unknown errors
  // 1) Log error
  console.error("ERROR 💥 ", err);
  // 2) Send generic message
  return res.status(err.statusCode).render("error", {
    title: "Something went wrong!",
    msg: "Please try again later.",
  });
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500; // 500 is a default if err.statusCode not defined
  err.status = err.status || "error"; // another default

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === "production") {
    // some errors we want to replace by marking it as an operational error
    // 1) An invalid id being passed to getTour
    let error = { ...err }; // Save a copy of the original error so we don't overwrite argument to the function
    error.message = err.message; // message is a non-iteraable attribute so wasn't copied by the spread operator
    error.name = err.name;

    if (error.name === "CastError") error = handleCastErrorDB(error); // *bug workaround - see below
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === "ValidationError")
      error = handleValidationErrorDB(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

    sendErrorProd(error, req, res); // our error is now an operational error
  }

  // *bug workaround. It seems that the previous line> let error = { ...err } < does not
  // preserve the name field... that's why the comparison uses the original object err
};

const path = require("path");
const express = require("express");
const morgan = require("morgan"); // simple logger
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const cors = require("cors");

const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");
const tourRouter = require("./routes/tourRoutes");
const userRouter = require("./routes/userRoutes");
const reviewRouter = require("./routes/reviewRoutes");
const bookingRouter = require("./routes/bookingRoutes");
const bookingController = require("./controllers/bookingController");
const viewRouter = require("./routes/viewRoutes");

// Start express app
const app = express();

// app.enable("trust proxy");

app.set("view engine", "pug"); // recognised by Express as a view renderer
app.set("views", path.join(__dirname, "views"));

// 1) GLOBAL MIDDLEWARE - middleware is applied to every single request
// Enable CORS requests
app.use(cors()); // Default is to set header: Access-Control-Allow_origin *

// Respond to OPTIONS requests
// .options() refers to the http method OPTIONS - like .get() (GET), .post() (POST), etc
// first parameter specifies all routes - we could specify specific routes and specific origins if we like
app.options("*", cors());

// Serving static files
app.use(express.static(path.join(__dirname, "public"))); // sets the file-access root to the public directory

// Set security HTTP Headers
//app.use(helmet());
// use early in the middleware stack, preferably first
// app.use(
//   helmet.contentSecurityPolicy({
//     directives: {
//       defaultSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
//       scriptSrc: [
//         "'self'",
//         'https://cdnjs.cloudflare.com',
//         'https://js.stripe.com',
//         'https://*.mapbox.com',
//         "'unsafe-eval'",
//       ],
//       connectSrc: [
//         "'self'",
//         'ws://127.0.0.1:1234',
//         'https://api.mapbox.com',
//         'https://events.mapbox.com',
//       ], // Add WebSocket URL
//       // Add more directives as needed
//     },
//   }),
// );
// TODO: work out headers for production use - see getTour in viewsController for map-specific headers
// TODO: rewatch lecture on security and work on remaining threats
app.use(helmet({ contentSecurityPolicy: false }));

// Development logging
console.log(`Starting in ${process.env.NODE_ENV} mode`);
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Limit requests from same IP address
const limiter = rateLimit({
  max: 100,
  windowMs: 3600 * 1000, // 1 hour
  message: "Too many requests from this IP, please try again in an hour!",
});
app.use("/api", limiter);

// We need this middleware to come BEFORE the body parser because we need the Stripe session
// in raw format, not in json format
app.post(
  "/webhook-checkout",
  express.raw({ type: "application/json" }),
  bookingController.webhookCheckout
);

// Body parser, reading data from body into req.body, limits body to 10Kb
app.use(
  express.json({
    limit: "10Kb",
  })
);
app.use(express.urlencoded({ extended: true, limit: "10kb" })); // built-in middleware, puts url-encoded data in the body
app.use(cookieParser());

// Data sanitisation against NoSQL query injection
app.use(mongoSanitize());

// Data sanitisation against XSS
app.use(xss());

// Prevent parameter pollution
app.use(
  hpp({
    whitelist: [
      "duration",
      "ratingsQuantity",
      "ratingsAverage",
      "maxGroupSize",
      "difficulty",
      "price",
    ],
  })
);

app.use(compression());

// our own middleware function to add to the middleware stack
// app.use((req, res, next) => {
//   console.log('Hello from the middleware');
//   next();
// });

// Test middleware
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  // console.log(req.cookies);

  next();
});

// 3) ROUTES
// 'mounting' the routers - these are processed in turn
app.use("/", viewRouter);
app.use("/api/v1/tours", tourRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/reviews", reviewRouter);
app.use("/api/v1/bookings", bookingRouter);
// we only reach here if the routers above do not catch the request
// we need a route that runs for all http methods, hence the 'all' function
app.all("*", (req, res, next) => {
  // res.status(404).json({
  //   status: 'fail',
  //   message: `Can't find ${req.originalUrl} on this server`,
  // });

  // better idea than us sending response - let the error-handling middleware deal with it
  // const err = new Error(`Can't find ${req.originalUrl} on this server`);
  // err.status = 'fail';
  // err.statusCode = 404;

  // Even better idea, use the AppError class and pass it to next()

  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404)); // passing an error to next() invokes the error-handling middleware
});

// Express provides us with middleware to handle errors - it recognises this from the parameter signature
// globalErrorHandler is a single function in errorController.js (see requires above) with such a signature
app.use(globalErrorHandler);

module.exports = app;

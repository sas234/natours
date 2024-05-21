const express = require("express");
const viewsController = require("../controllers/viewsController");
const authController = require("../controllers/authController");
const bookingController = require("../controllers/bookingController");

const router = express.Router();

// middleware to pick up a keyword in the 'alert' query string of a url
// ...and put it in a res.locals attribute
router.use(viewsController.alerts);

// This middleware is applied to all routes from this point onwards
router.use(authController.isLoggedIn);

router.get("/", authController.isLoggedIn, viewsController.getOverview);
router.get("/tour/:slug", authController.isLoggedIn, viewsController.getTour);
router.get("/login", authController.isLoggedIn, viewsController.getLoginForm);
router.get("/me", authController.protect, viewsController.getAccount);
router.get("/mytours", authController.protect, viewsController.getMyTours);

router.post(
  "/submit-user-data",
  authController.protect,
  viewsController.updateUserData
);

module.exports = router;

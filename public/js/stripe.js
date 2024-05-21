/* eslint-disable */
import axios from "axios";
import { showAlert } from "./alerts";

export const bookTour = async (tourId) => {
  try {
    const stripe = Stripe(
      "pk_test_51PI4TtJDwHMggZLO69bVYPhva0znaUtY9z9ktLHFnWZto9GFlFMGQ6oV48GZo64DF7LMOBdxVm2K2Ca114r5ft5T00lLt2TdZh"
    );
    // 1) Get the session from API
    const session = await axios(`/api/v1/bookings/checkout-session/${tourId}`);
    // console.log(session);

    // 2) Create checkout form + charge credit card
    await stripe.redirectToCheckout({
      sessionId: session.data.session.id,
    });
  } catch (err) {
    console.log(err);
    showAlert("error", err);
  }
};

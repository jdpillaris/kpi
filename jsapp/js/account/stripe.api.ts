import {when} from 'mobx';
import subscriptionStore from 'js/account/subscriptionStore';
import {endpoints} from 'js/api.endpoints';
import {ACTIVE_STRIPE_STATUSES} from 'js/constants';
import type {PaginatedResponse} from 'js/dataInterface';
import envStore from 'js/envStore';
import {fetchGet, fetchPost} from 'jsapp/js/api';
import type {
  AccountLimit,
  ChangePlan,
  Checkout,
  Organization,
  Product,
} from 'js/account/stripe.types';
import {Limits} from 'js/account/stripe.types';

const DEFAULT_LIMITS: AccountLimit = Object.freeze({
  submission_limit: Limits.unlimited,
  nlp_seconds_limit: Limits.unlimited,
  nlp_character_limit: Limits.unlimited,
  storage_bytes_limit: Limits.unlimited,
});

export async function getProducts() {
  return fetchGet<PaginatedResponse<Product>>(endpoints.PRODUCTS_URL, {
    errorMessageDisplay: t('There was an error getting the list of plans.'),
  });
}

export async function changeSubscription(
  priceId: string,
  subscriptionId: string
) {
  return fetchGet<ChangePlan>(
    `${endpoints.CHANGE_PLAN_URL}?price_id=${priceId}&subscription_id=${subscriptionId}`,
    {
      errorMessageDisplay: t(
        "We couldn't make the requested change to your plan.\nYour current plan has not been changed."
      ),
    }
  );
}

export async function getOrganization() {
  return fetchGet<PaginatedResponse<Organization>>(endpoints.ORGANIZATION_URL, {
    errorMessageDisplay: t("Couldn't get data for your organization."),
  });
}

/**
 * Start a checkout session for the given price and organization. Response contains the checkout URL.
 */
export async function postCheckout(priceId: string, organizationId: string) {
  return fetchPost<Checkout>(
    `${endpoints.CHECKOUT_URL}?price_id=${priceId}&organization_id=${organizationId}`,
    {},
    {
      errorMessageDisplay:
        'There was an error creating the checkout session. Please try again later.',
    }
  );
}

/**
 * Get the URL of the Stripe customer portal for an organization.
 */
export async function postCustomerPortal(organizationId: string) {
  return fetchPost<Checkout>(
    `${endpoints.PORTAL_URL}?organization_id=${organizationId}`,
    {},
    {
      errorMessageDisplay:
        'There was an error sending you to the billing portal. Please try again later.',
    }
  );
}

/**
 * Get the subscription interval (`'month'` or `'year'`) for the logged-in user.
 * Returns `'month'` for users on the free plan.
 */
export async function getSubscriptionInterval() {
  await when(() => envStore.isReady);
  if (envStore.data.stripe_public_key) {
    if (!subscriptionStore.isPending && !subscriptionStore.isInitialised) {
      subscriptionStore.fetchSubscriptionInfo();
    }
    await when(() => subscriptionStore.isInitialised);
    const subscriptionList = subscriptionStore.planResponse;
    const activeSubscription = subscriptionList.find((sub) =>
      ACTIVE_STRIPE_STATUSES.includes(sub.status)
    );
    if (activeSubscription) {
      return activeSubscription.items[0].price.recurring?.interval;
    }
  }
  return 'month';
}

/**
 * Extract the limits from Stripe product/price metadata and convert their values from string to number (if necessary.)
 * Will only return limits that exceed the ones in `limitsToCompare`, or all limits if `limitsToCompare` is not present.
 */
function getLimitsForMetadata(
  metadata: {[key: string]: string},
  limitsToCompare: false | AccountLimit = false
) {
  const limits: Partial<AccountLimit> = {};
  for (const [key, value] of Object.entries(metadata)) {
    // if we need to compare limits, make sure we're not overwriting a higher limit from somewhere else
    if (limitsToCompare) {
      if (!(key in limitsToCompare)) {
        continue;
      }
      if (
        key in limitsToCompare &&
        value !== Limits.unlimited &&
        value <= limitsToCompare[key as keyof AccountLimit]
      ) {
        continue;
      }
    }
    // only use metadata needed for limit calculations
    if (key in DEFAULT_LIMITS) {
      limits[key as keyof AccountLimit] =
        value === Limits.unlimited ? Limits.unlimited : parseInt(value);
    }
  }
  return limits;
}

/**
 * Get limits for the custom free tier (from `FREE_TIER_THRESHOLDS`), and merges them with the user's limits.
 * The `/environment/` endpoint handles checking whether the logged-in user registered before `FREE_TIER_CUTOFF_DATE`.
 */
const getFreeTierLimits = async (limits: AccountLimit) => {
  await when(() => envStore.isReady);
  const thresholds = envStore.data.free_tier_thresholds;
  const newLimits: AccountLimit = {...limits};
  if (thresholds.storage) {
    newLimits['storage_bytes_limit'] = thresholds.storage;
  }
  if (thresholds.data) {
    newLimits['submission_limit'] = thresholds.data;
  }
  if (thresholds.translation_chars) {
    newLimits['nlp_character_limit'] = thresholds.translation_chars;
  }
  if (thresholds.transcription_minutes) {
    newLimits['nlp_seconds_limit'] = thresholds.transcription_minutes * 60;
  }
  return newLimits;
};

/**
 * Get limits for any recurring add-ons the user has, merged with the rest of their limits.
 */
const getRecurringAddOnLimits = (limits: AccountLimit) => {
  let newLimits = {...limits};
  let activeAddOns = [...subscriptionStore.addOnsResponse];
  let metadata = {};
  // only check active add-ons
  activeAddOns = activeAddOns.filter((subscription) =>
    ACTIVE_STRIPE_STATUSES.includes(subscription.status)
  );
  if (activeAddOns.length) {
    activeAddOns.forEach((addOn) => {
      metadata = {
        ...addOn.items[0].price.product.metadata,
        ...addOn.items[0].price.metadata,
      };
      newLimits = {...newLimits, ...getLimitsForMetadata(metadata, newLimits)};
    });
  }
  return newLimits;
};

/**
 * Get all metadata keys for the logged-in user's plan, or from the free tier if they have no plan.
 */
const getStripeMetadataAndFreeTierStatus = async () => {
  await when(() => subscriptionStore.isInitialised);
  const plans = [...subscriptionStore.planResponse];
  // only use metadata for active subscriptions
  const activeSubscriptions = plans.filter((subscription) =>
    ACTIVE_STRIPE_STATUSES.includes(subscription.status)
  );
  let metadata;
  let hasFreeTier = false;
  if (activeSubscriptions.length) {
    // get metadata from the user's subscription (prioritize price metadata over product metadata)
    metadata = {
      ...activeSubscriptions[0].items[0].price.product.metadata,
      ...activeSubscriptions[0].items[0].price.metadata,
    };
  } else {
    // the user has no subscription, so get limits from the free monthly product
    hasFreeTier = true;
    try {
      const products = await getProducts();
      const freeProduct = products.results.filter((product) =>
        product.prices.filter(
          (price) =>
            price.unit_amount === 0 && price.recurring?.interval === 'month'
        )
      )[0];
      metadata = {
        ...freeProduct.metadata,
        ...freeProduct.prices[0].metadata,
      };
    } catch (error) {
      // couldn't find the free monthly product, continue in case we have limits to display from the free tier override
      metadata = {};
    }
  }
  return {metadata, hasFreeTier};
};

/**
 * Get the complete account limits for the logged-in user.
 * Checks (in descending order of priority):
 *  - the user's recurring add-ons
 *  - the `FREE_TIER_THRESHOLDS` override
 *  - the user's subscription limits
 */
export async function getAccountLimits() {
  const {metadata, hasFreeTier} = await getStripeMetadataAndFreeTierStatus();

  // initialize to unlimited
  let limits: AccountLimit = {...DEFAULT_LIMITS};

  // apply any limits from the metadata
  limits = {...limits, ...getLimitsForMetadata(metadata)};

  if (hasFreeTier) {
    // if the user is on the free tier, overwrite their limits with whatever free tier limits exist
    limits = await getFreeTierLimits(limits);

    // if the user has active recurring add-ons, use those as the final say on their limits
    limits = getRecurringAddOnLimits(limits);
  }

  return limits;
}

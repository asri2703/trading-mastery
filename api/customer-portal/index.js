// Gold Hunter — Stripe Customer Portal Session Creator
// File: api/customer-portal/index.js → route: /api/customer-portal
//
// Purpose: Generate a Stripe Customer Portal session URL for a customer.
// The portal lets customers view invoices, download receipts, update
// payment methods, and re-purchase (via auto-created customer).
//
// Usage from client side:
//   GET /api/customer-portal?email=user@example.com
//   or
//   GET /api/customer-portal?order_id=<uuid>
//
// Returns: JSON with `url` field that client should redirect to

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Parse query params
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  const orderId = url.searchParams.get('order_id');

  if (!email && !orderId) {
    return new Response(JSON.stringify({
      error: 'missing identifier',
      hint: 'Pass ?email=you@example.com or ?order_id=<uuid>',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Look up the Stripe customer ID
  let customerId = null;

  try {
    if (orderId) {
      // Get the order, then find customer_id
      const orderRes = await fetch(
        `${supabaseUrl}/rest/v1/gh_orders?id=eq.${orderId}&select=stripe_session_id,email&limit=1`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
        }
      );
      const orders = await orderRes.json();
      if (!orders || orders.length === 0) {
        return new Response(JSON.stringify({ error: 'order not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const order = orders[0];
      // Get the session to find customer
      if (order.stripe_session_id) {
        const sessionRes = await fetch(
          `https://api.stripe.com/v1/checkout/sessions/${order.stripe_session_id}`,
          {
            headers: { 'Authorization': `Bearer ${stripeKey}` },
          }
        );
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          customerId = session.customer;
        }
      }
      // If still no customer, try by email
      if (!customerId && order.email) {
        const custRes = await fetch(
          `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(order.email)}'&limit=1`,
          { headers: { 'Authorization': `Bearer ${stripeKey}` } }
        );
        if (custRes.ok) {
          const custData = await custRes.json();
          if (custData.data && custData.data.length > 0) {
            customerId = custData.data[0].id;
          }
        }
      }
    } else if (email) {
      // Search Stripe customer by email
      const custRes = await fetch(
        `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(email)}'&limit=1`,
        { headers: { 'Authorization': `Bearer ${stripeKey}` } }
      );
      if (custRes.ok) {
        const custData = await custRes.json();
        if (custData.data && custData.data.length > 0) {
          customerId = custData.data[0].id;
        }
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'lookup failed',
      detail: e.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  if (!customerId) {
    return new Response(JSON.stringify({
      error: 'no stripe customer found',
      hint: 'Customer needs to complete a payment first',
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  // Create a Customer Portal session
  try {
    // Build return URL (where customer goes after closing portal)
    const origin = url.origin;
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': customerId,
        'return_url': `${origin}/?portal=closed`,
      }),
    });

    if (!portalRes.ok) {
      const err = await portalRes.text();
      return new Response(JSON.stringify({
        error: 'portal session failed',
        detail: err,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const portalSession = await portalRes.json();
    return new Response(JSON.stringify({
      url: portalSession.url,
      customer_id: customerId,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'portal creation failed',
      detail: e.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

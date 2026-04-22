import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { plan_id, amount_inr, plan_name } = await req.json();

    if (!plan_id || !amount_inr) {
      return new Response(JSON.stringify({ error: 'Missing plan_id or amount_inr' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const keyId     = Deno.env.get('RAZORPAY_KEY_ID')!;
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;
    const auth      = btoa(`${keyId}:${keySecret}`);

    const amountPaise = Math.round(Number(amount_inr) * 100);

    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount:   amountPaise,
        currency: 'INR',
        receipt:  `incoin_${plan_id}_${Date.now()}`,
        notes:    { plan_name },
      }),
    });

    const order = await rzpRes.json();

    if (!rzpRes.ok || !order.id) {
      console.error('Razorpay order error:', order);
      return new Response(JSON.stringify({ error: order.error?.description || 'Razorpay order creation failed.' }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ order_id: order.id, amount: order.amount, currency: order.currency }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('razorpay-order error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

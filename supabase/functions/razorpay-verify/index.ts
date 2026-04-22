import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';
import { encode as hexEncode } from 'https://deno.land/std@0.177.0/encoding/hex.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Credits mapping per plan
const PLAN_CREDITS: Record<string, number> = {
  starter:      10,
  standard:     25,
  professional: 60,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan_id,
      amount_inr,
    } = await req.json();

    // 1. Verify Razorpay signature
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;
    const body      = `${razorpay_order_id}|${razorpay_payment_id}`;
    const encoder   = new TextEncoder();
    const key       = await crypto.subtle.importKey(
      'raw', encoder.encode(keySecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig      = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const computed = new TextDecoder().decode(hexEncode(new Uint8Array(sig)));

    if (computed !== razorpay_signature) {
      return new Response(JSON.stringify({ error: 'Invalid payment signature.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get user from JWT
    const supabaseUrl         = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader          = req.headers.get('Authorization') ?? '';
    const userSupabase        = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: userErr } = await userSupabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Add credits via RPC
    const credits = PLAN_CREDITS[plan_id] ?? 0;
    const { data: rpcData, error: rpcErr } = await userSupabase.rpc('add_credits', {
      p_user_id:    user.id,
      p_credits:    credits,
      p_amount_inr: amount_inr,
      p_note:       `Payment ${razorpay_payment_id} — ${plan_id} plan`,
    });

    if (rpcErr) {
      console.error('add_credits RPC error:', rpcErr);
      return new Response(JSON.stringify({ error: 'Failed to credit account.' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success:       true,
      credits_added: credits,
      new_balance:   rpcData?.new_balance ?? 0,
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('razorpay-verify error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

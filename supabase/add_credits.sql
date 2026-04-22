-- Run this once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/zuqohqbkmkcxzxcnsbyr/sql/new

CREATE OR REPLACE FUNCTION add_credits(
  p_user_id    uuid,
  p_credits    int,
  p_amount_inr numeric,
  p_note       text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance int;
BEGIN
  -- Add credits and update total_spent atomically
  UPDATE profiles
  SET
    credits     = credits + p_credits,
    total_spent = total_spent + p_amount_inr
  WHERE id = p_user_id
  RETURNING credits INTO v_new_balance;

  -- Log to activity
  INSERT INTO activity_log (user_id, action, detail)
  VALUES (p_user_id, 'credit_added', p_note);

  RETURN json_build_object('new_balance', v_new_balance);
END;
$$;

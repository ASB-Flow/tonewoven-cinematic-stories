CREATE OR REPLACE FUNCTION public.consume_credits(_user_id uuid, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_balance integer;
BEGIN
  UPDATE public.credits
  SET balance = balance - _amount
  WHERE user_id = _user_id AND balance >= _amount
  RETURNING balance INTO new_balance;
  RETURN new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_credits(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.credits
  SET balance = balance + _amount
  WHERE user_id = _user_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer) TO service_role;
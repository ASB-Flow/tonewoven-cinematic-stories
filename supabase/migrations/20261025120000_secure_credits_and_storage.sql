-- Users must no longer be able to change their own credit balance from the client
DROP POLICY IF EXISTS "Users can update their own credits" ON public.credits;

-- Atomically debit credits; returns the new balance, or NULL if the balance is insufficient
CREATE OR REPLACE FUNCTION public.consume_credits(_user_id uuid, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE public.credits
  SET balance = balance - _amount
  WHERE user_id = _user_id
    AND balance >= _amount
  RETURNING balance INTO new_balance;

  RETURN new_balance;
END;
$$;

-- Give credits back when a paid operation fails after the debit
CREATE OR REPLACE FUNCTION public.refund_credits(_user_id uuid, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE public.credits
  SET balance = balance + _amount
  WHERE user_id = _user_id
  RETURNING balance INTO new_balance;

  RETURN new_balance;
END;
$$;

-- Only the edge functions (service role) may call these
REVOKE ALL ON FUNCTION public.consume_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer) TO service_role;

-- Make the audio bucket private: files are served through signed URLs only
UPDATE storage.buckets SET public = false WHERE id = 'audio-files';

DROP POLICY IF EXISTS "Audio files are publicly accessible" ON storage.objects;

CREATE POLICY "Users can view their own audio files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'audio-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

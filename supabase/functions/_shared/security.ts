import { createClient, type User } from "npm:@supabase/supabase-js@2.93.1";

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version';

// Extra origins can be added with the ALLOWED_ORIGINS secret (comma-separated)
const STATIC_ORIGINS = [
  'https://tonewoven-cinematic-stories.lovable.app',
  'http://localhost:8080',
  'http://localhost:8081',
];
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.(lovable\.app|lovableproject\.com|lovable\.dev)$/;

function isAllowedOrigin(origin: string): boolean {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return STATIC_ORIGINS.includes(origin) || extra.includes(origin) || PREVIEW_ORIGIN.test(origin);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

const adminClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

// Returns the signed-in user, or null when the request carries no valid user session
export async function getUser(req: Request): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// Returns true when the credits were debited, false when the balance is insufficient
export async function consumeCredits(userId: string, amount: number): Promise<boolean> {
  const { data, error } = await adminClient().rpc('consume_credits', { _user_id: userId, _amount: amount });
  if (error) throw new Error(`Credit check failed: ${error.message}`);
  return data !== null;
}

export async function refundCredits(userId: string, amount: number): Promise<void> {
  const { error } = await adminClient().rpc('refund_credits', { _user_id: userId, _amount: amount });
  if (error) console.error('Credit refund failed:', error.message);
}

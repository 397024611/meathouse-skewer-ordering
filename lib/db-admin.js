import { createClient } from '@supabase/supabase-js';

let adminClient;

export function adminDbConfigured(){
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function adminDb(){
  if(!adminDbConfigured()) throw new Error('Supabase server secret is not configured.');
  if(!adminClient){
    adminClient=createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      {auth:{persistSession:false,autoRefreshToken:false}}
    );
  }
  return adminClient;
}

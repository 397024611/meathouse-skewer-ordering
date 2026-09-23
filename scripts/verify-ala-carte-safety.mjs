import fs from 'node:fs';

const checks=[
  ['.env.example',/ALA_CARTE_RELEASE_UNLOCK=false/,'release lock defaults to false'],
  ['supabase/migrations/20260923_ala_carte_stripe_v1.sql',/enabled boolean not null default false/,'database feature flag defaults to false'],
  ['app/api/stripe/webhook/route.js',/constructEvent\(/,'Stripe webhook signature is verified'],
  ['app/api/stripe/webhook/route.js',/amount_total_cents/,'Stripe paid amount is checked against server order total'],
  ['app/api/customer/ala-carte/checkout/route.js',/idempotencyKey/,'Stripe Checkout creation is idempotent'],
  ['app/api/customer/order/route.js',/included skewer rounds are complete/,'free-order bypass is blocked after included rounds'],
  ['app/api/manager/ala-carte/route.js',/Full-store A La Carte can only be enabled with a LIVE Stripe secret key/,'TEST Stripe cannot enable full store'],
  ['app/api/manager/ala-carte/route.js',/Single-table test mode requires a Stripe TEST secret key/,'single-table test requires TEST Stripe'],
  ['lib/ala-carte.js',/test_table_token/,'single-table test allowlist is enforced'],
];

let failed=false;
for(const [file,re,label] of checks){
  const text=fs.readFileSync(file,'utf8');
  if(!re.test(text)){
    console.error('FAIL:',label,'—',file);
    failed=true;
  }else{
    console.log('PASS:',label);
  }
}
if(failed)process.exit(1);
console.log('A La Carte safety checks passed.');

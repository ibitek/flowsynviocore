import {createBillingV25} from '../lib/billing-v25.js';
import {createClient} from '@supabase/supabase-js';
import {createFlowHandler} from '../lib/flow.js';
const handler=createFlowHandler({createClient});
const billing25=createBillingV25({createClient});
export const GET=r=>new URL(r.url).searchParams.has('billing25')?billing25(r):handler(r);
export const POST=r=>new URL(r.url).searchParams.has('billing25')?billing25(r):handler(r);
export const OPTIONS=handler;

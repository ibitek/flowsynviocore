import {createClient} from '@supabase/supabase-js';
import {createFlowHandler} from '../lib/flow.js';
const handler=createFlowHandler({createClient});
export const GET=handler;
export const POST=handler;
export const OPTIONS=handler;

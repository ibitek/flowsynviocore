export async function walletActive(sb,organizationId){const {data,error}=await sb.rpc('synvio_wallet_active',{p_org:organizationId});return !error&&data===true;}

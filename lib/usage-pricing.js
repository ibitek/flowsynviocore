// Pilot wallet rate for GPT-4.1 mini. Amounts use millionths of a USD.
export const PRICING={
  model:'gpt-4.1-mini',
  inputUsdPerMillion:2,
  outputUsdPerMillion:8,
  providerInputUsdPerMillion:0.4,
  providerOutputUsdPerMillion:1.6,
  currency:'USD',
  status:'trial_wallet_not_invoice'
};

export function priceUsage(model,inputTokens,outputTokens){
  if(!/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(String(model||'')))return null;
  if(!Number.isSafeInteger(inputTokens)||!Number.isSafeInteger(outputTokens)||inputTokens<0||outputTokens<0)return null;
  // Each reported provider token is one Synvio token. Input and output have
  // different unit prices; round only the final charge to a micro-dollar.
  const exactTenths=BigInt(inputTokens)*20n+BigInt(outputTokens)*80n;
  const rounded=(exactTenths+5n)/10n;
  if(rounded>BigInt(Number.MAX_SAFE_INTEGER))return null;
  const priceMicroUsd=Number(rounded);
  const providerCostMicroUsd=Math.round(inputTokens*.4+outputTokens*1.6);
  return {priceMicroUsd,providerCostMicroUsd};
}

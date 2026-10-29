// Compare the workspace total with ALL paid agent seats, never one $25 seat.
export function recommendPlan({agents,usageMicroUsd,actions,observedDays},plans){
 const seats=Math.max(1,Number(agents)||0),days=Math.min(30,Math.max(1,Number(observedDays)||1));
 const actual=Math.max(0,Number(usageMicroUsd)||0);
 const enough=days>=7&&actions>=10;
 const projected=enough?Math.round(actual/days*30):null;
 const basis=projected??actual;
 const comparisons=plans.map(plan=>{
  const cost=Number(plan.price_micro_usd)*seats,allowance=Number(plan.allowance_micro_usd)*seats;
  const overage=Math.max(0,basis-allowance);
  return {...plan,seats,costMicroUsd:cost,allowanceMicroUsd:allowance,paygMicroUsd:basis,projected:enough,overageMicroUsd:overage,
   totalWithOptInPaygMicroUsd:cost+overage,savingsMicroUsd:basis-cost-overage,requiresPaygOptIn:overage>0,
   recommend:basis>cost+overage&&(enough||actual>cost+overage)};
 });
 const best=comparisons.filter(p=>p.recommend).sort((a,b)=>b.savingsMicroUsd-a.savingsMicroUsd)[0]||null;
 return {seats,actual30DayMicroUsd:actual,projected30DayMicroUsd:projected,observedDays:days,comparisons,recommendedPlan:best};
}

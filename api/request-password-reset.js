import { createClient } from "@supabase/supabase-js";
import {sendEmail} from '../lib/postmark.js';
import crypto from "node:crypto";

const attempts = new Map();
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8"}});}
function env(name){const value=process.env[name];if(!value)throw new Error(`Missing environment variable: ${name}`);return value;}

export async function POST(request){
  try {
    const body=await request.json().catch(()=>null);
    const email=String(body?.email||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({error:"Enter your full email address."},400);
    // Best-effort per-instance cooldown. Also retain host-level request limits.
    const now=Date.now();
    for(const [key,time] of attempts) if(now-time>3600000) attempts.delete(key);
    const key=crypto.createHash('sha256').update(email).digest('hex');
    if(attempts.has(key)&&now-attempts.get(key)<60000)return json({error:"Wait a minute before requesting another link."},429);
    if(attempts.size>10000)return json({error:"Please try again later."},429);
    attempts.set(key,now);
    const sb=createClient(env('SUPABASE_URL'),env('SUPABASE_SECRET_KEY'),{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
    const redirectTo=`${new URL(request.url).origin}/reset-password.html`;
    const {data,error}=await sb.auth.admin.generateLink({type:'recovery',email,options:{redirectTo}});
    if(error){
      if(error.code==='user_not_found'||error.status===404)return json({ok:true});
      throw error;
    }
    const actionLink=data?.properties?.action_link;
    if(!actionLink||new URL(actionLink).searchParams.get('redirect_to')!==redirectTo)throw new Error('Check Supabase Auth redirect URLs.');
    let from=String(process.env.POSTMARK_FROM_EMAIL||'').trim();
    if(!from){
      const {data:members,error:memberError}=await sb.from('organization_members').select('organization_id').eq('user_id',data.user.id);
      if(memberError)throw memberError;
      const orgs=members?.map(member=>member.organization_id)||[];
      if(orgs.length){
        const {data:inboxes,error:inboxError}=await sb.from('inboxes').select('outbound_from_email,outbound_from_name').in('organization_id',orgs);
        if(inboxError)throw inboxError;
        const sender=inboxes?.find(item=>item.outbound_from_email);
        if(sender)from=sender.outbound_from_email.includes('<')?sender.outbound_from_email:`${sender.outbound_from_name||'Synvio'} <${sender.outbound_from_email}>`;
      }
    }
    if(!from)throw new Error('Configure a verified POSTMARK_FROM_EMAIL sender.');
    const {data:sent,error:sendError}=await sendEmail({
      from,to:[email],subject:'Set your Synvio password',
      text:`Open this one-time link to set or reset your Synvio password:\n${actionLink}\n\nAfter saving, sign in with your work email and password. If you did not request this, ignore the email.`
    });
    if(sendError||!sent?.id)throw new Error(sendError?.message||'Email submission failed.');
    return json({ok:true});
  } catch(error){
    console.error('Password reset failed:',error.message);
    return json({error:'Unable to send a password link. Ask your administrator to check the email sender configuration.'},503);
  }
}

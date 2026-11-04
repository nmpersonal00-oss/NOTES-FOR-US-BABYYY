/** Petal Notes scheduled Web Push sender.
 * Run from Supabase Cron every 5 minutes. Users see NO calendar dates;
 * the local-day key here is only for once-per-day deduplication.
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY),
 * PETAL_CRON_TOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 * Deploy with JWT verification disabled. Requests authenticate with a private header.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.84.0';
import webpush from 'npm:web-push@3.6.7';

const env=(key:string)=>Deno.env.get(key)||'';
const secret=env('PETAL_CRON_TOKEN');
const url=env('SUPABASE_URL');
const serviceKey=env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY');
const vapidPublic=env('VAPID_PUBLIC_KEY');
const vapidPrivate=env('VAPID_PRIVATE_KEY');
const subject=env('VAPID_SUBJECT');
const scheduled:Record<string,string>={morning:'09:00',afternoon:'14:00',evening:'19:00'};

function localNow(timezone:string,at:Date){
  try{
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).formatToParts(at);
    const value=(key:string)=>parts.find(p=>p.type===key)?.value||'';
    return {day:`${value('year')}-${value('month')}-${value('day')}`,hour:Number(value('hour')),minute:Number(value('minute'))};
  }catch{return localNow('UTC',at);}
}
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json','cache-control':'no-store'}
});

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return response({error:'method not allowed'},405);
  if(!secret||req.headers.get('x-petal-secret')!==secret)return response({error:'unauthorized'},401);
  if(!url||!serviceKey||!vapidPublic||!vapidPrivate||!subject)return response({error:'Push secrets are not configured'},503);
  webpush.setVapidDetails(subject,vapidPublic,vapidPrivate);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const [notesResult,membersResult,subsResult]=await Promise.all([
    db.from('notes').select('id,room_id,title,body,repeat,remind_time,audience').neq('repeat','off'),
    db.from('room_members').select('room_id,user_id,role'),
    db.from('push_subscriptions').select('id,user_id,subscription,timezone')
  ]);
  if(notesResult.error||membersResult.error||subsResult.error){
    console.error(notesResult.error||membersResult.error||subsResult.error);
    return response({error:'Could not read reminder state'},500);
  }
  const members=(membersResult.data||[]) as Array<{room_id:string,user_id:string,role:string}>;
  const subscriptions=(subsResult.data||[]) as Array<{id:string,user_id:string,subscription:any,timezone:string}>;
  const relevant=new Map<string,Array<{id:string,user_id:string,subscription:any,timezone:string,role:string}>>();
  for(const member of members){
    const list=relevant.get(member.room_id)||[];
    for(const sub of subscriptions.filter(s=>s.user_id===member.user_id))list.push({...sub,role:member.role});
    relevant.set(member.room_id,list);
  }
  const at=new Date();let checked=0,sent=0,failed=0;
  for(const note of notesResult.data||[]){
    const target=note.repeat==='custom'?note.remind_time:scheduled[note.repeat];
    if(!target || !/^([01]\d|2[0-3]):[0-5]\d$/.test(target))continue;
    const [targetHour,targetMinute]=target.split(':').map(Number);
    for(const sub of relevant.get(note.room_id)||[]){
      if(note.audience!=='both'&&note.audience!==sub.role)continue;
      const local=localNow(sub.timezone||'UTC',at);
      // One-minute cron with 10-minute grace window for scheduling drift; one daily delivery per device.
      const elapsed=local.hour*60+local.minute-(targetHour*60+targetMinute);
      if(elapsed<0||elapsed>10)continue;
      checked++;
      const claimed=await db.from('push_deliveries').upsert({
        note_id:note.id,subscription_id:sub.id,local_day:local.day,status:'sending'
      },{onConflict:'note_id,subscription_id,local_day',ignoreDuplicates:true}).select('id');
      if(claimed.error){console.error('claim error',claimed.error);failed++;continue;}
      const deliveryId=claimed.data?.[0]?.id;
      if(!deliveryId)continue;
      try{
        await webpush.sendNotification(sub.subscription,JSON.stringify({
          title:String(note.title).slice(0,80),
          body:String(note.body||'Your scheduled reminder is here.').slice(0,350),
          tag:`petal-${note.id}`
        }),{TTL:3600,urgency:'normal'});
        await db.from('push_deliveries').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',deliveryId);
        sent++;
      }catch(error){
        failed++;
        const status=Number((error as {statusCode?:number}).statusCode||0);
        console.error('push failed',status,String(error));
        if(status===404||status===410){await db.from('push_subscriptions').delete().eq('id',sub.id);}
        // Releasing the failed claim permits next cron run to retry.
        await db.from('push_deliveries').delete().eq('id',deliveryId);
      }
    }
  }
  return response({checked,sent,failed});
});

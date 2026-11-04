import { createClient } from "npm:@supabase/supabase-js@2.84.0";
import webpush from "npm:web-push@3.6.7";

const projectUrl = Deno.env.get("SUPABASE_URL") || "";
const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const db = projectUrl && secretKey ? createClient(projectUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
const presets = {morning:"09:00",afternoon:"14:00",evening:"19:00"};

function localTime(timezone, now) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US",{timeZone:timezone || "UTC",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US",{timeZone:"UTC",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  }
  const find = k => parts.find(p=>p.type===k)?.value || "";
  return {day: find("year")+"-"+find("month")+"-"+find("day"),minutes:Number(find("hour"))*60+Number(find("minute"))};
}
const answer = (data,status=200) => Response.json(data,{status,headers:{"cache-control":"no-store"}});
Deno.serve(async request=>{
  if(request.method!=="POST") return answer({error:"Method not allowed"},405);
  if(!db) return answer({error:"Backend not configured"},503);
  // The same server-only Vault credentials used by the existing Wifey & Hubby
  // sender. Never return them to clients and never accept them from query args.
  const {data:keys,error:keysError} = await db.rpc("wh_server_push_secrets");
  if(keysError || !keys) return answer({error:"Push credentials unavailable"},503);
  if(!keys.wh_cron_secret || request.headers.get("x-cron-secret")!==keys.wh_cron_secret) return answer({error:"Unauthorized"},401);
  if(!keys.wh_vapid_public || !keys.wh_vapid_private) return answer({error:"Missing VAPID configuration"},503);
  webpush.setVapidDetails(keys.wh_vapid_subject || "https://github.com/nmpersonal00-oss/NOTES-FOR-US-BABYYY",keys.wh_vapid_public,keys.wh_vapid_private);
  const [notesResult,subsResult]=await Promise.all([
    db.from("petal_notes").select("id,user_id,title,body,repeat,remind_time,reminder_timezone").neq("repeat","off").limit(2000),
    db.from("petal_push_subscriptions").select("endpoint,user_id,subscription,timezone").eq("enabled",true).limit(2000)
  ]);
  if(notesResult.error || subsResult.error) {
    console.error("Petal query error",notesResult.error,subsResult.error);
    return answer({error:"Could not load reminders"},500);
  }
  const byUser = new Map();
  for(const sub of subsResult.data||[]) {
    const rows=byUser.get(sub.user_id)||[];
    rows.push(sub);byUser.set(sub.user_id,rows);
  }
  const now=new Date();
  let due=0,sent=0,failed=0;
  for(const note of notesResult.data||[]) {
    const when=note.repeat==="custom"?note.remind_time:presets[note.repeat];
    if(!when || !/^([01]\d|2[0-3]):[0-5]\d$/.test(when))continue;
    const [hour,minute]=when.split(":").map(Number);
    const scheduledMinute=hour*60+minute;
    // One canonical timezone for this shared reminder; all devices fire together.
    const clock=localTime(note.reminder_timezone || "America/Los_Angeles",now);
    const lag=clock.minutes-scheduledMinute;
    // The scheduler runs every minute; allow only a short retry window.
    if(lag<0 || lag>2)continue;
    // Separate deduplication claims for different daily reminder schedules,
    // so changing the time does not suppress the new reminder.
    const scheduleKey=[note.repeat,when,note.reminder_timezone||"America/Los_Angeles"].join("|");
    for(const sub of byUser.get(note.user_id)||[]) {
      due++;
      const {data:claim,error:claimError}=await db.from("petal_push_deliveries").upsert({
        note_id:note.id,endpoint:sub.endpoint,local_day:clock.day,schedule_key:scheduleKey,status:"sending"
      },{onConflict:"note_id,endpoint,local_day,schedule_key",ignoreDuplicates:true}).select("note_id");
      if(claimError){console.error("Claim failed",claimError);failed++;continue;}
      if(!claim?.length)continue;
      try {
        await webpush.sendNotification(sub.subscription,JSON.stringify({
          title:String(note.title).slice(0,80),
          body:String(note.body||"Your daily reminder is here.").slice(0,350),
          tag:"petal-"+note.id
        }),{TTL:3600,urgency:"normal"});
        await db.from("petal_push_deliveries").update({status:"sent",sent_at:new Date().toISOString()})
          .eq("note_id",note.id).eq("endpoint",sub.endpoint).eq("local_day",clock.day).eq("schedule_key",scheduleKey);
        sent++;
      } catch(error) {
        failed++;
        const code=Number(error?.statusCode||0);
        console.error("Web Push failed",code,String(error));
        if(code===404 || code===410) {
          await db.from("petal_push_subscriptions").update({enabled:false})
            .eq("endpoint",sub.endpoint);
        }
        await db.from("petal_push_deliveries").delete()
          .eq("note_id",note.id).eq("endpoint",sub.endpoint).eq("local_day",clock.day).eq("schedule_key",scheduleKey);
      }
    }
  }
  return answer({due,sent,failed});
});
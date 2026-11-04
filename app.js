/* Petal Notes — AI sticker art, shared Supabase login, and background Web Push. */
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const STORAGE_KEY='petal-notes-v2';
const OLD_STORAGE_KEY='petal-notes-v1';
const ART={book:'sticker-book.webp',snack:'sticker-snack.webp',vitamins:'sticker-vitamins.webp',letter:'sticker-letter.webp',bunny:'sticker-bunny.webp',bear:'sticker-bear.webp'};
const ui={notes:[],editingId:null,audience:'both',repeat:'morning',remind_time:null,sticker:'book',client:null,user:null,membership:null,inviteCode:'',working:false};
const cloudConfig=window.PETAL_CLOUD||{};
const cloudConfigured=!!(cloudConfig.url&&cloudConfig.publishableKey);
const repeatLabels={off:'No reminder',morning:'Morning',afternoon:'Afternoon',evening:'Evening',custom:'Daily'};
const safeText=value=>String(value??'');
const localId=()=>globalThis.crypto?.randomUUID?.()||`local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let toastTimer;
function validNote(note){return note&&typeof note.title==='string'&&typeof note.id==='string'&&!note.sample;}
function normalizeNote(note){
 const old={ '🌷':'book','🍓':'snack','☁️':'letter','🧸':'bear','💗':'letter','⭐':'bunny' };
 return {...note,sticker:ART[note.sticker]?note.sticker:(old[note.sticker]||'book'),remind_time:note.remind_time||null};
}
function loadLocal(){
 try{
   for(const key of [STORAGE_KEY,OLD_STORAGE_KEY]){
     const found=JSON.parse(localStorage.getItem(key)||'null');
     if(Array.isArray(found))return found.filter(validNote).map(normalizeNote);
   }
 }catch(error){console.warn('Cannot read saved notes',error);}
 return [];
}
function storeLocal(notes){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(notes));}catch(error){console.warn(error);toast('Could not save on this device.');}}
function toast(message){const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},3000)}
function feedback(message){$('#settings-message').textContent=message;}
function usingShared(){return !!(ui.client&&ui.user&&ui.membership);}
function render(){
 const host=$('#notes-list');host.replaceChildren();
 if(!ui.notes.length){
   const empty=document.createElement('div');empty.className='empty-state';
   const art=document.createElement('img');art.src='./assets/sticker-couple.webp';art.alt='Illustrated bunny and bear';
   const title=document.createElement('h2');title.textContent='No reminders yet';
   const body=document.createElement('p');body.textContent='Add your first reminder to receive a daily notification on both phones once connected.';
   const add=document.createElement('button');add.type='button';add.className='new-note-button';add.textContent='Add reminder';
   add.addEventListener('click',()=>openNote());
   empty.append(art,title,body,add);host.append(empty);return;
 }
 ui.notes.forEach((note,index)=>{
   const card=document.createElement('button');card.type='button';card.className='note-card';card.style.animationDelay=`${Math.min(index,10)*45}ms`;
   card.setAttribute('aria-label',`Edit ${note.title}`);
   const img=document.createElement('img');img.src=`./assets/${ART[note.sticker]||ART.book}`;img.alt='';img.className='note-sticker';
   const details=document.createElement('div');details.className='note-info';
   const title=document.createElement('div');title.className='note-title';title.textContent=note.title;
   const body=document.createElement('div');body.className='note-body';body.textContent=note.body||'';
   const meta=document.createElement('div');meta.className='note-meta';
   const when=document.createElement('span');when.className='tag time'+(note.repeat==='off'?'':' active');
   when.textContent=note.repeat==='custom'?`Daily ${formatTime(note.remind_time||'09:00')}`:(repeatLabels[note.repeat]||'Not scheduled');
   meta.append(when);details.append(title);if(note.body)details.append(body);details.append(meta);
   const chevron=document.createElement('span');chevron.className='edit-indicator';chevron.textContent='›';chevron.setAttribute('aria-hidden','true');
   card.append(img,details,chevron);card.addEventListener('click',()=>openNote(note));host.append(card);
 });
}
function formatTime(value){try{const [h,m]=value.split(':').map(Number);const hour=((h+11)%12)+1;return `${hour}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;}catch{return '9:00 AM';}}
function setChoice(group,value){$$('button[data-value]',group).forEach(btn=>{const selected=btn.dataset.value===value;btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));});}
function openModal(id){const dialog=document.getElementById(id);if(!dialog.open)dialog.showModal();}
function closeModal(id){const dialog=document.getElementById(id);if(dialog.open)dialog.close();}
function openNote(note=null){
 ui.editingId=note?.id??null;ui.audience='both';ui.repeat=note?.repeat&&note.repeat!=='off'?note.repeat:'morning';ui.sticker=ART[note?.sticker]?note.sticker:'book';ui.remind_time=note?.remind_time||'09:00';
 $('#note-modal-heading').textContent=note?'Edit reminder':'Add reminder';
 $('#note-title').value=note?.title||'';$('#note-body').value=note?.body||'';
 $('#custom-time').value=ui.remind_time;
 $('#custom-time-wrap').hidden=ui.repeat!=='custom';$('#delete-note').hidden=!note;
 setChoice($('#repeat-choice'),ui.repeat);setChoice($('#sticker-choice'),ui.sticker);
 openModal('note-dialog');
}
async function saveNote(event){
 event.preventDefault();if(ui.working)return;
 const title=$('#note-title').value.trim();const body=$('#note-body').value.trim();if(!title){toast('Please add a title.');return;}
 const existing=ui.notes.find(n=>n.id===ui.editingId);
 const next={title:title.slice(0,72),body:body.slice(0,500),repeat:ui.repeat,remind_time:ui.repeat==='custom'?$('#custom-time').value:null,sticker:ui.sticker,reminder_timezone:existing?.reminder_timezone||'America/Los_Angeles'};
 if(next.repeat==='custom'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.remind_time||'')){toast('Choose a valid daily time.');return;}
 ui.working=true;$('#save-note').disabled=true;
 try{
   if(usingShared()){
     if(existing){const {error}=await ui.client.from('petal_notes').update(next).eq('id',existing.id).eq('user_id',ui.user.id);if(error)throw error;}
     else{const {error}=await ui.client.from('petal_notes').insert({...next,user_id:ui.user.id});if(error)throw error;}
     await fetchNotes();
   }else{
     if(existing)ui.notes=ui.notes.map(n=>n.id===existing.id?{...n,...next}:n);
     else ui.notes.unshift({id:localId(),...next,created_at:new Date().toISOString()});
     storeLocal(ui.notes);render();
   }
   closeModal('note-dialog');toast('Reminder saved.');
 }catch(error){console.error(error);toast(`Save failed: ${safeText(error.message)}`);}
 finally{ui.working=false;$('#save-note').disabled=false;}
}
async function deleteNote(){
 if(!ui.editingId||ui.working)return;
 if(!confirm('Delete this reminder?'))return;
 ui.working=true;
 try{
   if(usingShared()){const {error}=await ui.client.from('petal_notes').delete().eq('id',ui.editingId).eq('user_id',ui.user.id);if(error)throw error;await fetchNotes();}
   else{ui.notes=ui.notes.filter(n=>n.id!==ui.editingId);storeLocal(ui.notes);render();}
   closeModal('note-dialog');toast('Reminder deleted.');
 }catch(error){toast(`Could not delete: ${safeText(error.message)}`);}
 finally{ui.working=false;}
}
async function startCloud(){
  $('#offline-panel').hidden=true;$('#cloud-panel').hidden=false;
  try{
    const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.84.0/+esm');
    ui.client=createClient(cloudConfig.url,cloudConfig.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await ui.client.auth.getUser();if(error && error.name!=='AuthSessionMissingError')console.warn(error);
    ui.user=data?.user||null;
    ui.client.auth.onAuthStateChange((event,session)=>{
      // Avoid querying Supabase synchronously inside its auth callback.
      setTimeout(()=>syncAuth(session?.user||null),0);
    });
    await syncAuth(ui.user);
  }catch(error){
    console.error('Cloud init failed',error);feedback('Could not connect to the cloud. Check configuration and your network.');
  }
}
let noteChannel=null;
let syncInFlight=null;
let syncInFlightFor=null;
async function syncAuth(user){
  const forUser=user?.id||null;
  if(syncInFlight && syncInFlightFor===forUser)return syncInFlight;
  syncInFlightFor=forUser;
  syncInFlight=performSync(user);
  try{return await syncInFlight;}
  finally{syncInFlight=null;}
}
async function performSync(user){
  if(!ui.client)return;
  if(noteChannel){await ui.client.removeChannel(noteChannel);noteChannel=null;}
  ui.user=user;ui.membership=user?{user_id:user.id}:null;
  $('#signed-out-panel').hidden=!!user;
  $('#signed-in-panel').hidden=!user;
  $('#push-panel').hidden=!user;
  if(!user){ui.notes=loadLocal();render();return;}
  $('#signed-in-email').textContent=user.email||'Signed in';
  await importLocalNotes();
  await fetchNotes();
  noteChannel=ui.client.channel('petal-reminders-'+user.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'petal_notes',filter:'user_id=eq.'+user.id},()=>fetchNotes())
    .subscribe();
  refreshPushStatus();
}
async function fetchNotes(){
  if(!usingShared())return;
  const userId=ui.user.id;
  const {data,error}=await ui.client.from('petal_notes')
    .select('id,title,body,repeat,remind_time,reminder_timezone,sticker,created_at')
    .eq('user_id',userId).order('created_at',{ascending:false});
  if(error){feedback('Could not sync reminders: '+error.message);return;}
  if(ui.user?.id!==userId)return;
  ui.notes=(data||[]).map(normalizeNote);render();
}
async function importLocalNotes(){
  if(!usingShared())return;
  const key='petal-imported-existing-account-'+ui.user.id;
  if(localStorage.getItem(key))return;
  const originals=loadLocal().filter(validNote);
  if(!originals.length){localStorage.setItem(key,'1');return;}
  const rows=originals.map(note=>({
    user_id:ui.user.id,title:safeText(note.title).slice(0,72),
    body:safeText(note.body).slice(0,500),
    repeat:note.repeat||'off',
    remind_time:note.remind_time||null,
    sticker:ART[note.sticker]?note.sticker:'book',
    reminder_timezone:note.reminder_timezone||'America/Los_Angeles'
  }));
  const {error}=await ui.client.from('petal_notes').insert(rows);
  if(error){feedback('Could not import saved reminders: '+error.message);return;}
  localStorage.setItem(key,'1');
  toast('Saved reminders are now synced.');
}
async function signIn(event){event.preventDefault();
  if(!ui.client)return;
  const email=$('#auth-email').value.trim(),password=$('#auth-password').value;
  feedback('Signing in…');
  const {error}=await ui.client.auth.signInWithPassword({email,password});
  feedback(error?error.message:'Signed in.');
}
function base64ToBytes(value){
  const base64=value.replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64+'='.repeat((4-base64.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function enablePush(){
  if(!usingShared()){feedback('Sign in with your existing Supabase account first.');return;}
  if(!cloudConfig.vapidPublicKey){feedback('The public push key is not configured yet. See the setup guide.');return;}
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){feedback('This browser does not support web push.');return;}
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  if(isIOS&&!installed){feedback('On iPhone: open in Safari, tap Share → Add to Home Screen, then launch the new icon and enable notifications there.');return;}
  try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){feedback('Notifications are not allowed. You can change this in your phone settings.');return;}
    const reg=await navigator.serviceWorker.ready;
    let subscription=await reg.pushManager.getSubscription();
    if(!subscription){subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(cloudConfig.vapidPublicKey)});}
    const details=subscription.toJSON();
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    const {error}=await ui.client.from('petal_push_subscriptions').upsert({user_id:ui.user.id,endpoint:subscription.endpoint,subscription:details,timezone,enabled:true,updated_at:new Date().toISOString()},{onConflict:'endpoint'});
    if(error)throw error;
    $('#push-status').textContent='Notifications are enabled on this device.';
    $('#enable-push').textContent='Notifications enabled';
    feedback('This phone is subscribed to reminders.');
  }catch(e){console.error(e);feedback(`Could not enable notifications: ${e.message}`);}
}
async function refreshPushStatus(){
  if(!('Notification'in window)||Notification.permission!=='granted'||!('serviceWorker'in navigator))return;
  try {const sub=await(await navigator.serviceWorker.ready).pushManager.getSubscription();if(sub){$('#push-status').textContent='This browser has a push subscription. Enable again if you switched accounts.';}}
  catch(e){console.warn(e);}
}
async function testNotification(){
  if(!('Notification'in window)||!('serviceWorker'in navigator)){feedback('This browser does not support notifications.');return;}
  if(Notification.permission!=='granted'){feedback('Enable notifications first.');return;}
  try{const reg=await navigator.serviceWorker.ready;await reg.showNotification('Petal Notes',{body:'This is a local notification test.',icon:'./assets/icon-192.png',badge:'./assets/icon-192.png',tag:'petal-test'});feedback('Local test sent! This checks phone notification display, not server delivery.');}
  catch(e){feedback('Local test failed: '+e.message);}
}


function attachEvents(){
 $('#hero-add').addEventListener('click',()=>openNote());
 $('#nav-add').addEventListener('click',()=>openNote());
 $('#nav-shared').addEventListener('click',()=>openModal('settings-dialog'));
 $('#open-settings').addEventListener('click',()=>openModal('settings-dialog'));
 $('#nav-home').addEventListener('click',()=>{closeModal('settings-dialog');closeModal('note-dialog');window.scrollTo({top:0,behavior:'smooth'});});
 $$('[data-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
 for(const [selector,key] of [['#repeat-choice','repeat'],['#sticker-choice','sticker']]){
  $$('#'+selector.slice(1)+' [data-value]').forEach(btn=>btn.addEventListener('click',()=>{
   ui[key]=btn.dataset.value;setChoice($(selector),ui[key]);
   if(key==='repeat')$('#custom-time-wrap').hidden=ui.repeat!=='custom';
  }));
 }
 $('#note-form').addEventListener('submit',saveNote);
 $('#delete-note').addEventListener('click',deleteNote);
 $('#auth-form').addEventListener('submit',signIn);
 $('#sign-out').addEventListener('click',async()=>{await ui.client?.auth.signOut();feedback('Signed out on this phone.');});
 $('#enable-push').addEventListener('click',enablePush);
 $('#test-push').addEventListener('click',testNotification);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&usingShared())fetchNotes();});
 window.addEventListener('online',()=>{if(usingShared())fetchNotes();});
}
function init(){
 attachEvents();ui.notes=loadLocal();render();
 if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
   navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('Service worker unavailable',error));
 }
 if(cloudConfigured)startCloud();else feedback('Cloud connection is not configured.');
}
init();

const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Elem {
 constructor(tag='div'){this.tag=tag;this.children=[];this.handlers={};this.style={};this.dataset={};this.hidden=false;this.value='';this.textContent='';this.open=false;this.attributes={};this.className='';this.querySelectorAll=()=>[];this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};}
 addEventListener(t,cb){this.handlers[t]=cb;}
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=items}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k]}
 focus(){}
 showModal(){this.open=true}
 close(){this.open=false}
}
const ids={};const byId=id=>ids[id]??(ids[id]=new Elem());
const filterValues=['all','both','mine','reminders'];
const configs={'audience-choice':['wife','hubby','both'],'repeat-choice':['off','morning','afternoon','evening','custom'],'sticker-choice':['book','snack','vitamins','letter','bunny','bear']};
const buttonsFor={};
for(const [id,values] of Object.entries(configs)){buttonsFor[id]=values.map(value=>{let e=new Elem('button');e.dataset.value=value;return e})}
for(const [id,buttons] of Object.entries(buttonsFor))byId(id).querySelectorAll=()=>buttons;
const filters=filterValues.map(value=>{let e=new Elem('button');e.dataset.filter=value;return e});
const closeButtons=['note-dialog','settings-dialog'].map(id=>{let e=new Elem('button');e.dataset.close=id;return e});
const document={
 querySelector:s=>s.startsWith('#')?byId(s.slice(1)):null,
 querySelectorAll:s=>{if(s==='.filter')return filters;if(s==='[data-close]')return closeButtons;if(s.startsWith('#')&&s.endsWith(' [data-value]'))return buttonsFor[s.slice(1).split(' ')[0]]||[];return[]},
 createElement:tag=>new Elem(tag),
 getElementById:byId,
 addEventListener:()=>{},
};
const storage=new Map();const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
const context={console,document,localStorage,window:{PETAL_CLOUD:{},scrollTo:()=>{},addEventListener:()=>{}},navigator:{},location:{protocol:'file:',hostname:''},crypto:{randomUUID:()=>'id-test'},setTimeout,clearTimeout,confirm:()=>true,structuredClone,Intl,Date,Promise};
vm.createContext(context);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../app.js'),'utf8'),context);
(async()=>{
 assert.equal(byId('notes-list').children.length,1,'empty state shown');
 await context.openNote();
 assert(byId('note-dialog').open,'editor opens');
 byId('note-title').value='Pray before breakfast';byId('note-body').value='Pray before snacks';
 vm.runInContext("ui.repeat='custom';ui.remind_time='08:30'",context);byId('custom-time').value='08:30';
 await context.saveNote({preventDefault(){}});
 let saved=JSON.parse(storage.get('petal-notes-v2'));
 assert.equal(saved.length,1);assert.equal(saved[0].repeat,'custom');assert.equal(saved[0].remind_time,'08:30');
 assert.equal(byId('notes-list').children.length,1,'one card');
 context.openNote(saved[0]);assert.equal(byId('note-title').value,'Pray before breakfast');
 byId('note-title').value='Morning prayer';await context.saveNote({preventDefault(){}});
 saved=JSON.parse(storage.get('petal-notes-v2'));assert.equal(saved[0].title,'Morning prayer');
 vm.runInContext("ui.filter='reminders'",context);context.render();assert.equal(byId('notes-list').children.length,1);
 context.openNote(saved[0]);await context.deleteNote();assert.deepEqual(JSON.parse(storage.get('petal-notes-v2')),[]);
 console.log('PASS: application initialized, empty state, note editor, save, custom reminder time, update, filter, delete, local persistence');
})().catch(e=>{console.error(e.stack);process.exitCode=1});

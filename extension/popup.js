const q=document.getElementById('q'), results=document.getElementById('results'), status=document.getElementById('status');
let conversations=[];

document.getElementById('file').addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f)return;
  const text=await f.text();
  conversations=parseInput(text,f.name);
  await chrome.storage.local.set({conversations});
  status.textContent=`Imported ${conversations.length} conversations locally.`;
  render(conversations.slice(0,20));
});
document.getElementById('search').addEventListener('click', run);
q.addEventListener('keydown',e=>{if(e.key==='Enter')run()});

(async()=>{const x=await chrome.storage.local.get('conversations'); conversations=x.conversations||[]; status.textContent=conversations.length?`${conversations.length} conversations indexed locally.`:'Import a Claude export to begin.'})();

function parseInput(text,name){
  try{
    const data=JSON.parse(text);
    const arr=Array.isArray(data)?data:(data.conversations||data.chats||data.items||[]);
    if(Array.isArray(arr)) return arr.map((x,i)=>({
      title:x.name||x.title||x.subject||`Conversation ${i+1}`,
      date:x.created_at||x.createdAt||x.updated_at||x.updatedAt||'',
      url:x.url||x.share_url||'',
      text:JSON.stringify(x)
    }));
  }catch{}
  return text.split(/\n\s*\n/).filter(Boolean).map((x,i)=>({title:`Imported note ${i+1}`,date:'',url:'',text:x}));
}
function score(c,terms){
  const hay=(c.title+' '+c.text).toLowerCase(); let s=0;
  for(const t of terms){if(hay.includes(t))s+=hay.split(t).length-1}
  return s;
}
function run(){
  const terms=q.value.toLowerCase().split(/\s+/).filter(x=>x.length>2);
  if(!terms.length){render(conversations.slice(0,20));return}
  const ranked=conversations.map(c=>({c,s:score(c,terms)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,20).map(x=>x.c);
  status.textContent=`Found ${ranked.length} matching conversations.`;
  render(ranked);
}
function render(items){
  results.innerHTML=items.length?items.map(c=>{
    const raw=(c.text||'').replace(/\s+/g,' ');
    const lower=raw.toLowerCase(), term=(q.value.toLowerCase().split(/\s+/).find(t=>t.length>2)||'');
    let i=term?lower.indexOf(term):0; i=i<0?0:i;
    const snippet=raw.slice(Math.max(0,i-90),i+220);
    return `<div class="result"><div class="title">${esc(c.title)}</div><div class="meta">${esc(c.date||'Imported conversation')}</div><div class="snippet">${esc(snippet)}${c.url?`<br><a href="${esc(c.url)}" target="_blank">Open source</a>`:''}</div></div>`
  }).join(''):'<div class="empty">No results yet.</div>';
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

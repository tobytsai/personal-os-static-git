/* Personal OS · YouTube channels, watch queue and public rankings. */
(() => {
  "use strict";
  const STORAGE_KEY = "toby-youtube-workspace-v1";
  const FILE_VERSION = 1;
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_CHANNELS = 300, MAX_QUEUE = 1200;
  const CHANNEL_CATS = ["藝術／膠彩","裱框／畫廊","社區營造","自學／教育","AI／科技","財經／商業","旅遊／生活","娛樂／其他"];
  const VIDEO_CATS = ["藝術與設計","社區營造","親子自學","AI 科技","財經商業","旅行生活","紀錄與新聞","娛樂音樂","其他"];
  const $ = id => document.getElementById(id);
  if (!$("yt-channel-list") || !$("yt-queue-list")) return;

  function uid() { return (crypto && typeof crypto.randomUUID === "function") ? crypto.randomUUID() : "yt-" + Date.now() + "-" + Math.random().toString(36).slice(2,10); }
  function clean(input, max=260) { return String(input || "").trim().slice(0,max); }
  function validDate(input) { return typeof input === "string" && /^\d{4}-\d{2}-\d{2}T/.test(input) ? input : new Date().toISOString(); }
  function normalUrl(raw) {
    let txt = clean(raw,2048);
    if (txt.startsWith("@")) txt = "https://www.youtube.com/" + txt;
    if (/^(?:www\.|m\.|music\.)?youtube\.com\//i.test(txt) || /^youtu\.be\//i.test(txt)) txt = "https://" + txt;
    try {
      const u = new URL(txt);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      if (!["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com","youtu.be","www.youtu.be"].includes(u.hostname.toLowerCase())) return null;
      return u;
    } catch (_) { return null; }
  }
  function parseChannel(value) {
    const u = normalUrl(value);
    if (!u || !u.hostname.includes("youtube.com")) return null;
    const bits = u.pathname.split("/").filter(Boolean);
    if (bits.length < 1) return null;
    let segment = bits[0];
    if (segment.startsWith("@") && /^@[a-z0-9._-]{2,100}$/i.test(segment)) {
      return "https://www.youtube.com/" + segment;
    }
    if (["channel","user","c"].includes(segment) && bits[1] && /^[a-z0-9_-]{2,100}$/i.test(bits[1])) {
      return "https://www.youtube.com/" + segment + "/" + bits[1];
    }
    return null;
  }
  function parseVideo(value) {
    const u = normalUrl(value);
    if (!u) return null;
    const bits = u.pathname.split("/").filter(Boolean);
    const host = u.hostname.toLowerCase();
    let id = "";
    if (host.endsWith("youtu.be")) id = bits[0] || "";
    else if (bits[0] === "watch") id = u.searchParams.get("v") || "";
    else if (["shorts","live","embed"].includes(bits[0])) id = bits[1] || "";
    if (/^[a-z0-9_-]{11}$/i.test(id)) {
      return {type:"video",videoId:id,url:"https://www.youtube.com/watch?v=" + id};
    }
    const list = u.searchParams.get("list") || "";
    if ((bits[0] === "playlist" || bits[0] === "watch") && /^[a-z0-9_-]{2,150}$/i.test(list)) {
      return {type:"playlist",videoId:"",url:"https://www.youtube.com/playlist?list=" + encodeURIComponent(list)};
    }
    return null;
  }
  function makeChannel(raw) {
    const url = parseChannel(raw.url);
    if (!url) return null;
    return {
      id:clean(raw.id,100) || uid(),
      title:clean(raw.title,140) || "我的頻道",
      url,
      category:CHANNEL_CATS.includes(raw.category) ? raw.category : "娛樂／其他",
      notes:clean(raw.notes,1200),
      createdAt:validDate(raw.createdAt),
      updatedAt:validDate(raw.updatedAt || raw.createdAt)
    };
  }
  function makeQueueItem(raw) {
    const video = parseVideo(raw.url);
    if (!video) return null;
    return {
      id:clean(raw.id,100) || uid(),
      title:clean(raw.title,190) || (video.type === "video" ? "待播影片 · " + video.videoId : "我的播放清單"),
      url:video.url,type:video.type,videoId:video.videoId,
      category:VIDEO_CATS.includes(raw.category) ? raw.category : "其他",
      notes:clean(raw.notes,1200),
      status:["later","watching","done"].includes(raw.status) ? raw.status : "later",
      createdAt:validDate(raw.createdAt),
      updatedAt:validDate(raw.updatedAt || raw.createdAt)
    };
  }
  function blankState(){return {version:FILE_VERSION,channels:[],queue:[],trendMemo:""};}
  function loadState(){
    const state=blankState();
    try {
      const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
      if (Array.isArray(raw.channels)) state.channels=raw.channels.slice(0,MAX_CHANNELS).map(makeChannel).filter(Boolean);
      if (Array.isArray(raw.queue)) state.queue=raw.queue.slice(0,MAX_QUEUE).map(makeQueueItem).filter(Boolean);
      state.trendMemo=clean(raw.trendMemo,2000);
    } catch (_) {}
    return state;
  }
  let state=loadState(),channelEditing="",queueEditing="",queueFilter="all";
  const msg=(node,text)=>{if($(node)) $(node).textContent=text;};
  const saveState=()=>{
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      msg("yt-save-status","已儲存在這台裝置的瀏覽器，尚未連接 YouTube 或雲端同步。");
      return true;
    } catch (_) {
      msg("yt-save-status","⚠️ 瀏覽器不允許儲存資料，請匯出備份，避免資料遺失。");
      return false;
    }
  };
  function element(tag, cls, txt){
    const e=document.createElement(tag);
    if (cls) e.className=cls;
    if (txt!==undefined) e.textContent=String(txt);
    return e;
  }
  function appendAction(host,text,action,id,optionalClass="") {
    const b=element("button",optionalClass,text); b.type="button";
    b.dataset.ytAction=action; b.dataset.ytId=id;
    host.appendChild(b);
    return b;
  }
  function openLink(text,url,klass=""){
    const link=element("a",klass,text);
    link.href=url;link.target="_blank";link.rel="noopener noreferrer";
    return link;
  }
  function setOptions() {
    for (const [id,values] of [["yt-channel-category",CHANNEL_CATS],["yt-queue-category",VIDEO_CATS]]) {
      const select=$(id);
      values.forEach(v=>{const opt=element("option","",v);opt.value=v;select.appendChild(opt);});
    }
  }
  function resetChannelForm() {
    $("yt-channel-form").reset();channelEditing="";$("yt-channel-form").hidden=true;
    $("yt-channel-save").textContent="＋ 新增頻道";
    $("yt-channel-category").value=CHANNEL_CATS[0];
  }
  function showChannelForm(channel=null) {
    const form=$("yt-channel-form");
    form.hidden=false;channelEditing=channel?.id || "";
    $("yt-channel-name").value=channel?.title || "";
    $("yt-channel-url").value=channel?.url || "";
    $("yt-channel-category").value=channel?.category || CHANNEL_CATS[0];
    $("yt-channel-notes").value=channel?.notes || "";
    $("yt-channel-save").textContent=channel?"儲存頻道修改":"＋ 新增頻道";
    form.scrollIntoView({behavior:"smooth",block:"center"});
    $("yt-channel-name").focus();
  }
  $("yt-channel-open").addEventListener("click",()=>showChannelForm());
  $("yt-channel-cancel").addEventListener("click",resetChannelForm);
  $("yt-channel-form").addEventListener("submit",e=>{
    e.preventDefault();
    const url=parseChannel($("yt-channel-url").value);
    if (!url) {msg("yt-channel-notice","請貼上有效的 YouTube 頻道網址，例如 https://www.youtube.com/@channelname");return;}
    const duplicate=state.channels.find(x=>x.url.toLowerCase()===url.toLowerCase() && x.id!==channelEditing);
    if (duplicate) {msg("yt-channel-notice","此頻道已在追蹤清單，不需要重複加入。");return;}
    if (!channelEditing && state.channels.length>=MAX_CHANNELS){msg("yt-channel-notice","頻道上限為 "+MAX_CHANNELS+"，請先整理。");return;}
    const previous=state.channels.find(x=>x.id===channelEditing);
    const created=makeChannel({id:previous?.id||uid(),title:$("yt-channel-name").value,url,
      category:$("yt-channel-category").value,notes:$("yt-channel-notes").value,
      createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
    if (previous) state.channels=state.channels.map(x=>x.id===previous.id?created:x);
    else state.channels.unshift(created);
    saveState();resetChannelForm();renderChannels();msg("yt-channel-notice","頻道已加入你的私人追蹤清單（非 YouTube 訂閱）。");
  });
  function renderChannels(){
    const term=$("yt-channel-search").value.trim().toLocaleLowerCase();
    const filtered=state.channels.filter(x=>(x.title+" "+x.category+" "+x.notes+" "+x.url).toLocaleLowerCase().includes(term));
    msg("yt-channel-count","已追蹤 "+state.channels.length+" 個頻道，顯示 "+filtered.length+" 個");
    const host=$("yt-channel-list");host.replaceChildren();
    if (!filtered.length){
      host.appendChild(element("div","yt-empty",state.channels.length?"找不到符合搜尋的頻道。":"目前尚未加入自己的頻道。按「＋ 新增頻道」，貼上頻道網址與自訂分類即可建立。"));
      return;
    }
    filtered.forEach(x=>{
      const card=element("article","yt-personal-card");
      const head=element("div","yt-personal-head");
      head.appendChild(element("span","yt-emoji","📺"));
      const body=element("div");
      body.appendChild(element("strong","yt-personal-title",x.title));
      body.appendChild(element("span","yt-personal-kind",x.category));
      head.appendChild(body);card.appendChild(head);
      if(x.notes) card.appendChild(element("p","yt-personal-notes",x.notes));
      const actions=element("div","yt-card-actions");
      actions.appendChild(openLink("▶ 開啟頻道",x.url,"yt-watch"));
      appendAction(actions,"編輯","edit-channel",x.id);
      appendAction(actions,"刪除","remove-channel",x.id,"yt-danger");
      card.appendChild(actions);host.appendChild(card);
    });
  }
  $("yt-channel-search").addEventListener("input",renderChannels);
  $("yt-channel-list").addEventListener("click",e=>{
    const b=e.target.closest("button[data-yt-action]");if(!b)return;
    const item=state.channels.find(x=>x.id===b.dataset.ytId);if(!item)return;
    if(b.dataset.ytAction==="edit-channel"){showChannelForm(item);}
    if(b.dataset.ytAction==="remove-channel"){
      if(!confirm("確定要從啟動器刪除「"+item.title+"」？不會影響 YouTube 真正的訂閱。"))return;
      state.channels=state.channels.filter(x=>x.id!==item.id);saveState();renderChannels();
      msg("yt-channel-notice","已從啟動器移除頻道。");
    }
  });

  function resetQueueForm(){
    $("yt-queue-form").reset();queueEditing="";$("yt-queue-form").hidden=true;
    $("yt-queue-save").textContent="＋ 加入待播清單";
    $("yt-queue-category").value=VIDEO_CATS[0];
  }
  function showQueueForm(item=null){
    $("yt-queue-form").hidden=false;queueEditing=item?.id || "";
    $("yt-queue-title").value=item?.title || "";
    $("yt-queue-url").value=item?.url || "";
    $("yt-queue-category").value=item?.category || VIDEO_CATS[0];
    $("yt-queue-notes").value=item?.notes || "";
    $("yt-queue-save").textContent=item?"儲存影片修改":"＋ 加入待播清單";
    $("yt-queue-form").scrollIntoView({behavior:"smooth",block:"center"});
    $("yt-queue-url").focus();
  }
  $("yt-queue-open").addEventListener("click",()=>showQueueForm());
  $("yt-queue-cancel").addEventListener("click",resetQueueForm);
  $("yt-queue-form").addEventListener("submit",e=>{
    e.preventDefault();
    const video=parseVideo($("yt-queue-url").value);
    if(!video){msg("yt-queue-notice","請貼上有效的影片、Shorts、直播或播放清單網址。");return;}
    const duplicate=state.queue.find(x=>x.url===video.url && x.id!==queueEditing);
    if(duplicate){msg("yt-queue-notice","這部影片或播放清單已在待播清單裡。");return;}
    if(!queueEditing && state.queue.length>=MAX_QUEUE){msg("yt-queue-notice","待播清單已達上限，請先整理。");return;}
    const previous=state.queue.find(x=>x.id===queueEditing);
    const item=makeQueueItem({id:previous?.id||uid(),title:$("yt-queue-title").value,url:video.url,
      category:$("yt-queue-category").value,notes:$("yt-queue-notes").value,
      status:previous?.status||"later",createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
    if(previous) state.queue=state.queue.map(x=>x.id===previous.id?item:x);
    else state.queue.unshift(item);
    saveState();resetQueueForm();renderQueue();msg("yt-queue-notice","已加入自訂待播清單（不會自動加入 YouTube 的稍後觀看）。");
  });
  function renderQueue(){
    const total=state.queue.length;
    const counts={later:0,watching:0,done:0};
    state.queue.forEach(x=>counts[x.status]++);
    msg("yt-queue-count","合計 "+total+" 筆");
    $("yt-queue-stats").replaceChildren();
    [["⏳ 待看",counts.later],["▶ 觀看中",counts.watching],["✓ 已看完",counts.done]].forEach(([name,n])=>{
      $("yt-queue-stats").appendChild(element("span","",name+" "+n));
    });
    $("yt-queue-filters").querySelectorAll("button[data-filter]").forEach(btn=>{
      btn.setAttribute("aria-pressed",String(btn.dataset.filter===queueFilter));
      const count=btn.dataset.filter==="all"?total:counts[btn.dataset.filter];
      btn.textContent=({"all":"全部","later":"待播","watching":"觀看中","done":"已看"}[btn.dataset.filter]||"") + " · " + count;
    });
    const term=$("yt-queue-search").value.trim().toLocaleLowerCase();
    const filtered=state.queue.filter(x=>(queueFilter==="all"||x.status===queueFilter)&&
      (x.title+" "+x.category+" "+x.notes).toLocaleLowerCase().includes(term));
    const ordering={later:0,watching:1,done:2};
    filtered.sort((a,b)=>ordering[a.status]-ordering[b.status] || b.createdAt.localeCompare(a.createdAt));
    const host=$("yt-queue-list");host.replaceChildren();
    if(!filtered.length){host.appendChild(element("div","yt-empty",
      total?"沒有符合目前搜尋或狀態篩選的影片。":"還沒有影片。把 YouTube 影片、Shorts 或播放清單網址貼上來，之後可以標記待看、觀看中與已看完。"));return;}
    filtered.forEach(item=>{
      const card=element("article","yt-personal-card");
      if(item.type==="video"){
        const img=element("img","yt-video-thumb");
        img.src="https://i.ytimg.com/vi/"+item.videoId+"/hqdefault.jpg";
        img.alt=item.title+" 影片縮圖";img.loading="lazy";img.referrerPolicy="no-referrer";
        card.appendChild(img);
      }
      const head=element("div","yt-personal-head");
      if(item.type!=="video")head.appendChild(element("span","yt-emoji","📂"));
      const body=element("div");body.appendChild(element("strong","yt-personal-title",item.title));
      body.appendChild(element("span","yt-personal-kind",item.category+(item.type==="playlist"?" · 播放清單":" · YouTube 影片")));
      head.appendChild(body);card.appendChild(head);
      const line=element("div","yt-checkline");
      const status={"later":"待播","watching":"觀看中","done":"已看完"}[item.status];
      line.appendChild(element("span","yt-label "+item.status,status));
      line.appendChild(document.createTextNode("　加入："+new Date(item.createdAt).toLocaleDateString("zh-TW")));
      card.appendChild(line);
      if(item.notes)card.appendChild(element("p","yt-personal-notes",item.notes));
      const actions=element("div","yt-card-actions");
      const play=openLink("▶ 播放影片",item.url,"yt-watch");
      play.dataset.ytAction="play";play.dataset.ytId=item.id;
      actions.appendChild(play);
      appendAction(actions,item.status==="done"?"↩ 再看一次":"✓ 標記已看","toggle-done",item.id);
      appendAction(actions,"編輯","edit-queue",item.id);
      appendAction(actions,"刪除","remove-queue",item.id,"yt-danger");
      card.appendChild(actions);host.appendChild(card);
    });
  }
  $("yt-queue-search").addEventListener("input",renderQueue);
  $("yt-queue-filters").addEventListener("click",e=>{
    const button=e.target.closest("button[data-filter]");
    if(!button)return;queueFilter=button.dataset.filter;renderQueue();
  });
  $("yt-queue-list").addEventListener("click",e=>{
    const target=e.target.closest("[data-yt-action]");
    if(!target)return;
    const item=state.queue.find(x=>x.id===target.dataset.ytId);
    if(!item)return;
    const action=target.dataset.ytAction;
    if(action==="play"){
      if(item.status==="later"){item.status="watching";item.updatedAt=new Date().toISOString();saveState();renderQueue();}
      return;
    }
    if(action==="edit-queue"){showQueueForm(item);return;}
    if(action==="toggle-done"){
      item.status=item.status==="done"?"later":"done";
      item.updatedAt=new Date().toISOString();saveState();renderQueue();return;
    }
    if(action==="remove-queue"){
      if(!confirm("確定刪除「"+item.title+"」？這不會移除 YouTube 原生播放清單。"))return;
      state.queue=state.queue.filter(x=>x.id!==item.id);saveState();renderQueue();msg("yt-queue-notice","已從啟動器移除。");
    }
  });

  const localMemo=$("yt-trend-memo");
  localMemo.value=state.trendMemo || "";
  $("yt-memo-save").addEventListener("click",()=>{
    state.trendMemo=clean(localMemo.value,2000);
    saveState();msg("yt-memo-status","趨勢觀察筆記已儲存在本機。");
  });

  $("yt-backup-export").addEventListener("click",()=>{
    const json=JSON.stringify({app:"Toby Personal OS / YouTube Workspace",version:FILE_VERSION,exportedAt:new Date().toISOString(),
      channels:state.channels,queue:state.queue,trendMemo:state.trendMemo},null,2);
    const blob=new Blob([json],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download="toby-youtube-workspace-"+new Date().toLocaleDateString("en-CA")+".json";
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    msg("yt-backup-notice","已輸出 JSON 備份，可在另一台裝置用「匯入」還原。");
  });
  $("yt-backup-import").addEventListener("click",()=>$("yt-backup-file").click());
  $("yt-backup-file").addEventListener("change",async e=>{
    const file=e.target.files?.[0];e.target.value="";
    if(!file)return;
    if(file.size>MAX_FILE_BYTES){msg("yt-backup-notice","檔案超過 2MB，為安全起見不匯入。");return;}
    try {
      const input=JSON.parse(await file.text());
      if(!input || input.app!=="Toby Personal OS / YouTube Workspace" ||
          !Array.isArray(input.channels) || !Array.isArray(input.queue)){
        throw new Error("格式不是 YouTube 啟動器的 JSON 備份。");
      }
      const channels=input.channels.slice(0,MAX_CHANNELS).map(makeChannel).filter(Boolean);
      const queue=input.queue.slice(0,MAX_QUEUE).map(makeQueueItem).filter(Boolean);
      let channelAdded=0,queueAdded=0;
      const seenChannels=new Set(state.channels.map(x=>x.url.toLowerCase()));
      const seenVideos=new Set(state.queue.map(x=>x.url));
      for(const item of channels){
        if(state.channels.length>=MAX_CHANNELS)break;
        if(seenChannels.has(item.url.toLowerCase()))continue;
        seenChannels.add(item.url.toLowerCase());state.channels.push({...item,id:uid()});channelAdded++;
      }
      for(const item of queue){
        if(state.queue.length>=MAX_QUEUE)break;
        if(seenVideos.has(item.url))continue;
        seenVideos.add(item.url);state.queue.push({...item,id:uid()});queueAdded++;
      }
      if(typeof input.trendMemo==="string" && !state.trendMemo) {
        state.trendMemo=clean(input.trendMemo,2000); localMemo.value=state.trendMemo;
      }
      saveState();renderChannels();renderQueue();
      msg("yt-backup-notice","匯入完成：新增 "+channelAdded+" 個頻道、"+queueAdded+" 個影片／清單；重複連結已略過。");
    } catch(err){msg("yt-backup-notice","無法匯入："+err.message);}
  });

  function prettyViews(raw) {
    const n=Number(raw);
    return Number.isFinite(n) && n>=0 ? n.toLocaleString("zh-TW")+" 次觀看" : "";
  }
  async function loadTaiwanRanking(){
    const host=$("yt-taiwan-preview"),date=$("yt-taiwan-date");host.replaceChildren();
    try {
      const r=await fetch("../data/youtube-taiwan-latest.json?view="+Date.now(),{cache:"no-store"});
      if(!r.ok)throw new Error("HTTP "+r.status);
      const data=await r.json();
      if(!Array.isArray(data.items)||!data.items.length){
        date.textContent="尚未啟用自動採集";
        host.appendChild(element("div","yt-muted-panel","YouTube 台灣熱門影片自動榜單尚未設定 API 金鑰。上方的官方／第三方排行榜連結已可使用；設定 GitHub Actions Secret「YOUTUBE_API_KEY」後，才會每天產生有來源的台灣榜單。"));
        return;
      }
      date.textContent="採集日期："+(data.date_taipei||"未知")+"　·　 "+(data.scope||"台灣音樂／電影／遊戲熱門影片");
      const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      if(data.date_taipei!==today){
        host.appendChild(element("div","yt-muted-panel","以下是歷史快照（"+data.date_taipei+"），不是今天的即時排行。"));
      }
      data.items.slice(0,10).forEach(row=>{
        const id=String(row.video_id||"");
        if(!/^[a-z0-9_-]{11}$/i.test(id))return;
        const a=openLink("","https://www.youtube.com/watch?v="+id,"yt-rank-row");
        a.appendChild(element("span","yt-rank-no","#"+row.rank));
        const img=element("img","yt-rank-thumb");
        img.src="https://i.ytimg.com/vi/"+id+"/mqdefault.jpg";img.alt="影片縮圖";img.loading="lazy";
        a.appendChild(img);
        const content=element("span","yt-rank-row-content");
        content.appendChild(element("strong","",row.title||"未命名影片"));
        content.appendChild(element("small","",(row.channel_title||"YouTube")+(row.view_count?" · "+prettyViews(row.view_count):"")));
        a.appendChild(content);
        if(Number.isFinite(row.rank_change) && row.rank_change!==0){
          a.appendChild(element("span","yt-rank-move",(row.rank_change>0?"↑":"↓")+Math.abs(row.rank_change)));
        }
        host.appendChild(a);
      });
    } catch(_){
      date.textContent="目前沒有可驗證的資料快照";
      host.appendChild(element("div","yt-muted-panel","暫時無法讀取台灣 YouTube 排行快照。可先開啟上方已核實的來源連結。"));
    }
  }

  function initFloating(){
    const button=$("yt-floating-jump");
    const menu=$("yt-floating-topics");
    const close=$("yt-floating-close");
    if(!button || !menu || !close)return;
    function setOpen(shouldOpen,restoreFocus=false){
      menu.hidden=!shouldOpen;
      button.setAttribute("aria-expanded",String(shouldOpen));
      button.setAttribute("aria-label",shouldOpen?"關閉影音主題選單":"開啟影音主題選單");
      if(shouldOpen){
        const first=menu.querySelector("a[href]");
        if(first)first.focus();
      } else if(restoreFocus && !button.hidden){
        button.focus();
      }
    }
    function refresh(){
      const show=window.scrollY>=400;
      button.hidden=!show;
      if(!show && !menu.hidden)setOpen(false);
    }
    button.addEventListener("click",()=>setOpen(menu.hidden));
    close.addEventListener("click",()=>setOpen(false,true));
    menu.addEventListener("click",event=>{
      if(event.target.closest("a[href]"))setOpen(false);
    });
    document.addEventListener("click",event=>{
      if(!menu.hidden && !menu.contains(event.target) && !button.contains(event.target))setOpen(false);
    });
    document.addEventListener("keydown",event=>{
      if(event.key==="Escape" && !menu.hidden){
        setOpen(false,true);
        event.stopPropagation();
      }
    });
    window.addEventListener("scroll",refresh,{passive:true});
    window.addEventListener("resize",refresh,{passive:true});
    refresh();
  }
  // 每台裝置首次加入一次；保留既有頻道，刪除後不會重新建立。
  try {
    const seedKey="toby-youtube-laorou-v1";
    const channelUrl="https://www.youtube.com/channel/UC5DGiN7-nlPno2kjHUdcdCg";
    if(!localStorage.getItem(seedKey)){
      const exists=state.channels.some(x=>x.url.toLowerCase()===channelUrl.toLowerCase());
      if(exists) localStorage.setItem(seedKey,"1");
      else if(state.channels.length<MAX_CHANNELS){
        const item=makeChannel({title:"老肉雜談",url:channelUrl,category:"娛樂／其他"});
        if(item){state.channels.unshift(item);if(saveState())localStorage.setItem(seedKey,"1");}
      }
    }
  } catch (_) {}
  setOptions();
  renderChannels();renderQueue();
  loadTaiwanRanking();
  initFloating();
})();

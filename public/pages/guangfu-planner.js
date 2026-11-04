/* 光復土築夢計畫｜筆記、行程與任務到期日月曆。與 guangfu-dream-project.html 共用本機資料 KEY。 */
"use strict";
(function(){
  const isoPattern=/^\d{4}-\d{2}-\d{2}$/;
  const noteCategories=["申請資料","研究觀察","光復土採樣","材料與安全","顏料製程","DIY與教案","會議訪談","成果紀錄","其他"];
  let calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  let selectedDay=localDay(new Date());
  let calendarView=data.calendarView==="week"?"week":"month";
  let editingNoteId="";
  let editingEventId="";
  function localDay(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
  function validDay(s){
    if(!isoPattern.test(String(s||"")))return false;
    const y=+s.slice(0,4),m=+s.slice(5,7),day=+s.slice(8,10);
    const dt=new Date(y,m-1,day);
    return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===day;
  }
  function safeDate(s){return validDay(s)?s:""}
  function niceDate(s){return validDay(s)?s.replace(/-/g,"/"):"尚未排定"}
  function ensurePlanner(){
    if(!Array.isArray(data.notes))data.notes=[];
    if(!Array.isArray(data.events))data.events=[];
    if(!data.tasks||typeof data.tasks!=="object")data.tasks={};
  }
  function taskDeadline(t){const r=record(t.id);return safeDate(Object.prototype.hasOwnProperty.call(r,"dueDate")?r.dueDate:t.due)}
  function updateTask(id,field,value){
    const t=allTasks().find(x=>x.id===id);if(!t)return;
    const r=data.tasks[id]||{};
    if(field==="dueDate"&&!(!value||validDay(value))){alert("請選擇有效日期");return}
    if(field==="status"&&!statusNames.includes(value))return;
    r[field]=value;data.tasks[id]=r;save();refreshTaskAndCalendar();
  }
  function refreshTaskAndCalendar(){renderProgress();renderTasks();renderCalendar();renderUpcoming();renderNoteCards()}
  // Extend existing task renderer, preserving its original status, notes, evidence and localStorage behavior.
  const baseRenderTasks=renderTasks;
  renderTasks=function(){
    baseRenderTasks();
    document.querySelectorAll("#taskGrid article.task").forEach(article=>{
      const statusSelect=article.querySelector("[data-task-status]");
      if(!statusSelect)return;
      const id=statusSelect.dataset.taskStatus,t=allTasks().find(x=>x.id===id);
      if(!t)return;
      const due=taskDeadline(t),r=record(id);
      const meta=article.querySelector(".meta small");
      if(meta)meta.textContent=(due||"尚未設定日期")+(t.phase==="獲獎後"&&!due?"（原規劃 "+t.due+"）":"")+" · "+t.priority+"優先";
      const dateArea=document.createElement("div");
      dateArea.className="task-date-line";
      dateArea.innerHTML='<label for="deadline-'+esc(id)+'">工作項目到期日（連動月曆）</label><div class="due-control"><input type="date" id="deadline-'+esc(id)+'" data-task-deadline="'+esc(id)+'" value="'+esc(due)+'" aria-label="'+esc(t.title)+' 到期日"><button class="btn" type="button" data-task-calendar="'+esc(id)+'">月曆檢視</button></div>'+(t.phase==="獲獎後"&&!due?'<small class="muted">目前僅有相對月份「'+esc(t.due)+'」，設定實際日期後才會進入月曆。</small>':"");
      article.insertBefore(dateArea,article.querySelector("details"));
    });
  };
  document.getElementById("taskGrid").addEventListener("change",e=>{
    const el=e.target.closest("[data-task-deadline]");
    if(el)updateTask(el.dataset.taskDeadline,"dueDate",el.value);
  });
  document.getElementById("taskGrid").addEventListener("click",e=>{
    const btn=e.target.closest("[data-task-calendar]");if(!btn)return;
    const t=allTasks().find(x=>x.id===btn.dataset.taskCalendar);if(!t)return;
    const due=taskDeadline(t);
    if(due){selectedDay=due;calendarMonth=new Date(+due.slice(0,4),+due.slice(5,7)-1,1)}
    showTab("calendar");renderCalendar();document.querySelector(".tabs").scrollIntoView({behavior:"smooth",block:"start"});
  });
  const originalRerender=rerender;
  rerender=function(){ensurePlanner();calendarView=data.calendarView==="week"?"week":"month";originalRerender();renderCalendar();renderNoteCards();renderUpcoming();syncNoteTaskSelect()};
  const months=["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
  function calendarEntries(){
    const tasks=allTasks().map(t=>({kind:"task",id:t.id,title:t.title,date:taskDeadline(t),state:taskStatus(t),group:t.group,phase:t.phase})).filter(x=>x.date);
    const events=data.events.filter(x=>validDay(x.date)).map(e=>({kind:"event",id:e.id,title:e.title,date:e.date,start:e.start||"",end:e.end||"",type:e.type||"行程",location:e.location||""}));
    return tasks.concat(events).sort((a,b)=>a.date.localeCompare(b.date)||((a.start||"").localeCompare(b.start||""))||a.title.localeCompare(b.title,"zh-Hant"));
  }
  function filterEntries(items){
    const showTasks=document.getElementById("calShowTasks").checked;
    const showEvents=document.getElementById("calShowEvents").checked;
    const showDone=document.getElementById("calShowDone").checked;
    return items.filter(x=>(x.kind==="task"?(showTasks&&(showDone||x.state!=="已完成")):showEvents));
  }
  function weekStart(iso){
    const d=new Date(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10));
    d.setDate(d.getDate()-d.getDay());
    return d;
  }
  function renderCalendar(){
    ensurePlanner();
    const weekView=calendarView==="week";
    const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth();
    const first=weekView?weekStart(selectedDay):new Date(y,m,1);
    const last=weekView?new Date(first.getFullYear(),first.getMonth(),first.getDate()+6):new Date(y,m+1,0);
    const before=first.getDay();
    const total=weekView?7:Math.ceil((before+last.getDate())/7)*7;
    const entries=filterEntries(calendarEntries());
    const weekRange=localDay(first)+"～"+localDay(last);
    document.getElementById("calendarTitle").textContent=weekView?weekRange.replace(/-/g,"/"):y+"年 "+months[m];
    document.getElementById("calendarGrid").classList.toggle("week-view",weekView);
    document.getElementById("calendarWeekdays").classList.toggle("weekdays-week",weekView);
    for(const view of ["month","week"]){
      const btn=document.getElementById(view==="month"?"calMonthView":"calWeekView");
      btn.classList.toggle("active",calendarView===view);
      btn.setAttribute("aria-pressed",String(calendarView===view));
    }
    document.getElementById("calPrev").textContent=weekView?"← 上週":"← 上月";
    document.getElementById("calNext").textContent=weekView?"下週 →":"下月 →";
    document.getElementById("calPrev").setAttribute("aria-label",weekView?"上一週":"上一個月");
    document.getElementById("calNext").setAttribute("aria-label",weekView?"下一週":"下一個月");
    let html="";
    const today=localDay(new Date());
    for(let i=0;i<total;i++){
      const day=weekView?new Date(first.getFullYear(),first.getMonth(),first.getDate()+i):new Date(y,m,1-before+i);
      const date=localDay(day),sameMonth=day.getMonth()===m;
      const dayEvents=entries.filter(x=>x.date===date);
      const classes=["calendar-day",!weekView&&!sameMonth?"outside":"",date===today?"today":"",date===selectedDay?"selected":""].filter(Boolean).join(" ");
      const dayLabel=weekView?(day.getMonth()+1)+"/"+day.getDate():String(day.getDate());
      html+='<div class="'+classes+'" data-calendar-day="'+date+'"><button class="calendar-date" type="button" data-select-day="'+date+'" aria-label="查看 '+date+' 行程">'+dayLabel+'</button><div class="calendar-items">';
      for(const item of dayEvents.slice(0,weekView?dayEvents.length:3)){
        const eventTime=weekView&&item.kind==="event"&&item.start?esc(item.start)+" ":"";
        html+='<button class="cal-event '+(item.kind==="task"?"is-task":"is-event")+(item.state==="已完成"?" done":"")+'" data-select-day="'+date+'" type="button" title="'+esc(item.title)+'">'+(item.kind==="task"?"✓ ":"● ")+eventTime+esc(item.title)+'</button>';
      }
      if(!weekView&&dayEvents.length>3)html+='<button type="button" class="more-events" data-select-day="'+date+'">＋'+(dayEvents.length-3)+'項</button>';
      html+="</div></div>";
    }
    document.getElementById("calendarGrid").innerHTML=html;
    const periodEntries=weekView?entries.filter(x=>x.date>=localDay(first)&&x.date<=localDay(last)):entries.filter(x=>x.date.slice(0,7)===y+"-"+String(m+1).padStart(2,"0"));
    document.getElementById("calendarCount").textContent=(weekView?"本週":"本月")+"共"+periodEntries.length+"項安排（工作到期／個人行程）";
    renderDayAgenda();
  }
  function renderDayAgenda(){
    document.getElementById("selectedDayTitle").textContent=selectedDay.replace(/-/g,"/")+" 的工作與行程";
    const entries=filterEntries(calendarEntries()).filter(x=>x.date===selectedDay);
    document.getElementById("dayAgenda").innerHTML=entries.length?entries.map(x=>{
      if(x.kind==="task"){
        return '<article class="agenda-item task-agenda"><div class="split"><span class="chip">到期工作｜'+esc(x.group)+'</span><small>'+esc(x.phase)+'</small></div><h3>'+esc(x.title)+'</h3><label for="agendaDate-'+esc(x.id)+'">調整到期日（同步工作卡）</label><input id="agendaDate-'+esc(x.id)+'" type="date" data-agenda-task-date="'+esc(x.id)+'" value="'+esc(x.date)+'"><label for="agendaState-'+esc(x.id)+'">工作狀態</label><select id="agendaState-'+esc(x.id)+'" data-agenda-task-state="'+esc(x.id)+'">'+statusNames.map(s=>'<option '+(x.state===s?"selected ":"")+'value="'+esc(s)+'">'+esc(s)+'</option>').join("")+'</select><button type="button" class="btn" data-agenda-open-task="'+esc(x.id)+'">開啟工作項目</button></article>';
      }
      const e=data.events.find(z=>z.id===x.id),time=[e.start,e.end].filter(Boolean).join("～");
      return '<article class="agenda-item event-agenda"><div class="split"><span class="chip">行程｜'+esc(e.type||"活動")+'</span><small>'+esc(time)+'</small></div><h3>'+esc(e.title)+'</h3><p class="muted small">'+esc(e.location||"未填地點")+'</p>'+(e.memo?'<p>'+esc(e.memo).replace(/\n/g,"<br>")+'</p>':"")+(e.link&&/^https?:\/\//i.test(e.link)?'<p><a target="_blank" rel="noopener noreferrer" href="'+esc(e.link)+'">參考連結 ↗</a></p>':"")+'<div class="toolbar"><button class="btn" type="button" data-edit-event="'+esc(e.id)+'">編輯行程</button><button class="btn warn" type="button" data-delete-event="'+esc(e.id)+'">刪除行程</button></div></article>';
    }).join(""):'<p class="muted">這天尚無工作到期或行程。點「＋新增行程」或「＋新增工作項目」即可安排。</p>';
  }
  function moveCalendar(diff){
    if(calendarView==="week"){
      const anchor=new Date(+selectedDay.slice(0,4),+selectedDay.slice(5,7)-1,+selectedDay.slice(8,10));
      anchor.setDate(anchor.getDate()+diff*7);
      selectedDay=localDay(anchor);
      calendarMonth=new Date(anchor.getFullYear(),anchor.getMonth(),1);
    }else{
      calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+diff,1);
      selectedDay=localDay(calendarMonth);
    }
    renderCalendar();
  }
  function setCalendarView(view){
    if(view!=="month"&&view!=="week")return;
    calendarView=view;
    data.calendarView=view;
    calendarMonth=new Date(+selectedDay.slice(0,4),+selectedDay.slice(5,7)-1,1);
    save();
    renderCalendar();
  }
  document.getElementById("calMonthView").addEventListener("click",()=>setCalendarView("month"));
  document.getElementById("calWeekView").addEventListener("click",()=>setCalendarView("week"));
  document.getElementById("calPrev").addEventListener("click",()=>moveCalendar(-1));
  document.getElementById("calNext").addEventListener("click",()=>moveCalendar(1));
  document.getElementById("calToday").addEventListener("click",()=>{selectedDay=localDay(new Date());calendarMonth=new Date(+selectedDay.slice(0,4),+selectedDay.slice(5,7)-1,1);renderCalendar()});
  ["calShowTasks","calShowEvents","calShowDone"].forEach(id=>document.getElementById(id).addEventListener("change",renderCalendar));
  document.getElementById("calendarGrid").addEventListener("click",e=>{
    const btn=e.target.closest("[data-select-day]");if(!btn)return;
    selectedDay=btn.dataset.selectDay;
    calendarMonth=new Date(+selectedDay.slice(0,4),+selectedDay.slice(5,7)-1,1);renderCalendar();
  });
  document.getElementById("dayAgenda").addEventListener("change",e=>{
    const d=e.target.closest("[data-agenda-task-date]"),s=e.target.closest("[data-agenda-task-state]");
    if(d)updateTask(d.dataset.agendaTaskDate,"dueDate",d.value);
    if(s)updateTask(s.dataset.agendaTaskState,"status",s.value);
  });
  document.getElementById("dayAgenda").addEventListener("click",e=>{
    const open=e.target.closest("[data-agenda-open-task]");
    if(open){
      showTab("tasks");document.getElementById("taskSearch").value="";
      document.getElementById("taskPhase").value="";document.getElementById("taskStatus").value="";renderTasks();
      const id=open.dataset.agendaOpenTask,field=document.querySelector('[data-task-status="'+id+'"]');
      field?.closest(".task")?.scrollIntoView({behavior:"smooth",block:"center"});
      return;
    }
    const edit=e.target.closest("[data-edit-event]");
    if(edit){startEventEdit(edit.dataset.editEvent);return}
    const remove=e.target.closest("[data-delete-event]");
    if(remove){
      const item=data.events.find(x=>x.id===remove.dataset.deleteEvent);
      if(!item||!confirm("刪除行程「"+item.title+"」？"))return;
      data.events=data.events.filter(x=>x.id!==item.id);save();renderCalendar();renderUpcoming();
    }
  });
  document.getElementById("calendarAddEvent").addEventListener("click",()=>startEventEdit(""));
  document.getElementById("calendarAddTask").addEventListener("click",()=>{
    showTab("tasks");toggleCustom(true);document.getElementById("newTaskDue").value=selectedDay;
    document.getElementById("newTaskTitle").focus();document.querySelector(".tabs").scrollIntoView({behavior:"smooth",block:"start"});
  });
  function startEventEdit(id){
    const form=document.getElementById("eventForm"),e=data.events.find(x=>x.id===id);
    editingEventId=e?.id||"";form.hidden=false;
    document.getElementById("eventFormHeading").textContent=e?"編輯行程":"新增行程";
    document.getElementById("eventTitle").value=e?.title||"";
    document.getElementById("eventDate").value=e?.date||selectedDay;
    document.getElementById("eventStart").value=e?.start||"";
    document.getElementById("eventEnd").value=e?.end||"";
    document.getElementById("eventType").value=e?.type||"活動";
    document.getElementById("eventLocation").value=e?.location||"";
    document.getElementById("eventMemo").value=e?.memo||"";
    document.getElementById("eventLink").value=e?.link||"";
    form.scrollIntoView({behavior:"smooth",block:"nearest"});
    document.getElementById("eventTitle").focus();
  }
  document.getElementById("eventCancel").addEventListener("click",()=>{editingEventId="";document.getElementById("eventForm").hidden=true});
  document.getElementById("eventForm").addEventListener("submit",e=>{
    e.preventDefault();
    const title=document.getElementById("eventTitle").value.trim(),date=document.getElementById("eventDate").value;
    const start=document.getElementById("eventStart").value,end=document.getElementById("eventEnd").value;
    if(!title||!validDay(date)){alert("請輸入行程名稱與正確日期");return}
    if(start&&end&&start>end){alert("結束時間不能早於開始時間");return}
    const row={id:editingEventId||"EV"+Date.now(),title,date,start,end,type:document.getElementById("eventType").value,location:document.getElementById("eventLocation").value.trim(),memo:document.getElementById("eventMemo").value.trim(),link:document.getElementById("eventLink").value.trim()};
    if(row.link&&!/^https?:\/\//i.test(row.link)){alert("參考連結請使用 http 或 https 開頭");return}
    const i=data.events.findIndex(x=>x.id===row.id);
    if(i>=0)data.events[i]=row;else data.events.push(row);
    save();editingEventId="";document.getElementById("eventForm").hidden=true;
    selectedDay=date;calendarMonth=new Date(+date.slice(0,4),+date.slice(5,7)-1,1);renderCalendar();renderUpcoming();
  });
  function renderUpcoming(){
    const today=localDay(new Date()),rows=calendarEntries().filter(x=>x.date>=today).slice(0,8);
    document.getElementById("upcomingList").innerHTML=rows.length?rows.map(x=>'<button type="button" class="upcoming-row" data-upcoming-day="'+esc(x.date)+'"><span class="chip">'+esc(x.date.slice(5).replace("-","/"))+'</span><span class="upcoming-title">'+esc(x.title)+'</span><span class="muted small">'+(x.kind==="task"?"工作到期":"個人行程")+'</span></button>').join(""):'<p class="muted">目前沒有即將到期的工作或行程。</p>';
  }
  document.getElementById("upcomingList").addEventListener("click",e=>{
    const btn=e.target.closest("[data-upcoming-day]");if(!btn)return;
    selectedDay=btn.dataset.upcomingDay;calendarMonth=new Date(+selectedDay.slice(0,4),+selectedDay.slice(5,7)-1,1);
    showTab("calendar");renderCalendar();document.querySelector(".tabs").scrollIntoView({behavior:"smooth",block:"start"});
  });
  function syncNoteTaskSelect(){
    const el=document.getElementById("noteTask");
    const val=el.value;
    el.innerHTML='<option value="">不關聯工作項目</option>'+allTasks().map(t=>'<option value="'+esc(t.id)+'">'+esc(t.id+"｜"+t.title)+'</option>').join("");
    if(allTasks().some(t=>t.id===val))el.value=val;
  }
  function startNoteEdit(id){
    const n=data.notes.find(x=>x.id===id);
    editingNoteId=n?.id||"";
    document.getElementById("noteEditorTitle").textContent=n?"編輯筆記":"新增筆記";
    document.getElementById("noteTitle").value=n?.title||"";
    document.getElementById("noteCategory").value=n?.category||"研究觀察";
    document.getElementById("noteBody").value=n?.body||"";
    document.getElementById("noteTags").value=n?.tags||"";
    document.getElementById("noteSource").value=n?.source||"";
    document.getElementById("noteTask").value=n?.taskId||"";
    document.getElementById("noteEditor").scrollIntoView({behavior:"smooth",block:"nearest"});
    document.getElementById("noteTitle").focus();
  }
  function renderNoteCards(){
    ensurePlanner();
    const q=document.getElementById("notesSearch").value.trim().toLowerCase(),category=document.getElementById("notesFilter").value;
    const rows=data.notes.filter(n=>(!category||n.category===category)&&(!q||[n.title,n.body,n.tags,n.category].join(" ").toLowerCase().includes(q))).sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||"")));
    document.getElementById("notesCounter").textContent="顯示 "+rows.length+" / "+data.notes.length+" 篇筆記";
    document.getElementById("notesList").innerHTML=rows.length?rows.map(n=>{
      const t=allTasks().find(x=>x.id===n.taskId);
      return '<article class="note-card"><div class="split"><span class="chip">'+esc(n.category||"其他")+'</span><small class="muted">'+esc((n.updated||"").slice(0,10))+'</small></div><h3>'+esc(n.title)+'</h3><p class="note-preview">'+esc(n.body||"")+'</p>'+(n.tags?'<p class="small muted">標籤：'+esc(n.tags)+'</p>':"")+(t?'<p class="small">關聯工作：'+esc(t.title)+'</p>':"")+(n.source&&/^https?:\/\//i.test(n.source)?'<a href="'+esc(n.source)+'" target="_blank" rel="noopener noreferrer">資料連結 ↗</a>':"")+'<div class="toolbar"><button class="btn" type="button" data-note-edit="'+esc(n.id)+'">編輯</button><button class="btn warn" type="button" data-note-delete="'+esc(n.id)+'">刪除</button></div></article>';
    }).join(""):'<p class="muted">尚無符合條件的筆記。可用上方表單記錄實驗、研究資料與會議紀錄。</p>';
  }
  ["notesSearch","notesFilter"].forEach(id=>document.getElementById(id).addEventListener("input",renderNoteCards));
  document.getElementById("noteNew").addEventListener("click",()=>startNoteEdit(""));
  document.getElementById("noteCancel").addEventListener("click",()=>startNoteEdit(""));
  document.getElementById("noteEditor").addEventListener("submit",e=>{
    e.preventDefault();
    const title=document.getElementById("noteTitle").value.trim(),body=document.getElementById("noteBody").value.trim(),source=document.getElementById("noteSource").value.trim();
    if(!title){alert("請輸入筆記標題");return}
    if(source&&!/^https?:\/\//i.test(source)){alert("來源連結請使用 http 或 https 開頭");return}
    const old=data.notes.find(x=>x.id===editingNoteId),now=new Date().toISOString();
    const item={id:old?.id||"N"+Date.now(),title,body,category:document.getElementById("noteCategory").value,tags:document.getElementById("noteTags").value.trim(),source,taskId:document.getElementById("noteTask").value,created:old?.created||now,updated:now};
    const idx=data.notes.findIndex(x=>x.id===item.id);
    if(idx>=0)data.notes[idx]=item;else data.notes.push(item);
    save();editingNoteId="";document.getElementById("noteEditor").reset();document.getElementById("noteCategory").value="研究觀察";renderNoteCards();
    document.getElementById("notesMessage").textContent="筆記已儲存在目前瀏覽器。請定期匯出 JSON，避免清除快取後遺失。";
  });
  document.getElementById("notesList").addEventListener("click",e=>{
    const edit=e.target.closest("[data-note-edit]");if(edit){startNoteEdit(edit.dataset.noteEdit);return}
    const del=e.target.closest("[data-note-delete]");if(!del)return;
    const n=data.notes.find(x=>x.id===del.dataset.noteDelete);
    if(!n||!confirm("確定刪除筆記「"+n.title+"」？"))return;
    data.notes=data.notes.filter(x=>x.id!==n.id);if(editingNoteId===n.id)startNoteEdit("");save();renderNoteCards();
  });
  // Prepare form category options and backward-compatible JSON content.
  document.getElementById("noteCategory").innerHTML=noteCategories.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");
  document.getElementById("notesFilter").innerHTML='<option value="">全部分類</option>'+noteCategories.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");
  ensurePlanner();
  syncNoteTaskSelect();
  const previousAddTask=document.getElementById("addTaskBtn");
  previousAddTask.addEventListener("click",()=>{syncNoteTaskSelect();renderCalendar();renderUpcoming()});
  document.getElementById("taskGrid").addEventListener("change",e=>{if(e.target.matches("[data-task-status]")){renderCalendar();renderUpcoming()}});
  // Import/reset uses the original parent page. Our rerender wrapper restores notes/events and their views.
  renderTasks();renderCalendar();renderNoteCards();renderUpcoming();
})();
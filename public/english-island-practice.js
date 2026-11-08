(()=>{
"use strict";
const $=id=>document.getElementById(id);
const STORE="englishLearningIslandPracticeV1";
const LEGACY="wordBlossomEnglishLearningIslandV1";
const ZONES=[{id:"ab",chars:"ABCD"},{id:"eh",chars:"EFGH"},{id:"il",chars:"IJKL"},{id:"mp",chars:"MNOP"},{id:"qt",chars:"QRST"},{id:"uz",chars:"UVWXYZ"}];
const TOPIC_WORDS={
"動物":["fish","deer","monkey","chick","hen","ant","bird","pig","frog","duck"],
"食物與餐點":["meal","tea","cake","lunch","pea","rice","orange","fork"],
"家人與人物":["son","father","granny","child","boy","man","she","him"],
"身體":["arm","head","foot","ear","face","nose"],
"顏色":["green","black","blue"],
"自然":["sea","rock","sun","rain","tree","seed","soil","air","ice","nature"],
"交通":["car","bus","port","sail","bridge"],
"家與學校":["room","book","table","desk","bag","pen","library","school"],
"數字":["one","eight","five","six","ten","nine"],
"動作":["play","read","write","sing","watch","sit","wait","talk","clap","jump","come","turn","keep"],
"天氣與時間":["warm","cool","day","night","now","late"],
"生活用品":["tool","dress","coat","purse","doll","ring","tie"]
};
const ICONS={"動物":"🐾","食物與餐點":"🥪","家人與人物":"👨‍👩‍👦","身體":"💪","顏色":"🎨","自然":"🌳","交通":"🚌","家與學校":"📚","數字":"🔢","動作":"🎯","天氣與時間":"☀️","生活用品":"🧸","綜合字彙":"🌼"};
const SEEDS={
"fish":["I can see a fish.","我看到一條魚。","1–2年級","入門"],
"book":["This is my book.","這是我的書。","1–2年級","入門"],
"sun":["The sun is bright.","太陽很明亮。","1–2年級","入門"],
"car":["This car is red.","這輛汽車是紅色的。","1–2年級","入門"],
"bus":["I go to school by bus.","我搭公車去學校。","1–2年級","入門"],
"one":["I have one apple.","我有一顆蘋果。","1–2年級","入門"],
"five":["I have five pencils.","我有五支鉛筆。","1–2年級","入門"],
"six":["There are six ducks.","這裡有六隻鴨子。","1–2年級","入門"],
"ten":["I can count to ten.","我會數到十。","1–2年級","入門"],
"blue":["The sky is blue.","天空是藍色的。","1–2年級","入門"],
"green":["The tree is green.","樹是綠色的。","1–2年級","入門"],
"pen":["I write with a pen.","我用筆寫字。","1–2年級","入門"],
"tree":["A bird is in the tree.","樹上有一隻鳥。","1–2年級","入門"],
"rain":["I hear the rain.","我聽見雨聲。","1–2年級","入門"],
"bird":["The bird can sing.","這隻鳥會唱歌。","1–2年級","入門"],
"cake":["I like this cake.","我喜歡這個蛋糕。","1–2年級","入門"],
"duck":["The duck swims in the pond.","鴨子在池塘裡游泳。","1–2年級","入門"],
"frog":["The frog can jump.","青蛙會跳。","1–2年級","入門"],
"room":["My room is tidy.","我的房間很整齊。","1–2年級","入門"],
"father":["My father likes music.","我的爸爸喜歡音樂。","1–2年級","入門"],
"count":["Can you count the stars?","你能數數看星星有幾顆嗎？","3–4年級","基礎"],
"play":["We play in the park.","我們在公園裡玩。","1–2年級","入門"],
"read":["I read a story every day.","我每天讀一個故事。","1–2年級","入門"],
"write":["I write a letter.","我寫一封信。","3–4年級","基礎"],
"library":["Let's go to the library.","我們去圖書館吧。","3–4年級","基礎"],
"prefer":["I prefer tea to coffee.","比起咖啡，我更喜歡茶。","5–6年級","進階"],
"nature":["We learn about nature.","我們學習大自然。","3–4年級","基礎"],
"bridge":["We walk across the bridge.","我們走過這座橋。","3–4年級","基礎"],
"soil":["Seeds grow in the soil.","種子在土壤裡生長。","3–4年級","基礎"],
"art":["Art makes me happy.","藝術讓我快樂。","1–2年級","入門"],
"best":["This is my best drawing.","這是我畫得最好的一張圖。","3–4年級","基礎"],
"sail":["The boat can sail on the sea.","船可以在海上航行。","3–4年級","基礎"],
"fork":["Use a fork to eat the rice.","用叉子吃飯。","1–2年級","入門"]
};
const state={custom:[],overrides:{},progress:{},favorites:[],mistakes:[],activity:[],view:"today",voice:"en-US",selected:null};
let source={words:[]},words=[],selected=null,lastSpeech=null,player=new Audio(),recorder=null,micStream=null,clipUrl=null,clipParts=[],gameAnswered=false,serial=0;
const SpeechRecognitionClass=window.SpeechRecognition||window.webkitSpeechRecognition||null;
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function localDay(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
function future(n){const d=new Date();d.setDate(d.getDate()+n);return localDay(d)}
function textStatus(msg){$("siteStatus").textContent=msg}
function load(){try{let v=JSON.parse(localStorage.getItem(STORE)||"null");if(v&&typeof v==="object"){for(const k of ["custom","overrides","progress","favorites","mistakes","activity","view","voice","selected"])if(v[k]!=null)state[k]=v[k];}}catch(e){console.warn("Local state unavailable",e)}
if(!Array.isArray(state.custom))state.custom=[];
if(!Array.isArray(state.favorites))state.favorites=[];
if(!Array.isArray(state.mistakes))state.mistakes=[];
if(!Array.isArray(state.activity))state.activity=[];
if(!state.overrides||typeof state.overrides!=="object")state.overrides={};
if(!state.progress||typeof state.progress!=="object")state.progress={};
try{const v=JSON.parse(localStorage.getItem(LEGACY)||"{}");for(const id of (v.learned||[])){if(!state.progress[id])state.progress[id]={status:"learned",streak:2,due:future(3),updated:localDay()}}for(const id of (v.review||[])){if(!state.progress[id])state.progress[id]={status:"review",streak:0,due:localDay(),updated:localDay()}}}catch(e){}
if(!["en-US","en-GB"].includes(state.voice))state.voice="en-US";
$("voiceLocale").value=state.voice;
}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state));const v=JSON.parse(localStorage.getItem(LEGACY)||"{}");v.learned=Object.entries(state.progress).filter(([,p])=>p.status==="learned").map(([id])=>id);v.review=Object.entries(state.progress).filter(([,p])=>p.status==="review").map(([id])=>id);localStorage.setItem(LEGACY,JSON.stringify(v))}catch(e){textStatus("儲存空間可能已滿，請先匯出 JSON 備份。")}}
function logIt(action,w){state.activity.unshift({when:new Date().toISOString(),action,word:w?.word||""});state.activity=state.activity.slice(0,100)}
function zoneFor(word){let a=(word||"").toUpperCase().charAt(0);return (ZONES.find(z=>z.chars.includes(a))||ZONES[0]).id}
function setWords(){words=[...(source.words||[]),...state.custom];if(selected){selected=words.find(w=>w.id===selected.id)||null}if(!selected)selected=words.find(w=>w.id===state.selected)||words[0]||null;state.selected=selected?.id||null}
function topicFor(word){for(const [name,arr] of Object.entries(TOPIC_WORDS)){if(arr.includes(String(word).toLowerCase()))return name}return "綜合字彙"}
function mOf(w){if(!w)return {};const seed=SEEDS[String(w.word).toLowerCase()]||[];const defaults={word:w.word,zh:w.zh,topic:topicFor(w.word),grade:seed[2]||"未分級",level:seed[3]||"未分級",sentence:seed[0]||"",sentenceZh:seed[1]||"",image:"",audio:"",notes:""};return Object.assign(defaults,w,state.overrides[w.id]||{})}
function isDue(w){const p=state.progress[w.id];return !!p&&(p.status==="review"||(!!p.due&&p.due<=localDay()))}
function hash(s){let h=0;for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h)}
function todayWords(){const due=words.filter(isDue).sort((a,b)=>(state.progress[a.id].due||"").localeCompare(state.progress[b.id].due||""));const seen=new Set(due.map(w=>w.id));const newPool=words.filter(w=>!seen.has(w.id)&&!state.progress[w.id]).sort((a,b)=>hash(a.id+localDay())-hash(b.id+localDay()));return due.concat(newPool.slice(0,Math.max(0,12-due.length)))}
function baseList(){switch(state.view){case"today":return todayWords();case"learned":return words.filter(w=>state.progress[w.id]?.status==="learned");case"due":return words.filter(isDue);case"wrong":return words.filter(w=>state.mistakes.includes(w.id));case"favorites":return words.filter(w=>state.favorites.includes(w.id));case"game":return todayWords();default:return words}}
function filters(){let list=baseList();let query=$("q").value.trim().toLowerCase(),topic=$("topicFilter").value,grade=$("gradeFilter").value,level=$("levelFilter").value;return list.filter(w=>{const m=mOf(w);return(!query||[m.word,m.zh,m.sentence,m.sentenceZh,m.topic].some(x=>String(x||"").toLowerCase().includes(query)))&&(!topic||m.topic===topic)&&(!grade||m.grade===grade)&&(!level||m.level===level)})}
function renderTopics(){const chosen=$("topicFilter").value;const topics=[...new Set(words.map(w=>mOf(w).topic))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));$("topicFilter").innerHTML='<option value="">所有主題</option>'+topics.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");$("topicFilter").value=topics.includes(chosen)?chosen:""}
function renderStats(){$("totalCount").textContent=words.length;$("todayCount").textContent=todayWords().length;$("learnedCount").textContent=words.filter(w=>state.progress[w.id]?.status==="learned").length;$("mistakeCount").textContent=state.mistakes.length;$("favCount").textContent=state.favorites.length}
function renderList(){const found=filters();$("resultCount").textContent="顯示 "+found.length+" 張卡片 · 已載入 "+words.length+" 張";
$("wordList").innerHTML=found.length?found.map(w=>{const m=mOf(w),p=state.progress[w.id];return '<button class="word-row '+(selected?.id===w.id?"active":"")+'" type="button" data-id="'+esc(w.id)+'"><span><strong>'+esc(m.word)+'</strong><small>'+esc(m.zh)+' · '+esc(m.topic)+'</small></span><span class="flag">'+(state.favorites.includes(w.id)?"💛":state.mistakes.includes(w.id)?"✏️":isDue(w)?"🔄":p?.status==="learned"?"✅":"🌱")+'</span></button>'}).join(""):'<div class="empty">這個分類還沒有卡片。可以換一個篩選條件，或按「新增」加入單字。</div>'}
function pictureUrl(url){if(!url)return"";try{const v=new URL(url,location.href);return v.protocol==="https:"?v.href:""}catch(e){return""}}
function renderCard(){if(!selected)return;const w=selected,m=mOf(w),img=pictureUrl(m.image),a=$("cardImage"),topic=m.topic||"綜合字彙",p=state.progress[w.id];a.hidden=!img;if(img){a.src=img;a.alt=m.word+" 的圖片";a.onerror=()=>{a.hidden=true;$("cardEmoji").hidden=false}}else{a.removeAttribute("src");} $("cardEmoji").hidden=!!img;$("cardEmoji").textContent=ICONS[topic]||"🌸";
$("wordTitle").textContent=m.word;$("wordZh").textContent=m.zh;
$("cardBadges").innerHTML=[topic,m.grade||"未分級",m.level||"未分級"].map(x=>"<span>"+esc(x)+"</span>").join("");
const realSentence=m.sentence||"Can you say "+m.word+"?";
$("sentenceText").textContent=realSentence;$("sentenceZh").textContent=m.sentenceZh||(m.sentence?"（此句尚未加入中文翻譯）":"跟讀提示：試著說出這個英文。可在下方編輯例句。");
$("favToggle").textContent=state.favorites.includes(w.id)?"💛 已收藏":"♡ 收藏";
$("audioOrigin").textContent="單字語音來源："+(pictureUrl(m.audio)?"自訂音檔":wordHasLocalAudio(w,m)?"學習島 MP3 音檔（無法播放時改用裝置語音）":"裝置英文語音");
$("dueInfo").textContent=p?.due?"下次複習："+p.due:"尚未安排複習";
$("noteInput").value=m.notes||"";
renderQuiz();
}
function renderActivity(){const items=state.activity;$("activityList").innerHTML=items.length?items.map(x=>{let s=new Date(x.when);return '<div class="activity-item"><span><b>'+esc(x.word)+'</b> · '+esc(x.action)+'</span><time>'+esc(isNaN(s)?String(x.when):s.toLocaleString("zh-TW"))+'</time></div>'}).join(""):'<p class="empty">還沒有練習紀錄。先點一張單字，開始探索！</p>'}
function renderViews(){for(const btn of $("viewNav").querySelectorAll("[data-view]")){const active=btn.dataset.view===state.view;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active))}
const showLog=state.view==="log";$("learningPanel").hidden=showLog;$("logPanel").hidden=!showLog;$("gameArea").hidden=showLog;
}
function render(){setWords();renderTopics();renderStats();renderViews();renderList();renderCard();renderActivity()}
function selectWord(id,scroll){const w=words.find(x=>x.id===id);if(!w)return;selected=w;state.selected=w.id;stopAllSpeech();render();if(scroll&&window.innerWidth<980)$("learningPanel").scrollIntoView({behavior:"smooth",block:"start"})}
function next(){let list=filters();if(list.length<2)list=words;const i=list.findIndex(x=>x.id===selected?.id);selectWord(list[(i+1)%list.length]?.id||words[0]?.id,false)}
function wordHasLocalAudio(w,m){return /^w\d+$/.test(w.id)&&w.word===m.word&&/^[a-z]{1,32}$/.test(w.word)}
function stopAllSpeech(){player.pause();player.currentTime=0;try{window.speechSynthesis?.cancel()}catch(e){}}
function tts(text,slow){if(!("speechSynthesis" in window)||typeof SpeechSynthesisUtterance==="undefined"){textStatus("此裝置無內建英文語音。單字可使用原站 MP3，例句請改用支援語音的 Chrome。");return}
try{stopAllSpeech();const u=new SpeechSynthesisUtterance(text);u.lang=state.voice;u.rate=slow?.72:.94;u.pitch=1;u.volume=1;const vs=window.speechSynthesis.getVoices()||[];const v=vs.find(v=>v.lang.toLowerCase()===state.voice.toLowerCase())||vs.find(v=>v.lang.toLowerCase().startsWith("en"));if(v)u.voice=v;u.onstart=()=>textStatus("🔊 正在朗讀："+text);u.onerror=()=>textStatus("語音啟動失敗。請先試聽或檢查手機音量及語音服務。");window.speechSynthesis.speak(u)}catch(e){textStatus("裝置語音無法播放。請檢查瀏覽器語音服務。")}}
function playSpeech(text,opt={}){if(!text)return;stopAllSpeech();lastSpeech={text,slow:!!opt.slow,word:!!opt.word};
const m=selected?mOf(selected):{},url=opt.word&&(pictureUrl(m.audio)||(selected&&wordHasLocalAudio(selected,m)?"../audio/english-island/"+selected.word+".mp3":""));
if(url){player.src=url;player.playbackRate=opt.slow?.75:1;player.play().then(()=>textStatus("🔊 正在播放："+text+(opt.slow?"（慢速）":""))).catch(()=>tts(text,!!opt.slow));}else tts(text,!!opt.slow);
}
function playWord(slow){if(!selected)return;playSpeech(mOf(selected).word,{slow,word:true})}
function playSentence(slow){if(!selected)return;const m=mOf(selected);playSpeech(m.sentence||"Can you say "+m.word+"?",{slow})}
function mark(kind){if(!selected)return;const id=selected.id,p=state.progress[id]||{streak:0},name=mOf(selected).word;
if(kind==="learned"){const streak=(p.streak||0)+1,days=[1,3,7,14,30,60][Math.min(streak-1,5)];state.progress[id]={status:"learned",streak,due:future(days),updated:localDay()};state.mistakes=state.mistakes.filter(x=>x!==id);logIt("我會了；"+days+" 天後複習",{word:name});textStatus("✅ "+name+" 學會了！下次複習 "+future(days))}
else{state.progress[id]={status:"review",streak:0,due:localDay(),updated:localDay()};if(kind==="wrong"&&!state.mistakes.includes(id))state.mistakes.push(id);logIt(kind==="wrong"?"遊戲再練一次":"主動安排複習",{word:name});textStatus("🔄 已將 "+name+" 放進待複習")}
save();render();}
function fav(){if(!selected)return;const id=selected.id;state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):state.favorites.concat(id);logIt(state.favorites.includes(id)?"加入收藏":"取消收藏",mOf(selected));save();render()}
function sample(xs,n){let a=xs.slice();for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,n)}
function renderQuiz(){if(!selected)return;gameAnswered=false;const other=sample(words.filter(x=>x.id!==selected.id&&mOf(x).zh!==mOf(selected).zh),3);
const opts=sample([selected,...other],4);$("quizPrompt").textContent="先按「🔊 播放題目」，再選擇聽到的中文意思。";$("quizResult").textContent="";
$("quizOptions").innerHTML=opts.map(w=>'<button type="button" class="quiz-option" data-answer="'+esc(w.id)+'">'+esc(mOf(w).zh)+'</button>').join("")}
function answerQuiz(id){if(gameAnswered||!selected)return;gameAnswered=true;const success=id===selected.id;for(const b of $("quizOptions").querySelectorAll("[data-answer]")){b.disabled=true;if(b.dataset.answer===selected.id)b.classList.add("correct");else if(b.dataset.answer===id&&!success)b.classList.add("incorrect")}
if(success){$("quizResult").textContent="🎉 答對了！還可以聽一次，或自己跟讀。";logIt("聽音配對答對",mOf(selected));if(state.mistakes.includes(selected.id))state.mistakes=state.mistakes.filter(x=>x!==selected.id);}
else{$("quizResult").textContent="沒關係，正解是 "+mOf(selected).zh+"。再聽一次，稍後再挑戰。";state.mistakes=Array.from(new Set(state.mistakes.concat(selected.id)));state.progress[selected.id]={status:"review",streak:0,due:localDay(),updated:localDay()};logIt("聽音配對待加強",mOf(selected))}
save();renderStats();renderList()}
async function beginRecording(){if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"||!window.isSecureContext){$("recordHint").textContent="目前瀏覽器無法錄音。請用 HTTPS 網址直接在 Chrome 開啟本站，且允許麥克風權限。";return}
try{if(clipUrl){URL.revokeObjectURL(clipUrl);clipUrl=null}$("recordAudio").hidden=true;clipParts=[];micStream=await navigator.mediaDevices.getUserMedia({audio:true});recorder=new MediaRecorder(micStream);
recorder.ondataavailable=e=>{if(e.data?.size)clipParts.push(e.data)};
recorder.onstop=()=>{micStream?.getTracks().forEach(t=>t.stop());micStream=null;const blob=new Blob(clipParts,{type:recorder.mimeType||"audio/webm"});if(blob.size){clipUrl=URL.createObjectURL(blob);$("recordAudio").src=clipUrl;$("recordAudio").hidden=false;$("recordHint").textContent="✅ 已錄好！按下播放器的 ▶ 聽聽自己說的英文。錄音只暫存在此頁，重新整理即消失。";logIt("完成跟讀錄音（未上傳）",mOf(selected||{}));save()}else $("recordHint").textContent="這次沒有錄到聲音，請再試一次。";$("recordStart").disabled=false;$("recordStop").disabled=true};
recorder.start();$("recordStart").disabled=true;$("recordStop").disabled=false;$("recordHint").textContent="🔴 正在錄音…請說出單字或例句，結束後就可以回放。";
}catch(e){micStream?.getTracks().forEach(t=>t.stop());$("recordHint").textContent="無法取得麥克風："+(e.name==="NotAllowedError"?"未允許權限。":"請確認裝置與 HTTPS 權限。");$("recordStart").disabled=false;$("recordStop").disabled=true}}
function stopRecording(){if(recorder?.state==="recording")recorder.stop()}
function normalizeText(s){return String(s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}
function similarity(a,b){a=normalizeText(a);b=normalizeText(b);if(a===b)return 100;if(!a.length||!b.length)return 0;let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){let temp=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=temp}}return Math.max(0,Math.round((1-row[b.length]/Math.max(a.length,b.length))*100))}
function startRecognition(){if(!SpeechRecognitionClass){$("sttOutput").textContent="這個瀏覽器沒有語音辨識功能，仍可錄音回放並自行評估。";return}if(!selected)return;const m=mOf(selected),target=m.sentence||m.word;let r=new SpeechRecognitionClass();r.lang=state.voice;r.interimResults=false;r.maxAlternatives=1;r.onstart=()=>{$("sttOutput").textContent="🎤 正在辨識，請說："+target};r.onresult=e=>{const said=e.results?.[0]?.[0]?.transcript||"",pct=similarity(target,said);$("sttOutput").textContent="辨識文字：「"+said+"」｜與練習句文字相似度 "+pct+"%（僅供參考，並非發音分數；請自己再聽回放。）";logIt("試用語音辨識",m);save()};r.onerror=e=>{$("sttOutput").textContent="辨識未完成（"+e.error+"）。可直接錄音回放，不影響學習紀錄。"};try{r.start()}catch(e){$("sttOutput").textContent="瀏覽器未能啟動辨識，請用 Chrome 嘗試。"}}
function editReset(){for(const id of ["editId","editWord","editZh","editSentence","editSentenceZh","editTopic","editImage","editAudio","editNotes"])$(id).value="";$("editGrade").value="未分級";$("editLevel").value="未分級";$("editFeedback").textContent=""}
function editSelected(){if(!selected)return;const m=mOf(selected);$("editor").open=true;$("editId").value=selected.id;for(const [el,key] of [["editWord","word"],["editZh","zh"],["editSentence","sentence"],["editSentenceZh","sentenceZh"],["editTopic","topic"],["editGrade","grade"],["editLevel","level"],["editImage","image"],["editAudio","audio"],["editNotes","notes"]])$(el).value=m[key]||"";$("editor").scrollIntoView({behavior:"smooth",block:"start"})}
function editNew(){editReset();$("editor").open=true;$("editor").scrollIntoView({behavior:"smooth",block:"start"});$("editWord").focus()}
function newId(){serial++;return "custom-"+Date.now().toString(36)+"-"+serial}
function applyCard(raw,id){const en=String(raw.word||raw.english||raw.en||raw["英文"]||"").trim(),zh=String(raw.zh||raw.chinese||raw.translation||raw["中文"]||"").trim();if(!en||!zh)return null;
let w=id?words.find(x=>x.id===id):words.find(x=>mOf(x).word.toLowerCase()===en.toLowerCase());
const props={word:en,zh,topic:String(raw.topic||raw["主題"]||topicFor(en)),grade:String(raw.grade||raw["年級"]||"未分級"),level:String(raw.level||raw.difficulty||raw["難度"]||"未分級"),sentence:String(raw.sentence||raw.example||raw["英文例句"]||""),sentenceZh:String(raw.sentenceZh||raw["中文例句"]||""),image:String(raw.image||raw.imageUrl||raw["圖片網址"]||""),audio:String(raw.audio||raw.audioUrl||raw["音檔網址"]||""),notes:String(raw.notes||raw["備註"]||"")};
if(w){state.overrides[w.id]=Object.assign({},state.overrides[w.id]||{},props);return w.id}
const wnew={id:newId(),zone:zoneFor(en),word:en,zh};state.custom.push(wnew);state.overrides[wnew.id]=props;words.push(wnew);return wnew.id}
function formSave(e){e.preventDefault();const raw={word:$("editWord").value,zh:$("editZh").value,sentence:$("editSentence").value,sentenceZh:$("editSentenceZh").value,topic:$("editTopic").value,grade:$("editGrade").value,level:$("editLevel").value,image:$("editImage").value,audio:$("editAudio").value,notes:$("editNotes").value};
const id=applyCard(raw,$("editId").value||null);if(!id){$("editFeedback").textContent="請輸入英文與繁體中文。";return}setWords();logIt("編輯／新增卡片",{word:raw.word});save();render();selectWord(id,false);$("editFeedback").textContent="✅ 儲存成功，這張卡已更新。";textStatus("已儲存 "+raw.word+" 的學習卡。")}
function download(name,body,type){const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function backupJson(){const cards=words.map(w=>Object.assign({id:w.id},mOf(w)));const exportObj={type:"English Learning Island Practice",version:1,exported:new Date().toISOString(),source:"Word Blossom English Learning Island 202 centers",cards,custom:state.custom,overrides:state.overrides,progress:state.progress,favorites:state.favorites,mistakes:state.mistakes,activity:state.activity};download("english-island-backup-"+localDay()+".json",JSON.stringify(exportObj,null,2),"application/json;charset=utf-8");textStatus("✅ 已匯出完整學習紀錄與卡片資料。")}
function csvCell(s){return '"'+String(s||"").replace(/"/g,'""')+'"'}
function backupCsv(){const keys=["英文","中文","英文例句","中文例句","主題","年級","難度","圖片網址","音檔網址","備註","完成狀態","下次複習"];const rows=[keys,...words.map(w=>{const m=mOf(w),p=state.progress[w.id]||{};return[m.word,m.zh,m.sentence,m.sentenceZh,m.topic,m.grade,m.level,m.image,m.audio,m.notes,p.status||"未學",p.due||""]})];download("english-island-cards-"+localDay()+".csv","\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n"),"text/csv;charset=utf-8");textStatus("✅ 已匯出單字教材 CSV。")}
function parseCsv(s){let rows=[],cur=[],cell="",quoted=false;s=String(s).replace(/^\uFEFF/,"");for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===","&&!quoted){cur.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&s[i+1]==="\n")i++;cur.push(cell);if(cur.some(x=>x.trim()))rows.push(cur);cur=[];cell=""}else cell+=c}cur.push(cell);if(cur.some(x=>x.trim()))rows.push(cur);return rows}
async function importFile(file){try{const str=await file.text();let arr=[],obj={};if(file.name.toLowerCase().endsWith(".csv")){const rows=parseCsv(str),headers=rows.shift()||[];arr=rows.map(row=>Object.fromEntries(headers.map((h,i)=>[h.trim(),row[i]||""])))}else{obj=JSON.parse(str);arr=Array.isArray(obj)?obj:Array.isArray(obj.cards)?obj.cards:Array.isArray(obj.words)?obj.words:[]}
if(!arr.length)throw Error("找不到可匯入的單字陣列");let count=0;for(const w of arr){if(applyCard(w,null))count++}
if(obj.progress&&typeof obj.progress==="object")state.progress=Object.assign({},state.progress,obj.progress);
if(Array.isArray(obj.favorites))state.favorites=Array.from(new Set(state.favorites.concat(obj.favorites)));
if(Array.isArray(obj.mistakes))state.mistakes=Array.from(new Set(state.mistakes.concat(obj.mistakes)));
if(Array.isArray(obj.activity))state.activity=obj.activity.concat(state.activity).slice(0,100);
if(obj.voice&&["en-US","en-GB"].includes(obj.voice))state.voice=obj.voice;
state.view="all";setWords();logIt("教材匯入 "+count+" 張",{word:"批次匯入"});save();render();textStatus("✅ 已匯入 "+count+" 張卡片（同字更新，不重複新增）。")}catch(e){textStatus("匯入失敗："+(e.message||"格式不符")+"。請檢查 JSON／CSV 欄位。")}finally{$("importFile").value=""}}
function bind(){
$("viewNav").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(!b)return;state.view=b.dataset.view;save();render();if(state.view==="game")playWord(false)});
$("wordList").addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(b)selectWord(b.dataset.id,true)});
for(const id of ["q","topicFilter","gradeFilter","levelFilter"])$(id).addEventListener(id==="q"?"input":"change",renderList);
$("wordSpeak").addEventListener("click",()=>playWord(false));$("wordSlow").addEventListener("click",()=>playWord(true));$("wordReplay").addEventListener("click",()=>lastSpeech?playSpeech(lastSpeech.text,{slow:lastSpeech.slow,word:lastSpeech.word}):playWord(false));
$("sentenceSpeak").addEventListener("click",()=>playSentence(false));$("sentenceText").addEventListener("click",()=>playSentence(false));$("sentenceSlow").addEventListener("click",()=>playSentence(true));
$("testVoice").addEventListener("click",()=>playSpeech("Hello! Welcome to English Learning Island.",{}));$("voiceLocale").addEventListener("change",()=>{state.voice=$("voiceLocale").value;save();playSpeech("Hello!",{});});
$("recordStart").addEventListener("click",beginRecording);$("recordStop").addEventListener("click",stopRecording);
$("sttStart").addEventListener("click",startRecognition);
$("markLearned").addEventListener("click",()=>mark("learned"));$("markReview").addEventListener("click",()=>mark("review"));$("favToggle").addEventListener("click",fav);$("nextCard").addEventListener("click",next);
$("quizHear").addEventListener("click",()=>playWord(false));$("quizOptions").addEventListener("click",e=>{const b=e.target.closest("[data-answer]");if(b)answerQuiz(b.dataset.answer)});
$("saveNote").addEventListener("click",()=>{if(!selected)return;const id=selected.id;state.overrides[id]=Object.assign({},state.overrides[id]||{},{notes:$("noteInput").value});logIt("儲存單字備註",mOf(selected));save();textStatus("✅ 備註已儲存。")});
$("newCardBtn").addEventListener("click",editNew);$("editCurrentBtn").addEventListener("click",editSelected);$("clearEditor").addEventListener("click",editReset);$("editForm").addEventListener("submit",formSave);
$("exportJsonBtn").addEventListener("click",backupJson);$("exportCsvBtn").addEventListener("click",backupCsv);$("importFile").addEventListener("change",e=>{if(e.target.files?.[0])importFile(e.target.files[0])});
window.addEventListener("beforeunload",()=>{if(clipUrl)URL.revokeObjectURL(clipUrl);micStream?.getTracks().forEach(t=>t.stop())});
if(!SpeechRecognitionClass){$("sttStart").disabled=true;$("sttStart").title="此瀏覽器不支援語音辨識，可使用錄音回放";}
if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"||!window.isSecureContext){$("recordStart").disabled=true;$("recordHint").textContent="這個瀏覽器或嵌入頁不支援錄音。請使用 HTTPS 直接開啟本站，或改用 Chrome。";}
}
async function init(){load();bind();try{const r=await fetch("../data/english-learning-island.json",{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);source=await r.json();if(!Array.isArray(source.words)||!source.words.length)throw Error("來源單字缺失");setWords();render();textStatus("✅ 已連接原版 "+source.words.length+" 組中心單字；點單字或🔊就能聽。")}catch(e){source={words:[{id:"demo01",word:"hello",zh:"你好",zone:"eh"},{id:"demo02",word:"book",zh:"書",zone:"ab"},{id:"demo03",word:"fish",zh:"魚",zone:"eh"},{id:"demo04",word:"sun",zh:"太陽",zone:"qt"}]};setWords();render();textStatus("⚠️ 尚未載入原版資料，目前僅顯示示範字。請重新整理或檢查連線。")}}
init();
})();
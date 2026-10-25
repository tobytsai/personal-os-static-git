// Trello「台北小旅行 → 台北景點」靜態匯入卡片；資料檔在同資料夾。
(function(){
  "use strict";
  const regionNames={taipei:"臺北市",newtaipei:"新北市",keelung:"基隆市",taoyuan:"桃園市"};
  const cityIds=Object.keys(regionNames);
  const pagination=document.getElementById("placePagination");
  const loadMore=document.getElementById("placeLoadMore");
  const counter=document.getElementById("placeCounter");
  let attractions=[];
  let importState="loading";
  let pageSize=48;
  let lastFilterKey="";
  const esc=value=>String(value??"").replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});
  const safeTrello=value=>/^https:\/\/trello\.com\/c\/[A-Za-z0-9]+$/.test(value||"")?value:"";
  const safeOfficial=value=>/^https:\/\/(?:www\.travel\.taipei\/zh-tw\/attraction\/details\/\d+|newtaipei\.travel\/zh-tw\/Attractions\/Detail\/\d+|travel\.tycg\.gov\.tw\/zh-tw\/Travel\/Attraction\/\d+)$/i.test(value||"")?value:"";
  const mapUrl=r=>r.map||("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(r.name+" "+(r.address||regionNames[r.city]+" "+r.district)));
  const taoyuanCategoryFilters={"taoyuan-nature":"自然生態","taoyuan-history":"歷史人文","taoyuan-factory":"觀光工廠","taoyuan-walk":"休閒健走","taoyuan-north-cross":"北橫原鄉","taoyuan-play":"遊樂購物","taoyuan-water":"水岸埤塘","taoyuan-farm":"草花農場"};
  const taipeiCategoryFilters={"taipei-family":"親子共遊","taipei-commercial":"主題商街","taipei-outdoor":"戶外踏青","taipei-arts":"藝文館所","taipei-history":"歷史建築","taipei-cycling":"單車遊蹤","taipei-hot-spring":"養生溫泉","taipei-accessibility":"無障礙旅遊推薦景點","taipei-night-market":"觀光夜市","taipei-religion":"宗教信仰","taipei-water":"藍色水路","taipei-public-art":"公共藝術","taipei-101":"101亮點","taipei-service":"借問站","taipei-other":"其他"};
  const categoryFiltersByCity={taoyuan:taoyuanCategoryFilters,taipei:taipeiCategoryFilters};
  const taoyuanCategoryRules={
    "自然生態":{title:/自然|生態|森林|瀑布|神木|海岸|濕地|動物園|風景區|保護區|植物園|公園|生態園/,terms:["自然生態","生態","森林","瀑布","鳥類","賞鳥","昆蟲","濕地","保育","野生動物","山林","神木","自然環境","植物","生態池","生物多樣性"],minimum:3},
    "歷史人文":{title:/歷史|文化|古蹟|古道|古厝|老街|故事館|紀念|祠|廟|官舍|宿舍|眷村|文物|博物館|鐵路|車站|聚落|文化館|人文|古宅|故居|寺|橋|隧道|圖書館|美術館|藝術館|電影館|劇場|文創園區/,terms:["歷史","文化","古蹟","古道","古厝","老街","文物","信仰","客家","泰雅","部落","眷村","日式","日治","清代","紀念","文史","建築","傳統","遺址"],minimum:4},
    "觀光工廠":{title:/觀光工廠|工廠|製造所|體驗館|文創館|文教館|酒廠|工藝館|巧克力共和國|探索館|體驗園區/,terms:["觀光工廠","工廠","產線","生產線","製造所"],minimum:1},
    "休閒健走":{title:/步道|古道|登山|自行車|單車|鐵馬|健行|健走|綠廊|河濱|公園|廣場|球場|體育|自行車道/,terms:["步道","登山","健行","健走","自行車道","單車","鐵馬","散步","漫步","綠廊","環湖","騎乘","野餐"],minimum:2},
    "遊樂購物":{title:/商圈|夜市|購物|百貨|商場|Outlet|遊樂園|主題樂園|樂園|遊憩區|影城|Xpark|水族館|商業廣場|購物中心|名品城|文創園區/,terms:["購物中心","百貨","商圈","夜市","購物","遊樂園","主題樂園","遊樂設施","水族館"],minimum:2},
    "水岸埤塘":{title:/埤塘|水岸|河濱|溪|海岸|湖|潭|池|濕地|水庫|漁港|海堤|水圳|碼頭|石滬|紅橋/,terms:["埤塘","水岸","河岸","河濱","溪流","河流","湖泊","池塘","水庫","海岸","濕地","港口","碼頭","水圳","灌溉","漁港","石滬"],minimum:2},
    "草花農場":{title:/農場|農莊|農園|休閒農業|農業區|花海|花園|花卉|苗圃|果園|茶園|香草|草花|牧場|育苗/,terms:["農場","農莊","農業體驗","休閒農業","果園","花海","花園","花卉","草花","香草","園藝","苗圃","採果","茶園","農村","農事體驗","蔬菜育苗"],minimum:2}
  };
  const taoyuanCategoryOverrides={
    "霄裡玉元宮":["歷史人文"],"桃園防災教育館":["歷史人文"],"黑水號咖啡廳":["遊樂購物"],"佳安里(石門十一份)":["水岸埤塘","歷史人文"],
    "Global Mall 桃園A19":["遊樂購物"],"新屋農博環境教育園區":["自然生態","草花農場"],"桃園會展中心":["遊樂購物"],"中台環境資源教育中心":["自然生態"],
    "桃園國際機場":["遊樂購物"],"淘動漫":["遊樂購物"],"桃園北區客家會館":["歷史人文"],"龍岡國旗屋":["歷史人文"],
    "南崁兒童藝術村":["歷史人文","休閒健走"],"憲光二村":["歷史人文"],"棒球名人堂":["歷史人文","遊樂購物"],
    "葡萄王健康活力能量館":["觀光工廠"],"桃知道GELEVEN PLAZA":["遊樂購物"],"台灣高鐵桃園站":["遊樂購物"],
    "龍情‧魔幻豆子主題館":["觀光工廠"],"乳姑山":["自然生態","休閒健走"],"桃園軌道願景館":["歷史人文"],
    "楊梅故事園區":["歷史人文","休閒健走"],"觀音區多功能場館":["休閒健走"]
  };
  function attractionCategories(r){
    const supplied=Array.isArray(r.category)?r.category.filter(Boolean):[];
    if(r.city!=="taoyuan")return supplied;
    const name=r.name||"",text=name+" "+(r.topic||""),labels=new Set(supplied);
    if(r.district==="復興區"||/北橫|泰雅|原鄉|部落|拉拉山|巴陵|角板山|小烏來/.test(text))labels.add("北橫原鄉");
    for(const [label,rule] of Object.entries(taoyuanCategoryRules)){
      const hits=rule.terms.filter(word=>text.includes(word)).length;
      if(rule.title.test(name)||hits>=rule.minimum)labels.add(label);
    }
    (taoyuanCategoryOverrides[name]||[]).forEach(label=>labels.add(label));
    return [...labels];
  }
  const importedMode=()=>cityIds.includes(city)&&(venue==="all"||venue==="venues"||Boolean(categoryFiltersByCity[city]?.[venue]));
  const baseRenderVenueCards=renderVenueCards;
  const baseRenderAdminAreaButtons=renderAdminAreaButtons;
  const baseUpdate=update;
  function placeCard(r){
    const id=esc(r.id),name=esc(r.name),loc=esc(regionNames[r.city]+"・"+r.district),address=esc(r.address||"地址請以原始資料為準");
    const saved=favoriteVenueIds.includes(r.id);
    const category=attractionCategories(r);
    const tags=category.length?category.map(t=>'<span class="place-tag">'+esc(t)+'</span>').join(""):'<span class="place-tag">尚未提供分類標籤</span>';
    const popularity=r.rank?'<span class="place-tag">熱門第 '+esc(r.rank)+' 名 · '+Number(r.views||0).toLocaleString("zh-TW")+' 次瀏覽</span>':"";
    const sourceName=r.city==="newtaipei"?"新北市小旅行 → 新北市景點":r.city==="taoyuan"?"桃園小旅行 → 桃園市景點":"台北小旅行 → 台北景點";
    const officialLabel=r.city==="newtaipei"?"新北市觀光旅遊網":r.city==="taoyuan"?"桃園市觀光旅遊網":"臺北旅遊網";
    const summary=esc(r.topic||"來源卡片未提供摘要，可前往官方網站查看完整資訊。");
    const trello=safeTrello(r.trello),official=safeOfficial(r.official);
    const actions='<a class="venue-map" href="'+esc(mapUrl(r))+'" target="_blank" rel="noopener noreferrer" data-map-id="'+id+'">📍 Google 地圖 ↗</a>'+
      (trello?'<a class="place-source" href="'+esc(trello)+'" target="_blank" rel="noopener noreferrer" data-map-id="'+id+'">Trello 原始卡片 ↗</a>':"")+
      (official?'<a class="place-source" href="'+esc(official)+'" target="_blank" rel="noopener noreferrer" data-map-id="'+id+'">'+officialLabel+' ↗</a>':"");
    return '<article class="venue-card place-card"><div class="venue-card-head"><div><span class="tag">'+loc+'</span><h3>'+name+'</h3></div>'+
       '<button class="venue-star'+(saved?' saved':'')+'" type="button" data-favorite-id="'+id+'" aria-label="收藏 '+name+'" aria-pressed="'+saved+'">'+(saved?'★':'☆')+'</button></div>'+
       '<div class="place-tags">'+popularity+tags+'</div>'+
       '<p class="place-address">📍 '+address+'</p>'+
       '<p class="venue-summary">'+summary+'</p>'+
       '<details class="venue-explainer"><summary>？景點分類與使用說明</summary><p>來源：Trello「'+esc(sourceName)+'」。'+(category.length?'整理標籤：'+esc(category.join("、"))+'。':'來源卡片未提供分類／標籤。')+'出發前請確認最新開放資訊；點選 Google 地圖可查看路線。</p></details>'+
       '<div class="place-actions">'+actions+'</div></article>';
  }
  renderVenueCards=function(){
    if(!importedMode()){
      pagination.hidden=true;
      return baseRenderVenueCards();
    }
    cityVenueFeature.dataset.city=city;
    cityVenueFeature.dataset.area=quick;
    const cityName=regionNames[city];
    if(importState==="loading"){
      cityVenueTitle.textContent=cityName+"景點・正在載入";
      cityVenueCards.innerHTML='<p class="place-status">正在載入 Trello 景點資料…</p>';
      pagination.hidden=true;return;
    }
    if(importState==="error"){
      cityVenueTitle.textContent=cityName+"景點";
      cityVenueCards.innerHTML='<p class="place-status">景點資料載入失敗，請重新整理頁面；也可先由下方對應城市的 Trello 看板查看原始清單。</p>';
      pagination.hidden=true;return;
    }
    const area=adminArea==="all"?"":adminAreas[city]?.units[Number(adminArea)]||"";
    const keywords=search.value.trim().toLocaleLowerCase();
    const activeCategory=categoryFiltersByCity[city]?.[venue]||"";const match=attractions.filter(r=>r.city===city&&(!area||r.district===area)).filter(r=>!activeCategory||attractionCategories(r).includes(activeCategory)).filter(r=>!keywords||[r.name,r.address,r.district,r.topic,...attractionCategories(r)].join(" ").toLocaleLowerCase().includes(keywords));
    cityVenueTitle.textContent=cityName+(area?"・"+area:"")+(activeCategory?"・"+activeCategory:"")+"景點（"+match.length+"）";
    cityVenueCards.innerHTML=match.length?match.slice(0,pageSize).map(placeCard).join(""):'<p class="place-status">這個行政區沒有符合條件的景點卡片；可以清除搜尋文字或切換行政區。</p>';
    pagination.hidden=false;
    const sourceName=city==="newtaipei"?"新北市小旅行／新北市景點":city==="taoyuan"?"桃園小旅行／桃園市景點":"台北小旅行／台北景點";
    counter.textContent="已顯示 "+Math.min(match.length,pageSize)+"／"+match.length+" 筆 · 來源："+sourceName+" · 依地址分區";
    loadMore.hidden=pageSize>=match.length;
  };
  renderAdminAreaButtons=function(){
    baseRenderAdminAreaButtons();
    if(!cityIds.includes(city)||!attractions.length)return;
    const counts={};let total=0;
    attractions.forEach(r=>{if(r.city!==city)return;counts[r.district]=(counts[r.district]||0)+1;total++;});
    [...adminAreaButtons.querySelectorAll("button")].forEach((b,i)=>{
      const district=i?adminAreas[city].units[i-1]:null;
      b.textContent=i?district+" ("+(counts[district]||0)+")":"全部行政區 ("+total+")";
    });
  };
  update=function(){
    const key=[region,quick,city,venue,adminArea,search.value].join("|");
    if(key!==lastFilterKey){pageSize=48;lastFilterKey=key;}
    baseUpdate();
    if(importedMode()&&venue==="all"&&region==="taiwan"&&quick==="north"){
      cityVenueFeature.hidden=false;
    }
  };
  loadMore.addEventListener("click",function(){pageSize+=48;renderVenueCards();});
  const decodeGzipBase64=async text=>{const binary=atob(text.replace(/\s/g,""));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));return JSON.parse(await new Response(stream).text());};
  Promise.all([
    fetch("../data/taipei-trello-attractions.json?v=20261025-470",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error("Failed to fetch existing attractions: "+r.status);return r.json();}),
    fetch("../data/newtaipei-trello-attractions.json.gz.b64?v=20261025-742",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error("Failed to fetch New Taipei attractions: "+r.status);return r.text();}).then(decodeGzipBase64),
    fetch("../data/taoyuan-trello-attractions.json?v=20261026-340",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error("Failed to fetch Taoyuan attractions: "+r.status);return r.json();})
  ]).then(([data,newtaipeiRecords,taoyuanData])=>{
     if(!Array.isArray(data.records)||!data.records.length||!Array.isArray(newtaipeiRecords)||newtaipeiRecords.length!==742||!Array.isArray(taoyuanData.records)||taoyuanData.records.length!==340)throw Error("Invalid attractions data");
     const oldIds=new Map(data.records.filter(r=>r.city==="newtaipei").map(r=>[r.name+"|"+r.district,r.id]));
     const completeNewTaipei=newtaipeiRecords.map(r=>({...r,id:oldIds.get(r.name+"|"+r.district)||r.id}));
     attractions=[...data.records.filter(r=>r.city!=="newtaipei"),...completeNewTaipei,...taoyuanData.records].filter(r=>cityIds.includes(r.city)&&r.district&&r.district!=="待確認"&&r.name&&r.id);
     for(const r of attractions){venueById.set(r.id,{id:r.id,name:r.name,city:regionNames[r.city]+"・"+r.district,topic:r.topic,map:mapUrl(r)});}
     importState="ready";syncFilters();update();renderVenueActivity();
   })
   .catch(err=>{console.warn("Taiwan attraction import unavailable",err);importState="error";update();});
  update();
})();
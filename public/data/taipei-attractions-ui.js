// Trello「台北小旅行 → 台北景點」靜態匯入卡片；資料檔在同資料夾。
(function(){
  "use strict";
  const regionNames={taipei:"臺北市",newtaipei:"新北市",keelung:"基隆市"};
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
  const safeOfficial=value=>/^https:\/\/(?:www\.travel\.taipei\/zh-tw\/attraction\/details\/\d+|newtaipei\.travel\/zh-tw\/Attractions\/Detail\/\d+)$/i.test(value||"")?value:"";
  const mapUrl=r=>r.map||("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(r.name+" "+(r.address||regionNames[r.city]+" "+r.district)));
  const importedMode=()=>cityIds.includes(city)&&(venue==="all"||venue==="venues");
  const baseRenderVenueCards=renderVenueCards;
  const baseRenderAdminAreaButtons=renderAdminAreaButtons;
  const baseUpdate=update;
  function placeCard(r){
    const id=esc(r.id),name=esc(r.name),loc=esc(regionNames[r.city]+"・"+r.district),address=esc(r.address||"地址請以原始資料為準");
    const saved=favoriteVenueIds.includes(r.id);
    const category=(Array.isArray(r.category)?r.category:[]).filter(Boolean);
    const tags=category.length?category.map(t=>'<span class="place-tag">'+esc(t)+'</span>').join(""):'<span class="place-tag">尚未提供分類標籤</span>';
    const popularity=r.rank?'<span class="place-tag">熱門第 '+esc(r.rank)+' 名 · '+Number(r.views||0).toLocaleString("zh-TW")+' 次瀏覽</span>':"";
    const sourceName=r.city==="newtaipei"?"新北市小旅行 → 新北市景點":"台北小旅行 → 台北景點";
    const officialLabel=r.city==="newtaipei"?"新北市觀光旅遊網":"臺北旅遊網";
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
       '<details class="venue-explainer"><summary>？景點分類與使用說明</summary><p>來源：Trello「'+esc(sourceName)+'」。'+(category.length?'官方分類／標籤：'+esc(category.join("、"))+'。':'來源卡片未提供分類／標籤。')+'出發前請確認最新開放資訊；點選 Google 地圖可查看路線。</p></details>'+
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
      cityVenueCards.innerHTML='<p class="place-status">景點資料載入失敗，請重新整理頁面；也可先由下方「台北小旅行」Trello 看板查看原始清單。</p>';
      pagination.hidden=true;return;
    }
    const area=adminArea==="all"?"":adminAreas[city]?.units[Number(adminArea)]||"";
    const keywords=search.value.trim().toLocaleLowerCase();
    const match=attractions.filter(r=>r.city===city&&(!area||r.district===area)).filter(r=>!keywords||[r.name,r.address,r.district,r.topic,...(r.category||[])].join(" ").toLocaleLowerCase().includes(keywords));
    cityVenueTitle.textContent=cityName+(area?"・"+area:"")+"景點（"+match.length+"）";
    cityVenueCards.innerHTML=match.length?match.slice(0,pageSize).map(placeCard).join(""):'<p class="place-status">這個行政區沒有符合條件的景點卡片；可以清除搜尋文字或切換行政區。</p>';
    pagination.hidden=false;
    const sourceName=city==="newtaipei"?"新北市小旅行／新北市景點":"台北小旅行／台北景點";
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
    fetch("../data/newtaipei-trello-attractions.json.gz.b64?v=20261025-742",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error("Failed to fetch New Taipei attractions: "+r.status);return r.text();}).then(decodeGzipBase64)
  ]).then(([data,newtaipeiRecords])=>{
     if(!Array.isArray(data.records)||!data.records.length||!Array.isArray(newtaipeiRecords)||newtaipeiRecords.length!==742)throw Error("Invalid attractions data");
     const oldIds=new Map(data.records.filter(r=>r.city==="newtaipei").map(r=>[r.name+"|"+r.district,r.id]));
     const completeNewTaipei=newtaipeiRecords.map(r=>({...r,id:oldIds.get(r.name+"|"+r.district)||r.id}));
     attractions=[...data.records.filter(r=>r.city!=="newtaipei"),...completeNewTaipei].filter(r=>cityIds.includes(r.city)&&r.district&&r.district!=="待確認"&&r.name&&r.id);
     for(const r of attractions){venueById.set(r.id,{id:r.id,name:r.name,city:regionNames[r.city]+"・"+r.district,topic:r.topic,map:mapUrl(r)});}
     importState="ready";syncFilters();update();renderVenueActivity();
   })
   .catch(err=>{console.warn("Taiwan attraction import unavailable",err);importState="error";update();});
  update();
})();
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
  const safeOfficial=value=>/^https:\/\/www\.travel\.taipei\/zh-tw\/attraction\/details\/\d+$/.test(value||"")?value:"";
  const mapUrl=r=>"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(r.name+" "+(r.address||regionNames[r.city]+" "+r.district));
  const importedMode=()=>cityIds.includes(city)&&(venue==="all"||venue==="venues");
  const baseRenderVenueCards=renderVenueCards;
  const baseRenderAdminAreaButtons=renderAdminAreaButtons;
  const baseUpdate=update;
  function placeCard(r){
    const id=esc(r.id),name=esc(r.name),loc=esc(regionNames[r.city]+"・"+r.district),address=esc(r.address||"地址請以原始資料為準");
    const saved=favoriteVenueIds.includes(r.id);
    const category=(Array.isArray(r.category)?r.category:[]).filter(Boolean);
    const tags=category.slice(0,3).map(t=>'<span class="place-tag">'+esc(t)+'</span>').join("");
    const summary=esc(r.topic||"從 Trello 原始卡片閱讀景點介紹。");
    const trello=safeTrello(r.trello),official=safeOfficial(r.official);
    const actions='<a class="venue-map" href="'+esc(mapUrl(r))+'" target="_blank" rel="noopener noreferrer" data-map-id="'+id+'">📍 Google 地圖 ↗</a>'+
      (trello?'<a class="place-source" href="'+esc(trello)+'" target="_blank" rel="noopener noreferrer" data-map-id="'+id+'">Trello 原始卡片 ↗</a>':"")+
      (official?'<a class="place-source" href="'+esc(official)+'" target="_blank" rel="noopener noreferrer" data-map-id="'+id+'">臺北旅遊網 ↗</a>':"");
    return '<article class="venue-card place-card"><div class="venue-card-head"><div><span class="tag">'+loc+'</span><h3>'+name+'</h3></div>'+
       '<button class="venue-star'+(saved?' saved':'')+'" type="button" data-favorite-id="'+id+'" aria-label="收藏 '+name+'" aria-pressed="'+saved+'">'+(saved?'★':'☆')+'</button></div>'+
       (tags?'<div class="place-tags">'+tags+'</div>':"")+
       '<p class="place-address">📍 '+address+'</p>'+
       '<p class="venue-summary">'+summary+'</p>'+
       '<details class="venue-explainer"><summary>？景點分類與使用說明</summary><p>來源：Trello「台北小旅行 → 台北景點」。'+(category.length?'官方分類／標籤：'+esc(category.join("、"))+'。':"")+'出發前請確認最新開放資訊；點選 Google 地圖可查看路線。</p></details>'+
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
    counter.textContent="已顯示 "+Math.min(match.length,pageSize)+"／"+match.length+" 筆 · 來源：台北小旅行／台北景點 · 依地址分區";
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
  fetch("../data/taipei-trello-attractions.json?v=20261025-470",{cache:"no-cache"})
   .then(r=>{if(!r.ok)throw Error("Failed to fetch attractions: "+r.status);return r.json();})
   .then(data=>{
     if(!Array.isArray(data.records)||!data.records.length)throw Error("Invalid list");
     attractions=data.records.filter(r=>cityIds.includes(r.city)&&r.district&&r.district!=="待確認"&&r.name&&r.id);
     for(const r of attractions){
       venueById.set(r.id,{id:r.id,name:r.name,city:regionNames[r.city]+"・"+r.district,topic:r.topic,map:mapUrl(r)});
     }
     importState="ready";syncFilters();update();renderVenueActivity();
   })
   .catch(err=>{console.warn("Taipei attraction import unavailable",err);importState="error";update();});
  update();
})();
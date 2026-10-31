(function(){
  const homePage = !!document.querySelector(".rail");
  const base = homePage ? "./" : "../";
  const items = [
    ["←","返回首頁",base+"index.html"],
    ["▦","工具",base+"index.html#tools"],
    ["★","收藏",base+"index.html#favorites"],
    ["📅","行事曆",base+"pages/calendar.html"],
    ["📝","記事",base+"pages/my-notes.html?from="+encodeURIComponent(location.pathname+location.search)],
    ["T","Trello","https://trello.com/"],
    ["✉","Gmail","https://mail.google.com/"],
    ["▣","Drive","https://drive.google.com/"]
  ];
  const style = document.createElement("style");
  style.textContent = `
    #os-global-nav{position:fixed;top:0;left:0;right:0;z-index:10000;height:68px;display:flex;align-items:center;gap:12px;padding:7px 16px;background:rgba(255,255,255,.96);border-bottom:1px solid #e6e9ee;box-shadow:0 4px 18px rgba(25,31,40,.07);backdrop-filter:blur(12px)}
    #os-global-nav .os-brand{flex:0 0 52px;width:52px;height:52px;border:0;border-radius:16px;background:linear-gradient(135deg,#7657ff,#ff5c97);color:#fff;font-size:28px;font-weight:900;display:grid;place-items:center;cursor:pointer}
    #os-global-nav .os-links{display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:thin;min-width:0}
    #os-global-nav .os-link{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:8px 13px;border-radius:15px;background:#f5f6f8;color:#454b55;text-decoration:none;font:600 14px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC",sans-serif;white-space:nowrap}
    #os-global-nav .os-link:hover{background:#e9eaf4;color:#20242a}
    #os-global-nav .os-icon{font-size:19px;line-height:1}
    .os-page-home-link{display:none!important}
    #os-global-menu{position:fixed;z-index:10002;top:78px;left:14px;width:min(330px,calc(100vw - 28px));padding:12px;background:#fff;border:1px solid #e6e9ee;border-radius:20px;box-shadow:0 18px 48px rgba(25,31,40,.2);display:none}
    #os-global-menu.is-open{display:block}
    #os-global-menu .os-menu-title{padding:8px 10px 12px;color:#747c87;font:700 12px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC",sans-serif;letter-spacing:.08em}
    #os-global-menu .os-menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #os-global-menu .os-link{display:flex;align-items:center;gap:9px;padding:12px 10px;border-radius:13px;background:#f5f6f8;color:#30343a;text-decoration:none;font:600 14px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC",sans-serif}
    #os-global-menu .os-icon{font-size:19px;min-width:22px;text-align:center}
    #os-quick-note{position:fixed;right:15px;bottom:16px;z-index:10003;display:inline-flex;align-items:center;gap:6px;padding:11px 15px;border-radius:999px;background:#287c95;color:#fff;text-decoration:none;box-shadow:0 9px 26px #1947675c;border:1px solid #ffffff70;font:850 13px system-ui,-apple-system,"Noto Sans TC",sans-serif;white-space:nowrap}
    #os-quick-note:hover{background:#1d6080}
    @media(max-width:600px){#os-quick-note{right:9px;bottom:12px;padding:10px 13px;font-size:12px}}
    body.os-subpage{padding-top:76px!important}
    @media(max-width:600px){#os-global-nav{height:64px;padding:6px 10px;gap:9px}#os-global-nav .os-brand{flex-basis:48px;width:48px;height:48px;border-radius:15px}#os-global-nav .os-link{padding:9px 11px;font-size:13px}#os-global-menu{top:72px}body.os-subpage{padding-top:70px!important}}
  `;
  document.head.appendChild(style);
  const nav = document.createElement("nav");
  nav.id = "os-global-nav";
  nav.setAttribute("aria-label","Personal OS 功能列");
  nav.innerHTML = '<button class="os-brand" type="button" aria-label="開啟功能選單" aria-expanded="false">◈</button><div class="os-links"></div>';
  const links = nav.querySelector(".os-links");
  const menu = document.createElement("div");
  menu.id = "os-global-menu";
  menu.setAttribute("role","menu");
  menu.innerHTML = '<div class="os-menu-title">PERSONAL OS 功能選單</div><div class="os-menu-grid"></div>';
  const grid = menu.querySelector(".os-menu-grid");
  function makeLink(item){
    const a = document.createElement("a");
    a.className = "os-link";
    a.href = item[2];
    a.innerHTML = '<span class="os-icon" aria-hidden="true"></span><span></span>';
    a.querySelector(".os-icon").textContent = item[0];
    a.querySelectorAll("span")[1].textContent = item[1];
    if(/^https?:/.test(item[2])){a.target="_blank";a.rel="noopener"}
    a.addEventListener("click",()=>closeMenu());
    return a;
  }
  if(!homePage){
    document.querySelectorAll("a").forEach(a=>{if(/(返回首頁|回到.*首頁)/.test((a.textContent||"").replace(/\s+/g," ").trim()))a.classList.add("os-page-home-link")});
    document.body.classList.add("os-subpage");
    items.forEach(item=>links.appendChild(makeLink(item)));
    document.body.prepend(nav);
  }else{
    const brand=document.querySelector(".rail .logo");
    if(brand){
      brand.setAttribute("role","button");
      brand.setAttribute("tabindex","0");
      brand.setAttribute("aria-label","開啟功能選單");
      brand.setAttribute("aria-expanded","false");
      brand.style.cursor="pointer";
      brand.addEventListener("click",toggleMenu);
      brand.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleMenu()}});
    }
  }
  items.forEach(item=>grid.appendChild(makeLink(item)));
  document.body.appendChild(menu);
  if(!location.pathname.endsWith("/my-notes.html")){
    const quick=document.createElement("a");
    quick.id="os-quick-note";
    quick.href=base+"pages/my-notes.html?from="+encodeURIComponent(location.pathname+location.search);
    quick.textContent="📝 記事";
    quick.setAttribute("aria-label","記錄來自目前啟動器的記事");
    document.body.appendChild(quick);
  }

  function closeMenu(){
    menu.classList.remove("is-open");
    const brand=homePage?document.querySelector(".rail .logo"):nav.querySelector(".os-brand");
    if(brand)brand.setAttribute("aria-expanded","false");
  }
  function toggleMenu(){
    const open=!menu.classList.contains("is-open");
    menu.classList.toggle("is-open",open);
    const brand=homePage?document.querySelector(".rail .logo"):nav.querySelector(".os-brand");
    if(brand)brand.setAttribute("aria-expanded",String(open));
  }
  if(!homePage)nav.querySelector(".os-brand").addEventListener("click",toggleMenu);
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu()});
  document.addEventListener("click",e=>{
    if(menu.classList.contains("is-open")&&!menu.contains(e.target)&&!e.target.closest("#os-global-nav")&&!e.target.closest(".rail .logo"))closeMenu();
  });
})();
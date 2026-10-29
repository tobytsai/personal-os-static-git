/* 松風閣實品照片大圖：所有商品探索頁面共用。 */
(function(){
"use strict";
const panel=document.getElementById("sfg-calculator");
const grid=document.getElementById("sfg-frame-grid");
const preview=document.getElementById("sfg-preview-photo");
if(!panel||!grid||!preview||document.getElementById("sfg-photo-lightbox"))return;

const style=document.createElement("style");
style.textContent=String.raw`
/* 一鍵放大官方框型照片，兼容手機視窗與橫直圖 */
.sfg-frame-photo:not([hidden]),.sfg-preview-photo:not([hidden]){cursor:zoom-in}
.sfg-frame-choice:has(.sfg-frame-photo:not([hidden])) .sfg-frame-copy strong::after{content:" 🔍";font-size:11px;opacity:.7}
.sfg-photo-zoom-guide{display:block;text-align:center;margin:6px 0 12px;color:#54709a;font-size:12px;font-weight:750;line-height:1.5}
#sfg-photo-lightbox{inset:0;margin:auto;width:min(960px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:min(94dvh,900px);padding:0;border:0;border-radius:18px;background:#fff;color:#273a55;box-shadow:0 22px 80px #0008;overflow:auto}
#sfg-photo-lightbox:not([open]){display:none}
#sfg-photo-lightbox::backdrop{background:rgba(6,15,32,.86);backdrop-filter:blur(3px)}
.sfg-lightbox-content{position:relative;display:flex;flex-direction:column;padding:14px;gap:10px;min-width:0}
.sfg-lightbox-close{position:absolute;top:21px;right:21px;z-index:2;display:grid;place-items:center;min-width:42px;min-height:42px;border:0;border-radius:50%;background:#142238ec;color:#fff;cursor:pointer;font-size:27px;font-weight:600;line-height:1}
.sfg-lightbox-close:focus-visible,.sfg-lightbox-link:focus-visible{outline:3px solid #87adea;outline-offset:3px}
.sfg-lightbox-img{display:block;max-width:100%;width:100%;max-height:min(74dvh,700px);object-fit:contain;object-position:center;border-radius:12px;background:#fafcff}
.sfg-lightbox-img[hidden]{display:none!important}
.sfg-lightbox-error{display:none;min-height:170px;align-items:center;justify-content:center;text-align:center;background:#f5f7fa;border-radius:12px;color:#6b7b91;padding:20px}
.sfg-lightbox-error:not([hidden]){display:flex}
.sfg-lightbox-meta{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.sfg-lightbox-title{font-size:15px;font-weight:850;line-height:1.45;overflow-wrap:anywhere}
.sfg-lightbox-links{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sfg-lightbox-link{display:inline-block;padding:8px 11px;border:1px solid #cfdcef;border-radius:10px;color:#315b92;background:#f4f8ff;font-size:12px;font-weight:800;text-decoration:none}
.sfg-lightbox-link[hidden]{display:none!important}
.sfg-lightbox-footnote{margin:0;color:#73829a;font-size:11px;line-height:1.6}
@media(max-width:560px){
 #sfg-photo-lightbox{width:calc(100vw - 14px);max-width:calc(100vw - 14px);max-height:94dvh;border-radius:14px}
 .sfg-lightbox-content{padding:8px;gap:8px}
 .sfg-lightbox-img{max-height:73dvh;border-radius:9px}
 .sfg-lightbox-close{top:14px;right:14px;min-width:40px;min-height:40px}
 .sfg-lightbox-title{font-size:13px}
 .sfg-lightbox-link{font-size:11px;padding:7px 9px}
}
`;
document.head.appendChild(style);

const dialog=document.createElement("dialog");
dialog.id="sfg-photo-lightbox";
dialog.setAttribute("aria-label","松風閣框型實品大圖");
dialog.innerHTML=String.raw`
<div class="sfg-lightbox-content">
 <button id="sfg-lightbox-close" class="sfg-lightbox-close" type="button" aria-label="關閉大圖" title="關閉大圖">×</button>
 <img id="sfg-lightbox-image" class="sfg-lightbox-img" alt="" referrerpolicy="no-referrer" decoding="async">
 <div id="sfg-lightbox-error" class="sfg-lightbox-error" hidden>原始照片暫時無法顯示，請使用下方「查看官網原圖」。</div>
 <div class="sfg-lightbox-meta">
  <strong id="sfg-lightbox-title" class="sfg-lightbox-title"></strong>
  <div class="sfg-lightbox-links">
   <a id="sfg-lightbox-original" class="sfg-lightbox-link" target="_blank" rel="noopener noreferrer">查看官網原圖 ↗</a>
   <a id="sfg-lightbox-product" class="sfg-lightbox-link" target="_blank" rel="noopener noreferrer" hidden>商品詳情 ↗</a>
  </div>
 </div>
 <p class="sfg-lightbox-footnote">照片來自松風閣官網，實際色澤可能因螢幕不同而有差異；點背景或按 Esc 可關閉。</p>
</div>
`;
document.body.appendChild(dialog);

const big=dialog.querySelector("#sfg-lightbox-image");
const error=dialog.querySelector("#sfg-lightbox-error");
const title=dialog.querySelector("#sfg-lightbox-title");
const originalLink=dialog.querySelector("#sfg-lightbox-original");
const productLink=dialog.querySelector("#sfg-lightbox-product");
const closeButton=dialog.querySelector("#sfg-lightbox-close");
let returnFocus=null;
const isPhoto=url=>typeof url==="string"&&/^https:\/\/sfg218\.com\/admin\/goods_pic\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(url);
const isProduct=url=>typeof url==="string"&&/^https:\/\/sfg218\.com\/frame_info\.php\?class=\d+&no=\d+$/.test(url);

function openPhoto(url,name,productUrl,focusTarget){
 if(!isPhoto(url))return false;
 returnFocus=focusTarget||document.activeElement;
 title.textContent=name||"松風閣框型實品照片";
 big.alt=title.textContent;
 error.hidden=true;big.hidden=false;
 originalLink.href=url;
 if(isProduct(productUrl)){productLink.href=productUrl;productLink.hidden=false;}
 else{productLink.removeAttribute("href");productLink.hidden=true;}
 big.src=url;
 if(typeof dialog.showModal==="function"){if(!dialog.open)dialog.showModal();}
 else dialog.setAttribute("open","");
 closeButton.focus();
 return true;
}
function closePhoto(){
 if(typeof dialog.close==="function"&&dialog.open)dialog.close();
 else{dialog.removeAttribute("open");restoreFocus();}
}
function restoreFocus(){
 if(returnFocus&&document.contains(returnFocus)&&typeof returnFocus.focus==="function")returnFocus.focus();
 returnFocus=null;
}
closeButton.addEventListener("click",closePhoto);
dialog.addEventListener("close",restoreFocus);
dialog.addEventListener("click",e=>{if(e.target===dialog)closePhoto();});
dialog.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&typeof dialog.close!=="function"){e.preventDefault();closePhoto();}
});
big.addEventListener("error",()=>{big.hidden=true;error.hidden=false;});

// Selecting a frame remains available by tapping anywhere else on its card.
// Tapping the actual photograph instead opens the original full-size image.
grid.addEventListener("click",e=>{
 const thumb=e.target.closest?.(".sfg-frame-photo");
 if(!thumb||thumb.hidden)return;
 const card=thumb.closest("[data-sfg-frame]");
 if(!card)return;
 const match=/^sf-(\d+)$/.exec(card.dataset.sfgFrame||"");
 if(!match)return;
 const n=Number(match[1]);
 const record=window.SFG_OFFICIAL_FRAME_PHOTOS?.[n];
 const frame=window.SFG_SHEET_FRAME_PRICES?.[n];
 const label=card.querySelector(".sfg-frame-copy strong")?.textContent||thumb.alt;
 if(!record||!isPhoto(record.full))return;
 e.preventDefault();
 e.stopPropagation(); // 不誤觸框型切換，原本報價仍維持
 openPhoto(record.full,label,frame?.url,card);
},true);

// The larger selected-frame preview is also independently zoomable by
// touch, mouse, Enter or Space for accessible keyboard navigation.
preview.tabIndex=0;
preview.setAttribute("role","button");
preview.setAttribute("aria-label","點擊放大松風閣框條實品照片");
preview.title="點擊查看框條大圖";
function openPreview(){
 if(preview.hidden||!isPhoto(preview.dataset.current||preview.src))return;
 const url=preview.dataset.current||preview.src;
 const item=document.getElementById("sfg-selected-name")?.textContent||preview.alt;
 const product=document.getElementById("sfg-frame-link")?.href;
 openPhoto(url,item,product,preview);
}
preview.addEventListener("click",openPreview);
preview.addEventListener("keydown",e=>{
 if(e.key==="Enter"||e.key===" "){e.preventDefault();openPreview();}
});
const note=document.getElementById("sfg-preview-note");
if(note){
 const hint=document.createElement("small");
 hint.className="sfg-photo-zoom-guide";
 hint.textContent="🔍 點框型照片或上方實品預覽，即可查看大圖";
 note.insertAdjacentElement("afterend",hint);
}
})();
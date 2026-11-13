/* Personal OS — mobile thumb actions. Does not change reminder data. */
(()=>{
  'use strict';
  const bar=document.getElementById('mobile-action-bar');
  if(!bar)return;
  function move(id){
    const section=document.getElementById(id);if(!section)return;
    const fold=section.querySelector('.home-fold');if(fold)fold.open=true;
    section.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function reminders(){
    const section=document.querySelector('.hero>.reminders');
    if(!section)return;
    const content=document.getElementById('reminder-content'),toggle=document.getElementById('reminder-toggle');
    if(content&&content.hidden&&toggle)toggle.click();
    section.scrollIntoView({behavior:'smooth',block:'start'});
  }
  const actions={
    search:()=>{
      const input=document.getElementById('q');
      if(!input)return;
      input.scrollIntoView({behavior:'smooth',block:'center'});
      try{input.focus({preventScroll:true});}catch{input.focus();}
    },
    reminders,
    calendar:()=>{
      const card=document.querySelector('.hero>.calendar');
      if(card)card.scrollIntoView({behavior:'smooth',block:'start'});
    },
    favorites:()=>move('favorites'),
    tools:()=>move('tools')
  };
  bar.addEventListener('click',e=>{
    const btn=e.target.closest('[data-mobile-action]');
    if(!btn||!bar.contains(btn))return;
    const action=btn.dataset.mobileAction;
    if(!Object.prototype.hasOwnProperty.call(actions,action))return;
    actions[action]();
  });
})();

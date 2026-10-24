/* Village-first interface; shared rules and transport remain in their own modules. */
(() => {
  'use strict';
  const C=window.LanternCore,L=window.LanternLocale,Base=window.OnlineGame;
  const {esc,iconSVG,avatar,RoleSystem,SHORT_ROLE}=C;
  const {normalizeRoomCode}=window.LanternNetwork;
  const t=s=>L.t(s);
  L.register({
    'A quiet village. A dangerous secret.':'قرية هادئة… وسرّ خطير.',
    'Your name':'اسمك','Room':'الغرفة','Match options':'إعدادات المباراة',
    'Finish turn':'إنهاء الدور','Sleep':'النوم','Turn finished':'اكتمل دورك',
    'Waiting for the village':'بانتظار بقية القرية','Choose a house':'اختر منزلًا',
    'Use your ability, then finish your turn.':'استخدم قدرتك ثم أنهِ دورك.',
    'Choose a resident':'اختر لاعبًا','Votes locked':'أصوات مؤكدة',
    'Talk to the village':'تحدّث مع القرية','Night actions':'أفعال الليل',
    'Your secret role':'دورك السري','Role pool':'الأدوار المتاحة',
    'Share the code with your friends.':'شارك الرمز مع أصدقائك.',
    'Nobody is safe after dark.':'لا أحد آمن بعد حلول الظلام.',
    'Ready to begin':'مستعد للبدء','Day':'النهار','Night':'الليل',
    'Seconds':'ثوانٍ','Force next phase':'فرض المرحلة التالية',
    'The host keeps this room alive.':'يجب أن يُبقي المضيف صفحة الغرفة مفتوحة.',
    'Confirm':'تأكيد','Locked':'تم التأكيد','Skip':'تخطّي',
    'The room service disconnected. This room has ended.':'انقطع الاتصال بخدمة الغرف وانتهت هذه الغرفة.',
    'Cannot reach the room service. Reconnecting…':'تعذر الوصول إلى خدمة الغرف. جارٍ إعادة الاتصال…',
    'The room service is unavailable.':'خدمة الغرف غير متاحة حاليًا.',
  });
  const option=(value,label,current)=>`<option value="${value}" ${String(value)===String(current)?'selected':''}>${esc(t(label))}</option>`;
  class VillageGame extends Base {
    install(){
      super.install();const e=this.e,ui=e.ui;
      const theme=document.querySelector('link[href="village-ui.css"]');if(theme)document.head.append(theme);
      ui.showGame=()=>this.showGame();
      ui.refreshActions=()=>this.actions();
      const refresh=ui.refresh.bind(ui);
      ui.refresh=()=>{if(!e.state)return;const s=e.state,p=s.players[0],node=ui.root.querySelector('#lh-actions');const signature=JSON.stringify([L.language,s.phase,s.day,s.players.map(q=>[q.id,q.name,q.color,q.hat,q.glasses,q.accessory,q.alive,q.publicRole]),p.role,p.charges,p.intel,p.bombs,s.log.length,s.history.length,s.publicExposures,e.selected,e.vote,e.voteLocked,e.nightTarget,e.nightMode,e.humanActions,e.visibleVotes,s.nightFinished,this.room?.finishedCount,s.winner]);if(this.hudNode!==node||this.hudSignature!==signature){this.hudNode=node;this.hudSignature=signature;refresh();}else ui.tick();const night=['night','resolve','reveal'].includes(s.phase);const day=Math.max(1,s.day-(night?0:1));const label=ui.root.querySelector('#lh-day');if(label)label.textContent=`${t(night?'Night':'Day')} ${day}`;const notes=ui.root.querySelector('#village-clue-count');if(notes)notes.textContent=p.intel.length||'';};
      ui.phaseText=()=>t({reveal:'Your secret role',day:'DISCUSS',vote:'VOTE',verdict:'VERDICT',night:'Night actions',resolve:'NIGHT',morning:'DAWN',end:'FINISHED'}[e.state.phase]);
    }
    home(){
      if(this.room)return this.renderRoom();const e=this.e,ui=e.ui;
      const code=ui.root.querySelector('#online-code')?.value||new URL(location.href).searchParams.get('room')||this.loadSession()?.code||'';
      ui.closeModal();e.state=null;e.nightSequence=null;e.voteOut=null;e.nightBefore=null;e.paused=false;e.screen='home';
      this.previewResidents([],true);ui.root.dataset.screen='home';ui.root.setAttribute('data-online-home','');ui.root.classList.remove('chat-open');ui.root.classList.toggle('online-shell-rtl',L.language==='ar');
      ui.screen.innerHTML=`${this.languageButton()}<div class="village-wordmark"><span>LANTERN</span><strong>HOLLOW</strong><p>${t('A quiet village. A dangerous secret.')}</p></div><section class="entrance-panel"><div class="entrance-identity"><button class="portrait-button" data-act="customize" title="${t('Your character')}">${avatar(this.profile())}</button><label><span>${t('Your name')}</span><input id="lh-name" data-config="name" maxlength="18" value="${esc(e.config.name)}" autocomplete="nickname" aria-label="${t('Your name')}"></label></div><div class="entrance-buttons"><button class="btn primary" data-act="create-room" ${this.busy?'disabled':''}>${iconSVG('play',20)} ${t('CREATE ROOM')}</button><span class="entrance-or">/</span><div class="join-pair"><input id="online-code" class="code-field" maxlength="6" value="${esc(normalizeRoomCode(code))}" aria-label="${t('ROOM CODE')}" placeholder="${t('ROOM CODE')}" autocomplete="off" spellcheck="false"><button class="btn light" data-act="join-room" ${this.busy?'disabled':''}>${t('JOIN ROOM')} ${iconSVG('arrow',18)}</button></div></div><div class="online-status ${this.status&&!this.busy?'error':''}" id="online-status" role="status">${esc(t(this.status))}</div><div class="entrance-footer"><span>4–12 ${t('Players')}</span><button data-act="how">${iconSVG('info',17)} ${t('How to play')}</button></div></section>`;
      ui.screen.querySelector('#lh-name').addEventListener('input',ev=>{e.config.name=ev.target.value.slice(0,18);e.save();});
      ui.screen.querySelector('#online-code').addEventListener('keydown',ev=>{if(ev.key==='Enter')this.join();});L.refresh(ui.root);
    }
    previewResidents(members,home=false){
      const e=this.e;
      const source=home?Array.from({length:8},(_,i)=>({id:i,name:'',color:C.COLORS[i],hat:['none','cap','flower','leaf'][i%4],glasses:false,accessory:'none'})):members;
      const own=source.findIndex(m=>m.id===this.memberId);const ordered=own>0?[source[own],...source.filter((_,i)=>i!==own)]:source;
      const old=e.preview?.players||[];
      const players=ordered.map((m,i)=>({...m,id:i,alive:true,blink:i*.4,x:old[i]?.x??720,y:old[i]?.y??450,tx:720,ty:450,bubble:'',bubbleTime:0}));
      e.preview={players,player(id){return this.players.find(p=>p.id===id);}};e.scene.map.layout(players);
    }
    renderRoom(){
      if(!this.room)return this.home();const e=this.e,ui=e.ui,r=this.room;
      const signature=JSON.stringify(r)+L.language+this.memberId;if(signature===this.lobbySignature&&e.screen==='room')return;this.lobbySignature=signature;
      const optionsOpen=!!ui.screen.querySelector('.lobby-game.options-open');
      ui.closeModal();e.state=null;e.screen='room';e.paused=false;e.nightSequence=null;e.voteOut=null;this.previewResidents(r.members);
      ui.root.dataset.screen='lobby';ui.root.removeAttribute('data-online-home');ui.root.classList.toggle('online-shell-rtl',L.language==='ar');
      const me=r.members.find(m=>m.id===this.memberId),start=r.members.length>=4&&r.members.every(m=>m.connected&&m.ready),s=r.settings,maxBad=Math.max(1,Math.floor((r.members.length-1)/2));
      ui.screen.innerHTML=`${this.languageButton()}<main class="lobby-game ${optionsOpen?'options-open':''}"><header class="lobby-header"><button class="iconbtn" data-act="leave-room" title="${t('LEAVE ROOM')}">${iconSVG('back',21)}</button><span>${t('Room')}</span><strong class="room-code" data-no-i18n>${esc(r.code)}</strong><button class="iconbtn" data-act="copy-code" title="${t('COPY CODE')}">${iconSVG('book',19)}</button><button class="iconbtn" data-act="copy-link" title="${t('COPY LINK')}">${iconSVG('arrow',19)}</button></header><aside class="lobby-roster paper-panel"><div class="dock-title">${t('Players')} <b>${r.members.length}/12</b></div>${r.members.map(m=>`<div class="lobby-person ${m.ready?'ready':''} ${m.connected?'':'offline'}">${avatar(m)}<span class="name" data-no-i18n>${esc(m.name)}</span>${m.id===r.hostId?iconSVG('crown',14):''}<i class="ready-dot" title="${t(m.ready?'READY':'NOT READY')}"></i>${this.isHost&&m.id!==r.hostId?`<button data-act="kick" data-member="${esc(m.id)}" title="${t('Remove player')}">×</button>`:''}</div>`).join('')}<small>${t('Share the code with your friends.')}</small></aside><button class="options-toggle paper-panel" data-act="toggle-room-settings">${iconSVG('settings',20)} ${t('Match options')}</button><aside class="match-settings paper-panel"><div class="dock-title">${t('CUSTOM GAME')}<button data-act="toggle-room-settings">×</button></div><div class="setting-pair"><label>${t('IMPOSTORS')}<select data-setting="impostorCount" ${this.isHost?'':'disabled'} aria-label="${t('IMPOSTORS')}">${option('random','RANDOM',s.impostorCount)}${Array.from({length:maxBad},(_,i)=>option(i+1,String(i+1),s.impostorCount)).join('')}</select></label><label>${t('NEUTRALS')}<select data-setting="neutralCount" ${this.isHost?'':'disabled'} aria-label="${t('NEUTRALS')}">${[0,1,2,3].map(n=>option(n,String(n),s.neutralCount)).join('')}</select></label></div>${[['discussion','DAY TIMER'],['voting','VOTE TIMER'],['night','NIGHT TIMER']].map(([key,label])=>`<label class="timer-setting"><span>${t(label)}</span><input type="number" data-setting="${key}" value="${s[key]}" min="5" max="600" ${this.isHost?'':'disabled'} aria-label="${t(label)}"><small>${t('Seconds')}</small></label>`).join('')}<details><summary>${t('ENABLED ROLES')}</summary><div class="role-options">${Object.entries(RoleSystem.roles).map(([key,role])=>`<label title="${esc(t(role.description))}"><input type="checkbox" data-online-role="${key}" ${s.enabled.includes(key)?'checked':''} ${this.isHost?'':'disabled'}>${iconSVG(key,19)}<span>${esc(t(role.name))}</span></label>`).join('')}</div></details></aside><footer class="lobby-ready paper-panel"><div><strong>${t(r.members.length<4?'Waiting for friends':start?'Ready to begin':'Everyone must be ready.')}</strong><small>${t('The host keeps this room alive.')}</small></div><button class="btn ${me?.ready?'light':'primary'}" data-act="ready">${iconSVG(me?.ready?'check':'heart',20)} ${t(me?.ready?'READY':'NOT READY')}</button>${this.isHost?`<button class="btn primary" data-act="start-match" ${start?'':'disabled'}>${iconSVG('play',20)} ${t('START MATCH')}</button>`:`<span class="waiting-host">${t('WAITING FOR HOST')}</span>`}</footer></main>`;L.refresh(ui.root);
    }
    showGame(){
      const e=this.e,ui=e.ui,s=e.state;e.screen='game';ui.root.dataset.screen='game';ui.logCount=-1;
      const pool=s.config.enabled||[];
      ui.screen.innerHTML=`<header class="hud village-hud"><div class="hudleft"><button class="role-badge" data-act="myrole" id="lh-rolebadge" title="${t('Your secret role')}"></button><div class="alive-pill">${iconSVG('heart',15)}<span id="lh-alive"></span></div></div><div class="phasebadge"><div class="phase-symbol" id="lh-phaseicon"></div><div><div id="lh-day"></div><strong id="lh-phase"></strong></div><div class="clock"><span id="lh-timer"></span><div class="timebar"><i id="lh-timebar"></i></div></div></div><div class="hudright"><button class="iconbtn" data-act="pause" id="lh-pause" title="${t('Pause')}"></button><button class="iconbtn" data-act="mute" id="lh-mute" title="${t('Sound')}"></button><button class="iconbtn" data-act="settings" title="${t('Settings')}">${iconSVG('settings',20)}</button><button class="iconbtn" data-act="menuconfirm" title="${t('Leave match')}">${iconSVG('back',20)}</button></div></header><button class="role-pool paper-panel" data-act="guide" title="${t('Role pool')}">${pool.slice(0,10).map(key=>iconSVG(key,22)).join('')}${pool.length>10?`<small>+${pool.length-10}</small>`:''}</button><div class="toolstrip"><button data-act="notebook" id="lh-notebookbutton" title="${t('Private notebook')}">${iconSVG('book',22)}<b id="village-clue-count"></b></button><button data-act="events" title="${t('Public report')}">${iconSVG('lookout',22)}</button></div><div id="lh-float" class="phase-hint"></div><div id="lh-eventstrip"></div><aside id="lh-selection"></aside><section class="chatpanel paper-panel"><div class="chathead">${t('Talk to the village')}<span id="lh-chatstatus"></span><button data-act="chatdrawer" aria-label="${t('Close conversation')}">−</button></div><div class="chatlog" id="lh-chatlog" aria-live="polite"></div><form id="lh-chat-form" class="chatform"><input maxlength="180" placeholder="${t('Say something…')}" aria-label="${t('Chat message')}"><button type="submit" aria-label="${t('Send message')}">${iconSVG('arrow',20)}</button></form></section><button class="chat-toggle" id="lh-chatbutton" data-act="chatdrawer" title="${t('Conversation')}">${iconSVG('chat',22)}<i></i></button><aside class="actionpanel paper-panel" id="lh-actions"></aside><nav class="roster" id="lh-roster" aria-label="${t('Residents')}"></nav>`;
      ui.root.classList.toggle('chat-open',innerWidth>=900);ui.refresh();
    }
    actions(){
      const e=this.e,s=e.state,node=e.ui.root.querySelector('#lh-actions');if(!s||!node)return;
      const p=s.players[0],role=RoleSystem.perceived(p),key=p.role==='insane'&&p.alive?p.cover:p.role;
      const roleHeader=`<div class="action-role">${iconSVG(key,24)}<div><strong>${esc(t(role.name))}</strong><small>${t(SHORT_ROLE[key]||'')}</small></div></div>`;
      let html='';const target=q=>q?`<div class="action-target">${avatar(q)}<span class="name" data-no-i18n>${esc(q.name)}</span>${iconSVG('check',15)}</div>`:`<div class="action-target empty">${iconSVG('arrow',17)} ${t(s.phase==='vote'?'Choose a resident':'Choose a house')}</div>`;
      if(s.phase==='reveal')html=`<div class="action-wait">${iconSVG('heart',24)}${t('Waiting for the village')}</div>`;
      else if(s.phase==='resolve'||s.phase==='verdict')html=`<div class="action-wait">${iconSVG(s.phase==='resolve'?'moon':'vote',24)}${t(s.phase==='resolve'?'NIGHT':'VERDICT')}</div>`;
      else if(!p.alive)html=`<div class="action-wait">${iconSVG('haunter',24)} ${t('ELIMINATED')}</div>`;
      else if(s.phase==='night'){
        if(s.nightFinished)html=`${roleHeader}<div class="turn-done">${iconSVG('check',24)}<span>${t('Turn finished')}<small>${t('Waiting for the village')} · ${this.room.finishedCount}/${this.room.aliveCount}</small></span></div>`;
        else {
          const mode=e.nightMode,q=s.player(e.nightTarget),confirmed=e.humanActions.some(a=>a.mode===mode),haveTargets=e.validTargets().length>0;
          let tabs='';if(p.faction==='impostors'&&key!=='impostor')tabs=`<div class="night-tabs"><button data-act="nightmode" data-mode="kill" class="${mode==='kill'?'active':''}" title="${t('Team attack')}">${iconSVG('impostor',20)}</button><button data-act="nightmode" data-mode="ability" class="${mode!=='kill'?'active':''}" title="${t(role.verb)}">${iconSVG(key,20)}</button></div>`;
          if(key==='bomber')tabs=`<div class="night-tabs"><button data-act="nightmode" data-mode="plant" class="${mode!=='detonate'?'active':''}">${iconSVG('bomber',20)}</button><button data-act="nightmode" data-mode="detonate" class="${mode==='detonate'?'active':''}" ${!p.bombs.some(id=>s.player(id)?.alive)?'disabled':''}>${iconSVG('sun',20)}</button></div>`;
          const guess=key==='sorcerer'?`<select id="lh-guess" aria-label="${t('Guess target role')}">${Object.entries(RoleSystem.roles).map(([k,r])=>option(k,r.name,e.guess)).join('')}</select>`:'';
          const canCast=(mode==='detonate'&&p.bombs?.some(id=>s.player(id)?.alive))||(haveTargets&&q&&e.validTargets().some(v=>v.id===q.id));
          html=`${roleHeader}${tabs}${target(q)}${guess}<div class="turn-buttons"><button class="btn primary" data-act="nightconfirm" ${!canCast||confirmed?'disabled':''}>${iconSVG(confirmed?'check':mode==='kill'?'impostor':key,19)} ${t(confirmed?'Locked':mode==='kill'?'ATTACK':mode==='detonate'?'DETONATE':role.verb)}</button><button class="btn light" data-act="finish-night">${iconSVG('moon',18)} ${t(e.humanActions.length?'Finish turn':'Sleep')}</button></div>`;
        }
      }else if(s.phase==='vote'){const q=s.player(e.vote);html=`${target(q)}<div class="turn-buttons"><button class="btn primary" data-act="voteconfirm" ${!q||e.voteLocked?'disabled':''}>${iconSVG(e.voteLocked?'check':'vote',20)} ${t(e.voteLocked?'VOTED':'VOTE')}</button><button class="btn light" data-act="skipvote" ${e.voteLocked?'disabled':''}>${t('Skip')}</button></div><small class="action-meta">${t('Votes locked')} · ${e.visibleVotes.length}/${s.players.filter(q=>q.alive).length}</small>`;}
      else if(s.phase==='day')html=`<div class="action-wait">${iconSVG('sun',23)}${t('Who do you trust?')}</div>${this.isHost?`<button class="btn light" data-act="advance">${iconSVG('vote',20)} ${t('START VOTE')}</button>`:''}`;
      else if(s.phase==='morning')html=`<div class="action-wait">${iconSVG('sun',23)} ${t('DAWN')}</div>`;
      else if(s.phase==='end')html=`<button class="btn primary" data-act="results">${iconSVG('star',22)} ${t('RESULTS')}</button>`;
      if(this.actionNode!==node||this.actionMarkup!==html){this.actionNode=node;this.actionMarkup=html;node.innerHTML=html;L.refresh(node);}
    }
    handle(action,data){
      if(action==='finish-night'){this.command({type:'finish-night'});return true;}
      if(action==='toggle-room-settings'){this.e.ui.screen.querySelector('.lobby-game')?.classList.toggle('options-open');return true;}
      if(action==='admin-advance'){this.e.ui.closeModal();this.command({type:'advance'});return true;}
      return super.handle(action,data);
    }
    settings(){super.settings();if(this.isHost&&this.e.state&&!['resolve','verdict','end'].includes(this.e.state.phase)){const wrapper=this.e.ui.layer.querySelector('[data-online-settings]');if(wrapper){const button=document.createElement('button');button.className='btn light wide';button.dataset.act='admin-advance';button.textContent=t('Force next phase');wrapper.append(button);}}}
  }
  window.OnlineGame=VillageGame;
})();

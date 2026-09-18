const fmt = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const money = n => `${fmt.format(Math.round((Number(n)||0)*100)/100)} ₽`;
const num = v => Number(String(v ?? '').replace(',','.')) || 0;
const ceil = Math.ceil;
const BOX_VOLUME_L = 96;      // 60×40×40 см = 96 000 см³ = 96 л
const BOXES_PER_PALLET = 16;

const DEFAULT_RATES = {
  unloadPallet:200, unloadCrate:2000, unloadBag:200, unloadBox:100,
  acceptance:10,
  marking:8,
  storageM3Day:62.5, storagePalletMonth:3000,
  fboBox:150, fboDeliveryBox:250, pallet:600, stretch:350, newBox:100, reboxItem:20,
  fbsBox:100, fbsDeliveryBox:500, fbsVolumePerLiter:10, fbsVolumeMinItem:20
};
let rates = {...DEFAULT_RATES, ...(JSON.parse(localStorage.getItem('atlantRates')||'{}'))};
const $ = id => document.getElementById(id);

const unloadDefs = [
  ['unloadPallet','Паллет','пал.'],['unloadCrate','Обрешётка','шт.'],['unloadBag','Баул','шт.'],['unloadBox','Короб','кор.']
];

// ---------- SKU ----------
function addSku(data={}){
  const t=document.querySelector('#skuTemplate').content.cloneNode(true); const card=t.querySelector('.sku-card');
  card.querySelector('.skuName').value=data.name||''; card.querySelector('.skuQty').value=data.qty||'';
  card.querySelector('.skuL').value=data.l||''; card.querySelector('.skuW').value=data.w||''; card.querySelector('.skuH').value=data.h||'';
  card.querySelectorAll('input').forEach(i=>i.addEventListener('input',recalc));
  card.querySelector('.removeSku').addEventListener('click',()=>{card.remove(); renumberSkus(); recalc()});
  document.querySelector('#skuList').append(card); renumberSkus(); recalc();
}
function renumberSkus(){document.querySelectorAll('.sku-card').forEach((c,i)=>c.querySelector('.sku-title').textContent=`Товар ${i+1}`)}
function getSkus(){return [...document.querySelectorAll('.sku-card')].map(c=>{
  const qty=num(c.querySelector('.skuQty').value), l=num(c.querySelector('.skuL').value), w=num(c.querySelector('.skuW').value), h=num(c.querySelector('.skuH').value);
  const liters=l*w*h/1000; return {name:c.querySelector('.skuName').value.trim()||'Без названия',qty,l,w,h,liters,totalLiters:liters*qty,boxes:liters>0?ceil((liters*qty)/BOX_VOLUME_L):0,card:c};
})}
function goodsTotals(){const s=getSkus();return {qty:s.reduce((a,x)=>a+x.qty,0),liters:s.reduce((a,x)=>a+x.totalLiters,0),boxes:s.reduce((a,x)=>a+x.boxes,0)}}

// ---------- РАЗГРУЗКА ----------
function renderUnload(){
  const root=document.querySelector('#unloadRows'); root.innerHTML='';
  unloadDefs.forEach(([key,label,unit])=>{
    const row=document.createElement('label');row.className='switch-card';
    row.innerHTML=`<input class="unloadOn" data-key="${key}" type="checkbox"><span style="width:100%"><b>${label}</b><small>${fmt.format(rates[key])} ₽ / ${unit}</small><input class="unloadQty" data-key="${key}" type="number" min="0" step="1" inputmode="numeric" placeholder="Количество" disabled></span>`;
    const ch=row.querySelector('.unloadOn'),q=row.querySelector('.unloadQty');
    ch.addEventListener('change',()=>{q.disabled=!ch.checked; if(!ch.checked)q.value='';recalc()}); q.addEventListener('input',recalc);root.append(row);
  });
}
function unloadCost(){let total=0; document.querySelectorAll('.unloadOn:checked').forEach(ch=>{const key=ch.dataset.key; const q=document.querySelector(`.unloadQty[data-key="${key}"]`); total+=num(q.value)*rates[key]});return total}

// ---------- ПРИЁМКА / МАРКИРОВКА ----------
function calcAcceptCost(){return $('acceptEnabled').checked?goodsTotals().qty*rates.acceptance:0}
function calcMarkingCost(){return $('markingEnabled').checked?num($('labelsCount').value)*rates.marking:0}

// ---------- УПАКОВКА ----------
function packingMode(){return document.querySelector('input[name="packingMode"]:checked')?.value||'own'}
function calcPackingBoxes(){
  const t=goodsTotals();
  if(!$('packingEnabled').checked) return t.boxes;               // товар уже готов
  if(packingMode()==='factory') return num($('factoryBoxes').value)||t.boxes;
  return t.boxes;
}

// ---------- ХРАНЕНИЕ ----------
function storageMode(){return document.querySelector('input[name="storageMode"]:checked')?.value||'none'}
function calcStorageCost(){const m=storageMode(); if(m==='m3day') return num($('storageM3').value)*num($('storageDays').value)*rates.storageM3Day; if(m==='palletMonth') return num($('storagePallets').value)*num($('storageMonths').value)*rates.storagePalletMonth; return 0}

// ---------- ОТГРУЗКА ----------
function shipMode(){return document.querySelector('input[name="shipMode"]:checked')?.value||'FBO'}
function fbsProcessing(){return getSkus().reduce((sum,s)=>sum+Math.max(rates.fbsVolumeMinItem,s.liters*rates.fbsVolumePerLiter)*s.qty,0)}
function estimatedFbsBoxes(){const l=goodsTotals().liters; return l?ceil(l/BOX_VOLUME_L):0}

function shipmentBreakdown(){
  const t=goodsTotals();
  if(shipMode()==='FBO'){
    const boxes = calcPackingBoxes();                 // из упаковки
    const pallets = boxes?ceil(boxes/BOXES_PER_PALLET):0;
    const lines=[];
    if(boxes) lines.push(['FBO · формирование коробов',`${boxes} кор. × ${money(rates.fboBox)}`,boxes*rates.fboBox]);
    if(boxes) lines.push(['FBO · доставка коробов',`${boxes} кор. × ${money(rates.fboDeliveryBox)}`,boxes*rates.fboDeliveryBox]);
    if(pallets){
      lines.push(['FBO · паллеты',`${pallets} пал. × ${money(rates.pallet)}`,pallets*rates.pallet]);
      lines.push(['FBO · стрейчевание',`${pallets} пал. × ${money(rates.stretch)}`,pallets*rates.stretch]);
    }
    if($('fboRebox').checked){
      const nb=num($('newBoxes').value);
      if(nb) lines.push(['FBO · новые транспортные короба',`${nb} кор. × ${money(rates.newBox)}`,nb*rates.newBox]);
      if(t.qty) lines.push(['FBO · перекладка единиц',`${t.qty} шт. × ${money(rates.reboxItem)}`,t.qty*rates.reboxItem]);
      if(nb){
        const p2=ceil(nb/BOXES_PER_PALLET);
        lines.push(['FBO · формирование новых коробов',`${nb} × ${money(rates.fboBox)}`,nb*rates.fboBox]);
        lines.push(['FBO · доставка новых коробов',`${nb} × ${money(rates.fboDeliveryBox)}`,nb*rates.fboDeliveryBox]);
        lines.push(['FBO · паллеты под пересборку',`${p2} пал. × ${money(rates.pallet)}`,p2*rates.pallet]);
        lines.push(['FBO · стрейчевание под пересборку',`${p2} пал. × ${money(rates.stretch)}`,p2*rates.stretch]);
      }
    }
    return lines;
  }
  // FBS
  const lines=[]; const proc=fbsProcessing();
  if(proc) lines.push(['FBS · обработка по объёму',`${money(rates.fbsVolumePerLiter)}/л, мин. ${money(rates.fbsVolumeMinItem)}/шт.`,proc]);
  const mode=document.querySelector('input[name="fbsBoxesMode"]:checked')?.value||'estimate';
  const boxes=num($('fbsBoxes').value);
  const orders=num($('dailyOrders').value), threshold=num($('dailyThreshold').value);
  const aboveThreshold = threshold>0 && orders>threshold;
  if(mode!=='unknown'){
    if(boxes) lines.push(['FBS · транспортные короба',`${boxes} кор. × ${money(rates.fbsBox)}`,boxes*rates.fbsBox]);
    if(boxes && !aboveThreshold) lines.push(['FBS · доставка коробов',`${boxes} кор. × ${money(rates.fbsDeliveryBox)}`,boxes*rates.fbsDeliveryBox]);
  } else {
    lines.push(['FBS · короба и доставка','Уточним после сборки',0]);
  }
  return lines;
}

// ---------- СБОРКА РАСЧЁТА ----------
function collectBreakdown(){
  const lines=[];
  document.querySelectorAll('.unloadOn:checked').forEach(ch=>{
    const key=ch.dataset.key,q=num(document.querySelector(`.unloadQty[data-key="${key}"]`).value),def=unloadDefs.find(x=>x[0]===key);
    if(q) lines.push([`Разгрузка · ${def[1]}`,`${q} × ${money(rates[key])}`,q*rates[key]]);
  });
  const t=goodsTotals();
  if($('acceptEnabled').checked && t.qty) lines.push(['Приёмка (сортировка + пересчёт)',`${t.qty} шт. × ${money(rates.acceptance)}`,calcAcceptCost()]);
  if($('markingEnabled').checked && num($('labelsCount').value)) lines.push(['Маркировка',`${num($('labelsCount').value)} этик. × ${money(rates.marking)}`,calcMarkingCost()]);
  const sc=calcStorageCost();
  if(sc){
    const m=storageMode();
    lines.push(['Хранение', m==='m3day'?`${num($('storageM3').value)} м³ × ${num($('storageDays').value)} сут.`:`${num($('storagePallets').value)} пал. × ${num($('storageMonths').value)} мес.`,sc]);
  }
  return lines.concat(shipmentBreakdown());
}

// ---------- ПЕРЕСЧЁТ И ОТРИСОВКА ----------
function recalc(){
  const skus=getSkus();
  skus.forEach(s=>{
    s.card.querySelector('.unitLiters').textContent=`${fmt.format(s.liters)} л`;
    s.card.querySelector('.lineLiters').textContent=`${fmt.format(s.totalLiters)} л`;
    s.card.querySelector('.lineBoxes').textContent=s.boxes;
  });
  const t=goodsTotals();
  $('goodsQty').textContent=`${fmt.format(t.qty)} шт.`;
  $('goodsVolume').textContent=`${fmt.format(t.liters)} л`;
  $('goodsBoxes').textContent=t.boxes;
  $('acceptQty').textContent=`${fmt.format(t.qty)} шт.`;
  $('acceptCost').textContent=money(calcAcceptCost());

  $('markingFields').classList.toggle('hidden', !$('markingEnabled').checked);
  $('markingCost').textContent=money(calcMarkingCost());

  // Раскладка по коробам
  $('packingBlock').classList.toggle('hidden', !$('packingEnabled').checked);
  $('factoryBoxesWrap').classList.toggle('hidden', packingMode()!=='factory');
  const boxForecast=$('boxForecast'); boxForecast.innerHTML='';
  getSkus().forEach(s=>{
    const d=document.createElement('div'); d.className='result-row';
    const boxesOne = s.liters>0 ? ceil(s.liters/BOX_VOLUME_L) : 0;
    d.innerHTML=`<div><b>${s.name}</b><small>${s.qty} шт. · ${fmt.format(s.liters)} л/шт. · ~${boxesOne} шт./короб</small></div><b>${s.boxes} кор.</b>`;
    boxForecast.append(d);
  });
  $('packingBoxesTotal').textContent=calcPackingBoxes();

  const sm=storageMode();
  $('storageInputs').classList.toggle('hidden',sm==='none');
  document.querySelectorAll('.storage-field').forEach(x=>x.classList.add('hidden'));
  if(sm!=='none') document.querySelector(`.storage-field.${sm}`)?.classList.remove('hidden');
  $('storageCost').textContent=money(calcStorageCost());

  const mode=shipMode();
  $('fboBlock').classList.toggle('hidden',mode!=='FBO');
  $('fbsBlock').classList.toggle('hidden',mode!=='FBS');
  const fboxes=calcPackingBoxes();
  if(mode==='FBO') $('fboBoxes').value = fboxes||num($('fboBoxes').value);
  const fb=num($('fboBoxes').value); $('fboPallets').value = fb?ceil(fb/BOXES_PER_PALLET):0;
  $('reboxFields').classList.toggle('hidden',!$('fboRebox').checked);

  const boxesMode=document.querySelector('input[name="fbsBoxesMode"]:checked')?.value||'estimate';
  if(boxesMode==='estimate'){
    $('fbsBoxes').value=estimatedFbsBoxes(); $('fbsBoxes').readOnly=true;
    $('fbsBoxHint').textContent=`Ориентировочно: ${$('fbsBoxes').value||0} коробов по 96 л без коэффициента неплотной укладки.`;
  } else if(boxesMode==='manual'){
    $('fbsBoxes').readOnly=false; $('fbsBoxHint').textContent='Введите известное количество коробов.';
  } else {
    $('fbsBoxes').value=''; $('fbsBoxes').readOnly=true; $('fbsBoxHint').textContent='Стоимость коробов и доставки уточним после сборки.';
  }

  const lines=collectBreakdown();
  const grand=lines.reduce((a,x)=>a+x[2],0);
  $('grandTotal').textContent=money(grand);
  $('perUnit').textContent=t.qty?`${money(grand/t.qty)} / шт.`:'0 ₽ / шт.';
  const rr=$('resultRows'); rr.innerHTML='';
  if(!lines.length){ rr.innerHTML='<div class="hint">Выберите операции и заполните данные партии.</div>'; }
  else {
    lines.forEach(([name,detail,cost])=>{
      const d=document.createElement('div'); d.className='result-row';
      d.innerHTML=`<div><b>${name}</b><small>${detail}</small></div><b>${money(cost)}</b>`;
      rr.append(d);
    });
  }
  saveState();
}

// ---------- НАВИГАЦИЯ ----------
function show(id){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  $(id)?.classList.add('active');
  document.querySelectorAll('.step').forEach(s=>s.classList.toggle('active',s.dataset.step===id));
  window.scrollTo({top:0,behavior:'smooth'});
  recalc();
}

// ---------- СОХРАНЕНИЕ / ЗАГРУЗКА ----------
function saveState(){
  const data={
    org:$('org').value, tg:$('tg').value, phone:$('phone').value,
    skus:getSkus().map(({card,...x})=>x),
    markingEnabled:$('markingEnabled').checked, labelsCount:$('labelsCount').value,
    packingEnabled:$('packingEnabled').checked, packingMode:packingMode(), factoryBoxes:$('factoryBoxes').value,
    fboBoxes:$('fboBoxes').value, fboRebox:$('fboRebox').checked, newBoxes:$('newBoxes').value,
    fbsBoxesMode:document.querySelector('input[name="fbsBoxesMode"]:checked')?.value,
    fbsBoxes:$('fbsBoxes').value, dailyOrders:$('dailyOrders').value, dailyThreshold:$('dailyThreshold').value,
    shipMode:shipMode(), storageMode:storageMode(),
    storageM3:$('storageM3').value, storageDays:$('storageDays').value,
    storagePallets:$('storagePallets').value, storageMonths:$('storageMonths').value,
    acceptEnabled:$('acceptEnabled').checked
  };
  localStorage.setItem('atlantState',JSON.stringify(data));
}
function loadState(){
  let d={}; try{d=JSON.parse(localStorage.getItem('atlantState')||'{}')}catch{}
  if(d.org)$('org').value=d.org; if(d.tg)$('tg').value=d.tg; if(d.phone)$('phone').value=d.phone;
  if(d.skus?.length)d.skus.forEach(addSku); else addSku({});
  if(d.markingEnabled!=null)$('markingEnabled').checked=d.markingEnabled;
  if(d.labelsCount!=null)$('labelsCount').value=d.labelsCount;
  if(d.packingEnabled!=null)$('packingEnabled').checked=d.packingEnabled;
  if(d.packingMode)document.querySelector(`input[name="packingMode"][value="${d.packingMode}"]`).checked=true;
  if(d.factoryBoxes!=null)$('factoryBoxes').value=d.factoryBoxes;
  if(d.fboBoxes!=null)$('fboBoxes').value=d.fboBoxes;
  if(d.fboRebox!=null)$('fboRebox').checked=d.fboRebox;
  if(d.newBoxes!=null)$('newBoxes').value=d.newBoxes;
  if(d.fbsBoxesMode)document.querySelector(`input[name="fbsBoxesMode"][value="${d.fbsBoxesMode}"]`)?.click();
  if(d.fbsBoxes!=null)$('fbsBoxes').value=d.fbsBoxes;
  if(d.dailyOrders!=null)$('dailyOrders').value=d.dailyOrders;
  if(d.dailyThreshold!=null)$('dailyThreshold').value=d.dailyThreshold;
  if(d.shipMode)document.querySelector(`input[name="shipMode"][value="${d.shipMode}"]`).checked=true;
  if(d.storageMode)document.querySelector(`input[name="storageMode"][value="${d.storageMode}"]`).checked=true;
  if(d.storageM3!=null)$('storageM3').value=d.storageM3;
  if(d.storageDays!=null)$('storageDays').value=d.storageDays;
  if(d.storagePallets!=null)$('storagePallets').value=d.storagePallets;
  if(d.storageMonths!=null)$('storageMonths').value=d.storageMonths;
  if(d.acceptEnabled!=null)$('acceptEnabled').checked=d.acceptEnabled;
  recalc();
}

// ---------- ПРАЙС / АДМИН ----------
function updateRateLabels(){
  const ids={acceptRateLabel:'acceptance',markingRateLabel:'marking',storageM3RateLabel:'storageM3Day',storagePalletRateLabel:'storagePalletMonth',fboBoxRateLabel:'fboBox',fboDeliveryRateLabel:'fboDeliveryBox',palletRateLabel:'pallet',stretchRateLabel:'stretch',newBoxRateLabel:'newBox',reboxItemRateLabel:'reboxItem',fbsBoxRateLabel:'fbsBox',fbsDeliveryBoxRateLabel:'fbsDeliveryBox',fbsVolumeRateLabel:'fbsVolumePerLiter',fbsVolumeMinLabel:'fbsVolumeMinItem'};
  Object.entries(ids).forEach(([id,k])=>{const el=document.getElementById(id);if(el)el.textContent=fmt.format(rates[k])});
  renderUnload(); recalc();
}
function renderAdmin(){
  const names={unloadPallet:'Разгрузка паллета',unloadCrate:'Разгрузка обрешётки',unloadBag:'Разгрузка баула',unloadBox:'Разгрузка короба',acceptance:'Приёмка за 1 шт.',marking:'Маркировка (этикетка)',storageM3Day:'Хранение м³/сутки',storagePalletMonth:'Паллето-место/месяц',fboBox:'FBO формирование короба',fboDeliveryBox:'FBO доставка короба',pallet:'Паллет',stretch:'Стрейчевание паллета',newBox:'Новый короб',reboxItem:'Перекладка 1 шт.',fbsBox:'FBS транспортный короб',fbsDeliveryBox:'FBS доставка короба',fbsVolumePerLiter:'FBS обработка, ₽/л',fbsVolumeMinItem:'FBS минимум, ₽/шт.'};
  const root=$('adminFields'); root.innerHTML='';
  Object.keys(DEFAULT_RATES).forEach(k=>{
    const w=document.createElement('label'); w.className='admin-field';
    w.innerHTML=`${names[k]||k}<input data-rate="${k}" type="number" min="0" step="0.01" value="${rates[k]}"><small>₽</small>`;
    root.append(w);
  });
  renderJournal();
}
function renderJournal(){
  const box=$('journalBox'); box.innerHTML='';
  const j=JSON.parse(localStorage.getItem('atlantJournal')||'[]');
  if(!j.length){ box.innerHTML='<div class="hint">Записей пока нет.</div>'; return; }
  j.slice().reverse().slice(0,20).forEach(e=>{
    const d=document.createElement('div'); d.className='result-row';
    d.innerHTML=`<div><b>${e.org||'без организации'}</b><small>${e.date} · ${e.tg||'—'} · ${e.phone||'—'}</small><small>${e.summary}</small></div><b>${e.action}</b>`;
    box.append(d);
  });
}
function addJournalEntry(action){
  const t=goodsTotals(); const lines=collectBreakdown();
  const grand=lines.reduce((a,x)=>a+x[2],0);
  const entry={
    date:new Date().toLocaleString('ru-RU'),
    org:$('org').value.trim(), tg:$('tg').value.trim(), phone:$('phone').value.trim(),
    ship:shipMode(), action,
    total:grand,
    summary:`${shipMode()} · ${fmt.format(t.qty)} шт. · ${fmt.format(t.liters)} л · ${money(grand)}`
  };
  const j=JSON.parse(localStorage.getItem('atlantJournal')||'[]'); j.push(entry);
  localStorage.setItem('atlantJournal',JSON.stringify(j));
}

// ---------- ТЕКСТ РАСЧЁТА ----------
function calcText(){
  const t=goodsTotals(),lines=collectBreakdown(),grand=lines.reduce((a,x)=>a+x[2],0);
  return [
    `АТЛАНТ — предварительный расчёт`,
    `Организация: ${$('org').value||'—'}`,
    `Telegram: ${$('tg').value||'—'}`,
    `Телефон: ${$('phone').value||'—'}`,
    `${shipMode()} · ${fmt.format(t.qty)} шт. · ${fmt.format(t.liters)} л`,
    ...lines.map(x=>`${x[0]}: ${x[1]} = ${money(x[2])}`),
    `ИТОГО: ${money(grand)}`,
    `Расчёт предварительный.`
  ].join('\n');
}

// ---------- СОБЫТИЯ ----------
document.querySelector('#addSku').addEventListener('click',()=>addSku({}));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{
  // Валидация контактов при выходе с первого шага
  if(b.dataset.go!=='contacts'){
    if(!$('org').value.trim()||!$('tg').value.trim()||!$('phone').value.trim()){
      alert('Заполните Организацию, Telegram и Телефон.'); show('contacts'); return;
    }
  }
  show(b.dataset.go);
}));
document.querySelectorAll('.step').forEach(b=>b.addEventListener('click',()=>show(b.dataset.step)));

['acceptEnabled','markingEnabled','labelsCount','storageM3','storageDays','storagePallets','storageMonths','fboBoxes','fboRebox','newBoxes','fbsBoxes','dailyOrders','dailyThreshold','packingEnabled','factoryBoxes','org','tg','phone'].forEach(id=>{
  const el=$(id); if(!el) return; el.addEventListener('input',recalc); el.addEventListener('change',recalc);
});
document.querySelectorAll('input[name="storageMode"],input[name="shipMode"],input[name="fbsBoxesMode"],input[name="packingMode"]').forEach(x=>x.addEventListener('change',recalc));

$('copyCalc').addEventListener('click',async()=>{await navigator.clipboard.writeText(calcText());$('copyCalc').textContent='Скопировано';setTimeout(()=>$('copyCalc').textContent='Скопировать',1200)});
$('printBtn').addEventListener('click',()=>window.print());

// Завершение без звонка
$('finishBtn').addEventListener('click',()=>{
  addJournalEntry('Завершил без звонка');
  alert('Спасибо за интерес к «Атланту»! Возвращайтесь, когда понадобится.');
  localStorage.removeItem('atlantState');
  location.reload();
});

// Открыть блок заявки
$('callbackOpen').addEventListener('click',()=>{
  $('cbOrg').value=$('org').value; $('cbTg').value=$('tg').value; $('cbPhone').value=$('phone').value;
  $('callback').classList.remove('hidden');
  $('callback').scrollIntoView({behavior:'smooth'});
});
$('callbackClose').addEventListener('click',()=>$('callback').classList.add('hidden'));

// Подтверждение заявки
$('sendCallback').addEventListener('click',()=>{
  const phone=$('cbPhone').value.trim(); if(!phone){$('cbPhone').focus();alert('Укажите номер телефона.');return}
  $('org').value=$('cbOrg').value.trim(); $('tg').value=$('cbTg').value.trim(); $('phone').value=phone;
  addJournalEntry('Запрошен звонок');
  const msg=[
    `Заявка на звонок · АТЛАНТ`,
    `Организация: ${$('org').value||'—'}`,
    `Telegram: ${$('tg').value||'—'}`,
    `Телефон: ${phone}`,
    $('cbComment').value.trim()?`Удобное время: ${$('cbComment').value.trim()}`:'',
    '',
    calcText()
  ].filter(Boolean).join('\n');
  navigator.clipboard.writeText(msg).catch(()=>{});
  window.open(`https://t.me/Golberg_Vladimir?text=${encodeURIComponent(msg)}`,'_blank');
  alert('Спасибо! Ваш запрос на звонок принят.');
});

// Админ
$('adminToggle').addEventListener('click',()=>{renderAdmin();$('adminPanel').classList.remove('hidden');$('adminPanel').scrollIntoView({behavior:'smooth'})});
$('adminClose').addEventListener('click',()=>$('adminPanel').classList.add('hidden'));
$('saveRates').addEventListener('click',()=>{
  document.querySelectorAll('[data-rate]').forEach(i=>rates[i.dataset.rate]=num(i.value));
  localStorage.setItem('atlantRates',JSON.stringify(rates)); updateRateLabels(); $('adminPanel').classList.add('hidden');
});
$('resetRates').addEventListener('click',()=>{rates={...DEFAULT_RATES};localStorage.removeItem('atlantRates');renderAdmin();updateRateLabels()});
$('clearJournal').addEventListener('click',()=>{localStorage.removeItem('atlantJournal');renderJournal()});

// Старт
loadState(); updateRateLabels();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

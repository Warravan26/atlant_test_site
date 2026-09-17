const fmt = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const money = n => `${fmt.format(Math.round((Number(n)||0)*100)/100)} ₽`;
const num = v => Number(String(v ?? '').replace(',','.')) || 0;
const ceil = Math.ceil;

const DEFAULT_RATES = {
  unloadPallet:200, unloadCrate:2000, unloadBag:200, unloadBox:100,
  acceptance:10,
  storageM3Day:62.5, storagePalletMonth:3000,
  fboBox:150, fboDeliveryBox:250, pallet:600, stretch:350, newBox:100, reboxItem:20,
  fbsBox:100, fbsDeliveryBox:500, fbsVolumePerLiter:10, fbsVolumeMinItem:20
};
let rates = {...DEFAULT_RATES, ...(JSON.parse(localStorage.getItem('atlantRates')||'{}'))};
const byId = id => document.getElementById(id);
const [goodsQty,goodsVolume,acceptEnabled,acceptQty,storageInputs,storageM3,storageDays,storagePallets,storageMonths,fboBlock,fbsBlock,fboBoxes,fboPallets,fboRebox,reboxFields,newBoxes,fbsBoxes,dailyOrders,dailyThreshold,fbsBoxHint,grandTotal,perUnit,resultRows,copyCalc,printBtn,finishBtn,callbackOpen,callbackClose,cbName,cbPhone,cbComment,sendCallback,adminToggle,adminPanel,adminClose,adminFields,saveRates,resetRates] = ['goodsQty','goodsVolume','acceptEnabled','acceptQty','storageInputs','storageM3','storageDays','storagePallets','storageMonths','fboBlock','fbsBlock','fboBoxes','fboPallets','fboRebox','reboxFields','newBoxes','fbsBoxes','dailyOrders','dailyThreshold','fbsBoxHint','grandTotal','perUnit','resultRows','copyCalc','printBtn','finishBtn','callbackOpen','callbackClose','cbName','cbPhone','cbComment','sendCallback','adminToggle','adminPanel','adminClose','adminFields','saveRates','resetRates'].map(byId);

const unloadDefs = [
  ['unloadPallet','Паллет','пал.'],['unloadCrate','Обрешётка','шт.'],['unloadBag','Баул','шт.'],['unloadBox','Короб','кор.']
];

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
  const liters=l*w*h/1000; return {name:c.querySelector('.skuName').value.trim()||'Без названия',qty,l,w,h,liters,totalLiters:liters*qty,card:c};
})}
function goodsTotals(){const s=getSkus();return {qty:s.reduce((a,x)=>a+x.qty,0),liters:s.reduce((a,x)=>a+x.totalLiters,0)}}

function renderUnload(){const root=document.querySelector('#unloadRows'); root.innerHTML=''; unloadDefs.forEach(([key,label,unit])=>{
  const row=document.createElement('label');row.className='switch-card';row.innerHTML=`<input class="unloadOn" data-key="${key}" type="checkbox"><span style="width:100%"><b>${label}</b><small>${fmt.format(rates[key])} ₽ / ${unit}</small><input class="unloadQty" data-key="${key}" type="number" min="0" step="1" inputmode="numeric" placeholder="Количество" disabled></span>`;
  const ch=row.querySelector('.unloadOn'),q=row.querySelector('.unloadQty'); ch.addEventListener('change',()=>{q.disabled=!ch.checked; if(!ch.checked)q.value='';recalc()}); q.addEventListener('input',recalc);root.append(row);
})}

function storageMode(){return document.querySelector('input[name="storageMode"]:checked')?.value||'none'}
function shipMode(){return document.querySelector('input[name="shipMode"]:checked')?.value||'FBO'}
function calcStorageCost(){const m=storageMode(); if(m==='m3day') return num(storageM3.value)*num(storageDays.value)*rates.storageM3Day; if(m==='palletMonth') return num(storagePallets.value)*num(storageMonths.value)*rates.storagePalletMonth; return 0}
function unloadCost(){let total=0; document.querySelectorAll('.unloadOn:checked').forEach(ch=>{const key=ch.dataset.key; const q=document.querySelector(`.unloadQty[data-key="${key}"]`); total+=num(q.value)*rates[key]});return total}
function calcAcceptCost(){return acceptEnabled.checked?goodsTotals().qty*rates.acceptance:0}

function fbsProcessing(){return getSkus().reduce((sum,s)=>sum+Math.max(rates.fbsVolumeMinItem,s.liters*rates.fbsVolumePerLiter)*s.qty,0)}
function estimatedFbsBoxes(){return goodsTotals().liters?ceil(goodsTotals().liters/96):0}

function shipmentBreakdown(){const t=goodsTotals(); if(shipMode()==='FBO'){
  const boxes=num(fboBoxes.value), pallets=boxes?ceil(boxes/16):0; const lines=[];
  if(boxes) lines.push(['FBO · формирование коробов',`${boxes} кор. × ${money(rates.fboBox)}`,boxes*rates.fboBox]);
  if(boxes) lines.push(['FBO · доставка коробов',`${boxes} кор. × ${money(rates.fboDeliveryBox)}`,boxes*rates.fboDeliveryBox]);
  if(pallets){lines.push(['FBO · паллеты',`${pallets} пал. × ${money(rates.pallet)}`,pallets*rates.pallet]); lines.push(['FBO · стрейчевание',`${pallets} пал. × ${money(rates.stretch)}`,pallets*rates.stretch])}
  if(fboRebox.checked){const nb=num(newBoxes.value); if(nb) lines.push(['FBO · новые транспортные короба',`${nb} кор. × ${money(rates.newBox)}`,nb*rates.newBox]); if(t.qty) lines.push(['FBO · перекладка товара',`${t.qty} шт. × ${money(rates.reboxItem)}`,t.qty*rates.reboxItem]);}
  return lines;
 }
 const boxes=num(fbsBoxes.value); const orders=num(dailyOrders.value), threshold=num(dailyThreshold.value); const lines=[]; const proc=fbsProcessing();
 if(proc) lines.push(['FBS · обработка по объёму товара',`${money(rates.fbsVolumePerLiter)}/л, минимум ${money(rates.fbsVolumeMinItem)}/шт.`,proc]);
 if(boxes) lines.push(['FBS · транспортные короба',`${boxes} кор. × ${money(rates.fbsBox)}`,boxes*rates.fbsBox]);
 const aboveThreshold = threshold>0 && orders>threshold;
 if(!aboveThreshold && boxes) lines.push(['FBS · доставка коробов',`${boxes} кор. × ${money(rates.fbsDeliveryBox)}`,boxes*rates.fbsDeliveryBox]);
 return lines;
}

function collectBreakdown(){const lines=[]; document.querySelectorAll('.unloadOn:checked').forEach(ch=>{const key=ch.dataset.key,q=num(document.querySelector(`.unloadQty[data-key="${key}"]`).value),def=unloadDefs.find(x=>x[0]===key); if(q)lines.push([`Разгрузка · ${def[1]}`,`${q} × ${money(rates[key])}`,q*rates[key]])});
 const t=goodsTotals(); if(acceptEnabled.checked&&t.qty)lines.push(['Приёмка и пересчёт',`${t.qty} шт. × ${money(rates.acceptance)}`,calcAcceptCost()]); const sc=calcStorageCost(); if(sc){const m=storageMode(); lines.push(['Хранение',m==='m3day'?`${num(storageM3.value)} м³ × ${num(storageDays.value)} сут.`:`${num(storagePallets.value)} пал. × ${num(storageMonths.value)} мес.`,sc])} return lines.concat(shipmentBreakdown())}

function recalc(){
 const skus=getSkus(); skus.forEach(s=>{s.card.querySelector('.unitLiters').textContent=`${fmt.format(s.liters)} л`;s.card.querySelector('.lineLiters').textContent=`${fmt.format(s.totalLiters)} л`}); const t=goodsTotals(); goodsQty.textContent=`${fmt.format(t.qty)} шт.`;goodsVolume.textContent=`${fmt.format(t.liters)} л`;acceptQty.textContent=`${fmt.format(t.qty)} шт.`;document.querySelector("#acceptCost").textContent=money(calcAcceptCost());
 const sm=storageMode(); storageInputs.classList.toggle('hidden',sm==='none'); document.querySelectorAll('.storage-field').forEach(x=>x.classList.add('hidden')); if(sm!=='none')document.querySelector(`.storage-field.${sm}`)?.classList.remove('hidden'); document.querySelector("#storageCost").textContent=money(calcStorageCost());
 const mode=shipMode(); fboBlock.classList.toggle('hidden',mode!=='FBO'); fbsBlock.classList.toggle('hidden',mode!=='FBS'); const fb=num(fboBoxes.value); fboPallets.value=fb?ceil(fb/16):0; reboxFields.classList.toggle('hidden',!fboRebox.checked);
 const boxesMode=document.querySelector('input[name="fbsBoxesMode"]:checked')?.value||'estimate'; if(boxesMode==='estimate'){fbsBoxes.value=estimatedFbsBoxes(); fbsBoxes.readOnly=true; fbsBoxHint.textContent=`Ориентировочно: ${fbsBoxes.value||0} коробов по 96 л без коэффициента неплотной укладки.`}else{fbsBoxes.readOnly=false; fbsBoxHint.textContent='Введите известное количество коробов.'}
 const lines=collectBreakdown(); const grand=lines.reduce((a,x)=>a+x[2],0); grandTotal.textContent=money(grand); perUnit.textContent=t.qty?`${money(grand/t.qty)} / шт.`:'0 ₽ / шт.'; resultRows.innerHTML=''; lines.forEach(([name,detail,cost])=>{const d=document.createElement('div');d.className='result-row';d.innerHTML=`<div><b>${name}</b><small>${detail}</small></div><b>${money(cost)}</b>`;resultRows.append(d)}); if(!lines.length)resultRows.innerHTML='<div class="hint">Выберите операции и заполните данные партии.</div>';
 saveState();
}

function show(id){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active')); document.querySelector(`#${id}`)?.classList.add('active'); document.querySelectorAll('.step').forEach(s=>s.classList.toggle('active',s.dataset.step===id)); window.scrollTo({top:0,behavior:'smooth'}); recalc()}

function saveState(){const data={skus:getSkus().map(({card,...x})=>x), fboBoxes:fboBoxes.value, fboRebox:fboRebox.checked,newBoxes:newBoxes.value,fbsBoxesMode:document.querySelector('input[name="fbsBoxesMode"]:checked')?.value,fbsBoxes:fbsBoxes.value,dailyOrders:dailyOrders.value,dailyThreshold:dailyThreshold.value,shipMode:shipMode(),storageMode:storageMode(),storageM3:storageM3.value,storageDays:storageDays.value,storagePallets:storagePallets.value,storageMonths:storageMonths.value,acceptEnabled:acceptEnabled.checked}; localStorage.setItem('atlantState',JSON.stringify(data))}
function loadState(){let d={};try{d=JSON.parse(localStorage.getItem('atlantState')||'{}')}catch{}; if(d.skus?.length)d.skus.forEach(addSku);else addSku({}); if(d.fboBoxes!=null)fboBoxes.value=d.fboBoxes;if(d.fboRebox!=null)fboRebox.checked=d.fboRebox;if(d.newBoxes!=null)newBoxes.value=d.newBoxes;if(d.fbsBoxesMode)document.querySelector(`input[name="fbsBoxesMode"][value="${d.fbsBoxesMode}"]`)?.click();if(d.fbsBoxes!=null)fbsBoxes.value=d.fbsBoxes;if(d.dailyOrders!=null)dailyOrders.value=d.dailyOrders;if(d.dailyThreshold!=null)dailyThreshold.value=d.dailyThreshold;if(d.shipMode)document.querySelector(`input[name="shipMode"][value="${d.shipMode}"]`).checked=true;if(d.storageMode)document.querySelector(`input[name="storageMode"][value="${d.storageMode}"]`).checked=true;if(d.storageM3!=null)storageM3.value=d.storageM3;if(d.storageDays!=null)storageDays.value=d.storageDays;if(d.storagePallets!=null)storagePallets.value=d.storagePallets;if(d.storageMonths!=null)storageMonths.value=d.storageMonths;if(d.acceptEnabled!=null)acceptEnabled.checked=d.acceptEnabled;recalc()}

function updateRateLabels(){const ids={acceptRateLabel:'acceptance',storageM3RateLabel:'storageM3Day',storagePalletRateLabel:'storagePalletMonth',fboBoxRateLabel:'fboBox',fboDeliveryRateLabel:'fboDeliveryBox',palletRateLabel:'pallet',stretchRateLabel:'stretch',newBoxRateLabel:'newBox',reboxItemRateLabel:'reboxItem',fbsBoxRateLabel:'fbsBox',fbsDeliveryBoxRateLabel:'fbsDeliveryBox',fbsVolumeRateLabel:'fbsVolumePerLiter',fbsVolumeMinLabel:'fbsVolumeMinItem'};Object.entries(ids).forEach(([id,k])=>{const el=document.getElementById(id);if(el)el.textContent=fmt.format(rates[k])});renderUnload();recalc()}
function renderAdmin(){const names={unloadPallet:'Разгрузка паллета',unloadCrate:'Разгрузка обрешётки',unloadBag:'Разгрузка баула',unloadBox:'Разгрузка короба',acceptance:'Приёмка за 1 шт.',storageM3Day:'Хранение м³/сутки',storagePalletMonth:'Паллето-место/месяц',fboBox:'FBO формирование короба',fboDeliveryBox:'FBO доставка короба',pallet:'Паллет',stretch:'Стрейчевание паллета',newBox:'Новый короб',reboxItem:'Перекладка 1 шт.',fbsBox:'FBS транспортный короб',fbsDeliveryBox:'FBS доставка короба',fbsVolumePerLiter:'FBS обработка, ₽/л',fbsVolumeMinItem:'FBS минимум, ₽/шт.'};adminFields.innerHTML='';Object.keys(DEFAULT_RATES).forEach(k=>{const w=document.createElement('label');w.className='admin-field';w.innerHTML=`${names[k]||k}<input data-rate="${k}" type="number" min="0" step="0.01" value="${rates[k]}"><small>₽</small>`;adminFields.append(w)})}
function calcText(){const t=goodsTotals(),lines=collectBreakdown(),grand=lines.reduce((a,x)=>a+x[2],0);return [`АТЛАНТ — предварительный расчёт`,`${shipMode()} · ${fmt.format(t.qty)} шт. · ${fmt.format(t.liters)} л`,...lines.map(x=>`${x[0]}: ${x[1]} = ${money(x[2])}`),`ИТОГО: ${money(grand)}`,`Расчёт предварительный.`].join('\n')}

document.querySelector('#addSku').addEventListener('click',()=>addSku({}));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.go)));document.querySelectorAll('.step').forEach(b=>b.addEventListener('click',()=>show(b.dataset.step)));
['acceptEnabled','storageM3','storageDays','storagePallets','storageMonths','fboBoxes','fboRebox','newBoxes','fbsBoxes','dailyOrders','dailyThreshold'].forEach(id=>document.getElementById(id)?.addEventListener('input',recalc));
document.querySelectorAll('input[name="storageMode"],input[name="shipMode"],input[name="fbsBoxesMode"]').forEach(x=>x.addEventListener('change',recalc));
copyCalc.addEventListener('click',async()=>{await navigator.clipboard.writeText(calcText());copyCalc.textContent='Скопировано';setTimeout(()=>copyCalc.textContent='Скопировать',1200)});printBtn.addEventListener('click',()=>window.print());finishBtn.addEventListener('click',()=>{localStorage.removeItem('atlantState');alert('Спасибо! Расчёт завершён.');location.reload()});
callbackOpen.addEventListener('click',()=>{document.querySelector('#callback').classList.remove('hidden');document.querySelector('#callback').classList.add('active');document.querySelector('#callback').scrollIntoView({behavior:'smooth'})});callbackClose.addEventListener('click',()=>document.querySelector('#callback').classList.add('hidden'));
sendCallback.addEventListener('click',()=>{const name=cbName.value.trim(),phone=cbPhone.value.trim();if(!phone){cbPhone.focus();alert('Укажите номер телефона для обратного звонка.');return}const msg=[`Заявка на звонок · АТЛАНТ`,`Имя: ${name||'не указано'}`,`Телефон: ${phone}`,cbComment.value.trim()?`Комментарий: ${cbComment.value.trim()}`:'',``,calcText()].filter(Boolean).join('\n');navigator.clipboard.writeText(msg).catch(()=>{});window.open(`https://t.me/Golberg_Vladimir?text=${encodeURIComponent(msg)}`,'_blank')});
adminToggle.addEventListener('click',()=>{renderAdmin();adminPanel.classList.remove('hidden');adminPanel.scrollIntoView({behavior:'smooth'})});adminClose.addEventListener('click',()=>adminPanel.classList.add('hidden'));saveRates.addEventListener('click',()=>{document.querySelectorAll('[data-rate]').forEach(i=>rates[i.dataset.rate]=num(i.value));localStorage.setItem('atlantRates',JSON.stringify(rates));updateRateLabels();adminPanel.classList.add('hidden')});resetRates.addEventListener('click',()=>{rates={...DEFAULT_RATES};localStorage.removeItem('atlantRates');renderAdmin();updateRateLabels()});
loadState();updateRateLabels();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

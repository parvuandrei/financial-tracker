function netWorthMoney(amount,currency){return amount.toLocaleString(I18n.locale(),{minimumFractionDigits:2,maximumFractionDigits:2})+' '+currency;}
function fillNetWorthWizard(value,currency){
  const n=value?FinTrackNetWorth.validate(value):FinTrackNetWorth.starter(currency);
  document.getElementById('netWorthCurrency').value=n.currency;
  for(const kind of ['assets','liabilities']){
    const list=document.getElementById('nw-'+kind);list.replaceChildren();
    for(const row of n[kind])appendNetWorthRow(kind,value?row:{...row,name:I18n.t(row.name)});
  }
  updateNetWorthPreview();
}
function appendNetWorthRow(kind,row){
  const list=document.getElementById('nw-'+kind);
  const index=list.children.length+1;
  const wrap=document.createElement('div');wrap.className='nwRow';wrap.dataset.id=row.id;
  const name=document.createElement('input');name.value=row.name;name.maxLength=100;name.required=true;
  name.dataset.field='name';I18n.attribute(name,'aria-label',`${kind==='assets'?'Asset':'Liability'} ${index} name`);
  const amount=document.createElement('input');amount.type='number';amount.min='0';amount.max='10000000000';amount.step='0.01';amount.required=true;
  amount.value=row.amount;amount.dataset.field='amount';I18n.attribute(amount,'aria-label',`${kind==='assets'?'Asset':'Liability'} ${index} amount`);
  const remove=document.createElement('button');remove.type='button';remove.className='textButton';I18n.write(remove,'Remove');
  I18n.attribute(remove,'aria-label',`Remove ${row.name || (kind==='assets'?'asset':'liability')}`);
  remove.addEventListener('click',()=>{wrap.remove();updateNetWorthPreview();});
  name.addEventListener('input',()=>{I18n.attribute(amount,'aria-label',`${name.value || kind} amount`);I18n.attribute(remove,'aria-label',`Remove ${name.value || kind}`);updateNetWorthPreview();});
  amount.addEventListener('input',updateNetWorthPreview);
  wrap.append(name,amount,remove);list.append(wrap);return name;
}
function addNetWorthRow(kind){
  if(!['assets','liabilities'].includes(kind)||savingPreferences)return;
  if(document.getElementById('nw-'+kind).children.length>=100){I18n.write(document.getElementById('nwError'),'You can add up to 100 items on each side.');return;}
  appendNetWorthRow(kind,{id:crypto.randomUUID(),name:I18n.t(kind==='assets'?'Other asset':'Other liability'),amount:0}).focus();
  updateNetWorthPreview();
}
function readNetWorthWizard(){
  const n={currency:document.getElementById('netWorthCurrency').value};
  for(const kind of ['assets','liabilities'])n[kind]=[...document.getElementById('nw-'+kind).children].map(row=>({
    id:row.dataset.id,name:row.querySelector('[data-field="name"]').value,
    amount:row.querySelector('[data-field="amount"]').valueAsNumber
  }));
  return FinTrackNetWorth.validate(n);
}
function updateNetWorthPreview(){
  try{
    const n=readNetWorthWizard(),t=FinTrackNetWorth.totals(n);
    for(const [id,key] of [['nwAssetsTotal','assets'],['nwDebtsTotal','liabilities'],['nwTotal','netWorth']])I18n.write(document.getElementById(id),netWorthMoney(t[key],n.currency));
    I18n.write(document.getElementById('nwError'),'');
  }catch(error){
    for(const id of ['nwAssetsTotal','nwDebtsTotal','nwTotal'])I18n.write(document.getElementById(id),'—');
    I18n.write(document.getElementById('nwError'),error.message);
  }
}
function renderSavedNetWorth(value){
  const n=value?FinTrackNetWorth.validate(value):null;
  const t=n?FinTrackNetWorth.totals(n):null;
  I18n.write(document.getElementById('netWorthMetric'),t?netWorthMoney(t.netWorth,n.currency):'Set up your net worth');
  I18n.write(document.getElementById('netWorthBreakdown'),t?`${netWorthMoney(t.assets,n.currency)} assets − ${netWorthMoney(t.liabilities,n.currency)} liabilities`:'Add what you own and what you owe.');
  I18n.write(document.getElementById('netWorthDetail'),t?netWorthMoney(t.netWorth,n.currency):'Not set up');
  I18n.write(document.getElementById('netWorthAssets'),t?netWorthMoney(t.assets,n.currency):'—');
  I18n.write(document.getElementById('netWorthLiabilities'),t?netWorthMoney(t.liabilities,n.currency):'—');
  for(const kind of ['assets','liabilities']){
    const list=document.getElementById('saved-'+kind);list.replaceChildren();
    if(!n || n[kind].length===0){const p=document.createElement('p');p.className='sub';I18n.write(p,'No items recorded.');list.append(p);continue;}
    for(const row of n[kind]){const item=document.createElement('div');item.className='summaryRow';const label=document.createElement('span'),amount=document.createElement('strong');label.textContent=row.name;I18n.write(amount,netWorthMoney(row.amount,n.currency));item.append(label,amount);list.append(item);}
  }
}
document.getElementById('netWorthCurrency').addEventListener('change',updateNetWorthPreview);

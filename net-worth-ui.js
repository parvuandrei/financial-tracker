function netWorthMoney(amount,currency){return amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+currency;}
function fillNetWorthWizard(value,currency){
  const n=value?FinTrackNetWorth.validate(value):FinTrackNetWorth.starter(currency);
  document.getElementById('netWorthCurrency').value=n.currency;
  for(const kind of ['assets','liabilities']){
    const list=document.getElementById('nw-'+kind);list.replaceChildren();
    for(const row of n[kind])appendNetWorthRow(kind,row);
  }
  updateNetWorthPreview();
}
function appendNetWorthRow(kind,row){
  const list=document.getElementById('nw-'+kind);
  const index=list.children.length+1;
  const wrap=document.createElement('div');wrap.className='nwRow';wrap.dataset.id=row.id;
  const name=document.createElement('input');name.value=row.name;name.maxLength=100;name.required=true;
  name.dataset.field='name';name.setAttribute('aria-label',`${kind==='assets'?'Asset':'Liability'} ${index} name`);
  const amount=document.createElement('input');amount.type='number';amount.min='0';amount.max='10000000000';amount.step='0.01';amount.required=true;
  amount.value=row.amount;amount.dataset.field='amount';amount.setAttribute('aria-label',`${kind==='assets'?'Asset':'Liability'} ${index} amount`);
  const remove=document.createElement('button');remove.type='button';remove.className='textButton';remove.textContent='Remove';
  remove.setAttribute('aria-label',`Remove ${row.name || (kind==='assets'?'asset':'liability')}`);
  remove.addEventListener('click',()=>{wrap.remove();updateNetWorthPreview();});
  name.addEventListener('input',()=>{amount.setAttribute('aria-label',`${name.value || kind} amount`);remove.setAttribute('aria-label',`Remove ${name.value || kind}`);updateNetWorthPreview();});
  amount.addEventListener('input',updateNetWorthPreview);
  wrap.append(name,amount,remove);list.append(wrap);return name;
}
function addNetWorthRow(kind){
  if(!['assets','liabilities'].includes(kind)||savingPreferences)return;
  if(document.getElementById('nw-'+kind).children.length>=100){document.getElementById('nwError').textContent='You can add up to 100 items on each side.';return;}
  appendNetWorthRow(kind,{id:crypto.randomUUID(),name:kind==='assets'?'Other asset':'Other liability',amount:0}).focus();
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
    for(const [id,key] of [['nwAssetsTotal','assets'],['nwDebtsTotal','liabilities'],['nwTotal','netWorth']])document.getElementById(id).textContent=netWorthMoney(t[key],n.currency);
    document.getElementById('nwError').textContent='';
  }catch(error){
    for(const id of ['nwAssetsTotal','nwDebtsTotal','nwTotal'])document.getElementById(id).textContent='—';
    document.getElementById('nwError').textContent=error.message;
  }
}
function renderSavedNetWorth(value){
  const n=value?FinTrackNetWorth.validate(value):null;
  const t=n?FinTrackNetWorth.totals(n):null;
  document.getElementById('netWorthMetric').textContent=t?netWorthMoney(t.netWorth,n.currency):'Set up your net worth';
  document.getElementById('netWorthBreakdown').textContent=t?`${netWorthMoney(t.assets,n.currency)} assets − ${netWorthMoney(t.liabilities,n.currency)} liabilities`:'Add what you own and what you owe.';
  document.getElementById('netWorthDetail').textContent=t?netWorthMoney(t.netWorth,n.currency):'Not set up';
  document.getElementById('netWorthAssets').textContent=t?netWorthMoney(t.assets,n.currency):'—';
  document.getElementById('netWorthLiabilities').textContent=t?netWorthMoney(t.liabilities,n.currency):'—';
  for(const kind of ['assets','liabilities']){
    const list=document.getElementById('saved-'+kind);list.replaceChildren();
    if(!n || n[kind].length===0){const p=document.createElement('p');p.className='sub';p.textContent='No items recorded.';list.append(p);continue;}
    for(const row of n[kind]){const item=document.createElement('div');item.className='summaryRow';const label=document.createElement('span'),amount=document.createElement('strong');label.textContent=row.name;amount.textContent=netWorthMoney(row.amount,n.currency);item.append(label,amount);list.append(item);}
  }
}
document.getElementById('netWorthCurrency').addEventListener('change',updateNetWorthPreview);

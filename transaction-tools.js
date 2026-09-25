let editingId=null;
const deletedTransactions=[];
function transactionMoney(value){return value.toLocaleString(I18n.locale(),{minimumFractionDigits:2,maximumFractionDigits:2})+' RON';}
function renderTransactions(){
  const income=tx.filter(t=>t.amt>0).reduce((sum,t)=>sum+Math.round(t.amt*100),0)/100;
  const outflow=tx.filter(t=>t.amt<0).reduce((sum,t)=>sum+Math.round(-t.amt*100),0)/100;
  I18n.write(document.getElementById('transactionBalance'),transactionMoney(income-outflow));
  I18n.write(document.getElementById('transactionIncome'),transactionMoney(income));
  I18n.write(document.getElementById('transactionOutflow'),transactionMoney(outflow));
  const cells=t=>`<td>${escapeText(t.name)}</td><td>${escapeText(I18n.t(t.type))}</td>`;
  const amount=t=>`<td class="${t.amt>0?'income':'expense'}">${transactionMoney(t.amt)}</td>`;
  document.getElementById('recent').innerHTML=tx.slice(0,5).map(t=>`<tr>${cells(t)}${amount(t)}</tr>`).join('')||`<tr><td colspan="3">${I18n.t('No transactions yet. Add your first transaction to see your balance.')}</td></tr>`;
  document.getElementById('all').innerHTML=tx.map(t=>`<tr>${cells(t)}<td>${escapeText(I18n.t(t.cat))}</td>${amount(t)}<td class="transactionActions"><button type="button" class="textButton" data-action="edit" data-id="${escapeText(t.id)}" aria-label="${I18n.t("Edit")} ${escapeText(t.name)}">${I18n.t("Edit")}</button> <button type="button" class="textButton" data-action="delete" data-id="${escapeText(t.id)}" aria-label="${I18n.t("Delete")} ${escapeText(t.name)}">${I18n.t("Delete")}</button></td></tr>`).join('')||`<tr><td colspan="5">${I18n.t('No transactions yet.')}</td></tr>`;
}
function updateTransactionEditor(){
  I18n.write(document.getElementById('transactionFormTitle'),editingId?'Edit transaction':'Add transaction');
  I18n.write(document.getElementById('addTransactionBtn'),editingId?'Save changes':'Add');
  document.getElementById('cancelTransactionEdit').hidden=!editingId;
}
function editTransaction(id){
  if(!window.FinTrackAccount?.isReady())return;
  const t=tx.find(t=>t.id===id);if(!t)return;
  editingId=id;
  for(const [field,value] of Object.entries({name:t.name,amount:Math.abs(t.amt),type:t.type,cat:t.cat}))document.getElementById(field).value=value;
  updateTransactionEditor();show('transactions');
  document.getElementById('name').focus();
  FinTrackData.changed();
}
function cancelTransactionEdit(){
  editingId=null;
  document.getElementById('name').value='';document.getElementById('amount').value='';
  updateTransactionEditor();window.FinTrackData?.changed();
}
function persistTransactionChange(){
  render();FinTrackData.changed();void FinTrackData.flush().catch(()=>{});
}
function deleteTransaction(id){
  if(!window.FinTrackAccount?.isReady())return;
  const index=tx.findIndex(t=>t.id===id);if(index<0)return;
  deletedTransactions.push({transaction:tx[index],index});tx.splice(index,1);
  if(editingId===id)cancelTransactionEdit();
  document.getElementById('undoTransaction').hidden=false;
  I18n.write(document.getElementById('deleteNotice'),'Transaction removed. You can undo deletions until you leave this session.');
  persistTransactionChange();
}
function undoTransactionDelete(){
  if(!window.FinTrackAccount?.isReady())return;
  const entry=deletedTransactions.pop();if(!entry)return;
  tx.splice(Math.min(entry.index,tx.length),0,entry.transaction);
  document.getElementById('undoTransaction').hidden=deletedTransactions.length===0;
  I18n.write(document.getElementById('deleteNotice'),'Transaction restored.');
  persistTransactionChange();
}
function resetTransactionTools(){
  editingId=null;deletedTransactions.length=0;updateTransactionEditor();
  document.getElementById('undoTransaction').hidden=true;I18n.write(document.getElementById('deleteNotice'),'');
}
document.getElementById('all').addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');if(!button)return;
  if(button.dataset.action==='edit')editTransaction(button.dataset.id);
  if(button.dataset.action==='delete')deleteTransaction(button.dataset.id);
});

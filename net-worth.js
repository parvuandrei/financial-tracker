(function(root){
  'use strict';
  function starter(currency='RON'){
    return {currency,
      assets:['Cash and bank accounts','Investments','Retirement accounts','Primary home','Other property','Vehicles','Other valuables'].map((name,i)=>({id:'asset-'+i,name,amount:0})),
      liabilities:['Mortgage','Car loans','Credit cards','Student loans','Personal loans','Other debt'].map((name,i)=>({id:'debt-'+i,name,amount:0}))};
  }
  function validate(value){
    if(!value || !['RON','EUR','USD'].includes(value.currency))throw new Error('Choose a net-worth currency.');
    const result={currency:value.currency};
    for(const kind of ['assets','liabilities']){
      if(!Array.isArray(value[kind]) || value[kind].length>100)throw new Error('Use up to 100 items on each side.');
      result[kind]=value[kind].map(row=>{
        if(!row || typeof row.id!=='string' || !row.id || typeof row.name!=='string' || !row.name.trim() || row.name.length>100
          || !Number.isFinite(row.amount) || row.amount<0 || row.amount>1e10)
          throw new Error('Give every item a name and an amount from 0 to 10 billion. Use 0 for items you do not have.');
        return {id:row.id,name:row.name.trim(),amount:Math.round(row.amount*100)/100};
      });
      if(new Set(result[kind].map(row=>row.id)).size!==result[kind].length)throw new Error('Duplicate item IDs.');
    }
    return result;
  }
  function totals(value){
    const n=validate(value);
    const sum=kind=>n[kind].reduce((total,row)=>total+Math.round(row.amount*100),0);
    const assets=sum('assets'),liabilities=sum('liabilities');
    return {assets:assets/100,liabilities:liabilities/100,netWorth:(assets-liabilities)/100};
  }
  const api={starter,validate,totals};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FinTrackNetWorth=api;
})(typeof window!=='undefined'?window:globalThis);

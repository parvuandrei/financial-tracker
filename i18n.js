/* Explicitly registered interface text only: never scans user-generated content. */
(() => {
  const dictionary=window.CashcavalRomanian;
  const textNodes=[],attributes=[],dynamic=new Map(),dynamicAttributes=new Map();
  const storageKey='cashcaval-language';
  function localLanguage(){try{const v=localStorage.getItem(storageKey);if(v==='en'||v==='ro')return v;}catch{}return navigator.language?.toLowerCase().startsWith('ro')?'ro':'en';}
  let language=localLanguage();
  function t(value){
    const source=String(value??'');if(language==='en')return source;
    const key=source.trim();let result=dictionary[key];
    if(result===undefined){
      const rules=[
        [/^(.+) assets − (.+) liabilities$/,(_,a,b)=>`${a} active − ${b} datorii`],
        [/^(.+)\/day is deducted automatically without detailed tracking\.$/,(_,a)=>`${a}/zi se scad automat, fără înregistrare detaliată.`],
        [/^(\d+) months$/,(_,n)=>`${n} luni`],[/^(\d+) mo$/,(_,n)=>`${n} luni`],
        [/^Month (\d+)( · event)?$/,(_,n,event)=>`Luna ${n}${event?' · eveniment':''}`],
        [/^(.+)\/day$/,(_,n)=>`${n}/zi`],[/^(.+)\/month$/,(_,n)=>`${n}/lună`],
        [/^Remove (.+)$/,(_,n)=>`Elimină ${n}`],[/^Edit (.+)$/,(_,n)=>`Editează ${n}`],[/^Delete (.+)$/,(_,n)=>`Șterge ${n}`],
        [/^Asset (\d+) name$/,(_,n)=>`Nume activ ${n}`],[/^Liability (\d+) name$/,(_,n)=>`Nume datorie ${n}`],
        [/^Asset (\d+) amount$/,(_,n)=>`Valoare activ ${n}`],[/^Liability (\d+) amount$/,(_,n)=>`Valoare datorie ${n}`],
        [/^(.+) amount$/,(_,n)=>`Valoare: ${n}`]
      ];
      for(const [regex,replace] of rules){if(regex.test(key)){result=key.replace(regex,replace);break;}}
    }
    return result===undefined?source:source.replace(key,result);
  }
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){const node=walker.currentNode;if(node.textContent.trim()&&!node.parentElement.closest('script,style'))textNodes.push([node,node.textContent]);}
  for(const element of document.querySelectorAll('option'))if(!element.hasAttribute('value'))element.value=element.textContent;
  for(const element of document.querySelectorAll('[placeholder],[aria-label]'))for(const name of ['placeholder','aria-label'])if(element.hasAttribute(name))attributes.push([element,name,element.getAttribute(name)]);
  function write(element,source){dynamic.set(element,String(source??''));element.textContent=t(source);}
  function attribute(element,name,source){if(!dynamicAttributes.has(element))dynamicAttributes.set(element,new Map());dynamicAttributes.get(element).set(name,source);element.setAttribute(name,t(source));}
  function use(next,refresh=true){
    if(!['en','ro'].includes(next))return;
    language=next;document.documentElement.lang=language;
    document.title=language==='ro'?'Cashcaval — Averea ta, la vedere':'Cashcaval — Your net worth, clearly';
    for(const [node,source] of textNodes)if(node.isConnected)node.textContent=t(source);
    for(const [element,name,source] of attributes)element.setAttribute(name,t(source));
    for(const [element,source] of dynamic){if(element.isConnected)element.textContent=t(source);else dynamic.delete(element);}
    for(const [element,values] of dynamicAttributes){if(!element.isConnected){dynamicAttributes.delete(element);continue;}for(const [name,source] of values)element.setAttribute(name,t(source));}
    for(const element of document.querySelectorAll('[data-language]'))element.value=language;
    if(refresh&&typeof refreshLanguageUI==='function')refreshLanguageUI();
  }
  window.I18n={t,write,attribute,use,localLanguage,hasLocalChoice:()=>{try{return ['en','ro'].includes(localStorage.getItem(storageKey));}catch{return false;}},get language(){return language;},locale:()=>language==='ro'?'ro-RO':'en-US'};
  for(const select of document.querySelectorAll('[data-language]'))select.addEventListener('change',()=>{
    const value=select.value;try{localStorage.setItem(storageKey,value);}catch{}
    use(value);
    if(window.FinTrackAccount?.isReady()){FinTrackData.changed();void FinTrackData.flush().catch(()=>{});}
  });
  use(language,false);
})();

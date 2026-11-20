async function init(){
 const status=document.getElementById('connection'),detail=document.getElementById('connection-detail');
 try{const r=await fetch('/api/uniware-status');const d=await r.json();status.textContent=d.configured?'Credentials configured':'API setup pending';detail.textContent=d.configured?'Ready for secure connection test':`Missing: ${d.missing.join(', ')}`;}
 catch(e){status.textContent='Backend unavailable';detail.textContent='Run through Vercel deployment';}
 try{const r=await fetch('/api/product-master');const d=await r.json();if(d.configured)document.getElementById('master-status').textContent='SOURCE CONNECTED';}catch(e){}
}
document.getElementById('refresh').addEventListener('click',init);
const testButton=document.getElementById('test-connection');
testButton.addEventListener('click',async()=>{
 const result=document.getElementById('test-result'),detail=document.getElementById('test-detail');
 testButton.disabled=true;testButton.textContent='Testing connection…';result.textContent='TESTING';result.className='tag muted';detail.textContent='Sending secure authentication request to Uniware.';
 try{const r=await fetch('/api/uniware-test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const d=await r.json();result.textContent=d.ok?'CONNECTED':'TEST FAILED';result.className='tag '+(d.ok?'success':'error');detail.textContent=d.message||'Connection test completed.';if(d.diagnostic){const x=d.diagnostic;detail.textContent+=' '+[x.stage&&`Stage: ${x.stage}`,x.upstreamStatus&&`HTTP: ${x.upstreamStatus}`,x.path&&`Path: ${x.path}`].filter(Boolean).join(' | ');}if(d.ok&&d.expiresIn)detail.textContent+=` Token validity: ${Math.floor(d.expiresIn/60)} minutes.`;}
 catch(e){result.textContent='TEST FAILED';result.className='tag error';detail.textContent='Could not reach the test endpoint. Check Vercel Runtime Logs.';}
 finally{testButton.disabled=false;testButton.textContent='Test Uniware Connection';}
});

const output=document.getElementById('export-output');
async function createExport(body,button){
 button.disabled=true;const old=button.textContent;button.textContent='Creating…';output.textContent='Sending export request to Uniware…';
 try{const r=await fetch('/api/uniware-export-create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();
  if(d.ok){
   const row=document.createElement('div');row.className='job-result';
   if(d.mode==='direct-inventory-snapshot'){
    row.textContent=`Inventory Snapshot fetched successfully · ${d.recordCount} unique SKUs · Total inventory: ${d.totalInventory}`;
    const tbody=document.getElementById('inventory-body');tbody.replaceChildren();
    for(const item of (d.inventory||[])){const tr=document.createElement('tr');const sku=document.createElement('td');sku.textContent=item.skuCode;const blanks=[0,1,2,3].map(()=>document.createElement('td'));const qty=document.createElement('td');qty.className='right';qty.textContent=Number(item.inventory||0).toLocaleString('en-IN');tr.append(sku,...blanks,qty);tbody.appendChild(tr);}
    document.getElementById('stock').textContent=Number(d.totalInventory||0).toLocaleString('en-IN');
    document.getElementById('export').onclick=()=>{const lines=['SKU CODE,UNIWARE INVENTORY',...(d.inventory||[]).map(x=>`${JSON.stringify(x.skuCode)},${Number(x.inventory||0)}`)];const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='KUCHIPOO-Uniware-Inventory.csv';a.click();URL.revokeObjectURL(url);};
   }else{row.textContent=`${d.report} created · Job Code: ${d.jobCode}${d.dateRange?` · ${d.dateRange.startDate} to ${d.dateRange.endDate}`:''}`;document.getElementById('status-job-code').value=d.jobCode;}
   output.prepend(row);
  }
  else {const x=d.diagnostic||{};output.textContent=`${d.code||'ERROR'}: ${d.message||'Export request failed.'}`+(x.upstreamStatus?` | Uniware HTTP: ${x.upstreamStatus}`:'')+(x.contentType?` | Content-Type: ${x.contentType}`:'')+(x.requestPath?` | Endpoint: ${x.requestPath}`:'')+(x.responseBody?` | Uniware response: ${x.responseBody}`:'');}
 }catch(e){output.textContent='Could not call the export endpoint. Check Vercel Runtime Logs.';}
 finally{button.disabled=false;button.textContent=old;}
}
document.getElementById('create-inventory-export').addEventListener('click',e=>createExport({reportType:'inventory'},e.currentTarget));
document.getElementById('create-sales-export').addEventListener('click',e=>createExport({reportType:'sales',startDate:document.getElementById('sales-start').value,endDate:document.getElementById('sales-end').value,filterId:document.getElementById('sales-filter-id').value},e.currentTarget));
document.getElementById('check-export-status').addEventListener('click',async e=>{
 const button=e.currentTarget,jobCode=document.getElementById('status-job-code').value.trim();if(!jobCode){output.textContent='Enter a Job Code first.';return;}button.disabled=true;button.textContent='Checking…';
 try{const r=await fetch('/api/uniware-export-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobCode})});const d=await r.json();const result=document.createElement('div');result.className='job-result';result.textContent=`Job ${jobCode} · Status: ${d.status||'UNKNOWN'}${d.message?` · ${d.message}`:''}${d.filePath?` · CSV path: ${d.filePath}`:''}`;output.prepend(result);}
 catch(e){output.textContent='Could not check job status. Check Vercel Runtime Logs.';}
 finally{button.disabled=false;button.textContent='Check Job Status';}
});
document.getElementById('search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#inventory-body tr').forEach(r=>r.style.display=r.innerText.toLowerCase().includes(q)?'':'none');});
document.getElementById('export').addEventListener('click',()=>alert('CSV download will be enabled after the data pipeline and storage are connected.'));
init();

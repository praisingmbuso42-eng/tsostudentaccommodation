(()=>{
 const $=id=>document.getElementById(id);
 const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 let latest=null;
 const number=value=>Number(value||0).toLocaleString("en-ZA");
 const breakdown=(items,labelKey)=>{
  if(!items?.length)return '<p class="muted-note">No records for this period.</p>';
  const max=Math.max(1,...items.map(x=>Number(x.count)||0));
  return items.map(item=>`<div class="breakdown-row"><div class="breakdown-label"><span>${escapeHtml(item[labelKey])}</span><strong>${number(item.count)}</strong></div><div class="breakdown-track"><span style="width:${Math.max(0,Math.min(100,(Number(item.count)||0)/max*100))}%"></span></div></div>`).join("");
 };
 async function loadReports(from="",to=""){
  const status=$("reportStatus");status.textContent="Loading reports…";status.className="form-message";
  const params=new URLSearchParams();if(from)params.set("from",from);if(to)params.set("to",to);
  try{
   const response=await fetch("/api/admin/reports"+(params.size?"?"+params.toString():""),{credentials:"same-origin",cache:"no-store"});
   const data=await response.json();if(!response.ok)throw new Error(data.message||"Could not load reports.");latest=data;
   $("reportStatGrid").innerHTML=[
    ["Applications",data.applications.total],["Active applicants",data.applications.active],["Registered students",data.students.registered],["Documents uploaded",data.documents.total],["Approved applicants",data.applications.approved]
   ].map(([label,value])=>`<article class="report-stat"><span>${label}</span><strong>${number(value)}</strong></article>`).join("");
   $("applicationStatusBreakdown").innerHTML=breakdown(data.applications.statuses,"status");
   $("documentStatusBreakdown").innerHTML=breakdown(data.documents.statuses,"status");
   $("courseBreakdown").innerHTML=breakdown(data.applications.byCourse,"course");
   $("facultyBreakdown").innerHTML=breakdown(data.applications.byFaculty,"faculty");
   $("occupancyRate").textContent=data.rooms.occupancyRate+"%";
   $("occupancyBar").style.width=data.rooms.occupancyRate+"%";
   $("roomMetrics").innerHTML=[["Occupied",data.rooms.occupied],["Reserved",data.rooms.reserved],["Allocated",data.rooms.allocated],["Available",data.rooms.available],["Total capacity",data.rooms.total]].map(([label,value])=>`<div><strong>${number(value)}</strong><span>${label}</span></div>`).join("");
   const months=data.applications.monthly||[];$("monthlyBreakdown").innerHTML=months.length?months.map(m=>`<div class="month-row"><span>${escapeHtml(m.month)}</span><div class="breakdown-track"><span style="width:${Math.max(2,Math.min(100,m.count/Math.max(1,...months.map(x=>x.count))*100))}%"></span></div><strong>${number(m.count)}</strong></div>`).join(""):'<p class="muted-note">No application activity for this period.</p>';
   $("reportPeriodLabel").textContent=from||to?`${from||"Earliest"} to ${to||"Today"}`:"All records";
   $("reportGeneratedAt").textContent="Generated "+new Date(data.generatedAt).toLocaleString("en-ZA");
   status.textContent="Reports updated successfully.";status.className="form-message success";
  }catch(error){status.textContent=error.message;status.className="form-message error";}
 }
 $("reportFilterForm").addEventListener("submit",event=>{event.preventDefault();const from=$("reportFrom").value,to=$("reportTo").value;if(from&&to&&from>to){$("reportStatus").textContent="The start date cannot be after the end date.";$("reportStatus").className="form-message error";return;}loadReports(from,to);});
 $("clearReportFilters").addEventListener("click",()=>{$("reportFrom").value="";$("reportTo").value="";loadReports();});
 $("printReportButton").addEventListener("click",()=>{if(!latest)return;window.print();});
 const csvCell=value=>{let text=String(value??"");if(/^[=+@\-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 $("downloadCsvButton").addEventListener("click",()=>{if(!latest)return;const rows=[["TSO Student Housing — Management Report"],["Report period",$("reportPeriodLabel").textContent],["Generated",$("reportGeneratedAt").textContent],[],["Category","Metric","Count"]];
  rows.push(["Applications","Total",latest.applications.total],["Applications","Active applicants (not rejected)",latest.applications.active],["Applications","Approved applicants",latest.applications.approved]);
  latest.applications.statuses.forEach(x=>rows.push(["Application status",x.status,x.count]));
  rows.push(["Students","Registered students",latest.students.registered],["Documents","Total uploaded",latest.documents.total]);latest.documents.statuses.forEach(x=>rows.push(["Document status",x.status,x.count]));
  rows.push(["Accommodation","Total capacity",latest.rooms.total],["Accommodation","Occupied",latest.rooms.occupied],["Accommodation","Reserved",latest.rooms.reserved],["Accommodation","Allocated",latest.rooms.allocated],["Accommodation","Available",latest.rooms.available],["Accommodation","Occupancy rate",latest.rooms.occupancyRate+"%"]);
  latest.applications.byCourse.forEach(x=>rows.push(["Applications by course",x.course,x.count]));latest.applications.byFaculty.forEach(x=>rows.push(["Applications by faculty",x.faculty,x.count]));latest.applications.monthly.forEach(x=>rows.push(["Monthly applications",x.month,x.count]));
  const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="TSO-Student-Housing-Management-Report.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 });
 loadReports();
})();

const menuToggle=document.getElementById("menuToggle");
const navLinks=document.getElementById("navLinks");
if(menuToggle&&navLinks){menuToggle.addEventListener("click",()=>{const open=navLinks.classList.toggle("active");menuToggle.setAttribute("aria-expanded",String(open));menuToggle.textContent=open?"✕":"☰";});navLinks.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>navLinks.classList.remove("active")));}
const year=document.getElementById("currentYear");if(year)year.textContent=new Date().getFullYear();
async function api(url,options={}){const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});let data={};try{data=await response.json()}catch{}if(!response.ok)throw new Error(data.message||"Something went wrong. Please try again.");return data;}
function message(text,error=false){const el=document.getElementById("formMessage");if(el){el.textContent=text;el.className="form-message "+(error?"error":"success");}}
function formData(form){return Object.fromEntries(new FormData(form).entries());}
// Public homepage content is loaded from the administrator-managed settings.
async function loadPublicSiteContent(){
 const bar=document.getElementById("publicAnnouncementBar");
 const isHome=!!document.getElementById("siteHeroEyebrow");
 if(!isHome&&!bar)return;
 try{const result=await api("/api/site-content"),c=result.content||{};
  const setText=(id,key)=>{const el=document.getElementById(id);if(el&&c[key])el.textContent=c[key];};
  setText("siteHeroEyebrow","heroEyebrow");setText("siteHeroTitleLine1","heroTitleLine1");setText("siteHeroTitleLine2","heroTitleLine2");setText("siteHeroTitleLine3","heroTitleLine3");setText("siteHeroDescription","heroDescription");
  setText("siteWelcomeLabel","welcomeLabel");setText("siteWelcomeTitleLine1","welcomeTitleLine1");setText("siteWelcomeTitleLine2","welcomeTitleLine2");setText("siteWelcomeDescription","welcomeDescription");
  const address=document.getElementById("siteContactAddress");if(address&&c.address)address.textContent=c.address;
  const phone=document.getElementById("siteContactPhone");if(phone&&c.phone){phone.textContent=c.phone;phone.href="tel:"+c.phone.replace(/[^0-9+]/g,"");}
  const email=document.getElementById("siteContactEmail");if(email&&c.email){email.textContent=c.email;email.href="mailto:"+c.email;}
  const hero=document.querySelector(".hero");if(hero&&c.heroImage)hero.style.backgroundImage=`url("${c.heroImage.replace(/[\"\\]/g,"")}")`;
  document.querySelectorAll("[data-site-image]").forEach(img=>{const url=c[img.dataset.siteImage];if(url){img.src=url;img.style.display="block";}});
  if(bar){if(c.publicAnnouncement){bar.textContent=c.publicAnnouncement;bar.hidden=false;}else bar.hidden=true;}
  const year=c.applicationYear;if(year){document.querySelectorAll("[data-year-content]").forEach(el=>el.textContent=year);const heroLink=document.getElementById("siteHeroApplyLink");if(heroLink)heroLink.textContent="Apply for "+year+" →";const appLink=document.getElementById("siteApplicationLink");if(appLink)appLink.textContent="Enquire About "+year+" Applications →";}
 }catch(error){console.warn("Public website content could not be loaded:",error.message);}
}
loadPublicSiteContent();

// Administrator website content editor
const siteContentForm=document.getElementById("siteContentForm");
if(siteContentForm){
 const status=document.getElementById("siteContentStatus");
 (async()=>{try{const result=await api("/api/admin/site-content");for(const [key,value] of Object.entries(result.content||{})){const field=siteContentForm.elements.namedItem(key);if(field)field.value=value;}}catch(error){if(status){status.textContent=error.message;status.className="form-message error";}}})();
 siteContentForm.addEventListener("submit",async event=>{event.preventDefault();const button=document.getElementById("saveSiteContentButton");button.disabled=true;try{const result=await api("/api/admin/site-content",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(siteContentForm))});status.textContent=result.message;status.className="form-message success";}catch(error){status.textContent=error.message;status.className="form-message error";}finally{button.disabled=false;}});
}
document.querySelectorAll(".siteImageForm").forEach(form=>form.addEventListener("submit",async event=>{event.preventDefault();const status=form.querySelector(".form-message"),button=form.querySelector("button");button.disabled=true;try{const data=new FormData(form);const result=await api("/api/admin/site-content/image/"+encodeURIComponent(form.dataset.slot),{method:"POST",body:data});status.textContent=result.message;status.className="form-message success";form.reset();}catch(error){status.textContent=error.message;status.className="form-message error";}finally{button.disabled=false;}}));

const register=document.getElementById("registerForm");
if(register)register.addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(register))});message("Account created. Redirecting to your student portal…");location.href="dashboard.html";}catch(err){message(err.message,true);}});
const login=document.getElementById("loginForm");
if(login)login.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(login))});location.href="dashboard.html";}catch(err){message(err.message,true);}});
const adminLogin=document.getElementById("adminLoginForm");
if(adminLogin)adminLogin.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(adminLogin))});location.href="dashboard.html";}catch(err){message(err.message,true);}});
const logout=document.getElementById("logoutButton");
if(logout)logout.addEventListener("click",async()=>{try{await api("/api/auth/logout",{method:"POST"});}finally{location.href="login.html";}});
const appForm=document.getElementById("applicationForm");
if(appForm)appForm.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/applications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(appForm))});message("Application submitted. You can track its status below.");await loadStudentTracking();}catch(err){message(err.message,true);}});
const docsForm=document.getElementById("documentsForm");
if(docsForm)docsForm.addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(docsForm);try{const r=await api("/api/documents",{method:"POST",body:fd});message(r.message);docsForm.reset();loadDocuments();loadStudentTracking();}catch(err){message(err.message,true);}});
async function loadDocuments(){const box=document.getElementById("documentStatus");if(!box)return;try{const r=await api("/api/documents/mine");box.innerHTML="<h2>My uploaded documents</h2>"+(r.documents.length?r.documents.map(x=>`<p>${escapeHtml(x.label)} — <span class="status-pill">${escapeHtml(x.status)}</span></p>`).join(""):"<p>No documents uploaded yet.</p>");}catch(e){box.textContent=e.message;}}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const reviewForm=document.getElementById("reviewForm");
if(reviewForm)reviewForm.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(reviewForm))});message("Thank you. Your review has been submitted for moderation.");reviewForm.reset();}catch(err){message(err.message,true);}});
async function loadReviews(){const box=document.getElementById("reviewsList");if(!box)return;try{const r=await api("/api/reviews");box.innerHTML=r.reviews.length?r.reviews.map(x=>`<article class="review-item"><strong>${"★".repeat(x.rating)}${"☆".repeat(5-x.rating)}</strong><p>${escapeHtml(x.comment)}</p><small>${escapeHtml(x.studentName)}</small></article>`).join(""):"<p>No published reviews yet.</p>";}catch(e){box.textContent="Reviews are temporarily unavailable.";}}
async function loadStudentTracking(){
 const box=document.getElementById("applicationTracking");
 if(!box)return;
 try{
  const r=await api("/api/student/me");
  const a=r.application;
  const labels={id:"South African ID",registration:"VUT registration",funding:"Proof of funding",residence:"Proof of residence",transcript:"Academic transcript"};
  if(!a){
   box.innerHTML='<div class="tracking-empty"><h2>No application submitted yet</h2><p>Complete the application form below to begin your TSO 2027 accommodation application.</p></div>';
   return;
  }
  const status=String(a.status||"Submitted");
  const stages=["Submitted","Under review","Pending documents","Approved"];
  const current=stages.indexOf(status);
  const isRejected=status==="Rejected";
  const steps=stages.map((s,i)=>`<div class="tracking-step ${i<current?"complete":i===current?"current":""}"><span class="tracking-dot">${i<current?"✓":i+1}</span><div><strong>${s}</strong><small>${i===0?"Your application has been received":i===1?"Management is reviewing your application":i===2?"Please check whether any documents need attention":"Your application has been approved"}</small></div></div>`).join("");
  const docs=r.documents||[];
  const docRows=docs.length?docs.map(d=>`<li><span>${escapeHtml(labels[d.type]||d.type)}</span><strong>${escapeHtml(d.status)}</strong></li>`).join(""):'<li>No documents uploaded yet.</li>';
  const room=r.allocation?`<div class="tracking-room"><span>Allocated accommodation space</span><strong>Space ${String(r.allocation.spaceNumber).padStart(2,"0")}</strong><small>${escapeHtml(r.allocation.status)}</small></div>`:'<div class="tracking-room"><span>Accommodation space</span><strong>Not allocated yet</strong><small>Management will allocate a space after approval.</small></div>';
  box.innerHTML=`<div class="tracking-summary"><div><span class="section-label">YOUR APPLICATION STATUS</span><h2>${escapeHtml(status)}</h2><p>Submitted ${escapeHtml(a.createdAt||"")}</p></div><span class="status-pill">${escapeHtml(status)}</span></div>${isRejected?'<p class="tracking-alert">Your application was rejected. Please contact TSO management for further information.</p>':`<div class="tracking-steps">${steps}</div>`}<div class="tracking-details"><div><h3>Application details</h3><p><strong>Course:</strong> ${escapeHtml(a.course)}</p><p><strong>Faculty:</strong> ${escapeHtml(a.faculty)}</p><p><strong>Year of study:</strong> ${escapeHtml(a.studyYear)}</p></div><div><h3>Document review</h3><ul class="tracking-docs">${docRows}</ul></div></div>${room}<p class="muted-note">Your status updates when TSO management processes your application or documents. Refresh this page to see the latest update.</p>`;
 }catch(e){
  box.innerHTML=`<p class="form-message error">${escapeHtml(e.message)} Please sign in again if your session has expired.</p>`;
 }
}
async function loadStudent(){const el=document.getElementById("welcomeText");if(!el)return;try{const r=await api("/api/student/me");el.textContent=`Welcome, ${r.student.fullName} · VUT student ${r.student.studentNumber}. Your TSO 2027 accommodation application and documents are available here.`;const s=document.getElementById("studentStatus");if(s)s.textContent=`Application status: ${r.application?.status||"Not submitted yet"} · Residence capacity: 50 students`;}catch(e){location.href="login.html";}}
async function loadAdmin(){const stats=document.getElementById("adminStats");if(!stats)return;try{const r=await api("/api/admin/summary");stats.innerHTML=`<div><strong>${r.total}</strong><span>Applications</span></div><div><strong>${r.approved}</strong><span>Approved</span></div><div><strong>${r.assigned}</strong><span>Spaces allocated</span></div><div><strong>${r.available}</strong><span>Available spaces</span></div>`;}catch(e){location.href="login.html";}}
async function loadApplications(){const body=document.getElementById("applicationsTable");if(!body)return;try{const r=await api("/api/admin/applications");body.innerHTML=r.applications.map(a=>`<tr><td>${escapeHtml(a.fullName)}</td><td>${escapeHtml(a.studentNumber)}</td><td>${escapeHtml(a.course||"—")}</td><td><span class="status-pill">${escapeHtml(a.status)}</span></td><td><select class="status-select" data-id="${a.id}"><option value="">Change status</option><option>Under review</option><option>Pending documents</option><option>Approved</option><option>Rejected</option></select></td></tr>`).join("")||'<tr><td colspan="5">No applications received.</td></tr>';body.querySelectorAll("select").forEach(sel=>sel.addEventListener("change",async()=>{if(!sel.value)return;try{await api(`/api/admin/applications/${sel.dataset.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:sel.value})});loadApplications();}catch(e){alert(e.message);}}));}catch(e){body.innerHTML=`<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;}}
async function loadStudents(){const body=document.getElementById("studentsTable");if(!body)return;try{const r=await api("/api/admin/students");body.innerHTML=r.students.map(s=>`<tr><td>${escapeHtml(s.fullName)}</td><td>${escapeHtml(s.studentNumber)}</td><td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.phone)}</td><td>${escapeHtml(s.createdAt)}</td></tr>`).join("")||'<tr><td colspan="5">No student accounts yet.</td></tr>';}catch(e){body.innerHTML=`<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;}}

async function loadAdminDocuments(){const body=document.getElementById("documentsTable");if(!body)return;try{const r=await api("/api/admin/documents");body.innerHTML=r.documents.map(d=>`<tr><td>${escapeHtml(d.studentName)}<br><small>${escapeHtml(d.studentNumber)}</small></td><td>${escapeHtml(d.label)}</td><td><a class="text-link" target="_blank" rel="noopener" href="/api/admin/documents/${d.id}/file">View PDF</a></td><td><span class="status-pill">${escapeHtml(d.status)}</span></td><td><select class="status-select" data-id="${d.id}"><option value="">Update</option><option>Verified</option><option>Rejected - replace copy</option><option>Pending verification</option></select></td></tr>`).join("")||'<tr><td colspan="5">No documents uploaded.</td></tr>';body.querySelectorAll("select").forEach(sel=>sel.addEventListener("change",async()=>{if(!sel.value)return;try{await api(`/api/admin/documents/${sel.dataset.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:sel.value})});loadAdminDocuments();}catch(e){alert(e.message);}}));}catch(e){body.innerHTML=`<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;}}


async function loadAdminReviews(){const body=document.getElementById("adminReviewsTable");if(!body)return;try{const r=await api("/api/admin/reviews");body.innerHTML=r.reviews.map(v=>`<tr><td>${escapeHtml(v.studentName)}</td><td>${"★".repeat(v.rating)}</td><td>${escapeHtml(v.comment)}</td><td>${escapeHtml(v.status)}</td><td><select class="status-select" data-id="${v.id}"><option value="">Moderate</option><option>Published</option><option>Hidden</option></select></td></tr>`).join("")||'<tr><td colspan="5">No reviews submitted yet.</td></tr>';body.querySelectorAll("select").forEach(sel=>sel.addEventListener("change",async()=>{if(!sel.value)return;try{await api(`/api/admin/reviews/${sel.dataset.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:sel.value})});loadAdminReviews();}catch(e){alert(e.message);}}));}catch(e){body.innerHTML=`<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;}}


// Admin announcement composer
const announcementForm=document.getElementById("announcementForm");
if(announcementForm)announcementForm.addEventListener("submit",async event=>{
 event.preventDefault();
 const button=document.getElementById("sendAnnouncementButton");
 const status=document.getElementById("announcementMessageStatus");
 button.disabled=true;
 try{
  const result=await api("/api/admin/announcements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(announcementForm))});
  if(status){status.textContent=result.message;status.className="form-message success";}
  announcementForm.reset();
 }catch(error){
  if(status){status.textContent=error.message;status.className="form-message error";}
 }finally{button.disabled=false;}
});

// Student notification centre
function updateNotificationBadges(count){
 const value=Number(count)||0;
 ["notificationCount","notificationBellCount"].forEach(id=>{
  const el=document.getElementById(id);if(!el)return;
  el.textContent=value>99?"99+":String(value);el.hidden=value===0;
 });
}
async function loadStudentNotifications(){
 const list=document.getElementById("notificationList");
 const summary=document.getElementById("notificationSummary");
 const markAll=document.getElementById("markAllRead");
 if(!list&&!summary&&!markAll)return;
 try{
  const data=await api("/api/student/notifications");
  updateNotificationBadges(data.unreadCount);
  if(summary)summary.textContent=`${data.unreadCount} unread · ${data.notifications.length} recent notifications`;
  if(!list)return;
  list.innerHTML=data.notifications.length?data.notifications.map(n=>`<article class="notification-item ${n.isRead?"read":"unread"}"><div class="notification-icon" aria-hidden="true">${n.category==="document"?"▤":n.category==="room"?"⌂":n.category==="announcement"?"!":"●"}</div><div class="notification-copy"><div class="notification-title-row"><h2>${escapeHtml(n.title)}</h2><time>${escapeHtml(n.createdAt)}</time></div><p>${escapeHtml(n.message)}</p>${n.isRead?'<span class="notification-read-label">Read</span>':`<button class="text-link mark-notification-read" type="button" data-id="${n.id}">Mark as read</button>`}</div></article>`).join(""):'<div class="notification-empty"><h2>You’re all caught up</h2><p>Application, document, room and important announcement updates will appear here.</p></div>';
  list.querySelectorAll(".mark-notification-read").forEach(button=>button.addEventListener("click",async()=>{button.disabled=true;try{await api(`/api/student/notifications/${button.dataset.id}/read`,{method:"PATCH"});await loadStudentNotifications();}catch(err){button.disabled=false;alert(err.message);}}));
 }catch(e){if(list)list.innerHTML=`<p class="form-message error">${escapeHtml(e.message)}</p>`;if(summary)summary.textContent="Notifications are temporarily unavailable.";}
}
const markAllRead=document.getElementById("markAllRead");
if(markAllRead)markAllRead.addEventListener("click",async()=>{markAllRead.disabled=true;try{await api("/api/student/notifications/read-all",{method:"POST"});await loadStudentNotifications();}catch(e){alert(e.message);}finally{markAllRead.disabled=false;}});

// Protect portal pages on every navigation, not only when a form submits.
(async()=>{
  const path=location.pathname;
  const studentPrivate=path.includes("/student/")&&!path.endsWith("/login.html")&&!path.endsWith("/register.html");
  const adminPrivate=path.includes("/admin/")&&!path.endsWith("/login.html");
  if(studentPrivate){try{await api("/api/student/me");}catch{location.replace("login.html");return;}}
  if(adminPrivate){try{await api("/api/admin/summary");}catch{location.replace("login.html");return;}}
  loadAdminReviews();loadAdminDocuments();loadDocuments();loadReviews();loadStudentTracking();loadStudent();loadStudentNotifications();loadAdmin();loadApplications();loadStudents();loadRoomManager();
})();

// TSO 50-space allocation manager
async function loadRoomManager(){
 const grid=document.getElementById("roomGrid");if(!grid)return;
 const availableEl=document.getElementById("roomAvailable"),reservedEl=document.getElementById("roomReserved"),occupiedEl=document.getElementById("roomOccupied");
 const spaceSelect=document.getElementById("spaceSelect"),studentSelect=document.getElementById("roomStudentSelect");
 try{
  const [roomData,eligibleData]=await Promise.all([api("/api/admin/rooms"),api("/api/admin/rooms/eligible-students")]);
  const spaces=roomData.spaces;
  if(availableEl)availableEl.textContent=roomData.summary.available;
  if(reservedEl)reservedEl.textContent=roomData.summary.Reserved;
  if(occupiedEl)occupiedEl.textContent=roomData.summary.Occupied;
  if(spaceSelect){
   const current=spaceSelect.value;
   spaceSelect.innerHTML='<option value="">Choose an available space</option>'+spaces.filter(s=>!s.allocationId).map(s=>`<option value="${s.spaceNumber}">Space ${String(s.spaceNumber).padStart(2,"0")}</option>`).join("");
   if(current&&[...spaceSelect.options].some(o=>o.value===current))spaceSelect.value=current;
  }
  if(studentSelect){
   const current=studentSelect.value;
   studentSelect.innerHTML='<option value="">Choose an approved student</option>'+eligibleData.students.map(s=>`<option value="${s.id}">${escapeHtml(s.fullName)} · ${escapeHtml(s.studentNumber)}</option>`).join("");
   if(current&&[...studentSelect.options].some(o=>o.value===current))studentSelect.value=current;
  }
  grid.innerHTML=spaces.map(s=>{
   const state=s.status||"Available";
   const student=s.fullName?`<div class="room-student">${escapeHtml(s.fullName)}<small>${escapeHtml(s.studentNumber||"")}</small></div>`:'<div class="room-empty">Ready for allocation</div>';
   const action=s.allocationId?`<div class="room-actions"><select class="status-select room-status" data-id="${s.allocationId}" aria-label="Update space ${s.spaceNumber} status"><option value="">Update status</option><option value="Reserved">Reserved</option><option value="Occupied">Occupied</option><option value="Released">Release space</option></select></div>`:'';
   return `<article class="room-card ${state.toLowerCase()}"><div class="room-card-top"><strong>SPACE ${String(s.spaceNumber).padStart(2,"0")}</strong><span class="room-state">${escapeHtml(state)}</span></div>${student}${action}</article>`;
  }).join("");
  grid.querySelectorAll(".room-status").forEach(sel=>sel.addEventListener("change",async()=>{
   if(!sel.value)return;
   const status=sel.value;
   if(status==="Released"&&!confirm("Release this accommodation space? It will become available for another approved student.")){sel.value="";return;}
   try{await api(`/api/admin/room-allocations/${sel.dataset.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});await loadRoomManager();await loadAdmin();}
   catch(e){alert(e.message);sel.value="";}
  }));
 }catch(e){grid.innerHTML=`<p class="form-message error">${escapeHtml(e.message)}</p>`;}
}
const roomForm=document.getElementById("roomAssignForm");
if(roomForm)roomForm.addEventListener("submit",async e=>{
 e.preventDefault();const msg=document.getElementById("roomMessage");
 try{
  const result=await api("/api/admin/rooms/assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(formData(roomForm))});
  if(msg){msg.textContent=result.message;msg.className="form-message success";}
  roomForm.reset();await loadRoomManager();await loadAdmin();
 }catch(err){if(msg){msg.textContent=err.message;msg.className="form-message error";}}
});
const refreshRooms=document.getElementById("refreshRooms");
if(refreshRooms)refreshRooms.addEventListener("click",loadRoomManager);

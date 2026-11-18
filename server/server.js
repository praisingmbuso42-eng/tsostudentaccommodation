
require("dotenv").config();
if(process.env.NODE_ENV==="production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim().length<32 || /replace|change|example/i.test(process.env.SESSION_SECRET))){
  throw new Error("Production startup blocked: set SESSION_SECRET to a random value of at least 32 characters.");
}
const express=require("express"), session=require("express-session"), helmet=require("helmet");
const path=require("path"), fs=require("fs"), crypto=require("crypto"), bcrypt=require("bcryptjs");
const {sendStudentEmail}=require("./email");
const Database=require("better-sqlite3"), multer=require("multer"), rateLimit=require("express-rate-limit");
const app=express(), PORT=process.env.PORT||3000;
if(process.env.NODE_ENV==="production") app.set("trust proxy",1);
const projectRoot=path.resolve(__dirname,"..");
const dataRoot=process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : projectRoot;

const databaseDir=path.join(dataRoot,"database");
const uploadDir=path.join(dataRoot,"server","uploads");
const siteImageDir=path.join(dataRoot,"public","uploads","site");

for(const directory of [databaseDir,uploadDir,siteImageDir]){
  fs.mkdirSync(directory,{recursive:true});
}

const db=new Database(path.join(databaseDir,"tso.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY,full_name TEXT NOT NULL,student_number TEXT UNIQUE NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY,student_id INTEGER UNIQUE NOT NULL REFERENCES students(id),course TEXT NOT NULL,faculty TEXT NOT NULL,study_year TEXT NOT NULL,notes TEXT,status TEXT NOT NULL DEFAULT 'Submitted',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),doc_type TEXT NOT NULL,file_name TEXT NOT NULL,original_name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pending verification',uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(student_id,doc_type));
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),rating INTEGER NOT NULL,comment TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pending moderation',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accommodation_spaces (
  id INTEGER PRIMARY KEY,
  space_number INTEGER NOT NULL UNIQUE CHECK(space_number BETWEEN 1 AND 50)
);
CREATE TABLE IF NOT EXISTS room_allocations (
  id INTEGER PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES accommodation_spaces(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT NOT NULL DEFAULT 'Reserved' CHECK(status IN ('Reserved','Occupied','Released')),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_allocation_per_space
  ON room_allocations(space_id) WHERE status IN ('Reserved','Occupied');
CREATE UNIQUE INDEX IF NOT EXISTS one_active_space_per_student
  ON room_allocations(student_id) WHERE status IN ('Reserved','Occupied');
`);
// Persistent, per-student notification history with a unique event key.
db.exec(`
CREATE TABLE IF NOT EXISTS student_notifications (
 id INTEGER PRIMARY KEY,
 student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 category TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
 related_type TEXT, related_id INTEGER,
 event_key TEXT NOT NULL UNIQUE,
 is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS student_notifications_history_idx
 ON student_notifications(student_id,created_at DESC);
`);
// Editable public website content managed from the administrator portal.
db.exec(`CREATE TABLE IF NOT EXISTS site_content (content_key TEXT PRIMARY KEY, content_value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
const defaultSiteContent={heroEyebrow:"WELCOME TO TSO STUDENT HOUSING",heroTitleLine1:"Your Home.",heroTitleLine2:"Your Comfort.",heroTitleLine3:"Your Future.",heroDescription:"A welcoming student accommodation experience exclusively for Vaal University of Technology students.",welcomeLabel:"WELCOME TO TSO",welcomeTitleLine1:"A place to belong.",welcomeTitleLine2:"A space to succeed.",welcomeDescription:"TSO Student Housing aims to provide VUT students with a welcoming, comfortable and supportive place to call home while pursuing their academic goals.",applicationYear:"2027",publicAnnouncement:"",address:"28 Aurora Avenue, Bedworth Park, Vereeniging, 1939, South Africa",phone:"071 673 9120",email:"keabetswedinala74@gmail.com"};
const seedSiteContent=db.prepare("INSERT OR IGNORE INTO site_content(content_key,content_value) VALUES(?,?)");
for(const [key,value] of Object.entries(defaultSiteContent))seedSiteContent.run(key,value);
function createStudentNotification(n) {
 const result=db.prepare(`INSERT OR IGNORE INTO student_notifications
 (student_id,category,title,message,related_type,related_id,event_key)
 VALUES(?,?,?,?,?,?,?)`).run(n.studentId,n.category,n.title,n.message,n.relatedType||null,n.relatedId||null,n.eventKey);

 // The in-portal notification is saved first. Email is deliberately fire-and-
 // forget so SMTP outages can never roll back or block the portal notification.
 if(result.changes){
  // Run after the current request/transaction has completed, and verify that
  // the notification committed before attempting external email delivery.
  setImmediate(()=>{
   try{
    const student=db.prepare(`SELECT s.email FROM students s
     JOIN student_notifications sn ON sn.student_id=s.id
     WHERE sn.event_key=?`).get(n.eventKey);
    if(student?.email) sendStudentEmail({to:student.email,title:n.title,message:n.message});
   }catch(error){console.error("Could not queue student email notification:",error.message);}
  });
 }
 return result.changes>0;
}

const seedSpaces=db.prepare("INSERT OR IGNORE INTO accommodation_spaces(space_number) VALUES(?)");
const seedSpaceTransaction=db.transaction(()=>{for(let n=1;n<=50;n++)seedSpaces.run(n);});
seedSpaceTransaction();
// SQLite-backed sessions survive server restarts; MemoryStore does not.
db.exec(`CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires);`);
class SQLiteSessionStore extends session.Store {
  get(sid, cb) {
    try {
      const row=db.prepare("SELECT sess,expires FROM sessions WHERE sid=?").get(sid);
      if(!row) return cb(null,null);
      if(row.expires<=Date.now()){db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);return cb(null,null);}
      cb(null,JSON.parse(row.sess));
    } catch(err){cb(err);}
  }
  set(sid,sess,cb=()=>{}) {
    try { const expires=sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now()+7*24*60*60*1000;
      db.prepare("INSERT INTO sessions(sid,sess,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expires=excluded.expires").run(sid,JSON.stringify(sess),expires);
      cb();
    } catch(err){cb(err);}
  }
  destroy(sid,cb=()=>{}) {try{db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);cb();}catch(err){cb(err);}}
  touch(sid,sess,cb=()=>{}) {this.set(sid,sess,cb);}
}
const safe=(v,max=200)=>String(v||"").trim().slice(0,max);
app.use(helmet({crossOriginResourcePolicy:{policy:"same-site"}}));
app.use(express.json({limit:"100kb"}));app.use(express.urlencoded({extended:true}));
app.use(session({
  name:"tso.sid",
  store:new SQLiteSessionStore(),
  secret:process.env.SESSION_SECRET||"development-only-change-this-secret",
  resave:false, saveUninitialized:false, rolling:true,
  cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000,path:"/"}
}));
app.use("/api/auth",rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false}));
app.use("/uploads/site",express.static(siteImageDir));
app.use(express.static(path.join(projectRoot,"public")));
const requireStudent=(req,res,next)=>req.session.user?.role==="student"?next():res.status(401).json({message:"Please sign in as a student."});
const requireAdmin=(req,res,next)=>req.session.user?.role==="admin"?next():res.status(401).json({message:"Administrator sign-in required."});
function adminBootstrap(){if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD)return;const email=process.env.ADMIN_EMAIL.toLowerCase();if(!db.prepare("SELECT id FROM admins WHERE email=?").get(email)){const hash=bcrypt.hashSync(process.env.ADMIN_PASSWORD,12);db.prepare("INSERT INTO admins(email,password_hash) VALUES(?,?)").run(email,hash);console.log("Initial administrator account created.");}}
adminBootstrap();
app.get("/api/health",(req,res)=>res.json({status:"success",message:"TSO Student Housing server is running"}));
const readSiteContent=()=>Object.fromEntries(db.prepare("SELECT content_key,content_value FROM site_content").all().map(row=>[row.content_key,row.content_value]));
app.get("/api/site-content",(req,res)=>res.set("Cache-Control","no-store").json({content:readSiteContent()}));
app.get("/api/admin/site-content",requireAdmin,(req,res)=>res.json({content:readSiteContent()}));
const siteTextLimits={heroEyebrow:100,heroTitleLine1:60,heroTitleLine2:60,heroTitleLine3:60,heroDescription:500,welcomeLabel:100,welcomeTitleLine1:100,welcomeTitleLine2:100,welcomeDescription:700,applicationYear:10,publicAnnouncement:300,address:250,phone:40,email:150};
app.put("/api/admin/site-content",requireAdmin,(req,res)=>{const input=req.body||{},updates=[];for(const [key,max] of Object.entries(siteTextLimits)){if(input[key]!==undefined){const value=String(input[key]??"").trim().slice(0,max);if(["heroEyebrow","heroTitleLine1","heroTitleLine2","heroTitleLine3","heroDescription","welcomeTitleLine1","welcomeTitleLine2","welcomeDescription","applicationYear","address","phone","email"].includes(key)&&!value)return res.status(400).json({message:`${key} cannot be empty.`});if(key==="email"&&value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return res.status(400).json({message:"Enter a valid contact email address."});updates.push([key,value]);}}if(!updates.length)return res.status(400).json({message:"No website content was provided."});const save=db.transaction(()=>{for(const [key,value] of updates)db.prepare(`INSERT INTO site_content(content_key,content_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(content_key) DO UPDATE SET content_value=excluded.content_value,updated_at=CURRENT_TIMESTAMP`).run(key,value);});save();res.json({message:"Public website content saved successfully.",content:readSiteContent()});});
const siteImageStorage=multer.diskStorage({destination:(req,file,cb)=>cb(null,siteImageDir),filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())});
const siteImageUpload=multer({storage:siteImageStorage,limits:{fileSize:5*1024*1024},fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();const valid=(file.mimetype==="image/jpeg"&&[".jpg",".jpeg"].includes(ext))||(file.mimetype==="image/png"&&ext===".png")||(file.mimetype==="image/webp"&&ext===".webp");if(!valid)return cb(new Error("Upload a JPG, PNG or WEBP image (maximum 5 MB)."));cb(null,true);}});
app.post("/api/admin/site-content/image/:slot",requireAdmin,(req,res)=>{const slot=req.params.slot;if(!["heroImage","galleryImage1","galleryImage2","galleryImage3"].includes(slot))return res.status(400).json({message:"Invalid website image slot."});siteImageUpload.single("image")(req,res,err=>{if(err)return res.status(400).json({message:err.message});if(!req.file)return res.status(400).json({message:"Choose an image to upload."});try{const fd=fs.openSync(req.file.path,"r"),sig=Buffer.alloc(12);fs.readSync(fd,sig,0,12,0);fs.closeSync(fd);const b=sig.toString("hex");const valid=(req.file.mimetype==="image/jpeg"&&b.startsWith("ffd8ff"))||(req.file.mimetype==="image/png"&&b.startsWith("89504e470d0a1a0a"))||(req.file.mimetype==="image/webp"&&sig.toString("ascii",0,4)==="RIFF"&&sig.toString("ascii",8,12)==="WEBP");if(!valid){fs.unlinkSync(req.file.path);return res.status(400).json({message:"The uploaded file is not a valid image."});}const value=`/uploads/site/${req.file.filename}`;db.prepare(`INSERT INTO site_content(content_key,content_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(content_key) DO UPDATE SET content_value=excluded.content_value,updated_at=CURRENT_TIMESTAMP`).run(slot,value);res.json({message:"Website image uploaded successfully.",slot,url:value});}catch(error){if(fs.existsSync(req.file.path))fs.unlinkSync(req.file.path);res.status(500).json({message:"Could not save the website image."});}});});
app.post("/api/auth/register",async(req,res)=>{try{const fullName=safe(req.body.fullName,100),studentNumber=safe(req.body.studentNumber,30),email=safe(req.body.email,150).toLowerCase(),phone=safe(req.body.phone,25),password=String(req.body.password||"");if(!fullName||!studentNumber||!email.includes("@")||!phone||password.length<10)return res.status(400).json({message:"Complete every field. Passwords must contain at least 10 characters."});const hash=await bcrypt.hash(password,12);const result=db.prepare("INSERT INTO students(full_name,student_number,email,phone,password_hash) VALUES(?,?,?,?,?)").run(fullName,studentNumber,email,phone,hash);req.session.regenerate(err=>{if(err)return res.status(500).json({message:"Could not start your session. Please sign in."});req.session.user={id:result.lastInsertRowid,role:"student"};req.session.save(err=>err?res.status(500).json({message:"Account created, but sign-in failed. Please log in."}):res.json({message:"Account created"}));});}catch(e){res.status(409).json({message:"An account with that email or VUT student number already exists."});}});
app.post("/api/auth/login",async(req,res)=>{const email=safe(req.body.email,150).toLowerCase(),row=db.prepare("SELECT * FROM students WHERE email=?").get(email);if(!row||!(await bcrypt.compare(String(req.body.password||""),row.password_hash)))return res.status(401).json({message:"Invalid email or password."});req.session.regenerate(err=>{if(err)return res.status(500).json({message:"Could not start your session. Please try again."});req.session.user={id:row.id,role:"student"};req.session.save(err=>err?res.status(500).json({message:"Could not save your session. Please try again."}):res.json({message:"Signed in"}));});});
// Protect administrator sign-in against password guessing. Successful logins are
// not counted; only failed attempts consume the per-IP allowance.
const adminLoginLimiter=rateLimit({
 windowMs:15*60*1000,
 limit:5,
 skipSuccessfulRequests:true,
 standardHeaders:true,
 legacyHeaders:false,
 message:{message:"Too many administrator login attempts. Please try again in 15 minutes."}
});
app.post("/api/admin/login",adminLoginLimiter,async(req,res)=>{const email=safe(req.body.email,150).toLowerCase(),row=db.prepare("SELECT * FROM admins WHERE email=?").get(email);if(!row||!(await bcrypt.compare(String(req.body.password||""),row.password_hash)))return res.status(401).json({message:"Invalid administrator credentials."});req.session.regenerate(err=>{if(err)return res.status(500).json({message:"Could not start your session. Please try again."});req.session.user={id:row.id,role:"admin"};req.session.save(err=>err?res.status(500).json({message:"Could not save your session. Please try again."}):res.json({message:"Signed in"}));});});
app.post("/api/auth/logout",(req,res)=>req.session.destroy(err=>{res.clearCookie("tso.sid",{path:"/",sameSite:"lax",secure:process.env.NODE_ENV==="production"});if(err)return res.status(500).json({message:"Could not sign out."});res.json({message:"Signed out"});}));
app.get("/api/student/me",requireStudent,(req,res)=>{
 const student=db.prepare("SELECT id,full_name AS fullName,student_number AS studentNumber,email,phone FROM students WHERE id=?").get(req.session.user.id);
 const application=db.prepare("SELECT status,course,faculty,study_year AS studyYear,notes,created_at AS createdAt,updated_at AS updatedAt FROM applications WHERE student_id=?").get(req.session.user.id)||null;
 const documents=db.prepare("SELECT doc_type AS type,status,uploaded_at AS uploadedAt FROM documents WHERE student_id=? ORDER BY doc_type").all(req.session.user.id);
 const allocation=db.prepare(`SELECT sp.space_number AS spaceNumber,ra.status,ra.assigned_at AS assignedAt FROM room_allocations ra JOIN accommodation_spaces sp ON sp.id=ra.space_id WHERE ra.student_id=? AND ra.status IN ('Reserved','Occupied') LIMIT 1`).get(req.session.user.id)||null;
 res.json({student,application,documents,allocation});
});
app.get("/api/student/notifications",requireStudent,(req,res)=>{const studentId=req.session.user.id;const notifications=db.prepare(`SELECT id,category,title,message,is_read AS isRead,created_at AS createdAt FROM student_notifications WHERE student_id=? ORDER BY created_at DESC,id DESC LIMIT 100`).all(studentId);const unreadCount=db.prepare("SELECT COUNT(*) AS count FROM student_notifications WHERE student_id=? AND is_read=0").get(studentId).count;res.json({notifications,unreadCount});});
app.patch("/api/student/notifications/:id/read",requireStudent,(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({message:"Invalid notification."});const result=db.prepare("UPDATE student_notifications SET is_read=1 WHERE id=? AND student_id=?").run(id,req.session.user.id);if(!result.changes)return res.status(404).json({message:"Notification not found."});res.json({message:"Notification marked as read."});});
app.post("/api/student/notifications/read-all",requireStudent,(req,res)=>{db.prepare("UPDATE student_notifications SET is_read=1 WHERE student_id=? AND is_read=0").run(req.session.user.id);res.json({message:"All notifications marked as read."});});
app.post("/api/applications",requireStudent,(req,res)=>{const course=safe(req.body.course,120),faculty=safe(req.body.faculty,120),studyYear=safe(req.body.studyYear,30),notes=safe(req.body.notes,1000);if(!course||!faculty||!studyYear)return res.status(400).json({message:"Please complete course, faculty and year of study."});const studentId=req.session.user.id;const approved=db.prepare("SELECT COUNT(*) n FROM applications WHERE status='Approved'").get().n;if(approved>=50)return res.status(409).json({message:"All 50 accommodation spaces have been allocated."});const submit=db.transaction(()=>{const existing=db.prepare("SELECT id,status FROM applications WHERE student_id=?").get(studentId);db.prepare(`INSERT INTO applications(student_id,course,faculty,study_year,notes) VALUES(?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET course=excluded.course,faculty=excluded.faculty,study_year=excluded.study_year,notes=excluded.notes,status='Submitted',updated_at=CURRENT_TIMESTAMP`).run(studentId,course,faculty,studyYear,notes);const current=db.prepare("SELECT id,updated_at AS updatedAt FROM applications WHERE student_id=?").get(studentId);if(!existing||existing.status!=="Submitted")createStudentNotification({studentId,category:"application",title:"Application submitted",message:"Your accommodation application has been submitted successfully.",relatedType:"application",relatedId:current.id,eventKey:`application:${current.id}:submitted:${crypto.randomUUID()}`});});submit();res.json({message:"Application submitted"});});

const fields=["id","registration","funding","residence","transcript"];
const labels={id:"South African ID",registration:"Proof of VUT registration",funding:"Proof of funding",residence:"Proof of residence",transcript:"Academic transcript"};
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,uploadDir),filename:(req,file,cb)=>cb(null,crypto.randomUUID()+".pdf")});
const pdfUpload=multer({storage,limits:{fileSize:5*1024*1024,files:5},fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();if(file.mimetype!=="application/pdf"||ext!==".pdf")return cb(new Error("Only PDF files are accepted."));cb(null,true);}}).fields(fields.map(name=>({name,maxCount:1})));
app.post("/api/documents",requireStudent,(req,res)=>pdfUpload(req,res,err=>{
 const uploaded=Object.values(req.files||{}).flat();
 const removeNewFiles=()=>{for(const file of uploaded){try{if(fs.existsSync(file.path))fs.unlinkSync(file.path);}catch(_){}}};
 if(err){removeNewFiles();return res.status(400).json({message:err.message});}
 const filesByType=Object.fromEntries(fields.map(key=>[key,req.files?.[key]?.[0]||null]));
 if(fields.some(key=>!filesByType[key])){removeNewFiles();return res.status(400).json({message:"Please select all five required PDF documents."});}
 for(const key of fields){
  const file=filesByType[key];let fd;
  try{fd=fs.openSync(file.path,"r");const sig=Buffer.alloc(4);fs.readSync(fd,sig,0,4,0);if(sig.toString()!=="%PDF"){fs.closeSync(fd);removeNewFiles();return res.status(400).json({message:"One of your files is not a valid PDF."});}fs.closeSync(fd);}
  catch(_){if(fd!==undefined){try{fs.closeSync(fd);}catch(__){}}removeNewFiles();return res.status(400).json({message:"One of your PDF files could not be read."});}
 }
 try{
  const studentId=req.session.user.id;
  const previous=db.prepare("SELECT doc_type,file_name FROM documents WHERE student_id=?").all(studentId);
  const save=db.transaction(()=>{
   for(const key of fields){const file=filesByType[key];
    db.prepare(`INSERT INTO documents(student_id,doc_type,file_name,original_name) VALUES(?,?,?,?) ON CONFLICT(student_id,doc_type) DO UPDATE SET file_name=excluded.file_name,original_name=excluded.original_name,status='Pending verification',uploaded_at=CURRENT_TIMESTAMP`).run(studentId,key,file.filename,safe(file.originalname,180));
   }
  });
  save();
  const replacements=new Set(fields.map(key=>filesByType[key].filename));
  for(const old of previous){if(!replacements.has(old.file_name)){const oldPath=path.join(uploadDir,old.file_name);try{if(fs.existsSync(oldPath))fs.unlinkSync(oldPath);}catch(error){console.error("Could not remove replaced document:",error.message);}}}
  res.json({message:"All five documents uploaded successfully."});
 }catch(error){removeNewFiles();console.error("Document upload could not be saved:",error.message);res.status(500).json({message:"Your documents could not be saved. Please try again."});}
}));
app.get("/api/documents/mine",requireStudent,(req,res)=>{const documents=db.prepare("SELECT doc_type AS type,original_name AS name,status FROM documents WHERE student_id=?").all(req.session.user.id).map(d=>({...d,label:labels[d.type]}));res.json({documents});});
app.get("/api/admin/documents",requireAdmin,(req,res)=>{const docs=db.prepare(`SELECT d.id,d.doc_type AS type,d.original_name AS name,d.status,s.full_name AS studentName,s.student_number AS studentNumber FROM documents d JOIN students s ON s.id=d.student_id ORDER BY d.uploaded_at DESC`).all().map(d=>({...d,label:labels[d.type]}));res.json({documents:docs});});
app.get("/api/admin/documents/:id/file",requireAdmin,(req,res)=>{const d=db.prepare("SELECT * FROM documents WHERE id=?").get(Number(req.params.id));if(!d)return res.status(404).json({message:"Document not found"});const file=path.join(uploadDir,d.file_name);if(!fs.existsSync(file))return res.status(404).json({message:"File unavailable"});res.type("application/pdf").set("Content-Disposition",`inline; filename="${d.original_name.replace(/["\\]/g,"")}"`).sendFile(file);});
app.patch("/api/admin/documents/:id",requireAdmin,(req,res)=>{const status=safe(req.body.status,40),id=Number(req.params.id);if(!["Verified","Rejected - replace copy","Pending verification"].includes(status))return res.status(400).json({message:"Invalid document status."});const update=db.transaction(()=>{const doc=db.prepare("SELECT id,student_id AS studentId,doc_type AS type,status FROM documents WHERE id=?").get(id);if(!doc)return {missing:true};if(doc.status===status)return {changed:false};db.prepare("UPDATE documents SET status=? WHERE id=?").run(status,id);const label=labels[doc.type]||doc.type;const wording=status==="Verified"?"has been accepted":status==="Rejected - replace copy"?"was rejected and needs a replacement":"is pending verification";createStudentNotification({studentId:doc.studentId,category:"document",title:status==="Verified"?"Document accepted":status==="Rejected - replace copy"?"Document rejected":"Document status updated",message:`Your ${label} ${wording}.`,relatedType:"document",relatedId:id,eventKey:`document:${id}:${crypto.randomUUID()}`});return {changed:true};});const result=update();if(result.missing)return res.status(404).json({message:"Document not found."});res.json({message:"Document status updated"});});

app.post("/api/reviews",requireStudent,(req,res)=>{const rating=Number(req.body.rating),comment=safe(req.body.comment,1000);if(!Number.isInteger(rating)||rating<1||rating>5||comment.length<3)return res.status(400).json({message:"Provide a rating from 1 to 5 and a comment."});db.prepare("INSERT INTO reviews(student_id,rating,comment) VALUES(?,?,?)").run(req.session.user.id,rating,comment);res.json({message:"Review submitted for moderation"});});
app.get("/api/reviews",(req,res)=>{const reviews=db.prepare("SELECT r.rating,r.comment,s.full_name AS studentName FROM reviews r JOIN students s ON s.id=r.student_id WHERE r.status='Published' ORDER BY r.created_at DESC LIMIT 50").all();res.json({reviews});});

app.get("/api/admin/reviews",requireAdmin,(req,res)=>{const reviews=db.prepare(`SELECT r.id,r.rating,r.comment,r.status,r.created_at AS createdAt,s.full_name AS studentName FROM reviews r JOIN students s ON s.id=r.student_id ORDER BY r.created_at DESC`).all();res.json({reviews});});
app.patch("/api/admin/reviews/:id",requireAdmin,(req,res)=>{const status=safe(req.body.status,30);if(!["Published","Hidden"].includes(status))return res.status(400).json({message:"Choose Published or Hidden."});db.prepare("UPDATE reviews SET status=? WHERE id=?").run(status,Number(req.params.id));res.json({message:"Review moderation updated"});});

// Administrator reporting and analytics. Date filters use the record's creation/upload/assignment date.
app.get("/api/admin/reports",requireAdmin,(req,res)=>{
 const validDate=value=>{if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(value+"T00:00:00Z");return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;};
 const from=safe(req.query.from,10),to=safe(req.query.to,10);
 if((from&&!validDate(from))||(to&&!validDate(to)))return res.status(400).json({message:"Use valid dates in YYYY-MM-DD format."});
 if(from&&to&&from>to)return res.status(400).json({message:"The start date cannot be after the end date."});
 const where=(column)=>{const clauses=[],params=[];if(from){clauses.push(`${column} >= ?`);params.push(from+" 00:00:00");}if(to){const end=new Date(to+"T00:00:00Z");end.setUTCDate(end.getUTCDate()+1);clauses.push(`${column} < ?`);params.push(end.toISOString().slice(0,10)+" 00:00:00");}return {sql:clauses.length?" WHERE "+clauses.join(" AND "):"",params};};
 const count=(sql,params=[])=>db.prepare(sql).get(...params).n;
 const appFilter=where("created_at"),studentFilter=where("created_at"),docFilter=where("uploaded_at");
 const applicationTotal=count("SELECT COUNT(*) n FROM applications"+appFilter.sql,appFilter.params);
 const applicationStatuses=db.prepare("SELECT status,COUNT(*) AS count FROM applications"+appFilter.sql+" GROUP BY status ORDER BY status").all(...appFilter.params);
 const documentTotal=count("SELECT COUNT(*) n FROM documents"+docFilter.sql,docFilter.params);
 const documentStatuses=db.prepare("SELECT status,COUNT(*) AS count FROM documents"+docFilter.sql+" GROUP BY status ORDER BY status").all(...docFilter.params);
 const registeredStudents=count("SELECT COUNT(*) n FROM students"+studentFilter.sql,studentFilter.params);
 const activeApplicants=count("SELECT COUNT(*) n FROM applications"+appFilter.sql+(appFilter.sql?" AND ":" WHERE ")+"status NOT IN ('Rejected')",appFilter.params);
 const approvedApplicants=count("SELECT COUNT(*) n FROM applications"+appFilter.sql+(appFilter.sql?" AND ":" WHERE ")+"status='Approved'",appFilter.params);
 const spacesTotal=count("SELECT COUNT(*) n FROM accommodation_spaces");
 const allocationCounts=db.prepare("SELECT status,COUNT(*) AS count FROM room_allocations WHERE status IN ('Reserved','Occupied') GROUP BY status").all();
 const allocationSummary={Reserved:0,Occupied:0};allocationCounts.forEach(row=>allocationSummary[row.status]=row.count);
 const activeAllocated=count("SELECT COUNT(*) n FROM room_allocations WHERE status IN ('Reserved','Occupied')");
 const availableSpaces=Math.max(0,spacesTotal-activeAllocated);
 const byCourse=db.prepare("SELECT course,COUNT(*) AS count FROM applications"+appFilter.sql+" GROUP BY course ORDER BY count DESC,course LIMIT 10").all(...appFilter.params);
 const byFaculty=db.prepare("SELECT faculty,COUNT(*) AS count FROM applications"+appFilter.sql+" GROUP BY faculty ORDER BY count DESC,faculty LIMIT 10").all(...appFilter.params);
 const monthly=db.prepare("SELECT substr(created_at,1,7) AS month,COUNT(*) AS count FROM applications"+appFilter.sql+" GROUP BY substr(created_at,1,7) ORDER BY month").all(...appFilter.params);
 res.set("Cache-Control","no-store").json({filters:{from:from||null,to:to||null},generatedAt:new Date().toISOString(),applications:{total:applicationTotal,active:activeApplicants,approved:approvedApplicants,statuses:applicationStatuses,byCourse,byFaculty,monthly},students:{registered:registeredStudents},documents:{total:documentTotal,statuses:documentStatuses},rooms:{total:spacesTotal,occupied:allocationSummary.Occupied,reserved:allocationSummary.Reserved,allocated:activeAllocated,available:availableSpaces,occupancyRate:spacesTotal?Math.round(activeAllocated/spacesTotal*100):0}});
});

app.get("/api/admin/summary",requireAdmin,(req,res)=>{
 const total=db.prepare("SELECT COUNT(*) n FROM applications").get().n;
 const approved=db.prepare("SELECT COUNT(*) n FROM applications WHERE status='Approved'").get().n;
 const occupied=db.prepare("SELECT COUNT(*) n FROM room_allocations WHERE status='Occupied'").get().n;
 const reserved=db.prepare("SELECT COUNT(*) n FROM room_allocations WHERE status='Reserved'").get().n;
 res.json({total,approved,occupied,reserved,assigned:occupied+reserved,available:50-occupied-reserved});
});
app.get("/api/admin/rooms",requireAdmin,(req,res)=>{
 const spaces=db.prepare(`SELECT sp.id,sp.space_number AS spaceNumber,ra.id AS allocationId,ra.status,
 ra.assigned_at AS assignedAt,s.id AS studentId,s.full_name AS fullName,
 s.student_number AS studentNumber,s.email,s.phone
 FROM accommodation_spaces sp
 LEFT JOIN room_allocations ra ON ra.space_id=sp.id AND ra.status IN ('Reserved','Occupied')
 LEFT JOIN students s ON s.id=ra.student_id ORDER BY sp.space_number`).all();
 const counts=db.prepare("SELECT status,COUNT(*) AS count FROM room_allocations WHERE status IN ('Reserved','Occupied') GROUP BY status").all();
 const summary={Reserved:0,Occupied:0};counts.forEach(x=>summary[x.status]=x.count);
 res.json({spaces,summary:{...summary,available:50-summary.Reserved-summary.Occupied,total:50}});
});
app.get("/api/admin/rooms/eligible-students",requireAdmin,(req,res)=>{
 const students=db.prepare(`SELECT s.id,s.full_name AS fullName,s.student_number AS studentNumber,s.email
 FROM students s JOIN applications a ON a.student_id=s.id
 LEFT JOIN room_allocations ra ON ra.student_id=s.id AND ra.status IN ('Reserved','Occupied')
 WHERE a.status='Approved' AND ra.id IS NULL ORDER BY s.full_name`).all();
 res.json({students});
});
app.post("/api/admin/rooms/assign",requireAdmin,(req,res)=>{
 const spaceNumber=Number(req.body.spaceNumber),studentId=Number(req.body.studentId),status=safe(req.body.status||'Reserved',20);
 if(!Number.isInteger(spaceNumber)||spaceNumber<1||spaceNumber>50||!Number.isInteger(studentId)||studentId<1||!['Reserved','Occupied'].includes(status))
  return res.status(400).json({message:'Choose a valid space, approved student and allocation status.'});
 try{
  const assign=db.transaction(()=>{
   const space=db.prepare("SELECT id FROM accommodation_spaces WHERE space_number=?").get(spaceNumber);
   const approved=db.prepare("SELECT s.id FROM students s JOIN applications a ON a.student_id=s.id WHERE s.id=? AND a.status='Approved'").get(studentId);
   if(!space)return {error:'Accommodation space not found.'};
   if(!approved)return {error:'Only students with an approved application can be allocated a space.'};
   if(db.prepare("SELECT id FROM room_allocations WHERE space_id=? AND status IN ('Reserved','Occupied')").get(space.id))return {error:'This space is already allocated.'};
   if(db.prepare("SELECT id FROM room_allocations WHERE student_id=? AND status IN ('Reserved','Occupied')").get(studentId))return {error:'This student already has an active space.'};
   const allocation=db.prepare("INSERT INTO room_allocations(space_id,student_id,status) VALUES(?,?,?)").run(space.id,studentId,status);
   createStudentNotification({studentId,category:"room",title:"Accommodation space allocated",message:`You have been allocated accommodation space ${String(spaceNumber).padStart(2,"0")}.`,relatedType:"room_allocation",relatedId:Number(allocation.lastInsertRowid),eventKey:`room-allocation:${allocation.lastInsertRowid}:created`});
   return {ok:true};
  });
  const result=assign();if(result.error)return res.status(409).json({message:result.error});
  res.json({message:'Space '+String(spaceNumber).padStart(2,'0')+' allocated successfully.'});
 }catch(e){res.status(409).json({message:'Could not allocate this space. Check whether the student or space is already assigned.'});}
});
app.patch("/api/admin/room-allocations/:id",requireAdmin,(req,res)=>{
 const id=Number(req.params.id),status=safe(req.body.status,20);
 if(!Number.isInteger(id)||id<1||!['Reserved','Occupied','Released'].includes(status))
  return res.status(400).json({message:'Choose Reserved, Occupied or Released.'});
 const result=db.prepare("UPDATE room_allocations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('Reserved','Occupied')").run(status,id);
 if(!result.changes)return res.status(404).json({message:'Active allocation not found.'});
 res.json({message:status==='Released'?'Space released and available again.':'Allocation updated to '+status+'.'});
});
app.get("/api/admin/applications",requireAdmin,(req,res)=>{const applications=db.prepare(`SELECT a.id,a.student_id AS studentId,a.course,a.faculty,a.study_year AS studyYear,a.status,a.created_at AS createdAt,s.full_name AS fullName,s.student_number AS studentNumber,s.email FROM applications a JOIN students s ON s.id=a.student_id ORDER BY a.created_at DESC`).all();res.json({applications});});
app.patch("/api/admin/applications/:id",requireAdmin,(req,res)=>{const status=safe(req.body.status,40),id=Number(req.params.id);if(!["Under review","Pending documents","Approved","Rejected"].includes(status))return res.status(400).json({message:"Invalid application status."});const update=db.transaction(()=>{const current=db.prepare("SELECT id,status,student_id AS studentId FROM applications WHERE id=?").get(id);if(!current)return {missing:true};if(current.status===status)return {changed:false};if(status==="Approved"){const verified=db.prepare("SELECT COUNT(*) n FROM documents WHERE student_id=? AND status='Verified'").get(current.studentId).n;if(verified!==5)return {error:"This applicant must have all five required documents verified before approval."};const count=db.prepare("SELECT COUNT(*) n FROM applications WHERE status='Approved'").get().n;if(count>=50)return {error:"Capacity reached: 50 students are already approved."};}db.prepare("UPDATE applications SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,id);const copy={"Under review":"Your accommodation application is now under review.","Pending documents":"Your application is awaiting document updates. Please check your documents page.","Approved":"Your accommodation application has been approved.","Rejected":"Your accommodation application has been rejected. Please contact TSO management if you need assistance."};createStudentNotification({studentId:current.studentId,category:"application",title:`Application ${status.toLowerCase()}`,message:copy[status],relatedType:"application",relatedId:id,eventKey:`application:${id}:${crypto.randomUUID()}`});return {changed:true};});const result=update();if(result.missing)return res.status(404).json({message:"Application not found."});if(result.error)return res.status(409).json({message:result.error});res.json({message:"Application updated"});});

app.post("/api/admin/announcements",requireAdmin,(req,res)=>{
 const title=safe(req.body.title,120),message=safe(req.body.message,2000);
 if(!title||message.length<3)return res.status(400).json({message:"Enter an announcement title and a message of at least 3 characters."});
 const students=db.prepare("SELECT id FROM students ORDER BY id").all();
 const announcementId=crypto.randomUUID();
 const publish=db.transaction(()=>{
  for(const student of students){
   createStudentNotification({
    studentId:student.id,category:"announcement",title,
    message,relatedType:"announcement",relatedId:null,
    eventKey:`announcement:${announcementId}:${student.id}`
   });
  }
 });
 publish();
 res.json({message:`Announcement delivered to ${students.length} student portal${students.length===1?"":"s"}. Email delivery will be attempted where SMTP is configured.`,recipients:students.length});
});
app.get("/api/admin/students",requireAdmin,(req,res)=>{const students=db.prepare("SELECT full_name AS fullName,student_number AS studentNumber,email,phone,created_at AS createdAt FROM students ORDER BY created_at DESC").all();res.json({students});});
app.use((err,req,res,next)=>{console.error(err.message);res.status(500).json({message:"A server error occurred."});});
// Remove expired persisted sessions periodically without relying on an in-memory store.
setInterval(()=>{try{db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());}catch(err){console.error("Session cleanup failed:",err.message);}},60*60*1000).unref();
const server=app.listen(PORT,()=>console.log(`TSO Student Housing running at http://localhost:${PORT}`));
let isShuttingDown=false;
function shutdown(signal){
 if(isShuttingDown)return;
 isShuttingDown=true;
 console.log(`${signal} received; closing TSO Student Housing safely.`);
 server.close(()=>{
  try{db.pragma("wal_checkpoint(TRUNCATE)");db.close();process.exit(0);}
  catch(error){console.error("Database shutdown error:",error.message);process.exit(1);}
 });
 setTimeout(()=>{console.error("Shutdown timed out; forcing process exit.");process.exit(1);},10000).unref();
}
process.on("SIGINT",()=>shutdown("SIGINT"));
process.on("SIGTERM",()=>shutdown("SIGTERM"));

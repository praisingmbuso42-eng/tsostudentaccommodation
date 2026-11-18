TSO STUDENT PORTAL UPDATE

This update improves the student portal navigation and adds an application tracking panel.

FILES INCLUDED
- server/server.js
- public/js/main.js
- public/css/style.css
- public/student/dashboard.html
- public/student/application.html
- public/student/documents.html
- public/student/reviews.html

INSTALL
1. Stop the running server in PowerShell with Ctrl+C.
2. Make a backup copy of your current TSO-Student-Housing folder.
3. Extract this ZIP into the existing TSO-Student-Housing project folder and allow the listed files to be replaced.
4. Do NOT replace or delete your .env file, database folder, server/uploads folder, or node_modules.
5. Start the project from its existing folder:
   npm run dev
6. Open the site using one consistent address: http://localhost:3000
   Do not switch between localhost and 127.0.0.1, and do not open the HTML files directly from File Explorer.

WHAT CHANGED
- Student pages now share portal navigation and a Log out control.
- The application page displays the current application status, review steps, document statuses, and any allocated accommodation space.
- Student status information is retrieved from the existing application, document, and room-allocation records.
- Existing SQLite-backed seven-day session handling is retained.

SAFETY
This is a source-code patch only. It does not include your .env, SQLite database, or uploaded PDFs. Keep those files private and back them up before updating.

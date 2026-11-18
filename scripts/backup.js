const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, 'backups', `TSO-${timestamp}`);
const sourceDb = path.join(root, 'database', 'tso.sqlite');

async function main() {
  if (!fs.existsSync(sourceDb)) throw new Error('The TSO database was not found.');
  fs.mkdirSync(backupDir, { recursive: true });

  const db = new Database(sourceDb, { readonly: true, fileMustExist: true });
  try {
    await db.backup(path.join(backupDir, 'tso.sqlite'));
  } finally {
    db.close();
  }

  for (const relative of ['server/uploads', 'public/uploads/site']) {
    const source = path.join(root, relative);
    if (fs.existsSync(source)) {
      const destination = path.join(backupDir, relative.replaceAll('/', path.sep));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(source, destination, { recursive: true });
    }
  }

  fs.writeFileSync(path.join(backupDir, 'BACKUP-INFO.txt'),
    'TSO Student Housing backup. Contains personal student information and private documents. Store securely; do not publish or email publicly.\n');
  console.log(`Backup created: ${path.relative(root, backupDir)}`);
}

main().catch(error => {
  console.error(`Backup failed: ${error.message}`);
  process.exitCode = 1;
});

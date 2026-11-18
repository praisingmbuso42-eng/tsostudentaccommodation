
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.resolve(__dirname, '..');
const dataRoot = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : projectRoot;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dataRoot, 'backups', `TSO-${timestamp}`);

const sourceDb = path.join(dataRoot, 'database', 'tso.sqlite');

const uploadDir = path.join(dataRoot, 'server', 'uploads');
const siteImageDir = path.join(dataRoot, 'public', 'uploads', 'site');

async function main() {
  if (!fs.existsSync(sourceDb)) {
    throw new Error('The TSO database was not found.');
  }

  fs.mkdirSync(backupDir, { recursive: true });

  const db = new Database(sourceDb, {
    readonly: true,
    fileMustExist: true
  });

  try {
    await db.backup(path.join(backupDir, 'tso.sqlite'));
  } finally {
    db.close();
  }

  for (const [source, relative] of [
    [uploadDir, path.join('server', 'uploads')],
    [siteImageDir, path.join('public', 'uploads', 'site')]
  ]) {
    if (fs.existsSync(source)) {
      const destination = path.join(backupDir, relative);

      fs.mkdirSync(path.dirname(destination), {
        recursive: true
      });

      fs.cpSync(source, destination, {
        recursive: true
      });
    }
  }

  fs.writeFileSync(
    path.join(backupDir, 'BACKUP-INFO.txt'),
    'TSO Student Housing backup. Contains personal student information and private documents. Store securely; do not publish or email publicly.\n'
  );

  console.log(`Backup created: ${path.relative(dataRoot, backupDir)}`);
}

main().catch(error => {
  console.error(`Backup failed: ${error.message}`);
  process.exitCode = 1;
});

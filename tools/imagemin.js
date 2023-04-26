import imagemin from 'imagemin';
import imageminWebp from 'imagemin-webp';
import fs from 'fs';
import path from 'path';

async function deleteFilesInDirectory(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(function (file) {
    const filePath = path.join(dir, file);
    const extname = path.extname(filePath);
    if (extname === '.png' || extname === '.jpg' || extname === '.jpeg') {
      fs.unlinkSync(filePath);
      console.log(`remove ${filePath}`);
    }
  });
}

async function updateMarkdownFile(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(function (file) {
    const filePath = path.join(dir, file);
    const extname = path.extname(filePath);
    if (extname === '.md') {
      const data = fs.readFileSync(filePath, 'utf-8');
      const newData = data.replace(
        /(!\[[^\]]*]\((.*?)\.(png|jpg|jpeg)\))/g,
        (match, p1, p2, p3) => {
          if (match) {
            console.log(`update ${filePath}`);
          }
          return p1.replace(`${p2}.${p3}`, `${p2}.webp`);
        }
      );
      fs.writeFileSync(filePath, newData);
    }
  });
}

async function convertImages(dir) {
  const subDirs = fs
    .readdirSync(dir)
    .filter((file) => fs.statSync(path.join(dir, file)).isDirectory());

  await imagemin([`${dir}/*.{png,jpg,jpeg}`], {
    destination: dir,
    plugins: [imageminWebp({ quality: 100 })]
  });
  await deleteFilesInDirectory(dir);

  for (const subDir of subDirs) {
    if (subDir === 'favicons') {
      continue;
    }

    const subDirPath = path.join(dir, subDir);
    await convertImages(subDirPath);
  }
}

(async () => {
  await convertImages('assets/img');
  await updateMarkdownFile('_posts');
})();

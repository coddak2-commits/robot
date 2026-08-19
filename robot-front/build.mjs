// esbuild single-bundle build for robot-front (CRA -> esbuild)
// 200+ 모듈을 dist/app.js 하나로 번들링. 가독성 위해 미압축(minify=false).
import esbuild from 'esbuild';
import { sassPlugin, postcssModules } from 'esbuild-sass-plugin';
import fs from 'fs';
import path from 'path';

const OUT = 'dist';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const assetLoaders = {};
for (const e of ['.png','.jpg','.jpeg','.gif','.svg','.ico','.webp',
                 '.dae','.mp4','.webm','.urdf','.glb','.gltf',
                 '.woff','.woff2','.ttf','.eot','.mp3','.wav']) {
  assetLoaders[e] = 'file';
}

const result = await esbuild.build({
  entryPoints: { app: 'src/index.tsx' },
  bundle: true,
  outdir: OUT,
  format: 'iife',
  platform: 'browser',
  target: 'es2019',
  jsx: 'automatic',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  loader: assetLoaders,
  assetNames: 'assets/[name]-[hash]',
  define: {
    'process.env.NODE_ENV': '"production"',
    'global': 'window',
  },
  plugins: [
    // .module.scss / .module.css -> CSS Modules (local scope)
    sassPlugin({ filter: /\.module\.(scss|css)$/, transform: postcssModules({}) }),
    // 일반 .scss/.sass/.css -> 전역 CSS
    sassPlugin({ filter: /\.(scss|sass|css)$/ }),
  ],
  metafile: true,
  logLevel: 'info',
});

// public/ 정적파일 복사 (index.html 제외)
const pub = 'public';
if (fs.existsSync(pub)) {
  for (const f of fs.readdirSync(pub)) {
    if (f === 'index.html') continue;
    const s = path.join(pub, f), d = path.join(OUT, f);
    fs.cpSync(s, d, { recursive: true });
  }
}

// dist/index.html 생성 (번들 로드)
const outFiles = fs.readdirSync(OUT);
const js = outFiles.find(f => f.endsWith('.js'));
const css = outFiles.find(f => f.endsWith('.css'));
const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VoT</title>
  ${css ? `<link rel="stylesheet" href="./${css}" />` : ''}
</head>
<body>
  <div id="root"></div>
  <script src="./${js}"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// 결과 요약
const outputs = result.metafile.outputs;
let total = 0;
for (const [f, info] of Object.entries(outputs)) {
  console.log(`  ${f}  ${(info.bytes/1024).toFixed(1)} KB`);
  total += info.bytes;
}
console.log(`BUNDLE-OK  총 ${(total/1024/1024).toFixed(2)} MB, 파일 ${Object.keys(outputs).length}개`);

import { createResolver } from '../packages/npm/dist/index.js';
const roles = ['background','subtle','muted','fill','onFill','fillHover','fillActive','border','text','strong'];
const encode = s => Buffer.from(s).toString('base64');
for (const contrastTarget of [1, 4.5, 7, 21]) {
  for (const [namespace,seed] of [['',0],['scope🐈',4294967295]]) {
    const resolver = createResolver({namespace,seed,contrastTarget});
    for (const text of ['', 'é','e\u0301','👩‍💻',...Array.from({length:32},(_,i)=>String(i))]) {
      const color = resolver.resolve(text);
      console.log([encode(text),encode(namespace),seed,contrastTarget,color.hue,
        ...['light','dark'].flatMap(theme=>roles.map(role=>color[theme][role].hex))].join('\t'));
    }
  }
}

import { createResolver } from '../packages/npm/dist/index.js';
const roles = ['background','subtle','muted','fill','onFill','fillHover','fillActive','border','text','strong'];
const encode = s => Buffer.from(s).toString('base64');
function emit(text, namespace, seed, contrastTarget, normalize = {unicode:'none', case:'none', whitespace:'none'}) {
  const color = createResolver({namespace,seed,contrastTarget,normalize}).resolve(text);
  console.log([encode(text),encode(namespace),seed,contrastTarget,normalize.unicode,normalize.case,normalize.whitespace,color.hue,
    ...['light','dark'].flatMap(theme=>roles.map(role=>color[theme][role].hex))].join('\t'));
}
for (const contrastTarget of [1, 4.5, 7, 21]) {
  for (const [namespace,seed] of [['',0],['scope🐈',4294967295]]) {
    for (const text of ['', 'é','e\u0301','👩‍💻',...Array.from({length:32},(_,i)=>String(i))]) {
      emit(text,namespace,seed,contrastTarget);
    }
  }
}

for (const unicode of ['none','NFC','NFKC']) {
  for (const casing of ['none','lower']) {
    for (const whitespace of ['none','trim','collapse']) {
      for (const text of ['  E\u0301\tΣ  ', 'ＦＯＯ\u00a0\u0085İ', '\ufeffA\u001c', 'ΣΟΣ', '𐐀']) {
        emit(text, '\u0085ＮE\u0301  ', 101, 7, {unicode,case:casing,whitespace});
      }
    }
  }
}

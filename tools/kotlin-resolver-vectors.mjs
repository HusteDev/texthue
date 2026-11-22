import { createResolver } from '../packages/npm/dist/index.js';
const roles = ['background','subtle','muted','fill','onFill','fillHover','fillActive','border','text','strong'];
const encode = s => Buffer.from(s).toString('base64');
function emit(text, namespace, seed, contrastTarget, normalize = {unicode:'none', case:'none', whitespace:'none'}, preset = 'labels', contrastModel = 'wcag2', contrastTargets = {}) {
  const color = createResolver({namespace,seed,preset,normalize,contrastModel,contrastTargets,...(contrastTarget === undefined ? {} : {contrastTarget})}).resolve(text);
  console.log([encode(text),encode(namespace),seed,contrastTarget,normalize.unicode,normalize.case,normalize.whitespace,preset,contrastModel,['fill','fillHover','fillActive','border','text','textOnSubtle','strong'].map(role=>contrastTargets[role]).join(','),color.hue,
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

for (const preset of ['labels','controls','chart','subdued','mono']) {
  for (const target of [undefined, 3, 9]) {
    for (const text of ['amber','violet','blue','green']) emit(text, '', 0, target, undefined, preset);
  }
}

for (const target of [undefined, 0, 45, 60, 75, 90, 106]) {
  for (const preset of ['labels','controls','mono']) {
    for (const text of ['amber','violet','blue','green']) emit(text, '', 0, target, undefined, preset, 'apca');
  }
}

for (const [model, targets] of [
  ['wcag2',{fill:7,fillHover:6,fillActive:5,border:4,text:3,textOnSubtle:7,strong:9}],
  ['apca',{fill:90,fillHover:45,fillActive:75,border:60,text:45,textOnSubtle:90,strong:106}],
  ['apca',{text:0,textOnSubtle:90}], ['apca',{text:90,textOnSubtle:0}], ['apca',{text:0,textOnSubtle:0}],
]) {
  for (let i=0;i<12;i++) emit(String(i),'',0,undefined,undefined,'labels',model,targets);
}

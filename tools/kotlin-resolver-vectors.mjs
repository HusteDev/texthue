import { createResolver } from '../packages/npm/dist/index.js';

const roles = ['background','subtle','muted','fill','onFill','fillHover','fillActive','border','text','strong'];
const encode = s => Buffer.from(s).toString('base64');
function emit(text, namespace, seed, contrastTarget, normalize = {unicode:'none', case:'none', whitespace:'none'}, preset = 'labels', contrastModel = 'wcag2', contrastTargets = {}, foregrounds = ['#000000','#ffffff'], foregroundPolicy = 'best', hueRange = [0,360], excludeHues = [], backgrounds = {}, profiles = {}, overrides = {}, palette) {
  const color = createResolver({namespace,seed,preset,normalize,contrastModel,contrastTargets,foregrounds,foregroundPolicy,hueRange,excludeHues,backgrounds,profiles,overrides,...(palette ? {palette} : {}),...(contrastTarget === undefined ? {} : {contrastTarget})}).resolve(text);
  console.log([encode(text),encode(namespace),seed,contrastTarget,normalize.unicode,normalize.case,normalize.whitespace,preset,contrastModel,['fill','fillHover','fillActive','border','text','textOnSubtle','strong'].map(role=>contrastTargets[role]).join(','),foregrounds.join(','),foregroundPolicy,hueRange.join(','),excludeHues.map(arc=>arc.join(',')).join('|'),backgrounds.light ?? '#ffffff',backgrounds.dark ?? '#121212',...['light','dark'].flatMap(theme => ['fill','text'].map(role => {
      const p = profiles[theme]?.[role];
      return [p?.lightness?.join(','),p?.chromaScale?.join(','),p?.chromaCap].join('|');
    })),Object.entries(overrides).map(([key,pair]) => [encode(key),pair.light,pair.dark].join(',')).join('|'),(palette ?? []).map(entry=>[encode(entry.id),entry.light,entry.dark].join(',')).join('|'),color.source,color.hueFraction,color.hue,
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

for (const model of ['wcag2','apca']) {
  for (const policy of ['best','first-passing']) {
    for (const candidates of [['#556677','#000000','#ffffff'],['#ffffff','#000000','#556677'],['#777777']]) {
      for (const target of (model === 'wcag2' ? [1,7,21] : [0,60,106])) {
        emit('foreground','',0,target,undefined,'labels',model,{},candidates,policy);
      }
    }
  }
}

for (const [allowed,excluded] of [
  [[300,60],[[350,10]]], [[10,220],[[30,80],[70,120],[190,240]]],
  [[0,360],[[120,110]]], [[35.125,35.25],[]], [[0,360],[[50,50]]],
]) {
  for (let i=0;i<20;i++) emit(String(i),'',0,7,undefined,'labels','wcag2',{},undefined,'best',allowed,excluded);
}

for (const backgrounds of [{light:'#abcdef'}, {dark:'#eeeeee'}, {light:'#777777',dark:'#3467AF'}, {light:'#000000',dark:'#ffffff'}]) {
  for (const model of ['apca','wcag2']) {
    for (let i=0;i<12;i++) emit(String(i),'',0,undefined,undefined,'labels',model,{},undefined,'best',undefined,undefined,backgrounds);
  }
}

for (const profiles of [
  {light:{fill:{lightness:[0.2,0.3],chromaScale:[0,1],chromaCap:0.02}},dark:{text:{chromaScale:[1,1]}}},
  {light:{text:{lightness:[0,0],chromaCap:0}},dark:{fill:{lightness:[1,1],chromaCap:0.4}}},
  {light:{fill:{chromaScale:[0.1,0.2]},text:{chromaScale:[0.9,1]}},dark:{text:{lightness:[0.2,0.7]}}},
]) for (const model of ['wcag2','apca']) {
  for (let i=0;i<12;i++) emit(String(i),'',0,undefined,undefined,'chart',model,{},undefined,'best',undefined,undefined,{},profiles);
}

for (const pair of [{light:'#ff4444',dark:'#55ccff'},{light:'#888888',dark:'#000000'},{light:'#ffffff',dark:'#12c431'}]) {
  for (const model of ['wcag2','apca']) {
    for (const name of ['Brand',' BRAND ','unmatched']) {
      emit(name,'scope',31,undefined,{unicode:'NFC',case:'lower',whitespace:'trim'},'chart',model,{},['#777777'],'best',undefined,undefined,{}, {},{brand:pair});
    }
  }
}

const entries = [{id:'é',light:'#555555',dark:'#777777'}, {id:'red',dark:'#ff1111'}, {id:'blue',light:'#000088'}];
for (const palette of [entries,[...entries].reverse()]) {
  for (const model of ['wcag2','apca']) {
    for (const target of (model === 'wcag2' ? [1,7,21] : [0,60,106])) {
      for (const text of ['fixed', ...Array.from({length:12},(_,i)=>String(i))])
        emit(text,'scope',7,target,undefined,'labels',model,{},['#ffffff'],'best',undefined,undefined,{}, {},
          {fixed:{light:'#123456',dark:'#abcdef'}},palette);
    }
  }
}

/* =============================================================
 * うさうさプロンプター 🐰  商用テスト（単一ファイル）
 * -------------------------------------------------------------
 * 使い方:
 *   npm i -g jsdom            （未導入なら）
 *   NODE_PATH=$(npm root -g) node usausa-prompter.test.mjs [対象HTML]
 *
 * 対象HTMLを省略すると、同じフォルダの usausa-prompter*.html を
 * 自動で探します（PRO版を優先）。
 *
 * 種類: 単体 / 結合(直列化往復) / 防御的(サニタイズ) /
 *       集計 / DOM・刻印 / モンキー(異常入力)
 * ============================================================= */
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* ---------- 対象HTMLの解決 ---------- */
function findHtml(){
  const arg=process.argv[2];
  if(arg&&fs.existsSync(arg))return arg;
  if(process.env.USAUSA_HTML&&fs.existsSync(process.env.USAUSA_HTML))return process.env.USAUSA_HTML;
  const dir=path.dirname(fileURLToPath(import.meta.url));
  const cands=fs.readdirSync(dir).filter(f=>/^usausa-prompter.*\.html$/i.test(f));
  cands.sort((a,b)=>{
    const pa=/PRO/i.test(a)?0:1, pb=/PRO/i.test(b)?0:1;
    if(pa!==pb)return pa-pb;          // PRO版を優先
    return b.localeCompare(a);        // 新しい名前を先に
  });
  if(cands.length)return path.join(dir,cands[0]);
  throw new Error("対象HTMLが見つかりません。引数で指定してください: node usausa-prompter.test.mjs <html>");
}
const HTML_PATH=findHtml();
const html=fs.readFileSync(HTML_PATH,"utf-8");
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"about:srcdoc"});
const w=dom.window, doc=w.document, U=w.__usausa;
if(!U){console.error("✗ window.__usausa が見つかりません。テスト用APIが公開されているHTMLを指定してください。");process.exit(2);}

/* ---------- ミニ・テストランナー ---------- */
let pass=0, fail=0, curSection="";
const fails=[];
function section(name){curSection=name;console.log("\n── "+name+" ──");}
function ok(name,cond,extra){
  if(cond){pass++;}
  else{fail++;fails.push(curSection+" / "+name+(extra!==undefined?("  ["+extra+"]"):""));console.log("  ✗ "+name+(extra!==undefined?("  ["+extra+"]"):""));}
}
function eq(name,got,want){ok(name,JSON.stringify(got)===JSON.stringify(want),"got="+JSON.stringify(got)+" want="+JSON.stringify(want));}
function noThrow(name,fn){try{fn();ok(name,true);}catch(e){ok(name,false,String(e&&e.message||e));}}

console.log("対象HTML: "+HTML_PATH);
console.log("バージョン: v"+U.APP_VERSION+" ("+U.BUILD_DATE+")");

/* =============================================================
 * 1) 単体テスト（純粋関数）
 * ============================================================= */
section("単体: 文字数・範囲・整形");
eq("countChars 全角",U.countChars("あいう"),3);
eq("countChars 改行は除外",U.countChars("あ\nい"),2);
eq("countChars 空",U.countChars(""),0);
eq("clampRatio 下限",U.clampRatio(-1),0);
eq("clampRatio 上限",U.clampRatio(9),1);
eq("clampRatio 中央",U.clampRatio(0.5),0.5);
ok("esc は山括弧を変換",U.esc("<b>")==="&lt;b&gt;",U.esc("<b>"));
ok("esc はアンパサンド変換",/&amp;/.test(U.esc("a&b")));
ok("clip 短文はそのまま",U.clip("abc",100)==="abc");
ok("clip 長文は省略付き",/省略/.test(U.clip("x".repeat(50),10)));
ok("parseAIResponse textを連結",U.parseAIResponse({content:[{type:"text",text:"あ"},{type:"text",text:"い"}]})==="あ\nい");
ok("parseAIResponse 不正は空",U.parseAIResponse(null)==="");

section("単体: コントラスト（WCAG）");
eq("hexLum 黒は0",U.hexLum("#000000"),0);
ok("hexLum 白は約1",Math.round(U.hexLum("#ffffff"))===1);
ok("hexLum 不正はnull",U.hexLum("red")===null);
ok("contrastRatio 黒白=21",Math.round(U.contrastRatio("#000000","#ffffff"))===21,U.contrastRatio("#000000","#ffffff"));
ok("contrastRatio 同色=1",Math.round(U.contrastRatio("#777777","#777777"))===1);
ok("contrastRatio 不正はnull",U.contrastRatio("x","#fff")===null);
ok("contrastLabel 良好→ok",U.contrastLabel(U.contrastRatio("#111111","#ffffff")).cls==="ok");
ok("contrastLabel 白×薄黄→bad",U.contrastLabel(U.contrastRatio("#fef6f9","#fff7cc")).cls==="bad",U.contrastRatio("#fef6f9","#fff7cc"));
ok("contrastLabel ぎりぎり→warn",U.contrastLabel(3.5).cls==="warn");
ok("contrastLabel null→ok",U.contrastLabel(null).cls==="ok");

section("単体: 応援メッセージ");
ok("CHEERS は配列(5件以上)",Array.isArray(U.CHEERS)&&U.CHEERS.length>=5,U.CHEERS&&U.CHEERS.length);
ok("CHEERS 全て非空文字列",U.CHEERS.every(s=>typeof s==="string"&&s.trim().length>=6));
{let inSet=true;for(let i=0;i<60;i++){if(!U.CHEERS.includes(U.cheerMessage())){inSet=false;break;}}ok("cheerMessage は配列内を返す",inSet);}

section("単体: CSV解析（全角スペース区切りに整形）");
eq("parseCSV 区切り変換",U.parseCSV("a,b,c\n1,2,3"),"a　b　c\n1　2　3");
eq("parseCSV 引用符内カンマ保持",U.parseCSV('a,"x,y",b'),"a　x,y　b");
eq("parseCSV 空行除去",U.parseCSV("あ\n\n\nい"),"あ\nい");
noThrow("parseCSV 空入力でも落ちない",()=>U.parseCSV(""));

section("単体: 行・ページ解析");
{
  const lines=U.parseLines("# 見出し\n本文1\n\n## 小見出し\n本文2");
  ok("parseLines 配列を返す",Array.isArray(lines)&&lines.length>=4,lines&&lines.length);
  ok("parseLines 種別を持つ",lines.every(l=>typeof l.type==="string"));
  const pages=U.splitPages(U.parseLines("# A\n本文\n---\n# B\n本文"));
  ok("splitPages 区切りで2ページ以上",Array.isArray(pages)&&pages.length>=2,pages&&pages.length);
  eq("lineToPage 先頭→p0",U.lineToPage(pages,0),0);
}
noThrow("splitPages 空でも落ちない",()=>U.splitPages(U.parseLines("")));
noThrow("statsAt 呼び出し",()=>U.statsAt("あ\nい\nう",0));
noThrow("nextHeadingLi 呼び出し",()=>U.nextHeadingLi(U.parseLines("# A\nあ\n# B"),0,1));

/* =============================================================
 * 2) 防御的テスト（サニタイズ）
 * ============================================================= */
section("防御: メモ・履歴のサニタイズ");
ok("noteSanitize 不正→null",U.noteSanitize(null)===null);
ok("noteSanitize 最小で復元",!!U.noteSanitize({kind:"todo",title:"t",body:"b"}));
ok("versionSanitize 不正→null",U.versionSanitize(null)===null);

section("防御: 実績ログ runLogSanitize");
ok("実績 不正→null",U.runLogSanitize(null)===null);
ok("実績 1秒未満→null",U.runLogSanitize({actualSec:0})===null);
ok("実績 id自動付与",typeof U.runLogSanitize({actualSec:5}).id==="string");
eq("実績 ratioクランプ",U.runLogSanitize({actualSec:5,endRatio:9}).endRatio,1);
eq("実績 負値は0",U.runLogSanitize({actualSec:10,plannedSec:-5}).plannedSec,0);

section("防御: 台本スロット slotsSanitize");
{
  const d=U.slotsSanitize(undefined);
  ok("スロット 既定2本",d.length===2&&d[0].name==="台本1"&&d[1].name==="台本2");
  ok("スロット 既定は空text",d[0].text===""&&d[1].text==="");
  eq("スロット 1本入力でも2本",U.slotsSanitize([{name:"a",text:"x"}]).length,2);
  eq("スロット 3本目は無視",U.slotsSanitize([{name:"a",text:"1"},{name:"b",text:"2"},{name:"c",text:"3"}]).length,2);
  ok("スロット 名前は40字に切詰",U.slotsSanitize([{name:"あ".repeat(60),text:""},{name:"",text:""}])[0].name.length===40);
  ok("スロット 不正要素→既定名",U.slotsSanitize(["x",null])[0].name==="台本1");
  const keep=U.slotsSanitize([{name:"朝",text:"おはよう"},{name:"夜",text:"こんばんは"}]);
  ok("スロット 内容保持",keep[0].text==="おはよう"&&keep[1].name==="夜");
}

/* =============================================================
 * 3) 集計テスト
 * ============================================================= */
section("集計: runSummary");
{
  const s=U.runSummary([{plannedSec:100,actualSec:120},{plannedSec:200,actualSec:180}]);
  eq("平均予定",s.avgPlanned,150);
  eq("平均実績",s.avgActual,150);
  eq("差0",s.diff,0);
  ok("空→null",U.runSummary([])===null);
  eq("差+30",U.runSummary([{plannedSec:60,actualSec:90}]).diff,30);
}

/* =============================================================
 * 4) 結合テスト（直列化の往復）
 * ============================================================= */
section("結合: serialize / deserialize 往復");
const fullState={
  text:"# テスト\n本文",cpm:300,size:48,dir:"v",mirror:false,
  posRatio:0.25,bookmarkRatio:0.5,highlights:{1:{c:"rose",u:true}},
  fgKey:"custom",bgKey:"custom",fgCustom:"#aabbcc",bgCustom:"#112233",
  timerMin:25,clickSound:"bell",keepAwake:true,countSec:5,showHelp:false,countBeep:false,
  notes:[{id:"n1",kind:"todo",title:"t",ts:1,body:"b"}],
  versions:[],
  runLogs:[{id:"r1",ts:1,plannedSec:120,actualSec:138,startRatio:0,endRatio:0.95,chars:257,reason:"完了"}],
  slots:[{name:"台本A",text:"本文A"},{name:"台本B",text:"本文B"}]
};
{
  const s=U.serialize(fullState);
  eq("スキーマ版数 v12",s.v,12);
  const d=U.deserialize(s);
  eq("本文",d.text,fullState.text);
  eq("速度",d.cpm,300);
  eq("向き",d.dir,"v");
  eq("カスタム文字色",[d.fgKey,d.fgCustom],["custom","#aabbcc"]);
  eq("カスタム背景色",[d.bgKey,d.bgCustom],["custom","#112233"]);
  eq("カウントダウン秒",d.countSec,5);
  eq("表紙表示OFF",d.showHelp,false);
  eq("カウント音OFF",d.countBeep,false);
  eq("台本スロット",[d.slots[0].text,d.slots[1].name],["本文A","台本B"]);
  eq("実績ログ保持",d.runLogs.length,1);
  ok("ブックマーク保持",d.bookmarkRatio===0.5);
}
section("結合: 既定値・上限・耐性");
ok("既定 表紙ON",U.deserialize({text:"x"}).showHelp===true);
ok("既定 カウント音ON",U.deserialize({text:"x"}).countBeep===true);
ok("不正な配色key→null",U.deserialize({text:"x",fgKey:"zzz"}).fgKey===null);
ok("不正なhex→null",U.deserialize({text:"x",fgKey:"custom",fgCustom:"red"}).fgCustom===null);
{
  const many=[];for(let i=0;i<60;i++)many.push({id:"r"+i,ts:i+1,plannedSec:60,actualSec:62,startRatio:0,endRatio:1,chars:100,reason:"完了"});
  eq("実績ログは50件上限",U.deserialize(U.serialize({...fullState,runLogs:many})).runLogs.length,50);
}
eq("不正runLogs→空配列",U.deserialize({text:"x",runLogs:"x"}).runLogs.length,0);
eq("不正slots→既定2本",U.deserialize({text:"x",slots:"x"}).slots.length,2);

/* =============================================================
 * 5) DOM・刻印テスト
 * ============================================================= */
section("DOM: 主要UIの存在");
[
  "stage","script","progress","btnPlay","btnOpen","btnMemo","btnAI","btnHL","btnMirror",
  "btnTimer","clock","overlay","mEdit","mMemo","mAI","mHist","mLog"
].forEach(id=>ok("#"+id,!!doc.getElementById(id)));

section("DOM: 追加機能のUI");
[
  "btnLog","btnLogNow","tRemain",        // 実績
  "contrastInfo","btnShowHelp",          // コントラスト/表紙
  "slotRow","btnRevDirS","btnRevMgrS","btnRevDirM","btnRevMgrM","btnCountBeep", // 台本2本/レビュー/カウント音
  "btnBell","btnBug"                     // 鈴・てんとう虫
].forEach(id=>ok("#"+id,!!doc.getElementById(id)));

section("DOM: 表紙（番組オープニング風）");
ok("ON AIRバッジ",!!doc.querySelector(".cover .on-air"));
ok("ニュース名",!!doc.querySelector(".cover .news-name"));
ok("本日のあなたへ",/本日のあなたへ/.test((doc.querySelector(".ticker-label")||{}).textContent||""));
ok("応援テロップ本文",((doc.getElementById("cheerText")||{}).textContent||"").trim().length>=6);
{
  const photo=doc.querySelector(".cover .bunny-photo");
  ok("うさぎ写真の存在",!!photo);
  ok("写真はdataURI埋め込み",!!photo&&/^data:image\/jpe?g;base64,/.test(photo.getAttribute("src")));
}
ok("鈴ボタン初期は🔔",(doc.getElementById("btnBell").textContent||"").includes("🔔"));
ok("バグボタンは🐞",(doc.getElementById("btnBug").textContent||"").includes("🐞"));

section("刻印: バージョン・テスト済み・配色");
ok("APP_VERSION 1.6",U.APP_VERSION==="1.6",U.APP_VERSION);
ok("タイトルにv1.6",/v1\.6/.test(doc.title),doc.title);
ok("HTMLコメントにテスト済み",/うさうさプロンプター v1\.6\s+テスト済み/.test(html));
ok("クレジットにテスト済み",/v1\.6 テスト済み/.test((doc.querySelector(".credit")||{}).textContent||""));
{
  const css=[...doc.querySelectorAll("style")].map(s=>s.textContent).join("\n");
  ok("配色 夜空 #1a1e44",/--ink:#1a1e44/.test(css));
  ok("配色 水色 #7fd8ff",/--mint:#7fd8ff/.test(css));
  ok("配色 金 #ffd86b",/--warn:#ffd86b/.test(css));
  ok("配色 ピンク #ff90bb",/--rose:#ff90bb/.test(css));
  ok("星レイヤー body::before",/body::before/.test(css));
}

/* =============================================================
 * 6) モンキーテスト（異常入力で落ちない）
 * ============================================================= */
section("モンキー: 異常入力でクラッシュしない");
noThrow("deserialize(空オブジェクト)",()=>U.deserialize({}));
noThrow("deserialize(null)",()=>U.deserialize(null));
noThrow("serialize(最小)",()=>U.serialize({text:""}));
noThrow("slotsSanitize(数値)",()=>U.slotsSanitize(123));
noThrow("runLogSanitize(文字列)",()=>U.runLogSanitize("x"));
noThrow("contrastRatio(両方不正)",()=>U.contrastRatio("x","y"));
noThrow("parseLines(巨大入力)",()=>U.parseLines("あ\n".repeat(5000)));
noThrow("clip(null)でも落ちない",()=>U.clip(null));
noThrow("cheerMessage 連続呼び出し",()=>{for(let i=0;i<100;i++)U.cheerMessage();});

/* =============================================================
 * 結果
 * ============================================================= */
console.log("\n================================================");
console.log(`  合計: ${pass} passed / ${fail} failed  （計 ${pass+fail} 項目）`);
console.log("================================================");
if(fail){
  console.log("\n失敗した項目:");
  fails.forEach(f=>console.log("  - "+f));
}
process.exit(fail?1:0);

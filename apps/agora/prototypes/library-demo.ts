import m from 'mithril';
import { AgoraStage, type AgoraStagePlanItem, type AgoraScene } from '@freedi/shared-types';
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/700.css';
import '../src/styles/global.scss';
import '../src/styles/components.scss';
import '../src/styles/theme-civic.scss';
import { initI18n, setLang } from '../src/lib/i18n';
import { VillageShell } from '../src/components/VillageShell';
import { SceneStage } from '../src/views/SceneStage';
initI18n();
setLang('he');
const scenes = [
		{
			sceneId: 'scene-intro',
			kind: 'intro',
			title: 'המשימה',
			text: 'צרפת, 1789. הממלכה על סף תהום. אתם — נוסעי הזמן — המשימה שלכם: למצוא פתרון שכל הצדדים יוכלו לחיות איתו.',
			imageUrls: ['/scenes/time-machine-briefing.webp'],
			dialogue: [],
		},
		{
			sceneId: 'scene-tunnel',
			kind: 'timeTunnel',
			title: 'מנהרת הזמן',
			text: 'המנהרה נפתחת. אורות חולפים על פניכם — מאתיים שנה אחורה. כשהערפל מתפזר, אתם עומדים ברחובות פריז.',
			videoUrl: '/scenes/time-tunnel.mp4',
			imageUrls: ['/scenes/time-tunnel.webp'],
			dialogue: [],
		},
		{
			sceneId: 'scene-period',
			kind: 'periodExplainer',
			title: 'פריז, 1789',
			text: 'המדינה שקועה בחובות אחרי מלחמות יקרות. הקציר נכשל ומחיר הלחם הכפיל את עצמו. האצולה והכנסייה פטורות ממס, והעם נושא בנטל. המלך לואי ה-16 כינס את אספת המעמדות — בפעם הראשונה מזה 175 שנה.',
			imageUrls: ['/scenes/french-revolution-intro.webp'],
			dialogue: [],
		},
		{
			sceneId: 'scene-royalist',
			kind: 'perspectiveA',
			title: 'בארמון',
			text: 'הרוזן דה-לה-רוש מקבל אתכם בטרקלין מוזהב.',
			imageUrls: ['/scenes/perspective-royalist.webp'],
			dialogue: [
				{ speaker: 'הרוזן דה-לה-רוש', line: 'ברוכים הבאים. שמעתי שבאתם מרחוק לעזור לצרפת.' },
				{ speaker: 'הרוזן דה-לה-רוש', line: 'המלוכה היא סדר. בלי מלך, צרפת תתפרק לכאוס ולשפיכות דמים. ראיתם מה קורה כשההמון משתלט על הרחוב?' },
				{ speaker: 'הרוזן דה-לה-רוש', line: 'המסורת והכנסייה מחזיקות את החברה יחד כבר אלף שנה. שינויים חייבים לבוא בהדרגה, מלמעלה.' },
			],
		},
		{
			sceneId: 'scene-jacobin',
			kind: 'perspectiveB',
			title: 'בבית הקפה',
			text: 'קמיל דופון יושב בבית קפה הומה, מוקף בעיתונים ובכרוזים.',
			imageUrls: ['/scenes/perspective-jacobin.webp'],
			dialogue: [
				{ speaker: 'קמיל דופון', line: 'שבו, שבו. תראו מה כתוב כאן — מחיר הלחם עלה שוב, והמלכה מזמינה תכשיטים.' },
				{ speaker: 'קמיל דופון', line: 'העם גווע ברעב בזמן שהארמון עורך נשפים. כל אדם נולד חופשי ושווה — אין זכויות יתר מלידה.' },
				{ speaker: 'קמיל דופון', line: 'רק שלטון של העם, למען העם, יביא צדק לצרפת. השאלה היא רק איך — ובאיזה מחיר.' },
			],
		},
		{
			sceneId: 'scene-needs-q',
			kind: 'needsQuestion',
			title: 'השאלה שמשנה הכל',
			text: 'שמעתם את העמדות של שני הצדדים. עכשיו אתם פונים אליהם ושואלים את השאלה שמאחורי הוויכוח: "מה אתם בעצם צריכים?"',
			imageUrls: ['/scenes/needs-question.webp'],
			dialogue: [],
		},
		{
			sceneId: 'scene-needs-a',
			kind: 'needsA',
			title: 'הרוזן נפתח',
			text: 'הרוזן דה-לה-רוש שותק רגע ארוך. ואז, בקול שקט יותר, הוא עונה.',
			imageUrls: ['/scenes/needs-royalist.webp'],
			dialogue: [
				{ speaker: 'הרוזן דה-לה-רוש', line: 'אני צריך לדעת שמשפחתי לא תיפגע ושאחוזתי לא תישרף בידי המון זועם.' },
				{ speaker: 'הרוזן דה-לה-רוש', line: 'אני צריך שהעולם שגדלתי בו לא ייעלם בן לילה — שיישאר משהו מהמסורת שלנו.' },
				{ speaker: 'הרוזן דה-לה-רוש', line: 'ואני צריך כבוד — שלא יראו בי אויב רק בגלל המעמד שנולדתי אליו.' },
			],
		},
		{
			sceneId: 'scene-needs-b',
			kind: 'needsB',
			title: 'קמיל נפתח',
			text: 'קמיל דופון מניח את העיתון. לרגע הוא לא נואם — הוא פשוט מדבר.',
			imageUrls: ['/scenes/needs-jacobin.webp'],
			dialogue: [
				{ speaker: 'קמיל דופון', line: 'אני צריך שלילדים שלנו יהיה לחם על השולחן — ביטחון קיומי בסיסי.' },
				{ speaker: 'קמיל דופון', line: 'אני צריך שישמעו אותנו — שלעם יהיה קול אמיתי בהחלטות שמעצבות את חייו.' },
				{ speaker: 'קמיל דופון', line: 'ואני צריך צדק — שהחוק יחול על כולם באותה מידה, גם על החזקים.' },
			],
		},] as AgoraScene[];
const plan: AgoraStagePlanItem[] = [
 {itemId:'demo-background',stage:AgoraStage.framing,title:'סיפור הרקע'},
 {itemId:'demo-voices',stage:AgoraStage.perspectives,title:'הדמויות והעמדות'},
 {itemId:'demo-needs',stage:AgoraStage.needs,title:'הצרכים של הצדדים'},
];
const kinds = [['intro','timeTunnel','periodExplainer'],['perspectiveA','perspectiveB'],['needsQuestion','needsA','needsB']];
let currentIndex=0, viewingIndex=0, completed=0;
const channel = new BroadcastChannel('agora-library-local-demo');
channel.onmessage = ({data}) => { if (Number.isInteger(data.index) && data.index>=0 && data.index<plan.length) {currentIndex=data.index;viewingIndex=data.index;completed=0;m.redraw();} };
function selectStage(index:number) { currentIndex=index;viewingIndex=index;completed=0;channel.postMessage({index}); }
m.mount(document.getElementById('demo')!, {view:()=>m('main', [
 m('header', {style:'padding:16px 24px;background:#293f36;color:#fff5dc;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap'},[
  m('div',[m('strong','המהפכה הצרפתית — הספרייה'),m('div','הדגמה מקומית · מתגי המנחה מדמים את התקדמות המפגש')]),
  m('div',plan.map((item,index)=>m('button.btn.btn--secondary',{style:'margin:4px', 'aria-pressed':currentIndex===index,onclick:()=>selectStage(index)},item.title))),
  m('small', {role:'status'},`נקראו ${completed} מסכים בספר הנוכחי`),
 ]),
 m(VillageShell,{plan,currentIndex,viewingIndex,papers:[],onSelectBook:(id:string)=>{viewingIndex=plan.findIndex(p=>p.itemId===id);}},
  m(SceneStage,{allowReplay:true,key:plan[viewingIndex].itemId,scenes:scenes.filter(s=>kinds[viewingIndex].includes(s.kind)),storageKey:'library-local-'+plan[viewingIndex].itemId,onProgress:(done:number)=>{completed=done;}})),
])});

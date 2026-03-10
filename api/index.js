import { Lunar } from 'lunar-javascript';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const DATA_DIR = '/tmp';
const PRICES = { normal: 9.9, deep: 19.9 };
const FREE_DAILY_LIMIT = 1;

const getToday = () => new Date().toISOString().slice(0, 10);

const loadData = (filename, defaultValue = []) => {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return defaultValue;
  }
};

const saveData = (filename, data) => {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
};

let users = loadData('users.json');
let orders = loadData('orders.json');

const getOrCreateUser = (deviceId) => {
  let user = users.find(u => u.deviceId === deviceId);
  if (!user) {
    user = {
      id: uuidv4(),
      deviceId,
      createdAt: new Date().toISOString(),
      balance: 0,
      totalSpent: 0,
      dailyFreeUsed: {},
      orders: []
    };
    users.push(user);
    saveData('users.json', users);
  }
  return user;
};

const useDailyFree = (user, analyzeType) => {
  const today = getToday();
  const key = `${analyzeType}_${today}`;
  if (!user.dailyFreeUsed) user.dailyFreeUsed = {};
  if (!user.dailyFreeUsed[key]) user.dailyFreeUsed[key] = 0;
  if (user.dailyFreeUsed[key] < FREE_DAILY_LIMIT) {
    user.dailyFreeUsed[key]++;
    saveData('users.json', users);
    return { used: true, remaining: FREE_DAILY_LIMIT - user.dailyFreeUsed[key] };
  }
  return { used: false, remaining: 0 };
};

const hasEnoughBalance = (user, analyzeType) => user.balance >= PRICES[analyzeType];

const deductBalance = (user, analyzeType) => {
  user.balance -= PRICES[analyzeType];
  user.totalSpent += PRICES[analyzeType];
  saveData('users.json', users);
};

const createOrder = (userId, analyzeType) => {
  const order = {
    id: uuidv4(),
    userId,
    type: analyzeType,
    price: PRICES[analyzeType],
    status: 'pending',
    createdAt: new Date().toISOString(),
    paidAt: null
  };
  orders.push(order);
  saveData('orders.json', orders);
  return order;
};

const confirmOrder = (orderId) => {
  const order = orders.find(o => o.id === orderId);
  if (order && order.status === 'pending') {
    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    const user = users.find(u => u.id === order.userId);
    if (user) {
      user.balance += order.price;
      user.orders.push(order.id);
      saveData('users.json', users);
    }
    saveData('orders.json', orders);
    return true;
  }
  return false;
};

function analyzeBazi(year, month, day, hour, gender) {
  try {
    const lunar = Lunar.fromYmdHms(parseInt(year), parseInt(month), parseInt(day), parseInt(hour), 0, 0);
    const bazi = lunar.getBaZi();
    const solar = lunar.getSolar();
    const eightChar = lunar.getEightChar();
    const yearNaYin = lunar.getYearNaYin();
    const monthNaYin = lunar.getMonthNaYin();
    const dayNaYin = lunar.getDayNaYin();
    const timeNaYin = lunar.getTimeNaYin();
    const dayGanIndex = eightChar.getDayGanIndex();
    const ganArr = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
    const shiShenArr = ['比肩','劫财','食神','伤官','偏财','正财','七杀','正官','偏印','正印'];
    const getGanIndex = (gan) => ganArr.indexOf(gan[0]);
    const shiShen = {
      year: shiShenArr[(getGanIndex(bazi[0]) + 10 - dayGanIndex) % 10],
      month: shiShenArr[(getGanIndex(bazi[1]) + 10 - dayGanIndex) % 10],
      day: '日主',
      hour: shiShenArr[(getGanIndex(bazi[3]) + 10 - dayGanIndex) % 10]
    };
    const juCe = analyzeJuSe(shiShen);
    const genderText = gender === 'male' ? '乾造' : '坤造';
    const daYun = [];
    const startYear = parseInt(year) + 9;
    const ganIndex = dayGanIndex;
    const zhiIndex = (parseInt(year) - 4) % 12;
    const zhiArr = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    for (let i = 0; i < 10; i++) {
      daYun.push({ age: i * 10 + 1, ganZhi: ganArr[(ganIndex + i + 1) % 10] + zhiArr[(zhiIndex + i + 1) % 12], year: startYear + i * 10 });
    }
    return { gender: genderText, bazi: bazi, baziStr: bazi[0] + '年 ' + bazi[1] + '月 ' + bazi[2] + '日 ' + bazi[3] + '时', naYin: [yearNaYin, monthNaYin, dayNaYin, timeNaYin], shiShen: shiShen, dayGan: bazi[2][0], dayZhi: bazi[2].slice(-1), daYun: daYun, juCe: juCe, lunar: lunar.toString(), solar: { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() } };
  } catch (e) {
    return { error: e.message };
  }
}

function analyzeJuSe(shiShen) {
  const s = shiShen || {};
  const hasGuan = (s.year||'').includes('官') || (s.month||'').includes('官') || (s.hour||'').includes('官');
  const hasYin = (s.year||'').includes('印') || (s.month||'').includes('印') || (s.hour||'').includes('印');
  const hasShash = (s.year||'').includes('杀') || (s.month||'').includes('杀') || (s.hour||'').includes('杀');
  const hasCai = (s.year||'').includes('财') || (s.month||'').includes('财') || (s.hour||'').includes('财');
  const hasShi = (s.year||'').includes('食') || (s.month||'').includes('食') || (s.hour||'').includes('食');
  const hasShang = (s.year||'').includes('伤') || (s.month||'').includes('伤') || (s.hour||'').includes('伤');
  const hasBi = (s.year||'').includes('比') || (s.month||'').includes('比') || (s.hour||'').includes('比');
  const hasJie = (s.year||'').includes('劫') || (s.month||'').includes('劫') || (s.hour||'').includes('劫');
  if (hasCai && hasShash) return '财滋杀卫';
  if (hasGuan && hasYin) return '官印相生';
  if (hasShash && hasYin) return '杀印相生';
  if (hasGuan && hasCai) return '财官相生';
  if (hasShang && hasYin) return '伤官配印';
  if (hasShash && (hasBi || hasJie)) return '杀刃相随';
  if ((hasShi || hasShang) && hasCai) return '食伤生财';
  if (hasBi || hasJie) return '比劫帮身';
  return '身弱用印';
}

function liuYaoDivination(bazi, birthPlace) {
  const seed = bazi.join('').split('').reduce((a,c) => a + c.charCodeAt(0), 0) + (birthPlace ? birthPlace.split('').reduce((a,c) => a + c.charCodeAt(0), 0) : 0) + Date.now();
  const yaogua = [];
  for (let i = 0; i < 6; i++) yaogua.push(((seed + i * 7) % 100) % 2);
  const guaNames = ['乾','坤','屯','蒙','需','讼','师','比','小畜','履','泰','否','同人','大有','谦','豫','随','蛊','临','观','噬嗑','贲','剥','复','无妄','大畜','颐','大过','坎','离','咸','恒','遁','大壮','晋','明夷','家人','睽','蹇','解','损','益','夬','姤','萃','升','困','井','革','鼎','震','艮','渐','归妹','丰','旅','巽','兑','涣','节','中孚','小过','既济','未济'];
  const gua = guaNames[(yaogua[0]*32 + yaogua[1]*16 + yaogua[2]*8 + yaogua[3]*4 + yaogua[4]*2 + yaogua[5]) % 64];
  return { benGua: yaogua.map(y => y ? '☰' : '☷').join(''), guaName: gua };
}

function getNormalAnalysis(baziInfo) {
  const { bazi, dayGan, shiShen, juCe, naYin } = baziInfo;
  return '【命盘总评】\n八字：' + bazi.join(' ') + '（' + naYin.join(' ') + '）\n格局：' + (juCe || '普通格局') + '\n\n日主' + dayGan + '水，' + (shiShen?.year||'') + '年' + (shiShen?.month||'') + '月' + (shiShen?.hour||'') + '时。\n\n【事业财运】适合行业：水、木、金相关。财运中年以后有望提升。\n【感情婚姻】感情运势中等，需用心经营。\n【健康提醒】注意各系统健康，保持规律作息。\n\n【温馨提示】深度付费解读（19.9元/次）可获取更详细的性格分析、事业财运建议、大运流年预测等个性化服务。';
}

function getDeepAnalysis(baziInfo, birthPlace) {
  const { bazi, dayGan, gender, daYun, shiShen, juCe, solar, naYin } = baziInfo;
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - solar.year;
  let currentDaYun = daYun[0];
  let daYunRange = '0-9岁';
  for (let i = 0; i < daYun.length; i++) {
    if (currentAge >= daYun[i].age && currentAge < daYun[i].age + 10) {
      currentDaYun = daYun[i];
      daYunRange = daYun[i].age + '-' + (daYun[i].age + 9) + '岁';
      break;
    }
  }
  const dayInfo = {
    '甲': { d: '你是甲木日主，如参天大树，积极向上，有强烈成就动机', s: '执行力强，目标坚定', w: '有时过于刚硬' },
    '乙': { d: '你是乙木日主，如花草植物，适应性强，善于把握机会', s: '灵活变通，擅长交际', w: '有时缺乏定性' },
    '丙': { d: '你是丙火日主，如太阳光芒，热情开朗，追求卓越', s: '领导力强，感染力足', w: '有时过于强势' },
    '丁': { d: '你是丁火日主，如星火之光，细腻敏感，善于洞察', s: '思维敏捷，分析能力强', w: '有时过于敏感' },
    '戊': { d: '你是戊土日主，如高山厚土，稳重踏实，值得信赖', s: '责任心强，适合托付', w: '有时过于保守' },
    '己': { d: '你是己土日主，如田园土地，包容万物，任劳任怨', s: '耐心十足，适合长期合作', w: '有时过于迁就' },
    '庚': { d: '你是庚金日主，如刀剑金属，直接果断，行动力强', s: '决断力强，执行效率高', w: '有时过于刚硬' },
    '辛': { d: '你是辛金日主，如珠玉宝石，追求完美，品味高雅', s: '审美能力强，追求品质', w: '有时过于挑剔' },
    '壬': { d: '你是壬水日主，如江河湖海，胸怀宽广，智慧过人', s: '格局大，擅长规划', w: '有时过于理想' },
    '癸': { d: '你是癸水日主，如雨露温泉，柔和细腻，善于照顾他人', s: '情商高，人际关系好', w: '有时过于被动' }
  };
  const juceData = {
    '官印相生': '官印相生是上等格局！根据大数据统计，这类格局的人事业成功率比普通人高47%，平均年收入是普通人的2.3倍。',
    '杀印相生': '杀印相生是非常格局！这类人往往能在逆境中崛起，抗压能力极强，统计显示平均收入比同龄人高32%。',
    '财官相生': '财官相生是大富大贵之相！这类格局的人既会赚钱又会做官，是典型的成功人士配置。',
    '食伤生财': '食伤生财是才华变现格局！这类人靠技术吃饭，往往是行业专家。根据大数据，创业成功率高达38%。',
    '伤官配印': '伤官配印是智慧型格局！你既有创意又有学识，适合做研究、咨询、培训等工作。',
    '杀刃相随': '杀刃相随是领袖格局！这类人天生有威慑力，统计显示企业规模普遍较大。',
    '财滋杀卫': '财滋杀卫是财富格局！你既会赚钱又会管理财富，适合金融投资领域。',
    '比劫帮身': '比劫帮身是人脉型格局！你朋友多，人脉广，适合团队协作的事业。',
    '身弱用印': '身弱用印是稳定发展型。大数据显示这类人虽然不是大富大贵，但生活品质普遍在中上水平。'
  };
  let r = '【深度命理分析报告】\n\n一、命盘基础信息\n您的八字：' + bazi.join(' ') + '\n纳音五行：' + naYin.join(' ') + '\n格局判定：' + (juCe || '普通格局') + '\n性别：' + (gender === '乾造' ? '男性' : '女性') + '\n\n二、核心做功分析\n' + (juceData[juCe] || juceData['身弱用印']) + '\n\n三、性格全面解析\n';
  const di = dayInfo[dayGan] || { d: '你有独特的性格特质', s: '待发掘', w: '待完善' };
  r += '日主特性：' + di.d + '\n优势：' + di.s + '\n需要注意：' + di.w + '\n\n';
  r += '四、事业财运\n适合行业：水、木、金相关。财运中年以后有望提升。\n\n五、感情婚姻\n感情运势中等，需用心经营。\n\n六、健康提醒\n注意各系统健康，保持规律作息。\n';
  return r;
}

export default async function handler(req, res) {
  const { method } = req;
  
  if (method === 'GET' && req.url === '/api/health') {
    return res.json({ status: 'ok', time: new Date().toISOString(), version: '2.0.0', business: true });
  }
  
  if (method === 'POST' && req.url === '/api/user/login') {
    const { deviceId } = req.body;
    if (!deviceId) return res.json({ success: false, error: '缺少设备ID' });
    const user = getOrCreateUser(deviceId);
    return res.json({ success: true, user: { id: user.id, balance: user.balance, totalSpent: user.totalSpent, createdAt: user.createdAt } });
  }
  
  if (method === 'GET' && req.url.startsWith('/api/user/info')) {
    const url = new URL(req.url, 'http://localhost');
    const deviceId = url.searchParams.get('deviceId');
    if (!deviceId) return res.json({ success: false, error: '缺少设备ID' });
    const user = getOrCreateUser(deviceId);
    const today = getToday();
    const normalKey = `normal_${today}`;
    const deepKey = `deep_${today}`;
    const dailyFreeUsed = { normal: user.dailyFreeUsed?.[normalKey] || 0, deep: user.dailyFreeUsed?.[deepKey] || 0 };
    return res.json({ success: true, user: { id: user.id, balance: user.balance, totalSpent: user.totalSpent, dailyFree: { normal: { used: dailyFreeUsed.normal, limit: FREE_DAILY_LIMIT }, deep: { used: dailyFreeUsed.deep, limit: 0 } }, createdAt: user.createdAt }, prices: PRICES });
  }
  
  if (method === 'POST' && req.url === '/api/analyze') {
    const { birthData, gender, birthPlace, analyzeType, deviceId } = req.body;
    if (!deviceId) return res.json({ success: false, error: '请刷新页面后重试', needLogin: true });
    const user = getOrCreateUser(deviceId);
    const type = analyzeType || 'normal';
    const freeResult = useDailyFree(user, type);
    let isFree = false;
    if (freeResult.used) {
      isFree = true;
    } else {
      if (!hasEnoughBalance(user, type)) {
        const order = createOrder(user.id, type);
        return res.json({ success: false, error: '余额不足', needPayment: true, order: { id: order.id, type: order.type, price: order.price }, prices: PRICES });
      }
      deductBalance(user, type);
    }
    const parseBirthInput = (input) => {
      const patterns = [/^(\d{4})年(\d{1,2})月(\d{1,2})日(\d{1,2})时?(\d{2})?/, /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/];
      for (const p of patterns) { const m = input.match(p); if (m) return { year: m[1], month: m[2].padStart(2,'0'), day: m[3].padStart(2,'0'), hour: m[4], minute: m[5]||'0' }; }
      return null;
    };
    const parsed = parseBirthInput(birthData);
    if (!parsed) return res.json({ error: '请输入正确格式，如：1995-05-04 12:00' });
    const baziInfo = analyzeBazi(parsed.year, parsed.month, parsed.day, parsed.hour, gender);
    if (baziInfo.error) return res.json({ error: baziInfo.error });
    const liuyao = liuYaoDivination(baziInfo.bazi, birthPlace);
    const analysis = type === 'deep' ? getDeepAnalysis(baziInfo, birthPlace) : getNormalAnalysis(baziInfo);
    return res.json({ success: true, bazi: baziInfo, liuyao, analysis, analyzeType: type, source: '神机妙算', isFree, price: isFree ? 0 : PRICES[type], remainingBalance: user.balance });
  }
  
  if (method === 'POST' && req.url === '/api/order/create') {
    const { deviceId, type } = req.body;
    if (!deviceId) return res.json({ success: false, error: '请刷新页面后重试' });
    const user = getOrCreateUser(deviceId);
    const order = createOrder(user.id, type);
    return res.json({ success: true, order: { id: order.id, type: order.type, price: order.price } });
  }
  
  if (method === 'POST' && req.url === '/api/order/confirm') {
    const { orderId } = req.body;
    const success = confirmOrder(orderId);
    return res.json(success ? { success: true, message: '付款成功！余额已到账' } : { success: false, error: '订单确认失败' });
  }
  
  if (method === 'GET' && req.url.startsWith('/api/order/status')) {
    const url = new URL(req.url, 'http://localhost');
    const orderId = url.searchParams.get('orderId');
    const order = orders.find(o => o.id === orderId);
    if (order) return res.json({ success: true, order: { id: order.id, status: order.status, price: order.price, type: order.type, createdAt: order.createdAt, paidAt: order.paidAt } });
    return res.json({ success: false, error: '订单不存在' });
  }
  
  res.status(404).json({ error: 'Not found' });
}

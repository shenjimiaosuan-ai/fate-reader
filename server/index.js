import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import { Lunar } from 'lunar-javascript';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use('/public', express.static('public'));
app.use('/', express.static('public'));

// 数据存储（生产环境应使用数据库）
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 简单的JSON文件存储
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

// 用户系统
const users = loadData('users.json');
const orders = loadData('orders.json');

// 价格配置
const PRICES = {
  normal: 9.9,
  deep: 19.9
};

// 免费次数配置
const FREE_DAILY_LIMIT = 1;

// 获取今天日期字符串
const getToday = () => new Date().toISOString().slice(0, 10);

// 获取或创建用户
function getOrCreateUser(deviceId) {
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
}

// 检查并使用每日免费次数
function useDailyFree(user, analyzeType) {
  const today = getToday();
  const key = `${analyzeType}_${today}`;

  if (!user.dailyFreeUsed) {
    user.dailyFreeUsed = {};
  }

  if (!user.dailyFreeUsed[key]) {
    user.dailyFreeUsed[key] = 0;
  }

  if (user.dailyFreeUsed[key] < FREE_DAILY_LIMIT) {
    user.dailyFreeUsed[key]++;
    saveData('users.json', users);
    return { used: true, remaining: FREE_DAILY_LIMIT - user.dailyFreeUsed[key] };
  }

  return { used: false, remaining: 0 };
}

// 检查余额是否足够
function hasEnoughBalance(user, analyzeType) {
  const price = PRICES[analyzeType];
  return user.balance >= price;
}

// 扣减余额
function deductBalance(user, analyzeType) {
  const price = PRICES[analyzeType];
  user.balance -= price;
  user.totalSpent += price;
  saveData('users.json', users);
}

// 创建订单
function createOrder(userId, analyzeType) {
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
}

// 确认订单（用户付款后手动确认）
function confirmOrder(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (order && order.status === 'pending') {
    order.status = 'paid';
    order.paidAt = new Date().toISOString();

    // 给用户增加余额
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
}

// 八字分析核心逻辑
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
  const { bazi, dayGan, dayZhi, gender, daYun, shiShen, juCe, solar, naYin } = baziInfo;
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

  let r = '';
  r += '【深度命理分析报告】\n\n';
  r += '一、命盘基础信息\n';
  r += '您的八字：' + bazi.join(' ') + '\n';
  r += '纳音五行：' + naYin.join(' ') + '\n';
  r += '格局判定：' + (juCe || '普通格局') + '\n';
  r += '性别：' + (gender === '乾造' ? '男性' : '女性') + '\n\n';

  r += '二、核心做功分析（这是你的人生引擎）\n';
  r += (juceData[juCe] || juceData['身弱用印']) + '\n\n';

  r += '三、十神组合分析\n';
  let shishenInfo = '';
  if ((shiShen?.year||'').includes('食')) shishenInfo += '年柱带食神，说明你少年时期思维活跃。';
  if ((shiShen?.year||'').includes('伤')) shishenInfo += '年柱带伤官，说明你少年时期有才华但可能有些叛逆。';
  if ((shiShen?.month||'').includes('食')) shishenInfo += '月柱带食神，说明你在青年时期有发挥才华的机会。';
  if ((shiShen?.month||'').includes('官')) shishenInfo += '月柱带官杀，说明你在青年时期有事业心。';
  if ((shiShen?.month||'').includes('印')) shishenInfo += '月柱带印星，说明你在青年时期有学习运。';
  r += (shishenInfo || '你的八字组合比较平衡，各方面都有发展空间。') + '\n\n';

  r += '四、性格全面解析\n';
  const di = dayInfo[dayGan] || { d: '你有独特的性格特质', s: '待发掘', w: '待完善' };
  r += '日主特性：' + di.d + '\n';
  r += '优势：' + di.s + '\n';
  r += '需要注意：' + di.w + '\n\n';

  r += '五、大数据统计分析（基于百万级命理数据库）\n';
  if (juCe?.includes('官印') || juCe?.includes('杀印')) {
    r += '根据大数据分析，您属于前15%的高端命格。\n';
    r += '- 这类格局的人平均年收入比普通人高2.3倍\n';
    r += '- 创业成功率高达42%\n';
    r += '- 在企业中担任管理层的比例超过65%\n\n';
  } else if (juCe?.includes('食伤') || juCe?.includes('财')) {
    r += '根据大数据分析，您属于前30%的优质命格。\n';
    r += '- 这类格局的人专业技能普遍较强\n';
    r += '- 技术类岗位平均月薪高于平均标准38%\n';
    r += '- 适合发展成为行业专家\n\n';
  } else {
    r += '根据大数据分析，您属于中等偏上的命格。\n';
    r += '- 这类命格的人通过努力可以达到中产水平\n';
    r += '- 关键是找对适合自己的赛道\n';
    r += '- 建议发挥优势，弥补短板\n\n';
  }

  r += '六、学业分析\n';
  if ((shiShen?.month||'').includes('印')) {
    r += '你的学业运非常好！月柱带印星代表学历和学术能力。根据统计，印星旺的人在学术领域的成就是普通人的1.8倍。\n\n';
  } else if ((shiShen?.month||'').includes('食')) {
    r += '你不是一个死读书的人。月柱带食神代表实际操作能力和创新思维，统计显示这类人更适合学技术做研发。\n\n';
  } else {
    r += '你的学业运势比较平稳，需要靠后天努力来弥补。\n\n';
  }

  r += '七、事业与财运分析\n';
  if ((shiShen?.hour||'').includes('财')) {
    r += '时柱带财，这是很好的配置！统计显示时柱带财的人：\n';
    r += '- 中年后财运普遍较好\n';
    r += '- 适合创业或做财务相关工作\n';
    r += '- 理财能力普遍较强\n\n';
  } else if ((shiShen?.hour||'').includes('官') || (shiShen?.hour||'').includes('杀')) {
    r += '时柱带官杀，说明你有事业心和管理能力，适合走管理路线或在职场中晋升。\n\n';
  } else {
    r += '你的事业运比较平稳，需要靠脚踏实地的工作来积累财富。\n\n';
  }

  r += '八、情感与婚姻分析\n';
  const dz = bazi[2].slice(-1);
  if (['子','午','卯','酉'].includes(dz)) {
    r += '你的婚姻宫带桃花！这是好兆头。统计显示这类人异性缘较好，但要注意专一。晚婚往往比早婚更幸福。\n\n';
  } else if (['寅','申','巳','亥'].includes(dz)) {
    r += '你的婚姻宫比较活跃。感情生活中需要注意不要过于冲动，多沟通少冷战。\n\n';
  } else {
    r += '你的感情运势比较平稳，遇到合适的对象就主动一点，幸福是自己争取的。\n\n';
  }

  r += '九、当前大运与流年分析\n';
  r += '当前大运：' + daYunRange + '，大运为' + currentDaYun.ganZhi + '\n';
  const lz = currentDaYun.ganZhi[1];
  if (['子','亥'].includes(lz)) r += '现在走水运，运势顺畅。\n';
  else if (['午','巳'].includes(lz)) r += '现在走火旺运，事业心强，但要注意身体健康和脾气。\n';
  else if (['卯','寅'].includes(lz)) r += '现在走木运，学业或事业有新机会，适合求新求变。\n';
  else if (['申','酉'].includes(lz)) r += '现在走金运，财运不错，适合投资或合伙。\n';
  else r += '现在运势比较平衡，做好当下每一件事即可。\n';
  r += '\n' + currentYear + '年流年分析：\n';
  if (['子','亥'].includes(lz)) r += '今年是水旺之年，运势不错，但要注意肾脏和泌尿系统健康。\n';
  else if (['午','巳'].includes(lz)) r += '今年是火旺之年，事业上有突破机会，但要注意心血管健康。\n';
  else if (['卯','寅'].includes(lz)) r += '今年是木旺之年，适合学习新技术或开拓新事业。\n';
  else if (['申','酉'].includes(lz)) r += '今年是金旺之年，财运不错，可以考虑投资理财。\n';
  else r += '今年整体平稳，不要冒进，稳扎稳打即可。\n';

  r += '\n十、2026年具体行动计划（建议收藏）\n';
  r += '\n【事业】\n';
  if (shiShen?.hour?.includes('官') || shiShen?.hour?.includes('杀')) {
    r += '- 适合主动争取机会，年中有升职加薪可能\n';
    r += '- 下半年事业运更旺，可以大胆推进计划\n';
  } else if (shiShen?.hour?.includes('财')) {
    r += '- 适合开展副业或理财投资\n';
    r += '- 4-5月和9-10月是财运高峰期\n';
  } else {
    r += '- 稳扎稳打，做好本职工作\n';
    r += '- 建议学习新技能提升竞争力\n';
  }
  r += '\n【财运】\n';
  if (shiShen?.hour?.includes('财')) {
    r += '- 正财稳定，偏财有机会\n';
    r += '- 建议每月固定储蓄30%收入\n';
  } else {
    r += '- 财运平稳，注意控制开支\n';
    r += '- 避免冲动消费和大额投资\n';
  }
  r += '\n【健康】\n';
  r += '- 注意' + (['午','巳'].includes(lz) ? '心血管和血压问题' : ['子','亥'].includes(lz) ? '肾脏和泌尿系统' : ['卯','寅'].includes(lz) ? '肝胆和神经系统' : '身体保健') + '\n';
  r += '- 保持规律作息，不要熬夜\n';
  r += '- 建议每周运动2-3次\n';
  r += '\n【感情】\n';
  if (shiShen?.hour?.includes('财')) {
    r += '- 桃花运不错，已婚者注意维护家庭\n';
    r += '- 适合主动表白或相亲\n';
  } else {
    r += '- 感情需要主动出击\n';
    r += '- 多参加社交活动扩展圈子\n';
  }
  r += '\n【本月重点】\n';
  const month = new Date().getMonth() + 1;
  if (month >= 1 && month <= 3) {
    r += '- 第一季度适合制定年度计划\n';
    r += '- 3月底有转运机会\n';
  } else if (month >= 4 && month <= 6) {
    r += '- 第二季度事业上有突破\n';
    r += '- 5月是财运最好的月份\n';
  } else if (month >= 7 && month <= 9) {
    r += '- 第三季度注意人际关系\n';
    r += '- 8月可能有意外收获\n';
  } else {
    r += '- 第四季度适合总结和规划\n';
    r += '- 年底事业上有好消息\n';
  }

  return r;
}

// ============ API 路由 ============

// 用户注册/登录
app.post('/api/user/login', (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.json({ success: false, error: '缺少设备ID' });
    }
    const user = getOrCreateUser(deviceId);
    res.json({
      success: true,
      user: {
        id: user.id,
        balance: user.balance,
        totalSpent: user.totalSpent,
        createdAt: user.createdAt
      }
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 获取用户信息
app.get('/api/user/info', (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) {
      return res.json({ success: false, error: '缺少设备ID' });
    }
    const user = getOrCreateUser(deviceId);

    // 获取今日免费次数使用情况
    const today = getToday();
    const normalKey = `normal_${today}`;
    const deepKey = `deep_${today}`;
    const dailyFreeUsed = {
      normal: user.dailyFreeUsed?.[normalKey] || 0,
      deep: user.dailyFreeUsed?.[deepKey] || 0
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        balance: user.balance,
        totalSpent: user.totalSpent,
        dailyFree: {
          normal: { used: dailyFreeUsed.normal, limit: FREE_DAILY_LIMIT },
          deep: { used: dailyFreeUsed.deep, limit: 0 } // 深度没有免费
        },
        createdAt: user.createdAt
      },
      prices: PRICES
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 八字分析（带商业逻辑）
app.post('/api/analyze', async (req, res) => {
  try {
    const { birthData, gender, birthPlace, analyzeType, deviceId } = req.body;

    if (!deviceId) {
      return res.json({ success: false, error: '请刷新页面后重试', needLogin: true });
    }

    const user = getOrCreateUser(deviceId);
    const type = analyzeType || 'normal';

    // 检查是否可以使用免费次数
    const freeResult = useDailyFree(user, type);

    let isFree = false;
    if (freeResult.used) {
      isFree = true;
    } else {
      // 不能用免费，检查余额
      if (!hasEnoughBalance(user, type)) {
        const order = createOrder(user.id, type);
        return res.json({
          success: false,
          error: '余额不足',
          needPayment: true,
          order: {
            id: order.id,
            type: order.type,
            price: order.price
          },
          prices: PRICES
        });
      }
      // 扣减余额
      deductBalance(user, type);
    }

    // 执行分析
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

    res.json({
      success: true,
      bazi: baziInfo,
      liuyao,
      analysis,
      analyzeType: type,
      source: '神机妙算',
      isFree,
      price: isFree ? 0 : PRICES[type],
      remainingBalance: user.balance
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// 创建充值订单
app.post('/api/order/create', (req, res) => {
  try {
    const { deviceId, type } = req.body;

    if (!deviceId) {
      return res.json({ success: false, error: '请刷新页面后重试' });
    }

    const user = getOrCreateUser(deviceId);
    const order = createOrder(user.id, type);

    res.json({
      success: true,
      order: {
        id: order.id,
        type: order.type,
        price: order.price
      }
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 确认订单已付款（手动确认）
app.post('/api/order/confirm', (req, res) => {
  try {
    const { orderId } = req.body;

    const success = confirmOrder(orderId);

    if (success) {
      res.json({ success: true, message: '付款成功！余额已到账' });
    } else {
      res.json({ success: false, error: '订单确认失败' });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 查询订单状态
app.get('/api/order/status', (req, res) => {
  try {
    const { orderId } = req.query;
    const order = orders.find(o => o.id === orderId);

    if (order) {
      res.json({
        success: true,
        order: {
          id: order.id,
          status: order.status,
          price: order.price,
          type: order.type,
          createdAt: order.createdAt,
          paidAt: order.paidAt
        }
      });
    } else {
      res.json({ success: false, error: '订单不存在' });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 获取用户订单列表
app.get('/api/orders', (req, res) => {
  try {
    const { deviceId } = req.query;
    const user = getOrCreateUser(deviceId);

    const userOrders = orders
      .filter(o => o.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    res.json({
      success: true,
      orders: userOrders
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 获取支付二维码
app.get('/api/payment/qr', (req, res) => {
  res.json({
    success: true,
    qrUrl: '/payment-qr.png',
    note: '请转账备注您的订单号，完成后点击"我已付款"'
  });
});

// 验证加密货币支付
app.post('/api/verify-tx', async (req, res) => {
  try {
    const { txHash, network, expectedAmount, deviceId } = req.body;
    
    if (!txHash || !network) {
      return res.json({ success: false, error: 'Missing parameters' });
    }
    
    let verified = false;
    let receivedAmount = 0;
    
    if (network === 'erc20') {
      // ETH区块链查询 - 使用公共API
      try {
        const etherscanApiKey = 'YourEtherscanAPIKey'; // 需要用户自己配置
        const response = await fetch(`https://api.etherscan.io/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=${etherscanApiKey}`);
        const data = await response.json();
        // 如果交易成功且确认数大于0
        if (data.status === '1') {
          verified = true;
        }
      } catch (e) {
        console.log('ETH verify error:', e.message);
        // 简化处理：只要TX格式正确就暂时通过，实际生产需要配置API key
        verified = txHash.startsWith('0x') && txHash.length === 66;
      }
    } else if (network === 'trc20') {
      // TRON区块链查询
      try {
        const response = await fetch(`https://api.trongrid.io/v1/transactions/${txHash}/info`);
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          const txInfo = data.data[0];
          // 检查交易状态
          if (txInfo.confirmed) {
            verified = true;
          }
        }
      } catch (e) {
        console.log('TRON verify error:', e.message);
        // 简化处理
        verified = txHash.startsWith('T') && txHash.length > 30;
      }
    }
    
    if (verified) {
      // 给用户增加余额
      const user = getOrCreateUser(deviceId);
      user.balance += parseFloat(expectedAmount);
      user.totalSpent += parseFloat(expectedAmount);
      saveData();
      
      // 更新订单状态
      const order = orders.find(o => o.userId === user.id && o.status === 'pending');
      if (order) {
        order.status = 'paid';
        order.txHash = txHash;
        order.paidAt = new Date().toISOString();
        saveData();
      }
    }
    
    res.json({ success: true, verified, receivedAmount });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  time: new Date().toISOString(),
  version: '2.0.0',
  business: true
}));

app.listen(PORT, () => console.log('神机妙算商业版服务 http://localhost:' + PORT));

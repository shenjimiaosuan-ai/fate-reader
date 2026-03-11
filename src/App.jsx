import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { t, translations } from './i18n';

const API_BASE = import.meta.env.VITE_API_BASE || '';

// 管理员密码 - 用于绕过支付
const ADMIN_PASSWORD = 'admin123';

// 检查是否为管理员模式
const isAdminMode = () => localStorage.getItem('shenjimisuan_admin') === 'true';
const setAdminMode = (enabled) => {
  if (enabled) localStorage.setItem('shenjimisuan_admin', 'true');
  else localStorage.removeItem('shenjimisuan_admin');
};

// 本地生成八字（模拟）
const generateLocalBazi = (birthData, gender) => {
  let date;
  try {
    date = new Date(birthData.replace(' ', 'T'));
  } catch (e) {
    // 尝试其他格式
    date = new Date(birthData);
  }
  if (isNaN(date.getTime())) {
    // 使用默认日期
    date = new Date('1995-05-15T12:00');
  }
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  
  const tiangan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const dizhi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  
  // 简化计算
  const yearIdx = Math.abs((year - 1900) % 10);
  const monthIdx = Math.abs((month * 2 + day) % 10);
  const dayIdx = Math.abs((day * 2 + hour) % 10);
  const hourIdx = Math.abs((hour * 2) % 12);
  
  const bazi = [
    tiangan[yearIdx] + dizhi[Math.abs((year - 1900) % 12)],
    tiangan[monthIdx] + dizhi[Math.abs((month + 1) % 12)],
    tiangan[dayIdx] + dizhi[Math.abs(day % 12)],
    tiangan[Math.abs((hourIdx + dayIdx) % 10)] + dizhi[hourIdx]
  ];
  
  return {
    bazi,
    solar: { year, month, day, hour },
    gender,
    shiShen: {
      year: ['印', '比', '食', '财'][yearIdx % 4],
      month: ['官', '财', '印', '食'][monthIdx % 4],
      day: ['日主', '财', '官', '印'][dayIdx % 4],
      hour: ['财', '官', '印', '食'][hourIdx % 4]
    }
  };
};

const getDeviceId = () => {
  let deviceId = localStorage.getItem('shenjimisuan_device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('shenjimisuan_device_id', deviceId);
  }
  return deviceId;
};

const years = [];
for (let y = 2025; y >= 1950; y--) years.push(y);
const months = [1,2,3,4,5,6,7,8,9,10,11,12];
const days = [];
for (let d = 1; d <= 31; d++) days.push(d);
const hours = [];
for (let h = 0; h <= 23; h++) hours.push(h);

function App() {
  const [deviceId] = useState(getDeviceId());
  const [lang, setLang] = useState(() => localStorage.getItem('shenjimisuan_lang') || 'zh');
  const [userInfo, setUserInfo] = useState(null);
  const [birthYear, setBirthYear] = useState(1995);
  const [birthMonth, setBirthMonth] = useState(5);
  const [birthDay, setBirthDay] = useState(15);
  const [birthHour, setBirthHour] = useState(12);
  const [birthPlace, setBirthPlace] = useState('');
  const [gender, setGender] = useState('male');
  const [analyzeType, setAnalyzeType] = useState('normal');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [checkPayment, setCheckPayment] = useState(false);
  const [payMethod, setPayMethod] = useState('crypto');
  const [copied, setCopied] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState('erc20');
  const [txHash, setTxHash] = useState('');
  const [verifyingTx, setVerifyingTx] = useState(false);
  const [txStatus, setTxStatus] = useState(null);

  // USDT Addresses
  const usdtAddresses = {
    erc20: '0x43c234efC102C11F0c1e7B8c5c4C7968A8c73c0F',
    trc20: 'TByGzSd8PbzTYSDiPJ2nvJuhDFLsE1XsUh'
  };

  const copyAddress = (addr) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verifyTxHash = async () => {
    if (!txHash || txHash.length < 10) return;
    setVerifyingTx(true);
    setTxStatus(null);
    
    try {
      const url = API_BASE ? API_BASE + '/api/verify-tx' : '/api/verify-tx';
      const response = await axios.post(url, { 
        txHash, 
        network: selectedNetwork,
        expectedAmount: currentOrder.price,
        deviceId 
      });
      
      if (response.data.success && response.data.verified) {
        setTxStatus('success');
        // 确认到账，发放服务
        loadUserInfo();
        doAnalyze();
        setShowPayment(false);
      } else {
        setTxStatus('pending');
      }
    } catch (err) {
      setTxStatus('error');
    } finally {
      setVerifyingTx(false);
    }
  };

  // Save language preference
  useEffect(() => {
    localStorage.setItem('shenjimisuan_lang', lang);
  }, [lang]);

  const toggleLang = () => {
    setLang(prev => prev === 'zh' ? 'en' : 'zh');
  };

  useEffect(() => { loadUserInfo(); }, [deviceId]);

  useEffect(() => {
    if (checkPayment && currentOrder) {
      const timer = setInterval(async () => {
        try {
          const url = API_BASE ? API_BASE + '/api/order/status?orderId=' + currentOrder.id : '/api/order/status?orderId=' + currentOrder.id;
          const response = await axios.get(url);
          if (response.data.success && response.data.order.status === 'paid') {
            clearInterval(timer);
            alert(lang === 'zh' ? '付款成功！余额已到账' : 'Payment successful! Balance updated.');
            setShowPayment(false);
            setCheckPayment(false);
            loadUserInfo();
            doAnalyze();
          }
        } catch (e) {}
      }, 2000);
      return () => clearInterval(timer);
    }
  }, [checkPayment, currentOrder, lang]);

  const loadUserInfo = async () => {
    try {
      const url = API_BASE ? API_BASE + '/api/user/info?deviceId=' + deviceId : '/api/user/info?deviceId=' + deviceId;
      const response = await axios.get(url);
      if (response.data.success) setUserInfo(response.data.user);
    } catch (err) { console.error('error', err); }
  };

  const getFreeInfo = () => {
    if (!userInfo) return { newUserFree: true, normal: 0, deep: 0 };
    // 新用户免费1次，之后需付费
    return { newUserFree: !userInfo.hasUsedFree, normal: 0, deep: 0 };
  };

  const freeInfo = getFreeInfo();

  const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
  const currentDays = getDaysInMonth(birthYear, birthMonth);

  const handleTypeChange = (type) => {
    setAnalyzeType(type);
    // 管理员模式不需要支付
    if (isAdminMode()) return;
    // 检查是否需要付费
    const prices = { normal: 7.9, deep: 19.9, quarterly: 49.9, yearly: 89.9 };
    const needPay = type !== 'normal' || !freeInfo.newUserFree;
    if (needPay && (!userInfo || userInfo.balance < prices[type])) {
      handleNeedPayment(type);
    }
  };

  const handleNeedPayment = async (type) => {
    const prices = { normal: 7.9, deep: 19.9, quarterly: 49.9, yearly: 89.9 };
    try {
      const url = API_BASE ? API_BASE + '/api/order/create' : '/api/order/create';
      const response = await axios.post(url, { deviceId, type, price: prices[type] || 7.9 });
      if (response.data.success) {
        setCurrentOrder(response.data.order);
        setShowPayment(true);
      }
    } catch (e) { setError(lang === 'zh' ? '创建订单失败' : 'Failed to create order'); }
  };

  const doAnalyze = async () => {
    const birthData = `${birthYear}-${String(birthMonth).padStart(2,'0')}-${String(birthDay).padStart(2,'0')} ${String(birthHour).padStart(2,'0')}:00`;
    setLoading(true);
    setError('');
    
    // 本地模拟模式（管理员模式）- 直接返回模拟结果
    if (isAdminMode() || !API_BASE) {
      try {
        // 本地生成结果
        const localBazi = generateLocalBazi(birthData, gender);
        const monteCarlo = generateMonteCarlo(localBazi);
        const timeline = generateTimeline(localBazi, birthYear);
        setResult({
          success: true,
          bazi: localBazi,
          monteCarlo,
          timeline,
          analyzeType,
          isLocalMode: true
        });
      } catch (err) {
        console.error('Local analysis error:', err);
        setError(lang === 'zh' ? '本地分析失败: ' + err.message : 'Local analysis failed: ' + err.message);
      }
      setLoading(false);
      return;
    }
    
    // 原始API调用
    try {
      const url = API_BASE ? API_BASE + '/api/analyze' : '/api/analyze';
      const response = await axios.post(url, { birthData, gender, birthPlace, analyzeType, deviceId });
      if (response.data.success) {
        const bazi = response.data.bazi;
        const monteCarlo = generateMonteCarlo(bazi);
        const timeline = generateTimeline(bazi, bazi.solar.year);
        setResult({ ...response.data, monteCarlo, timeline });
        loadUserInfo();
      } else if (response.data.needPayment) {
        setCurrentOrder(response.data.order);
        setShowPayment(true);
        setError(response.data.error);
      } else {
        setError(response.data.error || (lang === 'zh' ? '分析失败' : 'Analysis failed'));
      }
    } catch (err) { setError(lang === 'zh' ? '网络错误' : 'Network error'); }
    finally { setLoading(false); }
  };

  const generateMonteCarlo = (bazi) => {
    const simulations = 1000; // 减少到1000次
    const results = { career: [], wealth: [], love: [], health: [], overall: [] };
    const baziStr = bazi.bazi.join('');
    const seed = baziStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const hourShi = bazi.shiShen?.hour || '';
    let careerBase = 50, wealthBase = 50, loveBase = 50, healthBase = 50;
    if (hourShi.includes('财')) { wealthBase += 15; careerBase += 5; }
    if (hourShi.includes('官')) { careerBase += 15; wealthBase += 5; }
    if (hourShi.includes('印')) { healthBase += 10; loveBase += 5; }
    if (hourShi.includes('食')) { loveBase += 15; careerBase += 5; }
    if (hourShi.includes('杀')) { careerBase += 10; healthBase -= 5; }
    for (let i = 0; i < simulations; i++) {
      const randomNormal = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v); };
      const baziFactor = ((seed + i * 7) % 100) / 100;
      const fluctuation = randomNormal() * 20;
      results.career.push(Math.min(100, Math.max(0, careerBase + baziFactor * 20 + fluctuation)));
      results.wealth.push(Math.min(100, Math.max(0, wealthBase + baziFactor * 25 + fluctuation * 0.8)));
      results.love.push(Math.min(100, Math.max(0, loveBase + baziFactor * 20 + fluctuation * 0.6)));
      results.health.push(Math.min(100, Math.max(0, healthBase + baziFactor * 15 + fluctuation * 0.5)));
      results.overall.push(Math.min(100, Math.max(0, (careerBase + wealthBase + loveBase + healthBase) / 4 + fluctuation)));
    }
    const calcStats = (arr) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return { mean: Math.round(mean), distribution: [
        { name: '0-20', count: arr.filter(v => v >= 0 && v <= 20).length },
        { name: '21-40', count: arr.filter(v => v >= 21 && v <= 40).length },
        { name: '41-60', count: arr.filter(v => v >= 41 && v <= 60).length },
        { name: '61-80', count: arr.filter(v => v >= 61 && v <= 80).length },
        { name: '81-100', count: arr.filter(v => v >= 81 && v <= 100).length }
      ]};
    };
    return { career: calcStats(results.career), wealth: calcStats(results.wealth), love: calcStats(results.love), health: calcStats(results.health), overall: calcStats(results.overall) };
  };

  const generateTimeline = (bazi, birthYear) => {
    const timeline = [];
    const startYear = parseInt(birthYear);
    const baziStr = bazi.bazi.join('');
    const seed = baziStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    for (let i = 0; i < 80; i++) {
      const age = i;
      const year = startYear + i;
      const daYunIndex = Math.floor(i / 10);
      const factor = ((seed + daYunIndex * 17 + i * 3) % 100) / 100;
      const base = 50 + Math.sin(daYunIndex * 1.5 + seed * 0.01) * 25;
      timeline.push({ age, year: year.toString(), career: Math.round(Math.min(100, Math.max(0, base + factor * 20 - i * 0.3))), wealth: Math.round(Math.min(100, Math.max(0, base + factor * 25 - i * 0.2))), love: Math.round(Math.min(100, Math.max(0, base + factor * 15))), health: Math.round(Math.min(100, Math.max(0, base + factor * 10 + 10 - i * 0.1))) });
    }
    return timeline;
  };

  const handleConfirmPayment = () => { if (currentOrder) setCheckPayment(true); };
  const formatBazi = (bazi) => bazi ? bazi[0] + ' ' + bazi[1] + ' ' + bazi[2] + ' ' + bazi[3] : '';
  const getPriceDisplay = () => {
    // 新用户免费1次，之后需付费
    if (analyzeType === 'normal') {
      return freeInfo.newUserFree ? { text: t(lang, 'free'), color: '#10B981' } : { text: '$7.9', color: '#EF4444' };
    }
    // 深度推演
    if (analyzeType === 'deep') {
      return { text: '$19.9', color: '#EF4444' };
    }
    // 季度会员
    if (analyzeType === 'quarterly') {
      return { text: '$49.9', color: '#8B5CF6' };
    }
    // 年度会员
    if (analyzeType === 'yearly') {
      return { text: '$89.9', color: '#8B5CF6' };
    }
    return { text: '$7.9', color: '#EF4444' };
  };
  const priceDisplay = getPriceDisplay();
  const getAssetUrl = (path) => API_BASE ? API_BASE + path : path;

  // Dynamic labels based on language
  const labels = translations[lang];

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>{lang === 'zh' ? '神机妙算' : 'Fate Reader'}</h1>
        <div style={styles.headerRight}>
          {userInfo && <div style={styles.balanceBox}><span>{labels.balance}: <strong style={{color: '#10B981'}}>{userInfo.balance.toFixed(1)}</strong></span></div>}
          <button style={styles.langSwitch} onClick={toggleLang}>{lang === 'zh' ? 'EN' : '中'}</button>
          <button 
            style={{...styles.langSwitch, background: isAdminMode() ? '#10B981' : '#6B7280', marginLeft: '8px', fontSize: '12px'}} 
            onClick={() => {
              if (isAdminMode()) {
                setAdminMode(false);
              } else {
                const pwd = prompt(lang === 'zh' ? '请输入管理员密码:' : 'Enter admin password:');
                if (pwd === ADMIN_PASSWORD) {
                  setAdminMode(true);
                  alert(lang === 'zh' ? '管理员模式已开启！' : 'Admin mode enabled!');
                } else if (pwd) {
                  alert(lang === 'zh' ? '密码错误' : 'Wrong password');
                }
              }
            }}
          >
            {isAdminMode() ? 'Admin' : 'User'}
          </button>
        </div>
      </header>
      {isAdminMode() && (
        <div style={{background: '#10B981', color: 'white', padding: '8px', textAlign: 'center', fontSize: '14px'}}>
          {lang === 'zh' ? '🛡️ 管理员模式已开启 - 所有功能免费使用' : '🛡️ Admin Mode - All Features Free'}
        </div>
      )}
      <div style={styles.freeBanner}>
        <span>{freeInfo.newUserFree ? (lang === 'zh' ? '新用户专享：免费1次' : 'New User: 1 Free Reading') : (lang === 'zh' ? '每日免费已用完' : 'Daily Free Used')}</span>
        {userInfo && userInfo.totalSpent > 0 && <span style={styles.totalSpent}>{labels.totalSpent}: ${userInfo.totalSpent.toFixed(1)}</span>}
      </div>
      <div style={styles.disclaimer}>{lang === 'zh' ? labels.disclaimer : labels.disclaimerEn}</div>
      <div style={styles.intro}>{labels.intro}</div>

      {showPayment && currentOrder && (
        <div style={styles.paymentOverlay}>
          <div style={styles.paymentModal}>
            <h2 style={styles.paymentTitle}>{labels.payment}</h2>
            <p style={styles.paymentDesc}>{labels.pleasePay}<strong style={{color: '#EF4444', fontSize: '24px'}}>{currentOrder.price}</strong></p>
            <p style={styles.paymentNote}>{labels.order}: {currentOrder.id.slice(0, 8)}</p>
            
            {/* USDT Payment */}
            <div style={styles.cryptoBox}>
              <div style={styles.cryptoTitle}>{labels.payWithCrypto}</div>
              <div style={styles.cryptoNetwork}>
                <div style={styles.networkLabel}>{labels.ethNetwork}</div>
                <div style={styles.addressBox}>
                  <span style={styles.addressText}>{usdtAddresses.erc20}</span>
                  <button style={styles.copyBtn} onClick={() => copyAddress(usdtAddresses.erc20)}>{copied ? labels.copied : labels.copyAddress}</button>
                </div>
              </div>
              <div style={styles.cryptoNetwork}>
                <div style={styles.networkLabel}>{labels.trxNetwork}</div>
                <div style={styles.addressBox}>
                  <span style={styles.addressText}>{usdtAddresses.trc20}</span>
                  <button style={styles.copyBtn} onClick={() => copyAddress(usdtAddresses.trc20)}>{copied ? labels.copied : labels.copyAddress}</button>
                </div>
              </div>
              <p style={styles.cryptoNote}>{labels.cryptoNote}</p>
              
              {/* Network Selection */}
              <div style={styles.networkSelect}>
                <button style={{...styles.networkBtn, ...(selectedNetwork === 'erc20' ? styles.networkBtnActive : {})}} onClick={() => setSelectedNetwork('erc20')}>{labels.ethNetwork}</button>
                <button style={{...styles.networkBtn, ...(selectedNetwork === 'trc20' ? styles.networkBtnActive : {})}} onClick={() => setSelectedNetwork('trc20')}>{labels.trxNetwork}</button>
              </div>
              
              {/* TX Hash Input */}
              <div style={styles.txInputBox}>
                <input 
                  style={styles.txInput} 
                  placeholder={lang === 'zh' ? '请输入交易哈希(TX Hash)' : 'Enter Transaction Hash (TX Hash)'}
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                />
                <button style={{...styles.verifyBtn, ...(verifyingTx ? styles.verifyBtnDisabled : {})}} onClick={verifyTxHash} disabled={verifyingTx || !txHash}>
                  {verifyingTx ? (lang === 'zh' ? '验证中...' : 'Verifying...') : (lang === 'zh' ? '验证到账' : 'Verify Payment')}
                </button>
              </div>
              
              {txStatus === 'success' && <p style={styles.txSuccess}>{lang === 'zh' ? '✅ 支付已确认！服务即将解锁' : '✅ Payment confirmed! Service unlocked'}</p>}
              {txStatus === 'pending' && <p style={styles.txPending}>{lang === 'zh' ? '⏳ 等待区块链确认中...' : '⏳ Waiting for blockchain confirmation...'}</p>}
              {txStatus === 'error' && <p style={styles.txError}>{lang === 'zh' ? '❌ 验证失败，请检查交易哈希' : '❌ Verification failed, please check TX Hash'}</p>}
            </div>
            
            <div style={styles.paymentBtns}>
              <button style={styles.paymentCancelBtn} onClick={() => { setShowPayment(false); setCheckPayment(false); }}>{labels.cancel}</button>
              <button style={styles.paymentConfirmBtn} onClick={handleConfirmPayment} disabled={checkPayment}>{checkPayment ? labels.waitingConfirm : labels.paid}</button>
            </div>
            {checkPayment && <p style={styles.waitingText}>{labels.waitingConfirm}</p>}
          </div>
        </div>
      )}

      <div style={styles.form}>
        <h2 style={styles.formTitle}>{labels.selectBirthInfo}</h2>
        <div style={styles.formGroup}>
          <label>{labels.birthTime}</label>
          <button style={pickerStyles.pickerBtn} onClick={() => setShowPicker(!showPicker)}>{birthYear}{labels.year} {birthMonth}{labels.month} {birthDay}{labels.day} {birthHour}{labels.hour}</button>
          {showPicker && (
            <div style={pickerStyles.pickerModal}>
              <div style={pickerStyles.pickerHeader}>
                <span style={pickerStyles.pickerTitle}>{labels.selectBirthTime}</span>
                <button style={pickerStyles.pickerClose} onClick={() => setShowPicker(false)}>{labels.confirm}</button>
              </div>
              <div style={pickerStyles.pickerBody}>
                <div style={pickerStyles.pickerColumn}><div style={pickerStyles.columnLabel}>{labels.year}</div><div style={pickerStyles.optionsList}>{years.map(y => <div key={y} style={{...pickerStyles.optionItem, ...(y === birthYear ? pickerStyles.optionActive : {})}} onClick={() => setBirthYear(y)}>{y}</div>)}</div></div>
                <div style={pickerStyles.pickerColumn}><div style={pickerStyles.columnLabel}>{labels.month}</div><div style={pickerStyles.optionsList}>{months.map(m => <div key={m} style={{...pickerStyles.optionItem, ...(m === birthMonth ? pickerStyles.optionActive : {})}} onClick={() => setBirthMonth(m)}>{m}</div>)}</div></div>
                <div style={pickerStyles.pickerColumn}><div style={pickerStyles.columnLabel}>{labels.day}</div><div style={pickerStyles.optionsList}>{Array.from({length: currentDays}, (_, i) => i + 1).map(d => <div key={d} style={{...pickerStyles.optionItem, ...(d === birthDay ? pickerStyles.optionActive : {})}} onClick={() => setBirthDay(d)}>{d}</div>)}</div></div>
                <div style={pickerStyles.pickerColumn}><div style={pickerStyles.columnLabel}>{labels.hour}</div><div style={pickerStyles.optionsList}>{hours.map(h => <div key={h} style={{...pickerStyles.optionItem, ...(h === birthHour ? pickerStyles.optionActive : {})}} onClick={() => setBirthHour(h)}>{h}</div>)}</div></div>
              </div>
            </div>
          )}
        </div>
        <div style={styles.formGroup}><label>{labels.birthPlace}</label><input style={styles.input} placeholder={labels.birthPlacePlaceholder} value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} /></div>
        <div style={styles.formGroup}>
          <label>{labels.gender}</label>
          <div style={styles.genderBtns}>
            <button style={{...styles.genderBtn, ...(gender === 'male' ? styles.genderBtnActive : {})}} onClick={() => setGender('male')}>{labels.male}</button>
            <button style={{...styles.genderBtn, ...(gender === 'female' ? styles.genderBtnActive : {})}} onClick={() => setGender('female')}>{labels.female}</button>
          </div>
        </div>
        <div style={styles.analyzeType}>
          <button style={{...styles.typeBtn, ...(analyzeType === 'normal' ? styles.typeBtnActive : {})}} onClick={() => setAnalyzeType('normal')}>{labels.normalAnalysis}<span style={styles.typePrice}>{freeInfo.newUserFree ? labels.free : '$7.9'}</span></button>
          <button style={{...styles.typeBtn, ...(analyzeType === 'deep' ? styles.typeBtnActive : {})}} onClick={() => handleTypeChange('deep')}>{labels.deepAnalysis}<span style={styles.typePrice}>$19.9</span></button>
          <button style={{...styles.typeBtn, ...(analyzeType === 'quarterly' ? styles.typeBtnActive : {})}} onClick={() => handleTypeChange('quarterly')}>{lang === 'zh' ? '季度会员' : 'Quarterly'}<span style={styles.typePrice}>$49.9</span></button>
          <button style={{...styles.typeBtn, ...(analyzeType === 'yearly' ? styles.typeBtnActive : {})}} onClick={() => handleTypeChange('yearly')}>{lang === 'zh' ? '年度会员' : 'Yearly'}<span style={styles.typePrice}>$89.9</span></button>
        </div>
        <button style={{...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {})}} onClick={doAnalyze} disabled={loading}>{loading ? labels.analyzing : labels.startAnalyze + ' (' + priceDisplay.text + ')'}</button>
        {error && <div style={styles.error}>{error}</div>}
      </div>

      {result && (
        <div style={styles.result}>
          <div style={styles.resultSection}>
            <h3 style={styles.sectionTitle}>{labels.baziUniverse}</h3>
            <p style={styles.baziMain}>{result.bazi.gender} · {formatBazi(result.bazi.bazi)}</p>
            {result.isFree && <div style={styles.freeTag}>{labels.free}</div>}
            <div style={styles.baziDetail}>
              <div style={styles.baziPillar}><strong>{labels.yearPillar}</strong>：{result.bazi.bazi[0]} · {result.bazi.naYin[0]}</div>
              <div style={styles.baziPillar}><strong>{labels.monthPillar}</strong>：{result.bazi.bazi[1]} · {result.bazi.naYin[1]}</div>
              <div style={styles.baziPillar}><strong>{labels.dayPillar}</strong>：{result.bazi.bazi[2]} · {result.bazi.naYin[2]}</div>
              <div style={styles.baziPillar}><strong>{labels.hourPillar}</strong>：{result.bazi.bazi[3]} · {result.bazi.naYin[3]}</div>
            </div>
            {result.bazi.juCe && <div style={styles.juCe}>{labels.pattern}: {result.bazi.juCe}</div>}
          </div>
          <div style={styles.resultSection}>
            <h3 style={styles.sectionTitle}>{labels.daYun}</h3>
            <div style={styles.daYunGrid}>{result.bazi.daYun.slice(0, 8).map((d, i) => <div key={i} style={styles.daYunItem}><span style={styles.daYunAge}>{d.age}{labels.age}</span><span style={styles.daYunGanZhi}>{d.ganZhi}</span><span style={styles.daYunYear}>{d.year}</span></div>)}</div>
          </div>
          <div style={styles.resultSection}>
            <h3 style={styles.sectionTitle}>{labels.meiHua}</h3>
            <div style={styles.liuYaoBox}><div style={styles.guaName}>{result.liuyao.guaName}</div><div style={styles.guaSymbol}>{result.liuyao.benGua}</div></div>
          </div>
          <div style={styles.resultSection}>
            <h3 style={styles.sectionTitle}>{labels.lifeTrend} ({result.bazi.solar.year}{labels.startFrom})</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={result.timeline}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="age" /><YAxis domain={[0, 100]} /><Tooltip />
                <Line type="monotone" dataKey="career" name={labels.career} stroke="#8B5CF6" strokeWidth={2} />
                <Line type="monotone" dataKey="wealth" name={labels.wealth} stroke="#F59E0B" strokeWidth={2} />
                <Line type="monotone" dataKey="love" name={labels.love} stroke="#EC4899" strokeWidth={2} />
                <Line type="monotone" dataKey="health" name={labels.health} stroke="#10B981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <p style={styles.chartNote}>{labels.xAxisNote}</p>
          </div>
          <div style={styles.resultSection}>
            <h3 style={styles.sectionTitle}>{labels.monteCarlo}</h3>
            <div style={styles.chartGrid}>
              <div style={styles.chartBox}><h4>{labels.overallDistribution}</h4><ResponsiveContainer width="100%" height={150}><BarChart data={result.monteCarlo.overall.distribution}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Bar dataKey="count" fill="#8B5CF6" /></BarChart></ResponsiveContainer></div>
              <div style={styles.chartBox}><h4>{labels.dimensionAverage}</h4><ResponsiveContainer width="100%" height={150}><BarChart data={[{ name: labels.career, value: result.monteCarlo.career.mean }, { name: labels.wealth, value: result.monteCarlo.wealth.mean }, { name: labels.love, value: result.monteCarlo.love.mean }, { name: labels.health, value: result.monteCarlo.health.mean }]}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Bar dataKey="value" fill="#EC4899" /></BarChart></ResponsiveContainer></div>
            </div>
          </div>
          <div style={styles.resultSection}>
            <h3 style={styles.sectionTitle}>{labels.analysis}</h3>
            <div style={styles.analysisContent}>{result.analysis.split('\n').map((line, i) => <p key={i} style={styles.analysisLine}>{line}</p>)}</div>
          </div>
        </div>
      )}
      <footer style={styles.footer}>{labels.footer}</footer>
    </div>
  );
}

const pickerStyles = {
  pickerBtn: { width: '100%', padding: '16px', borderRadius: '8px', border: '1px solid #8B5CF6', background: 'rgba(139, 92, 246, 0.1)', color: '#fff', fontSize: '18px', cursor: 'pointer', textAlign: 'left' },
  pickerModal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', flexDirection: 'column' },
  pickerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #333' },
  pickerTitle: { fontSize: '18px', color: '#fff', fontWeight: 'bold' },
  pickerClose: { padding: '8px 24px', borderRadius: '8px', border: 'none', background: '#8B5CF6', color: '#fff', fontSize: '14px', cursor: 'pointer' },
  pickerBody: { flex: 1, display: 'flex', overflow: 'hidden' },
  pickerColumn: { flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #333' },
  columnLabel: { padding: '12px', textAlign: 'center', color: '#8B5CF6', fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #333' },
  optionsList: { flex: 1, overflow: 'auto', padding: '8px 0' },
  optionItem: { padding: '12px', textAlign: 'center', color: '#888', fontSize: '16px', cursor: 'pointer' },
  optionActive: { color: '#8B5CF6', fontWeight: 'bold', background: 'rgba(139, 92, 246, 0.1)' }
};

const styles = {
  container: { maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif', backgroundColor: '#0a0a0f', minHeight: '100vh', color: '#e5e5e5' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', borderBottom: '1px solid #333' },
  title: { fontSize: '28px', fontWeight: 'bold', background: 'linear-gradient(135deg, #8B5CF6, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  langSwitch: { padding: '8px 16px', borderRadius: '8px', border: '1px solid #8B5CF6', background: 'transparent', color: '#8B5CF6', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' },
  balanceBox: { padding: '8px 16px', background: '#1a1a25', borderRadius: '20px', fontSize: '14px' },
  freeBanner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.2))', borderRadius: '12px', margin: '16px 0', fontSize: '14px' },
  disclaimer: { padding: '10px 16px', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#F59E0B', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.3)' },
  totalSpent: { fontSize: '12px', color: '#888' },
  intro: { padding: '20px 0', fontSize: '14px', lineHeight: '1.8', color: '#aaa' },
  form: { background: '#151520', borderRadius: '16px', padding: '24px', margin: '20px 0' },
  formTitle: { fontSize: '20px', marginBottom: '20px' },
  formGroup: { marginBottom: '16px' },
  input: { width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a25', color: '#fff', fontSize: '14px' },
  genderBtns: { display: 'flex', gap: '12px' },
  genderBtn: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a25', color: '#888', fontSize: '14px', cursor: 'pointer' },
  genderBtnActive: { border: '1px solid #8B5CF6', background: 'rgba(139, 92, 246, 0.2)', color: '#fff' },
  analyzeType: { display: 'flex', gap: '12px', marginBottom: '20px' },
  typeBtn: { flex: 1, padding: '14px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a25', color: '#888', fontSize: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  typeBtnActive: { border: '1px solid #EC4899', background: 'rgba(236, 72, 153, 0.2)', color: '#fff' },
  typePrice: { fontSize: '12px', opacity: 0.8 },
  submitBtn: { width: '100%', padding: '16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #EC4899)', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' },
  submitBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  error: { marginTop: '12px', padding: '12px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#EF4444', fontSize: '14px' },
  paymentOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  paymentModal: { background: '#151520', borderRadius: '16px', padding: '32px', maxWidth: '400px', width: '90%', textAlign: 'center' },
  paymentTitle: { fontSize: '24px', marginBottom: '16px', color: '#fff' },
  paymentDesc: { fontSize: '16px', marginBottom: '8px', color: '#aaa' },
  paymentNote: { fontSize: '14px', color: '#F59E0B', marginBottom: '16px', padding: '8px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '8px' },
  qrBox: { margin: '20px auto', padding: '16px', background: '#fff', borderRadius: '12px', width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qrImage: { width: '100%', height: '100%', objectFit: 'contain' },
  cryptoBox: { margin: '20px 0', padding: '16px', background: '#1a1a25', borderRadius: '12px', border: '1px solid #8B5CF6' },
  cryptoTitle: { fontSize: '16px', fontWeight: 'bold', color: '#8B5CF6', marginBottom: '12px' },
  cryptoNetwork: { marginBottom: '12px' },
  networkLabel: { fontSize: '12px', color: '#888', marginBottom: '4px' },
  addressBox: { display: 'flex', alignItems: 'center', gap: '8px', background: '#0a0a0f', padding: '8px', borderRadius: '6px' },
  addressText: { flex: 1, fontSize: '11px', color: '#10B981', wordBreak: 'break-all', fontFamily: 'monospace' },
  copyBtn: { padding: '4px 8px', borderRadius: '4px', border: 'none', background: '#8B5CF6', color: '#fff', fontSize: '10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  cryptoNote: { fontSize: '11px', color: '#666', marginTop: '12px', textAlign: 'center' },
  networkSelect: { display: 'flex', gap: '8px', marginBottom: '12px' },
  networkBtn: { flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #333', background: '#1a1a25', color: '#888', fontSize: '12px', cursor: 'pointer' },
  networkBtnActive: { border: '1px solid #10B981', background: 'rgba(16, 185, 129, 0.2)', color: '#10B981' },
  txInputBox: { display: 'flex', gap: '8px', marginTop: '12px' },
  txInput: { flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #333', background: '#0a0a0f', color: '#fff', fontSize: '12px' },
  verifyBtn: { padding: '10px 16px', borderRadius: '6px', border: 'none', background: '#10B981', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' },
  verifyBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  txSuccess: { marginTop: '12px', padding: '8px', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '6px', color: '#10B981', fontSize: '12px', textAlign: 'center' },
  txPending: { marginTop: '12px', padding: '8px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '6px', color: '#F59E0B', fontSize: '12px', textAlign: 'center' },
  txError: { marginTop: '12px', padding: '8px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '6px', color: '#EF4444', fontSize: '12px', textAlign: 'center' },
  paymentTips: { fontSize: '12px', color: '#888', textAlign: 'left', marginBottom: '20px', lineHeight: '1.8', whiteSpace: 'pre-line' },
  paymentBtns: { display: 'flex', gap: '12px' },
  paymentCancelBtn: { flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #333', background: '#1a1a25', color: '#888', cursor: 'pointer' },
  paymentConfirmBtn: { flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#10B981', color: '#fff', cursor: 'pointer', fontWeight: 'bold' },
  waitingText: { marginTop: '12px', color: '#F59E0B', fontSize: '14px' },
  result: { marginTop: '20px' },
  resultSection: { background: '#151520', borderRadius: '16px', padding: '24px', marginBottom: '20px' },
  sectionTitle: { fontSize: '18px', marginBottom: '16px', color: '#fff' },
  baziMain: { fontSize: '24px', fontWeight: 'bold', margin: '10px 0', background: 'linear-gradient(135deg, #8B5CF6, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  freeTag: { display: 'inline-block', padding: '4px 12px', background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', borderRadius: '12px', fontSize: '12px', marginBottom: '12px' },
  baziDetail: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' },
  baziPillar: { padding: '12px', background: '#1a1a25', borderRadius: '8px', fontSize: '14px' },
  daYunGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' },
  daYunItem: { padding: '12px', background: '#1a1a25', borderRadius: '8px', textAlign: 'center' },
  daYunAge: { display: 'block', fontSize: '12px', color: '#888' },
  daYunGanZhi: { display: 'block', fontSize: '18px', fontWeight: 'bold', color: '#EC4899', margin: '4px 0' },
  daYunYear: { display: 'block', fontSize: '12px', color: '#666' },
  liuYaoBox: { textAlign: 'center', padding: '20px', background: '#1a1a25', borderRadius: '12px' },
  guaName: { fontSize: '28px', fontWeight: 'bold', color: '#F59E0B', marginBottom: '8px' },
  guaSymbol: { fontSize: '36px', letterSpacing: '8px', marginBottom: '12px' },
  chartNote: { fontSize: '12px', color: '#666', textAlign: 'center', marginTop: '8px' },
  chartGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  chartBox: { background: '#1a1a25', borderRadius: '12px', padding: '16px' },
  analysisContent: { lineHeight: '1.8', fontSize: '14px', whiteSpace: 'pre-wrap' },
  analysisLine: { marginBottom: '8px' },
  footer: { textAlign: 'center', padding: '20px 0', fontSize: '12px', color: '#444' },
  juCe: { marginTop: '12px', padding: '12px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2))', borderRadius: '8px', textAlign: 'center', fontSize: '16px', color: '#EC4899' }
};

export default App;

import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, query, setDoc } from 'firebase/firestore';
import { 
  MapPin, Plus, DollarSign, Cloud, Calendar, Navigation, Trash2, Heart, 
  Sun, Wind, Clock, PieChart, X, Droplets, CloudRain, 
  RefreshCw, CloudSnow, CloudLightning, Pencil, CheckCircle2, 
  Circle, Utensils, ShoppingBag, Palmtree, ListTodo, AlertTriangle, Timer,
  Sunset, CalendarDays
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyD9EF46xjmDEPD3bQxycbxcctYzHpzlyM8",
  authDomain: "hokkaido2026.firebaseapp.com",
  projectId: "hokkaido2026",
  storageBucket: "hokkaido2026.firebasestorage.app",
  messagingSenderId: "917390354586",
  appId: "1:917390354586:web:61814e86e81f7a4ed35723"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const appId = "hokkaido2026";
const JPY_TO_HKD = 0.052;
const HKD_TO_JPY = 1 / JPY_TO_HKD;

const START_DATE = new Date('2026-06-12T00:00:00');
const END_DATE = new Date('2026-06-19T23:59:59');

const getWeatherInfo = (code) => {
  if (code === 0) return { label: '晴朗', icon: Sun, color: 'text-yellow-300' };
  if (code <= 3) return { label: '多雲', icon: Cloud, color: 'text-slate-200' };
  if (code <= 48) return { label: '有霧', icon: Wind, color: 'text-slate-300' };
  if (code <= 67) return { label: '陣雨', icon: CloudRain, color: 'text-blue-300' };
  if (code <= 77) return { label: '下雪', icon: CloudSnow, color: 'text-indigo-100' };
  if (code <= 82) return { label: '雷雨', icon: CloudLightning, color: 'text-yellow-400' };
  return { label: '未知', icon: Cloud, color: 'text-white' };
};

const ExpensePieChart = ({ data, totalHKD }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };
  if (total === 0) return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-24 h-24 rounded-full border-2 border-slate-100 border-dashed flex items-center justify-center">
        <PieChart className="text-slate-200" size={24} />
      </div>
      <p className="text-slate-300 text-[10px] font-black uppercase mt-4 tracking-widest">暫無數據</p>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-8 py-2 w-full">
      <div className="relative w-40 h-40">
        <svg viewBox="-1 -1 2 2" className="transform -rotate-90 w-full h-full">
          {data.map((slice, i) => {
            if (slice.value === 0) return null;
            const startPercent = cumulativePercent;
            const slicePercent = slice.value / total;
            const endPercent = startPercent + slicePercent;
            cumulativePercent = endPercent;
            const [startX, startY] = getCoordinatesForPercent(startPercent);
            const [endX, endY] = getCoordinatesForPercent(endPercent);
            const largeArcFlag = slicePercent > 0.5 ? 1 : 0;
            const pathData = [`M ${startX} ${startY}`, `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`, `L 0 0`].join(' ');
            return <path key={i} d={pathData} fill={slice.color} className="transition-opacity hover:opacity-80" />;
          })}
          <circle cx="0" cy="0" r="0.78" fill="white" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">總開支 (HKD)</span>
          <span className="text-xl font-black text-slate-800 leading-none">HK${totalHKD.toLocaleString()}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-2">
        {data.map((slice, i) => slice.value > 0 && (
          <div key={i} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: slice.color }} />
            <span className="text-[10px] font-bold text-slate-400">{slice.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [activeTab, setActiveTab] = useState('itinerary');
  const [itinerary, setItinerary] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [weather, setWeather] = useState({
    temp: '--', label: '載入中', humidity: '--', windSpeed: '--', sunset: '--:--', icon: Sun, locationName: '定位中...', loading: true
  });

  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isWishlistModalOpen, setIsWishlistModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, col: '', id: '', title: '' });
  
  const [editingTripId, setEditingTripId] = useState(null);
  const [editingWishId, setEditingWishId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);

  const [newTrip, setNewTrip] = useState({ date: '2026-06-12', time: '10:00', location: '', note: '' });
  const [newExpense, setNewExpense] = useState({ item: '', amount: '', category: '飲食', currency: 'JPY', date: new Date().toISOString().split('T')[0] });
  const [newWish, setNewWish] = useState({ title: '', category: '餐廳', note: '', completed: false });

  // 1. 初始化 Meta 標籤，防止 iOS 縮放
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    document.getElementsByTagName('head')[0].appendChild(meta);
  }, []);

  const tripStatus = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(START_DATE.getFullYear(), START_DATE.getMonth(), START_DATE.getDate());
    const end = new Date(END_DATE.getFullYear(), END_DATE.getMonth(), END_DATE.getDate());
    const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));

    if (today < start) {
      const countdown = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
      return { text: `出發倒數 ${countdown} 日`, icon: Clock, color: 'bg-white/20 border-white/10' };
    } else if (today >= start && today <= end) {
      return { text: `旅行第 ${diffDays + 1} 日`, icon: Palmtree, color: 'bg-yellow-400 text-yellow-900 border-yellow-300 shadow-sm' };
    } else {
      const pastDays = Math.ceil((today - end) / (1000 * 60 * 60 * 24));
      return { text: `距離上次旅行 ${pastDays} 日`, icon: Timer, color: 'bg-white/10 border-white/5' };
    }
  }, []);

  const fetchWeather = async (lat, lon) => {
    try {
      setWeather(prev => ({ ...prev, loading: true }));
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=sunset&timezone=auto`);
      const data = await response.json();
      const current = data.current;
      const info = getWeatherInfo(current.weather_code);
      let sunsetStr = '--:--';
      if (data.daily?.sunset?.[0]) {
        sunsetStr = new Date(data.daily.sunset[0]).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      let locName = lat === 43.06 ? '札幌' : '當前位置';
      try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
          const geoData = await geoRes.json();
          locName = geoData.address.city || geoData.address.town || geoData.address.province || locName;
      } catch (e) { }
      setWeather({
        temp: Math.round(current.temperature_2m), label: info.label, humidity: current.relative_humidity_2m + '%', windSpeed: current.wind_speed_10m + ' km/h',
        sunset: sunsetStr, icon: info.icon, iconColor: info.color, locationName: locName, loading: false
      });
    } catch (error) { setWeather(prev => ({ ...prev, loading: false, label: '不可用' })); }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude), () => fetchWeather(43.06, 141.35));
    } else { fetchWeather(43.06, 141.35); }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token).catch(() => signInAnonymously(auth));
        } else { await signInAnonymously(auth); }
      } catch (error) { setAuthError("無法連接到服務。"); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => { if (u) { setUser(u); setAuthError(null); } });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const collections = ['itinerary', 'expenses', 'wishlist'];
    const unsubscribes = collections.map(colName => {
      const ref = collection(db, 'artifacts', appId, 'public', 'data', colName);
      return onSnapshot(ref, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (colName === 'itinerary') setItinerary(data.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time)));
        if (colName === 'expenses') setExpenses(data);
        if (colName === 'wishlist') setWishlist(data);
        setLoading(false);
      });
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [user]);

  const groupedItinerary = useMemo(() => {
    const groups = {};
    itinerary.forEach(item => {
      if (!groups[item.date]) groups[item.date] = [];
      groups[item.date].push(item);
    });
    return Object.entries(groups).sort((a, b) => new Date(a[0]) - new Date(b[0]));
  }, [itinerary]);

  const groupedExpenses = useMemo(() => {
    const groups = {};
    expenses.forEach(item => {
      const date = item.date || '未分類日期';
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [expenses]);

  const groupedWishlist = useMemo(() => {
    const categories = ['餐廳', '景點', '購物', '其他'];
    const groups = {};
    categories.forEach(cat => groups[cat] = wishlist.filter(item => item.category === cat));
    return Object.entries(groups);
  }, [wishlist]);

  const expenseChartData = useMemo(() => {
    const cats = {
      '飲食': { name: '飲食', color: '#f97316', value: 0 },
      '交通': { name: '交通', color: '#3b82f6', value: 0 },
      '購物': { name: '購物', color: '#ec4899', value: 0 },
      '住宿': { name: '住宿', color: '#8b5cf6', value: 0 },
      '其他': { name: '其他', color: '#94a3b8', value: 0 },
    };
    expenses.forEach(item => {
      const cat = item.category || '其他';
      if (cats[cat]) cats[cat].value += ((item.amountInJpy || 0) * JPY_TO_HKD);
    });
    return Object.values(cats);
  }, [expenses]);

  const totalExpenseHKD = useMemo(() => Math.round(expenses.reduce((sum, item) => sum + (item.amountInJpy || 0), 0) * JPY_TO_HKD), [expenses]);

  const nextTrip = useMemo(() => {
    if (itinerary.length === 0) return null;
    const now = new Date();
    const sorted = [...itinerary].sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    return sorted.find(item => new Date(`${item.date}T${item.time}`) > now) || sorted[0];
  }, [itinerary]);

  const openEditTrip = (item) => { setNewTrip({ date: item.date, time: item.time, location: item.location, note: item.note || '' }); setEditingTripId(item.id); setIsTripModalOpen(true); };
  const openEditWish = (item) => { setNewWish({ title: item.title, category: item.category, note: item.note || '', completed: item.completed }); setEditingWishId(item.id); setIsWishlistModalOpen(true); };
  const openEditExpense = (item) => { 
    setNewExpense({ item: item.item, amount: Math.round(item.amountInJpy), category: item.category, currency: 'JPY', date: item.date || new Date().toISOString().split('T')[0] }); 
    setEditingExpenseId(item.id); setIsExpenseModalOpen(true); 
  };

  const saveTrip = async () => {
    if (!user) return;
    const ref = editingTripId ? doc(db, 'artifacts', appId, 'public', 'data', 'itinerary', editingTripId) : collection(db, 'artifacts', appId, 'public', 'data', 'itinerary');
    editingTripId ? await updateDoc(ref, { ...newTrip, updatedAt: Date.now() }) : await addDoc(ref, { ...newTrip, createdAt: Date.now(), userId: user.uid });
    setNewTrip({ date: '2026-06-12', time: '10:00', location: '', note: '' }); setEditingTripId(null); setIsTripModalOpen(false);
  };

  const saveWish = async () => {
    if (!user) return;
    const ref = editingWishId ? doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', editingWishId) : collection(db, 'artifacts', appId, 'public', 'data', 'wishlist');
    editingWishId ? await updateDoc(ref, { ...newWish, updatedAt: Date.now() }) : await addDoc(ref, { ...newWish, createdAt: Date.now(), userId: user.uid });
    setNewWish({ title: '', category: '餐廳', note: '', completed: false }); setEditingWishId(null); setIsWishlistModalOpen(false);
  };

  const saveExpense = async () => {
    if (!user || !newExpense.item || !newExpense.amount) return;
    const calculatedJpy = newExpense.currency === 'JPY' ? Math.round(Number(newExpense.amount)) : Math.round(Number(newExpense.amount) * HKD_TO_JPY);
    const expenseData = { item: newExpense.item, amountInJpy: calculatedJpy, category: newExpense.category, date: newExpense.date, updatedAt: Date.now() };
    try {
      const ref = editingExpenseId ? doc(db, 'artifacts', appId, 'public', 'data', 'expenses', editingExpenseId) : collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
      editingExpenseId ? await updateDoc(ref, expenseData) : await addDoc(ref, { ...expenseData, createdAt: Date.now(), userId: user.uid });
      setNewExpense({ item: '', amount: '', category: '飲食', currency: 'JPY', date: new Date().toISOString().split('T')[0] }); setEditingExpenseId(null); setIsExpenseModalOpen(false);
    } catch (e) { console.error(e); }
  };

  const confirmDelete = async () => {
    if (!user || !deleteConfirm.id) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', deleteConfirm.col, deleteConfirm.id));
    setDeleteConfirm({ open: false, col: '', id: '', title: '' });
  };

  if (authError) return <div className="h-screen flex flex-col items-center justify-center p-6 text-center"><p className="text-slate-600 font-bold">{authError}</p><button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-full">重試</button></div>;
  if (!user) return <div className="h-screen flex flex-col items-center justify-center"><div className="w-10 h-10 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-32 text-slate-800 font-sans relative overflow-x-hidden pt-6">
      
      {/* 修正 iOS 縮放的 CSS */}
      <style>{`
        /* 避免 iOS 在 input 聚焦時縮放頁面 (強制 16px 但縮小顯示) */
        @media screen and (-webkit-min-device-pixel-ratio: 0) {
          input, select, textarea {
            font-size: 16px !important;
          }
          input[type="text"], input[type="number"], input[type="date"], input[type="time"], select {
            transform: scale(0.875); /* 使 16px 看起來像 14px */
            transform-origin: left center;
            width: 114.3% !important; /* 補償縮放後的寬度 */
            margin-right: -14.3%;
          }
        }
        /* 如果不想影響佈局，最簡單的方法是直接讓 input 變 16px 並微調 Padding */
        input, select {
          font-size: 16px !important;
        }
      `}</style>

      <header className="px-5 mb-4 max-w-md mx-auto">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-[2.5rem] p-5 text-white shadow-xl shadow-blue-100 relative overflow-hidden active:scale-95 transition-transform cursor-pointer" onClick={() => navigator.geolocation?.getCurrentPosition(pos => fetchWeather(pos.coords.latitude, pos.coords.longitude))}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="flex justify-between items-center mb-4 relative z-10">
               <div className="flex items-center gap-1.5 bg-black/10 px-2.5 py-1 rounded-full backdrop-blur-sm border border-white/5"><MapPin size={10} className="text-blue-200" /><span className="text-[9px] font-black uppercase tracking-[0.1em]">{weather.locationName}</span>{weather.loading && <RefreshCw size={8} className="animate-spin" />}</div>
               <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${tripStatus.color} backdrop-blur-md border shadow-sm`}><tripStatus.icon size={11} /><span className="text-[10px] font-black tracking-tight">{tripStatus.text}</span></div>
            </div>
            <div className="flex justify-between items-center relative z-10">
              <div className="flex-1 pr-4 border-r border-white/20">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">下一站預告</p>
                {nextTrip ? (<div><h2 className="text-[15px] font-black leading-tight line-clamp-1">{nextTrip.note || nextTrip.location}</h2><div className="flex items-center gap-1.5 mt-1 opacity-90"><Clock size={11} /><span className="text-[11px] font-bold">{nextTrip.time}</span></div></div>) : (<p className="text-xs font-bold opacity-60 italic">無安排行程</p>)}
              </div>
              <div className="flex items-center gap-3 pl-4">
                <div className="text-right"><div className="flex items-start"><h2 className="text-3xl font-black tracking-tighter">{weather.temp}</h2><span className="text-sm font-bold mt-1">°C</span></div><p className="text-[9px] font-black uppercase tracking-tighter opacity-80">{weather.label}</p></div>
                {weather.loading ? <RefreshCw size={24} className="animate-spin opacity-50" /> : <weather.icon size={36} className={`${weather.iconColor} drop-shadow-md`} />}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 flex gap-4">
                <div className="flex items-center gap-1.5"><Droplets size={11} className="text-blue-200" /><span className="text-[10px] font-black">{weather.humidity}</span></div>
                <div className="flex items-center gap-1.5"><Wind size={11} className="text-blue-200" /><span className="text-[10px] font-black">{weather.windSpeed}</span></div>
                <div className="flex items-center gap-1.5 border-l border-white/10 pl-4"><Sunset size={11} className="text-amber-200" /><span className="text-[10px] font-black">{weather.sunset}</span></div>
            </div>
          </div>
      </header>

      <main className="px-4 max-w-md mx-auto space-y-6">
        {activeTab === 'itinerary' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-md font-black flex items-center gap-2 px-1"><Calendar className="text-blue-500" size={18} /> 行程規劃</h2>
            {groupedItinerary.length === 0 ? (<div className="p-12 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200 text-slate-300 font-black italic">尚無安排</div>) : (
              groupedItinerary.map(([date, items]) => (
                <div key={date} className="space-y-3">
                  <div className="flex items-center gap-3 px-1">
                    <div className={`px-3 py-1 rounded-xl font-black text-xs ${new Date().toDateString() === new Date(date).toDateString() ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-200/50 text-slate-500'}`}>{new Date(date).toLocaleDateString('zh-HK', { month: 'short', day: 'numeric' })}</div>
                    <div className="h-px flex-1 bg-slate-200" /><span className="text-[10px] font-black text-slate-300 uppercase italic">{new Date(date).toLocaleDateString('zh-HK', { weekday: 'short' })}</span>
                  </div>
                  <div className="space-y-2.5">
                    {items.map((item) => (
                      <div key={item.id} className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center group active:bg-slate-50 transition-colors">
                        <div className="flex items-start gap-3"><div className="flex flex-col items-center pt-0.5 min-w-[32px]"><span className="text-[10px] font-black text-blue-500 leading-none">{item.time}</span></div><div className="flex-1"><h3 className="font-black text-slate-800 text-[14px]">{item.note || item.location}</h3>{item.note && (<p className="text-slate-400 text-[10px] font-bold mt-0.5 italic flex items-center gap-1"><MapPin size={9} /> {item.location}</p>)}</div></div>
                        <div className="flex gap-0.5 opacity-60 group-hover:opacity-100"><button onClick={() => openEditTrip(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors"><Pencil size={15} /></button><button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`, '_blank')} className="p-2 text-blue-500 rounded-xl transition-colors"><Navigation size={15} /></button><button onClick={() => setDeleteConfirm({ open: true, col: 'itinerary', id: item.id, title: item.note || item.location })} className="p-2 text-pink-400 hover:text-pink-600 transition-colors"><Trash2 size={15} /></button></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'wishlist' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-md font-black flex items-center gap-2 px-1"><ListTodo className="text-amber-500" size={18} /> 願望清單</h2>
            {groupedWishlist.map(([cat, items]) => items.length > 0 && (
              <div key={cat} className="space-y-3">
                <div className="flex items-center gap-2 px-1"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{cat}</span><div className="h-px flex-1 bg-slate-100" /></div>
                <div className="grid gap-2.5">
                  {items.map((item) => (
                    <div key={item.id} className={`bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center transition-all group ${item.completed ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3"><button onClick={async () => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', item.id), { completed: !item.completed })} className={`transition-colors ${item.completed ? 'text-amber-500' : 'text-slate-200 hover:text-amber-300'}`}>{item.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}</button><div><h3 className={`font-black text-slate-800 text-[14px] ${item.completed ? 'line-through' : ''}`}>{item.title}</h3>{item.note && <p className="text-slate-400 text-[9px] font-bold mt-0.5">{item.note}</p>}</div></div>
                      <div className="flex gap-0.5 opacity-60 group-hover:opacity-100"><button onClick={() => openEditWish(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors"><Pencil size={15} /></button><button onClick={() => setDeleteConfirm({ open: true, col: 'wishlist', id: item.id, title: item.title })} className="p-2 text-pink-400 hover:text-pink-600 transition-colors"><Trash2 size={15} /></button></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
               <p className="text-slate-300 text-[9px] font-black uppercase mb-4 tracking-[0.2em] text-center opacity-80">支出分析 (HKD)</p>
               <ExpensePieChart data={expenseChartData} totalHKD={totalExpenseHKD} />
            </div>
            
            <div className="space-y-6">
              <h2 className="text-md font-black flex items-center gap-2 px-1"><DollarSign className="text-emerald-500" size={18} /> 消費紀錄</h2>
              {groupedExpenses.length === 0 ? (<div className="p-12 text-center text-slate-300 italic font-black bg-white rounded-[2.5rem]">尚無紀錄</div>) : (
                groupedExpenses.map(([date, items]) => (
                  <div key={date} className="space-y-3">
                    <div className="flex items-center gap-3 px-1">
                      <div className="px-3 py-1 rounded-xl bg-slate-100 text-slate-500 font-black text-xs">{date}</div>
                      <div className="h-px flex-1 bg-slate-100" />
                      <span className="text-[10px] font-bold text-slate-400">當日小計: HK${Math.round(items.reduce((s, i) => s + (i.amountInJpy || 0), 0) * JPY_TO_HKD)}</span>
                    </div>
                    <div className="space-y-2.5">
                      {items.map((item) => (
                        <div key={item.id} className="bg-white p-4 rounded-[2rem] shadow-sm flex justify-between items-center border border-slate-50 group active:scale-98 transition-transform">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-md shadow-inner">
                              {item.category === '飲食' ? '🍱' : item.category === '交通' ? '🚆' : item.category === '購物' ? '🛍️' : item.category === '住宿' ? '🏨' : '🏷️'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-black text-slate-800 text-[13px] leading-tight">{item.item}</p>
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[8px] font-black text-slate-400 uppercase tracking-tighter">{item.category}</span>
                              </div>
                              <p className="text-[9px] text-slate-300 font-bold uppercase mt-0.5 tracking-wider">¥{Math.round(item.amountInJpy || 0).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <p className="font-black text-emerald-600 text-[13px] mr-2">HK${Math.round((item.amountInJpy || 0) * JPY_TO_HKD).toLocaleString()}</p>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditExpense(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors"><Pencil size={15} /></button>
                              <button onClick={() => setDeleteConfirm({ open: true, col: 'expenses', id: item.id, title: item.item })} className="p-2 text-pink-400 hover:text-pink-600 transition-colors"><Trash2 size={15} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-32 right-6 flex flex-col gap-3 items-end z-40">
        {activeTab === 'itinerary' && <button onClick={() => { setEditingTripId(null); setNewTrip({ date: '2026-06-12', time: '10:00', location: '', note: '' }); setIsTripModalOpen(true); }} className="w-14 h-14 bg-blue-500 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-all border-4 border-white"><Plus size={32} /></button>}
        {activeTab === 'wishlist' && <button onClick={() => { setEditingWishId(null); setNewWish({ title: '', category: '餐廳', note: '', completed: false }); setIsWishlistModalOpen(true); }} className="w-14 h-14 bg-amber-400 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-all border-4 border-white"><Plus size={32} /></button>}
        {activeTab === 'expenses' && <button onClick={() => { setEditingExpenseId(null); setNewExpense({ item: '', amount: '', category: '飲食', currency: 'JPY', date: new Date().toISOString().split('T')[0] }); setIsExpenseModalOpen(true); }} className="w-14 h-14 bg-emerald-500 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-all border-4 border-white"><Plus size={28} /></button>}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-6 z-50 pointer-events-none">
        <nav className="max-w-[300px] mx-auto bg-white/95 backdrop-blur-xl shadow-2xl rounded-[2.5rem] p-1.5 flex justify-around items-center border border-white/50 pointer-events-auto">
          {[
            { id: 'itinerary', icon: Calendar, label: '行程', color: 'bg-blue-500' },
            { id: 'wishlist', icon: ListTodo, label: '願望', color: 'bg-amber-400' },
            { id: 'expenses', icon: DollarSign, label: '支出', color: 'bg-emerald-500' },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-4 rounded-[2.2rem] flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === tab.id ? `${tab.color} text-white shadow-lg scale-105` : 'text-slate-400'}`}>
              <tab.icon size={18} /><span className="text-[9px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Modals */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeleteConfirm({ ...deleteConfirm, open: false })} />
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative z-10 text-center animate-in zoom-in-95"><h3 className="text-xl font-black text-slate-800 mb-2">確定要刪除？</h3><p className="text-slate-400 text-sm mb-8">「{deleteConfirm.title}」</p><div className="grid grid-cols-2 gap-3"><button onClick={() => setDeleteConfirm({ ...deleteConfirm, open: false })} className="p-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-sm">取消</button><button onClick={confirmDelete} className="p-4 bg-pink-500 text-white rounded-2xl font-black text-sm shadow-lg">確認刪除</button></div></div>
        </div>
      )}

      {isTripModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsTripModalOpen(false)} />
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative z-10 animate-in zoom-in-95">
            <div className="mb-6 text-center font-black uppercase tracking-widest text-xs text-slate-400">{editingTripId ? '編輯行程' : '新增目的地'}</div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2"><input type="date" value={newTrip.date} onChange={e => setNewTrip({...newTrip, date: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: '16px' }} /><input type="time" value={newTrip.time} onChange={e => setNewTrip({...newTrip, time: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: '16px' }} /></div>
              <input type="text" placeholder="地點" value={newTrip.location} onChange={e => setNewTrip({...newTrip, location: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: '16px' }} />
              <input type="text" placeholder="顯示名稱 / 筆記" value={newTrip.note} onChange={e => setNewTrip({...newTrip, note: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: '16px' }} />
              <button onClick={saveTrip} className="w-full bg-blue-500 text-white p-4 rounded-xl font-black shadow-lg mt-2">確認儲存</button>
            </div>
          </div>
        </div>
      )}

      {isWishlistModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsWishlistModalOpen(false)} />
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative z-10 animate-in zoom-in-95">
            <div className="mb-6 text-center font-black uppercase tracking-widest text-xs text-slate-400">{editingWishId ? '編輯願望' : '新增願望'}</div>
            <div className="space-y-3">
              <div className="flex gap-2"><input type="text" placeholder="項目名稱" value={newWish.title} onChange={e => setNewWish({...newWish, title: e.target.value})} className="flex-1 p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-amber-500" style={{ fontSize: '16px' }} /><select value={newWish.category} onChange={e => setNewWish({...newWish, category: e.target.value})} className="p-4 rounded-xl bg-slate-50 font-black outline-none" style={{ fontSize: '16px' }}><option>餐廳</option><option>景點</option><option>購物</option><option>其他</option></select></div>
              <input type="text" placeholder="筆記" value={newWish.note} onChange={e => setNewWish({...newWish, note: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-amber-500" style={{ fontSize: '16px' }} />
              <button onClick={saveWish} className="w-full bg-amber-400 text-white p-4 rounded-xl font-black shadow-lg mt-2">確認儲存</button>
            </div>
          </div>
        </div>
      )}

      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsExpenseModalOpen(false)} />
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative z-10 animate-in zoom-in-95">
            <div className="mb-6 text-center font-black uppercase tracking-widest text-xs text-slate-400">{editingExpenseId ? '編輯消費' : '紀錄消費'}</div>
            <div className="space-y-3">
              <input type="date" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-emerald-500 mb-2" style={{ fontSize: '16px' }} />
              <input type="text" placeholder="消費項目 (如: 拉麵)" value={newExpense.item} onChange={e => setNewExpense({...newExpense, item: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-emerald-500" style={{ fontSize: '16px' }} />
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input type="number" placeholder="金額" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-emerald-500" style={{ fontSize: '16px' }} />
                  <button onClick={() => setNewExpense(p => ({ ...p, currency: p.currency === 'JPY' ? 'HKD' : 'JPY' }))} className="absolute right-2 top-2 bottom-2 px-2 bg-white text-[9px] font-black rounded-lg border">{newExpense.currency}</button>
                </div>
                <select value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})} className="p-4 rounded-xl bg-slate-50 font-bold outline-none" style={{ fontSize: '16px' }}><option>飲食</option><option>交通</option><option>購物</option><option>住宿</option><option>其他</option></select>
              </div>
              <button onClick={saveExpense} className="w-full bg-emerald-500 text-white p-4 rounded-xl font-black shadow-lg mt-2">確認儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

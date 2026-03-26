import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, query, setDoc } from 'firebase/firestore';
import { 
  MapPin, Plus, DollarSign, Cloud, Calendar, Navigation, Trash2, Heart, 
  Sun, Wind, Clock, PieChart, X, Droplets, CloudRain, 
  RefreshCw, CloudSnow, CloudLightning, Pencil, CheckCircle2, 
  Circle, Utensils, ShoppingBag, Palmtree, ListTodo, AlertTriangle, ReceiptText
} from 'lucide-react';

/**
 * 💡 iPhone 安裝建議：
 * 1. 在 Safari 打開此網頁
 * 2. 點擊「分享」
 * 3. 選擇「加入主畫面」
 */

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

const getWeatherInfo = (code) => {
  if (code === 0) return { label: '晴朗', icon: Sun, color: 'text-yellow-300' };
  if (code <= 3) return { label: '多雲', icon: Cloud, color: 'text-slate-200' };
  if (code <= 48) return { label: '有霧', icon: Wind, color: 'text-slate-300' };
  if (code <= 67) return { label: '陣雨', icon: CloudRain, color: 'text-blue-300' };
  if (code <= 77) return { label: '下雪', icon: CloudSnow, color: 'text-indigo-100' };
  if (code <= 82) return { label: '雷雨', icon: CloudLightning, color: 'text-yellow-400' };
  return { label: '未知', icon: Cloud, color: 'text-white' };
};

const ExpensePieChart = ({ data, totalJPY, totalHKD }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cumulativePercent = 0;

  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="w-24 h-24 rounded-full border-2 border-slate-100 border-dashed flex items-center justify-center">
          <PieChart className="text-slate-200" size={24} />
        </div>
        <p className="text-slate-300 text-[10px] font-black uppercase mt-4 tracking-widest">暫無數據</p>
      </div>
    );
  }

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
            const pathData = [
              `M ${startX} ${startY}`,
              `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
              `L 0 0`,
            ].join(' ');

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
    temp: '--',
    label: '載入中',
    humidity: '--',
    windSpeed: '--',
    icon: Sun,
    locationName: '定位中...',
    loading: true
  });

  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isWishlistModalOpen, setIsWishlistModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, col: '', id: '', title: '' });
  const [editingTripId, setEditingTripId] = useState(null);

  const [newTrip, setNewTrip] = useState({ date: '2026-06-12', time: '10:00', location: '', note: '' });
  const [newExpense, setNewExpense] = useState({ item: '', amount: '', category: '飲食', currency: 'JPY' });
  const [newWish, setNewWish] = useState({ title: '', category: '餐廳', note: '', completed: false });

  useEffect(() => {
    const metaTags = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: '北海道2026' }
    ];

    metaTags.forEach(tag => {
      let element = document.querySelector(`meta[name="${tag.name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.name = tag.name;
        document.head.appendChild(element);
      }
      element.content = tag.content;
    });
  }, []);

  const fetchWeather = async (lat, lon) => {
    try {
      setWeather(prev => ({ ...prev, loading: true }));
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
      const data = await response.json();
      const current = data.current;
      const info = getWeatherInfo(current.weather_code);
      
      let locName = lat === 43.06 ? '札幌' : '當前位置';
      try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
          const geoData = await geoRes.json();
          locName = geoData.address.city || geoData.address.town || geoData.address.province || locName;
      } catch (e) { /* fallback */ }

      setWeather({
        temp: Math.round(current.temperature_2m),
        label: info.label,
        humidity: current.relative_humidity_2m + '%',
        windSpeed: current.wind_speed_10m + ' km/h',
        icon: info.icon,
        iconColor: info.color,
        locationName: locName,
        loading: false
      });
    } catch (error) {
      setWeather(prev => ({ ...prev, loading: false, label: '不可用' }));
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(43.06, 141.35)
      );
    } else {
      fetchWeather(43.06, 141.35);
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        setAuthError("無法連接到服務，請檢查網路。");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setAuthError(null); }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const collections = ['itinerary', 'expenses', 'wishlist'];
    const unsubscribes = collections.map(colName => {
      const ref = collection(db, 'artifacts', appId, 'public', 'data', colName);
      return onSnapshot(ref, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (colName === 'itinerary') {
          setItinerary(data.sort((a, b) => {
            const dateCompare = new Date(a.date) - new Date(b.date);
            return dateCompare !== 0 ? dateCompare : a.time.localeCompare(b.time);
          }));
        }
        if (colName === 'expenses') setExpenses(data);
        if (colName === 'wishlist') setWishlist(data);
        setLoading(false);
      }, (err) => console.error(err));
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
      if (cats[cat]) {
        const amountJpy = item.amountInJpy || item.amount || 0;
        cats[cat].value += (amountJpy * JPY_TO_HKD);
      }
    });
    return Object.values(cats);
  }, [expenses]);

  const totalExpenseJPY = useMemo(() => {
    const total = expenses.reduce((sum, item) => sum + (item.amountInJpy || item.amount || 0), 0);
    return Math.round(total);
  }, [expenses]);

  const totalExpenseHKD = useMemo(() => Math.round(totalExpenseJPY * JPY_TO_HKD), [totalExpenseJPY]);

  const nextTrip = useMemo(() => {
    if (itinerary.length === 0) return null;
    const now = new Date();
    const sorted = [...itinerary].sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    return sorted.find(item => new Date(`${item.date}T${item.time}`) > now) || sorted[0];
  }, [itinerary]);

  const openEditTrip = (item) => {
    setNewTrip({ date: item.date, time: item.time, location: item.location, note: item.note || '' });
    setEditingTripId(item.id);
    setIsTripModalOpen(true);
  };

  const saveTrip = async () => {
    if (!user) return;
    try {
      if (editingTripId) {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'itinerary', editingTripId);
        await updateDoc(ref, { ...newTrip, updatedAt: Date.now() });
      } else {
        const ref = collection(db, 'artifacts', appId, 'public', 'data', 'itinerary');
        await addDoc(ref, { ...newTrip, createdAt: Date.now(), userId: user.uid });
      }
      setNewTrip({ date: '2026-06-12', time: '10:00', location: '', note: '' });
      setEditingTripId(null);
      setIsTripModalOpen(false);
    } catch (e) { console.error(e); }
  };

  const toggleWishStatus = async (item) => {
    if (!user) return;
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', item.id);
      await updateDoc(ref, { completed: !item.completed });
    } catch (e) { console.error(e); }
  };

  const addItem = async (colName, itemData, resetFn, modalSetter) => {
    if (!user) return;
    try {
      const ref = collection(db, 'artifacts', appId, 'public', 'data', colName);
      await addDoc(ref, { ...itemData, createdAt: Date.now(), userId: user.uid });
      if (resetFn) resetFn();
      modalSetter(false);
    } catch (e) { console.error(e); }
  };

  const askDelete = (col, id, title) => {
    setDeleteConfirm({ open: true, col, id, title });
  };

  const confirmDelete = async () => {
    if (!user || !deleteConfirm.id) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', deleteConfirm.col, deleteConfirm.id));
      setDeleteConfirm({ open: false, col: '', id: '', title: '' });
    } catch (e) { console.error(e); }
  };

  if (authError) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center"><X size={32} /></div>
      <p className="text-slate-600 font-bold">{authError}</p>
      <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-500 text-white rounded-full font-bold">重新嘗試</button>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
      <p className="text-slate-400 font-bold animate-pulse">正在同步雲端數據...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-32 text-slate-800 font-sans relative overflow-x-hidden pt-6">
      
      {/* 優化後的透明頁首區，僅保留資訊卡片 */}
      <header className="px-5 mb-4 max-w-md mx-auto">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-[2.5rem] p-5 text-white shadow-xl shadow-blue-100 relative overflow-hidden active:scale-95 transition-transform cursor-pointer" 
               onClick={() => {
                 if (navigator.geolocation) {
                   navigator.geolocation.getCurrentPosition(pos => fetchWeather(pos.coords.latitude, pos.coords.longitude));
                 }
               }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            
            <div className="flex items-center gap-1.5 mb-3 opacity-90">
               <MapPin size={12} className="text-blue-200" />
               <span className="text-[10px] font-black uppercase tracking-widest">{weather.locationName}</span>
               {weather.loading && <RefreshCw size={10} className="animate-spin ml-auto" />}
            </div>

            <div className="flex justify-between items-center relative z-10">
              <div className="flex-1 pr-4 border-r border-white/20">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">下一站</p>
                {nextTrip ? (
                  <div>
                    <h2 className="text-[15px] font-black leading-tight line-clamp-1">
                        {nextTrip.note || nextTrip.location}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-1 opacity-90">
                      <Clock size={11} />
                      <span className="text-[11px] font-bold">{nextTrip.time} {nextTrip.note && <span className="opacity-60 ml-1">@ {nextTrip.location}</span>}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-bold opacity-60 italic">無後續行程</p>
                )}
              </div>
              
              <div className="flex items-center gap-3 pl-4">
                <div className="text-right">
                  <div className="flex items-start">
                    <h2 className="text-3xl font-black tracking-tighter">{weather.temp}</h2>
                    <span className="text-sm font-bold mt-1">°C</span>
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-tighter opacity-80">{weather.label}</p>
                </div>
                {weather.loading ? (
                   <div className="w-8 h-8 flex items-center justify-center"><RefreshCw size={20} className="animate-spin opacity-50" /></div>
                ) : (
                   <weather.icon size={36} className={`${weather.iconColor} drop-shadow-md`} />
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex gap-5">
                <div className="flex items-center gap-1.5">
                    <Droplets size={12} className="text-blue-200" />
                    <span className="text-[10px] font-black">{weather.humidity}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Wind size={12} className="text-blue-200" />
                    <span className="text-[10px] font-black">{weather.windSpeed}</span>
                </div>
            </div>
          </div>
      </header>

      <main className="px-4 max-w-md mx-auto space-y-6">
        {activeTab === 'itinerary' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-md font-black flex items-center gap-2 px-1"><Calendar className="text-blue-500" size={18} /> 行程規劃</h2>
            {groupedItinerary.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200 text-slate-300 font-black italic">尚無行程</div>
            ) : (
              groupedItinerary.map(([date, items]) => {
                const dateObj = new Date(date);
                const isToday = new Date().toDateString() === dateObj.toDateString();
                return (
                  <div key={date} className="space-y-3">
                    <div className="flex items-center gap-3 px-1">
                      <div className={`px-3 py-1 rounded-xl font-black text-xs ${isToday ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-200/50 text-slate-500'}`}>
                        {dateObj.toLocaleDateString('zh-HK', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-[10px] font-black text-slate-300 uppercase italic">{dateObj.toLocaleDateString('zh-HK', { weekday: 'short' })}</span>
                    </div>
                    <div className="space-y-2.5">
                      {items.map((item) => (
                        <div key={item.id} className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center group active:bg-slate-50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center pt-0.5 min-w-[32px]">
                              <span className="text-[10px] font-black text-blue-500 leading-none">{item.time}</span>
                            </div>
                            <div className="flex-1">
                              <h3 className="font-black text-slate-800 text-[14px]">
                                {item.note || item.location}
                              </h3>
                              {item.note && (
                                <p className="text-slate-400 text-[10px] font-bold mt-0.5 line-clamp-1 italic flex items-center gap-1">
                                  <MapPin size={9} /> {item.location}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                            <button onClick={() => openEditTrip(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors"><Pencil size={15} /></button>
                            <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`, '_blank')} className="p-2 text-blue-500 rounded-xl transition-colors"><Navigation size={15} /></button>
                            <button onClick={() => askDelete('itinerary', item.id, item.note || item.location)} className="p-2 text-slate-100 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'wishlist' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h2 className="text-md font-black flex items-center gap-2 px-1"><ListTodo className="text-amber-500" size={18} /> 必去必吃</h2>
            {groupedWishlist.map(([cat, items]) => items.length > 0 && (
              <div key={cat} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{cat}</span>
                   <div className="h-px flex-1 bg-slate-100" />
                </div>
                <div className="grid gap-2.5">
                  {items.map((item) => (
                    <div key={item.id} className={`bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center transition-all ${item.completed ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleWishStatus(item)} className={`transition-colors ${item.completed ? 'text-amber-500' : 'text-slate-200 hover:text-amber-300'}`}>
                          {item.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                        </button>
                        <div>
                          <h3 className={`font-black text-slate-800 text-[14px] ${item.completed ? 'line-through' : ''}`}>{item.title}</h3>
                          {item.note && <p className="text-slate-400 text-[9px] font-bold mt-0.5">{item.note}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {(cat === '餐廳' || cat === '景點') && (
                          <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title)}`, '_blank')} className="p-2.5 bg-slate-50 text-amber-600 rounded-xl active:bg-amber-100 transition-colors">
                            <Navigation size={15} />
                          </button>
                        )}
                        <button onClick={() => askDelete('wishlist', item.id, item.title)} className="p-2.5 text-slate-100 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                      </div>
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
               <p className="text-slate-300 text-[9px] font-black uppercase mb-4 tracking-[0.2em] text-center opacity-80">開支統計 (HKD)</p>
               <ExpensePieChart 
                 data={expenseChartData} 
                 totalJPY={totalExpenseJPY} 
                 totalHKD={totalExpenseHKD} 
               />
            </div>
            <div className="space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] px-1">支出細目</h3>
              {expenses.length === 0 ? (
                 <div className="p-12 text-center text-slate-300 italic font-black bg-white rounded-[2.5rem]">尚無開支</div>
              ) : (
                [...expenses].sort((a,b)=>b.createdAt-a.createdAt).map((item) => {
                  const amountJpy = item.amountInJpy || item.amount;
                  const amountHkd = Math.round(amountJpy * JPY_TO_HKD);
                  return (
                    <div key={item.id} className="bg-white p-4 rounded-[2rem] shadow-sm flex justify-between items-center border border-slate-50 active:scale-98 transition-transform">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-md shadow-inner">
                          {item.category === '飲食' ? '🍱' : item.category === '交通' ? '🚆' : item.category === '購物' ? '🛍️' : item.category === '住宿' ? '🏨' : '🏷️'}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-[13px] leading-tight">{item.item}</p>
                          <p className="text-[9px] text-slate-300 font-bold uppercase mt-0.5 tracking-wider">¥{Math.round(amountJpy).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-black text-emerald-600 text-[13px]">HK${amountHkd.toLocaleString()}</p>
                        </div>
                        <button onClick={() => askDelete('expenses', item.id, item.item)} className="p-2 text-slate-100 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* iPhone 專屬浮動按鈕位置 */}
      <div className="fixed bottom-32 right-6 flex flex-col gap-3 items-end z-40">
        {activeTab === 'itinerary' && (
          <button onClick={() => { setEditingTripId(null); setNewTrip({ date: '2026-06-12', time: '10:00', location: '', note: '' }); setIsTripModalOpen(true); }} className="w-14 h-14 bg-blue-500 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-all border-4 border-white animate-in zoom-in">
            <Plus size={32} />
          </button>
        )}
        {activeTab === 'wishlist' && (
          <button onClick={() => setIsWishlistModalOpen(true)} className="w-14 h-14 bg-amber-400 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-all border-4 border-white animate-in zoom-in">
            <Plus size={32} />
          </button>
        )}
        {activeTab === 'expenses' && (
          <button onClick={() => setIsExpenseModalOpen(true)} className="w-14 h-14 bg-emerald-500 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-all border-4 border-white animate-in zoom-in">
            <DollarSign size={28} />
          </button>
        )}
      </div>

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

      {/* 彈出層 Modals */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeleteConfirm({ ...deleteConfirm, open: false })} />
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative z-10 animate-in zoom-in-95 text-center">
            <h3 className="text-xl font-black text-slate-800 mb-2">確定刪除？</h3>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">項目「{deleteConfirm.title}」</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm({ ...deleteConfirm, open: false })} className="p-4 bg-slate-50 text-slate-500 rounded-2xl font-black text-sm">取消</button>
              <button onClick={confirmDelete} className="p-4 bg-red-500 text-white rounded-2xl font-black text-sm shadow-lg">刪除</button>
            </div>
          </div>
        </div>
      )}

      {isTripModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsTripModalOpen(false)} />
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative z-10 animate-in zoom-in-95">
            <div className="mb-6 text-center"><h3 className="text-xl font-black italic uppercase">{editingTripId ? '編輯目的地' : '新增目的地'}</h3></div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={newTrip.date} onChange={e => setNewTrip({...newTrip, date: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 text-xs font-bold border-none" />
                <input type="time" value={newTrip.time} onChange={e => setNewTrip({...newTrip, time: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 text-xs font-bold border-none" />
              </div>
              <input type="text" placeholder="目的地名稱" value={newTrip.location} onChange={e => setNewTrip({...newTrip, location: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 text-sm font-bold border-none" />
              <input type="text" placeholder="行程備註 (顯示為主標題)" value={newTrip.note} onChange={e => setNewTrip({...newTrip, note: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 text-sm font-bold border-none" />
              <button onClick={saveTrip} className="w-full bg-blue-500 text-white p-4 rounded-xl font-black shadow-lg active:scale-95 transition-all text-md">{editingTripId ? '更新' : '新增'}</button>
            </div>
          </div>
        </div>
      )}

      {isWishlistModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsWishlistModalOpen(false)} />
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative z-10 animate-in zoom-in-95">
            <div className="mb-6 text-center"><h3 className="text-xl font-black italic uppercase tracking-tight">新增心願</h3></div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input type="text" placeholder="項目名稱" value={newWish.title} onChange={e => setNewWish({...newWish, title: e.target.value})} className="flex-1 p-4 rounded-xl bg-slate-50 border-none text-sm font-bold" />
                <select value={newWish.category} onChange={e => setNewWish({...newWish, category: e.target.value})} className="p-4 rounded-xl bg-slate-50 border-none text-xs font-black text-amber-600">
                  <option>餐廳</option><option>景點</option><option>購物</option><option>其他</option>
                </select>
              </div>
              <input type="text" placeholder="補充資訊" value={newWish.note} onChange={e => setNewWish({...newWish, note: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold" />
              <button onClick={() => addItem('wishlist', newWish, () => setNewWish({title:'', category:'餐廳', note:'', completed:false}), setIsWishlistModalOpen)} className="w-full bg-amber-400 text-white p-4 rounded-xl font-black shadow-lg uppercase">加入清單</button>
            </div>
          </div>
        </div>
      )}

      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsExpenseModalOpen(false)} />
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl relative z-10 animate-in zoom-in-95">
            <div className="mb-6 text-center"><h3 className="text-xl font-black italic uppercase tracking-tight">紀錄開支</h3></div>
            <div className="space-y-3">
              <input type="text" placeholder="支出內容" value={newExpense.item} onChange={e => setNewExpense({...newExpense, item: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold" />
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input type="number" placeholder="金額" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold" />
                  <button onClick={() => setNewExpense(p => ({ ...p, currency: p.currency === 'JPY' ? 'HKD' : 'JPY' }))} className="absolute right-2 top-2 bottom-2 px-2 bg-white text-[9px] font-black text-emerald-600 rounded-lg shadow-sm">{newExpense.currency}</button>
                </div>
                <select value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})} className="p-4 rounded-xl bg-slate-50 border-none text-xs font-bold text-slate-600">
                  <option>飲食</option><option>交通</option><option>購物</option><option>住宿</option><option>其他</option>
                </select>
              </div>
              <button onClick={() => addItem('expenses', { item: newExpense.item, amountInJpy: newExpense.currency === 'JPY' ? Math.round(Number(newExpense.amount)) : Math.round(Number(newExpense.amount) * HKD_TO_JPY), inputAmount: Number(newExpense.amount), inputCurrency: newExpense.currency, category: newExpense.category }, () => setNewExpense({...newExpense, item:'', amount:''}), setIsExpenseModalOpen)} className="w-full bg-emerald-500 text-white p-4 rounded-xl font-black shadow-lg uppercase">確認記帳</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

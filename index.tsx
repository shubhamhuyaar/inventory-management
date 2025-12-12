import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { read, utils } from 'xlsx';
import { io, Socket } from 'socket.io-client';
import { 
  LayoutDashboard, Package, ShoppingCart, Users, 
  LogOut, Plus, Search, Bell, 
  Moon, Sun, TrendingUp, AlertTriangle, X,
  Edit, Trash2, Menu, CheckSquare, Square,
  FileText, Printer, Download, Upload, Wifi, WifiOff,
  Calendar, DollarSign, User as UserIcon, Server, Globe,
  Settings, Copy, ExternalLink, Code, Rocket, Share2
} from 'lucide-react';

// ==========================================
// 🛠️ MOCK BACKEND & REALTIME SIMULATION
// ==========================================

// Empty default to ensure honest "Offline" state until configured
const DEFAULT_SERVER_URL = ""; 

// --- Types ---
type UserRole = 'admin' | 'manager' | 'staff';
type ConnectionState = 'connected' | 'connecting' | 'disconnected';

interface User {
  _id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  storeId?: string;
  permissions?: string[]; 
  createdAt: string;
}

interface Store {
  _id: string;
  name: string;
  location: string;
  createdAt: string;
}

interface Product {
  _id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: string;
  storeId: string;
  createdAt: string;
  updatedAt: string;
}

interface BillItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
}

interface Bill {
  _id: string;
  billNo: string;
  partyName: string;
  vehicleName: string;
  address: string;
  reference: string;
  days: number;
  items: BillItem[];
  totalAmount: number;
  paymentMode: 'Cash' | 'Online';
  status: 'Paid' | 'Pending';
  createdBy: string; // User ID
  createdByName: string;
  createdAt: string;
}

interface Sale {
  _id: string;
  productId: string;
  productName: string;
  quantity: number;
  total: number;
  storeId: string;
  date: string;
}

// --- Socket Manager (Hybrid: Local Mock + Real Internet) ---
class SocketManager {
  private listeners: { [key: string]: Function[] } = {};
  private realSocket: Socket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private apiReference: any = null; // To call sync methods
  
  // Storage key for cross-tab sync in local mode
  private readonly STORAGE_KEY = 'inv_socket_emit_';

  constructor() {
    // 1. Listen for local storage changes (Cross-tab sync)
    window.addEventListener('storage', (e) => {
      if (this.connectionState !== 'connected' && e.key?.startsWith(this.STORAGE_KEY)) {
        const eventData = JSON.parse(e.newValue || '{}');
        // Handle sync before triggering UI
        if(this.apiReference) this.apiReference.syncRemoteEvent(eventData.event, eventData.data);
        this.triggerLocal(eventData.event, eventData.data);
      }
    });

    // 2. Connect automatically if URL exists
    const targetUrl = localStorage.getItem('inv_server_url') || DEFAULT_SERVER_URL;
    if (targetUrl) {
      this.connect(targetUrl);
    } else {
      this.connectionState = 'disconnected';
    }
  }

  setApi(api: any) {
    this.apiReference = api;
  }

  connect(url: string) {
    if (!url) return;
    
    if(this.realSocket) {
      this.realSocket.disconnect();
      this.realSocket = null;
    }
    
    localStorage.setItem('inv_server_url', url);

    console.log(`🔌 Connecting to: ${url}`);
    this.updateState('connecting');
    
    this.realSocket = io(url, {
      transports: ['websocket', 'polling'], 
      reconnectionAttempts: 3,
      timeout: 5000
    });
    
    this.realSocket.on('connect', () => {
      console.log('✅ Connected to Real Server');
      this.updateState('connected');
    });

    this.realSocket.on('connect_error', (err) => {
      console.warn('Connection Error (Using Local Mode):', err.message);
      this.updateState('disconnected');
    });

    this.realSocket.on('disconnect', () => {
      console.log('❌ Disconnected from Real Server');
      this.updateState('disconnected');
    });

    // Proxy incoming server events to local listeners
    ['productChange', 'billChange', 'userChange'].forEach(ev => {
      this.realSocket?.on(ev, (data: any) => {
        console.log(`📥 Received ${ev}`, data);
        // CRITICAL: Update local storage with the incoming data
        if(this.apiReference) {
           this.apiReference.syncRemoteEvent(ev, data);
        }
        this.triggerLocal(ev, data);
      });
    });
  }

  disconnect() {
    if(this.realSocket) {
      this.realSocket.disconnect();
      this.realSocket = null;
    }
    localStorage.removeItem('inv_server_url');
    this.updateState('disconnected');
  }

  // Register listener
  on(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event: string, callback: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  // Internal trigger for listeners
  private triggerLocal(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  private updateState(newState: ConnectionState) {
    this.connectionState = newState;
    this.triggerLocal('connectionChange', newState);
  }

  // Main Emit function
  emit(event: string, data: any) {
    // Optimistic UI update (trigger local immediately)
    // We do NOT call syncRemoteEvent here because we just performed the action locally in the API method
    this.triggerLocal(event, data);

    if (this.connectionState === 'connected' && this.realSocket) {
      // Send to Cloud Server
      this.realSocket.emit(event, data);
    } else {
      // Local Mode: Persist to storage for other tabs
      localStorage.setItem(this.STORAGE_KEY + Date.now(), JSON.stringify({ event, data }));
    }
  }
  
  get status() { return this.connectionState; }
}

const socket = new SocketManager();

// --- Mock Database ---
const DB_KEYS = {
  USERS: 'inv_users',
  PRODUCTS: 'inv_products',
  STORES: 'inv_stores',
  SALES: 'inv_sales',
  BILLS: 'inv_bills',
  AUTH: 'inv_auth_token'
};

const INITIAL_DATA = {
  users: [
    { 
      _id: 'u1', 
      name: 'Admin User', 
      username: 'admin',
      email: 'admin@demo.com', 
      role: 'admin', 
      permissions: ['dashboard', 'products', 'sales', 'users', 'bills'], 
      createdAt: new Date().toISOString() 
    },
    { 
      _id: 'u2', 
      name: 'Staff John', 
      username: 'staff',
      email: 'staff@demo.com', 
      role: 'staff', 
      permissions: ['dashboard', 'products', 'bills'], 
      createdAt: new Date().toISOString() 
    },
  ] as User[],
  stores: [
    { _id: 's1', name: 'Main Warehouse', location: 'New York, NY', createdAt: new Date().toISOString() }
  ] as Store[],
  products: [
    { _id: 'p1', name: 'Oil Filter', sku: 'PART-001', price: 15, stock: 100, category: 'Parts', storeId: 's1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { _id: 'p2', name: 'Brake Pads', sku: 'PART-002', price: 45, stock: 40, category: 'Parts', storeId: 's1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ] as Product[],
  bills: [] as Bill[]
};

class MockBackend {
  private get<T>(key: string): T[] {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  private set(key: string, data: any[]) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  constructor() {
    if (!localStorage.getItem(DB_KEYS.USERS)) this.set(DB_KEYS.USERS, INITIAL_DATA.users);
    if (!localStorage.getItem(DB_KEYS.PRODUCTS)) this.set(DB_KEYS.PRODUCTS, INITIAL_DATA.products);
    if (!localStorage.getItem(DB_KEYS.BILLS)) this.set(DB_KEYS.BILLS, INITIAL_DATA.bills);
  }

  // --- SYNC MECHANISM (Peer-to-Peer logic) ---
  syncRemoteEvent(event: string, payload: any) {
    if (!payload || !payload.type) return;

    if (event === 'productChange') {
      const products = this.get<Product>(DB_KEYS.PRODUCTS);
      
      if (payload.type === 'add' && payload.data) {
        if (!products.find(p => p._id === payload.data._id)) {
          products.push(payload.data);
          this.set(DB_KEYS.PRODUCTS, products);
        }
      } else if (payload.type === 'delete' && payload.id) {
        const filtered = products.filter(p => p._id !== payload.id);
        this.set(DB_KEYS.PRODUCTS, filtered);
      } else if (payload.type === 'update' && payload.data) {
        const idx = products.findIndex(p => p._id === payload.data._id);
        if (idx !== -1) {
          products[idx] = payload.data;
          this.set(DB_KEYS.PRODUCTS, products);
        }
      } else if (payload.type === 'stockUpdate' && payload.updates) {
        payload.updates.forEach((u: any) => {
          const p = products.find(prod => prod._id === u.id);
          if (p) p.stock = u.stock;
        });
        this.set(DB_KEYS.PRODUCTS, products);
      } else if (payload.type === 'fullSync' && payload.data) {
         this.set(DB_KEYS.PRODUCTS, payload.data);
      }
    }

    if (event === 'billChange') {
      const bills = this.get<Bill>(DB_KEYS.BILLS);
      if (payload.type === 'add' && payload.data) {
        if (!bills.find(b => b._id === payload.data._id)) {
           bills.unshift(payload.data);
           this.set(DB_KEYS.BILLS, bills);
        }
      } else if (payload.type === 'update' && payload.data) {
        const idx = bills.findIndex(b => b._id === payload.data._id);
        if (idx !== -1) {
          bills[idx] = payload.data;
          this.set(DB_KEYS.BILLS, bills);
        }
      }
    }
    
    if (event === 'userChange') {
       const users = this.get<User>(DB_KEYS.USERS);
       if(payload.type === 'add' && payload.data) {
          if(!users.find(u => u._id === payload.data._id)) {
             users.push(payload.data);
             this.set(DB_KEYS.USERS, users);
          }
       }
    }
  }

  // Auth
  async login(identifier: string): Promise<{ user: User, token: string }> {
    await this.delay(300);
    const users = this.get<User>(DB_KEYS.USERS);
    // Allow login by email OR username
    const user = users.find(u => u.email === identifier || u.username === identifier);
    if (!user) throw new Error('User not found. Try username "admin" or "staff".');
    return { user, token: 'fake-jwt-' + user._id };
  }

  async createUser(userData: Omit<User, '_id' | 'createdAt'>): Promise<User> {
    await this.delay(300);
    const users = this.get<User>(DB_KEYS.USERS);
    if (users.find(u => u.email === userData.email)) throw new Error('Email exists');
    if (users.find(u => u.username === userData.username)) throw new Error('Username exists');
    
    const newUser: User = { ...userData, _id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
    this.set(DB_KEYS.USERS, [...users, newUser]);
    
    // Emit full data for sync
    socket.emit('userChange', { type: 'add', data: newUser });
    return newUser;
  }

  // Products & Inventory
  async getProducts(): Promise<Product[]> {
    return this.get<Product>(DB_KEYS.PRODUCTS);
  }

  async createProduct(product: Omit<Product, '_id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    await this.delay(300);
    const products = this.get<Product>(DB_KEYS.PRODUCTS);
    const newProduct: Product = { 
      ...product, _id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    this.set(DB_KEYS.PRODUCTS, [...products, newProduct]);
    
    // Emit full data
    socket.emit('productChange', { type: 'add', data: newProduct });
    return newProduct;
  }

  async deleteProduct(id: string): Promise<void> {
    const products = this.get<Product>(DB_KEYS.PRODUCTS).filter(p => p._id !== id);
    this.set(DB_KEYS.PRODUCTS, products);
    socket.emit('productChange', { type: 'delete', id });
  }

  // Updated to accept raw data array from SheetJS
  async importInventory(data: any[]): Promise<void> {
    const products = this.get<Product>(DB_KEYS.PRODUCTS);
    let updatedCount = 0;
    
    for (const row of data) {
      // ... (normalization logic remains same) ...
      const normalizedRow: any = {};
      Object.keys(row).forEach(key => {
        normalizedRow[key.toLowerCase().trim()] = row[key];
      });

      const name = normalizedRow['name'] || normalizedRow['product name'] || normalizedRow['product'] || normalizedRow['item'];
      const sku = normalizedRow['sku'] || normalizedRow['code'] || normalizedRow['id'] || normalizedRow['part no'];
      const category = normalizedRow['category'] || normalizedRow['type'] || normalizedRow['group'] || 'General';
      const price = Number(normalizedRow['price'] || normalizedRow['cost'] || normalizedRow['rate'] || normalizedRow['amount'] || 0);
      const stock = Number(normalizedRow['stock'] || normalizedRow['quantity'] || normalizedRow['qty'] || normalizedRow['count'] || 0);

      if (!name) continue; 
      const finalSku = sku ? String(sku) : `GEN-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const existingIdx = products.findIndex(p => p.sku === finalSku);
      
      if (existingIdx >= 0) {
        products[existingIdx] = { 
          ...products[existingIdx], name, stock, price, category, updatedAt: new Date().toISOString() 
        };
      } else {
        products.push({
          _id: Math.random().toString(36).substr(2, 9),
          name, sku: finalSku, category, price, stock, storeId: 's1',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
      }
      updatedCount++;
    }
    
    this.set(DB_KEYS.PRODUCTS, products);
    // Send full data update to ensure everyone has the bulk import
    socket.emit('productChange', { type: 'fullSync', data: products });
  }

  // Bills
  async getBills(user: User): Promise<Bill[]> {
    const bills = this.get<Bill>(DB_KEYS.BILLS);
    if (user.role === 'admin') return bills;
    return bills.filter(b => b.createdBy === user._id);
  }

  async createBill(billData: Omit<Bill, '_id' | 'billNo' | 'createdAt'>): Promise<Bill> {
    await this.delay(500);
    const bills = this.get<Bill>(DB_KEYS.BILLS);
    const products = this.get<Product>(DB_KEYS.PRODUCTS);
    const updates: {id: string, stock: number}[] = [];

    // Deduct Stock
    billData.items.forEach(item => {
      const pIdx = products.findIndex(p => p._id === item.productId);
      if (pIdx >= 0) {
        if(products[pIdx].stock < item.quantity) throw new Error(`Insufficient stock for ${item.productName}`);
        products[pIdx].stock -= item.quantity;
        products[pIdx].updatedAt = new Date().toISOString();
        updates.push({ id: products[pIdx]._id, stock: products[pIdx].stock });
      }
    });

    const newBill: Bill = {
      ...billData,
      _id: Math.random().toString(36).substr(2, 9),
      billNo: `INV-${new Date().getFullYear()}-${(bills.length + 1).toString().padStart(4, '0')}`,
      createdAt: new Date().toISOString()
    };

    this.set(DB_KEYS.PRODUCTS, products);
    this.set(DB_KEYS.BILLS, [newBill, ...bills]);
    
    // Emit precise stock updates and new bill data
    socket.emit('productChange', { type: 'stockUpdate', updates });
    socket.emit('billChange', { type: 'add', data: newBill });
    
    return newBill;
  }

  async updateBillStatus(id: string, status: 'Paid' | 'Pending'): Promise<void> {
    const bills = this.get<Bill>(DB_KEYS.BILLS);
    const idx = bills.findIndex(b => b._id === id);
    if(idx !== -1) {
      bills[idx].status = status;
      this.set(DB_KEYS.BILLS, bills);
      socket.emit('billChange', { type: 'update', data: bills[idx] });
    }
  }

  // Users
  async getUsers(): Promise<User[]> { return this.get<User>(DB_KEYS.USERS); }

  private delay(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

const api = new MockBackend();
// Link API to SocketManager for syncing
socket.setApi(api);

// ==========================================
// 🎨 FRONTEND COMPONENTS
// ==========================================

const AuthContext = createContext<{ user: User | null; login: (e: string) => Promise<void>; logout: () => void; }>({ user: null, login: async () => {}, logout: () => {} });
const ThemeContext = createContext<{ isDark: boolean; toggleTheme: () => void; }>({ isDark: false, toggleTheme: () => {} });

// --- Reusable ---
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${className}`}>{children}</div>
);
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }> = ({ children, className = '', variant = 'primary', ...props }) => {
  const v = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    secondary: 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white'
  };
  return <button className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${v[variant]} ${className}`} {...props}>{children}</button>;
};

// IMPROVED INPUT VISIBILITY
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500" {...props} />
);
const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-gray-100" {...props} />
);

// --- Modules ---

const DashboardStats = () => {
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [stats, setStats] = useState({ revenue: 0, bills: 0, pending: 0, products: 0 });
  const { user } = useContext(AuthContext);

  const calculateStats = async () => {
    if (!user) return;
    const bills = await api.getBills(user);
    const products = await api.getProducts();
    
    const now = new Date();
    const filteredBills = bills.filter(b => {
      const d = new Date(b.createdAt);
      if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return d.getFullYear() === now.getFullYear();
    });

    setStats({
      products: products.length,
      bills: filteredBills.length,
      pending: filteredBills.filter(b => b.status === 'Pending').length,
      revenue: filteredBills.reduce((acc, curr) => acc + curr.totalAmount, 0)
    });
  };

  useEffect(() => {
    calculateStats();
    socket.on('billChange', calculateStats);
    socket.on('productChange', calculateStats);
    return () => { socket.off('billChange', calculateStats); socket.off('productChange', calculateStats); };
  }, [period, user]);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg flex text-sm">
          <button onClick={() => setPeriod('month')} className={`px-3 py-1 rounded-md text-gray-700 dark:text-gray-300 ${period === 'month' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : ''}`}>This Month</button>
          <button onClick={() => setPeriod('year')} className={`px-3 py-1 rounded-md text-gray-700 dark:text-gray-300 ${period === 'year' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : ''}`}>This Year</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="flex items-center gap-4">
          <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full"><DollarSign className="w-6 h-6 text-green-600" /></div>
          <div><p className="text-sm text-gray-500">Revenue ({period})</p><h3 className="text-2xl font-bold">${stats.revenue.toLocaleString()}</h3></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full"><FileText className="w-6 h-6 text-blue-600" /></div>
          <div><p className="text-sm text-gray-500">Bills Generated</p><h3 className="text-2xl font-bold">{stats.bills}</h3></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-full"><AlertTriangle className="w-6 h-6 text-yellow-600" /></div>
          <div><p className="text-sm text-gray-500">Pending Bills</p><h3 className="text-2xl font-bold">{stats.pending}</h3></div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-full"><Package className="w-6 h-6 text-purple-600" /></div>
          <div><p className="text-sm text-gray-500">Total Products</p><h3 className="text-2xl font-bold">{stats.products}</h3></div>
        </Card>
      </div>
    </div>
  );
};

const ProductList = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({ name: '', sku: '', price: 0, stock: 0, category: '' });

  const fetchProducts = async () => setProducts(await api.getProducts());

  useEffect(() => {
    fetchProducts();
    socket.on('productChange', fetchProducts);
    return () => { socket.off('productChange', fetchProducts); };
  }, []);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(file) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const arrayBuffer = evt.target?.result as ArrayBuffer;
          // Parse the file data
          const wb = read(arrayBuffer, { type: 'array' });
          // Get the first worksheet
          const wsName = wb.SheetNames[0];
          const ws = wb.Sheets[wsName];
          // Convert to JSON
          const data = utils.sheet_to_json(ws);
          
          if(data.length > 0) {
            await api.importInventory(data);
            alert(`Successfully imported ${data.length} items from ${file.name}`);
            // Clear input
            e.target.value = '';
          } else {
             alert('File appears to be empty.');
          }
        } catch(err) {
          console.error(err);
          alert('Failed to parse file. Please ensure it is a valid CSV or Excel file.');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const downloadSample = () => {
    const csv = "Name,SKU,Category,Price,Stock\nEngine Oil,OIL-01,Fluids,25,100\nWiper Blade,WIP-01,Accessories,15,50";
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_sample.csv';
    a.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createProduct(formData as any);
    setIsModalOpen(false);
    setFormData({ name: '', sku: '', price: 0, stock: 0, category: '' });
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold">Inventory</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={downloadSample} title="Download Sample CSV"><Download size={18} /></Button>
          <label className="flex items-center justify-center px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer transition-colors text-sm font-medium">
            <Upload size={18} className="mr-2"/> Import CSV/Excel
            {/* Accept CSV and standard Excel formats */}
            <input 
              type="file" 
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
              className="hidden" 
              onChange={handleImport} 
            />
          </label>
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2"><Plus size={18} /> Add Product</Button>
        </div>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <table className="w-full text-left">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 text-sm uppercase">
            <tr><th className="p-4">SKU</th><th className="p-4">Name</th><th className="p-4">Price</th><th className="p-4">Stock</th><th className="p-4">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {products.map(p => (
              <tr key={p._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="p-4 font-mono text-xs text-gray-600 dark:text-gray-300">{p.sku}</td>
                <td className="p-4 font-bold text-gray-900 dark:text-white">{p.name}</td>
                <td className="p-4 font-medium text-gray-900 dark:text-white">${p.price}</td>
                <td className="p-4 font-medium text-gray-900 dark:text-white">{p.stock}</td>
                <td className="p-4"><Button variant="danger" className="px-2 py-1" onClick={() => api.deleteProduct(p._id)}><Trash2 size={14}/></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg">
             <h3 className="text-xl font-bold mb-4">Add Product</h3>
             <form onSubmit={handleSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <Input placeholder="Name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 <Input placeholder="SKU" required value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <Input type="number" placeholder="Price" required value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} />
                 <Input type="number" placeholder="Stock" required value={formData.stock} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} />
               </div>
               <Input placeholder="Category" required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
               <div className="flex justify-end gap-2">
                 <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                 <Button type="submit">Save</Button>
               </div>
             </form>
          </Card>
        </div>
      )}
    </div>
  );
};

// --- Deployment Module ---

const DeployModal = ({ onClose }: { onClose: () => void }) => {
  const [activeTab, setActiveTab] = useState<'files' | 'guide' | 'share' | 'connect'>('share');
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('inv_server_url') || '');
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  const REPO_URL = "https://github.com/shubhamhuyaar/inventory-management";

  const SERVER_CODE = `const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});

const io = new Server(server, { 
  cors: { origin: "*" } 
});

io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Relay specific events to all other clients
  ['productChange', 'billChange', 'userChange'].forEach(event => {
    socket.on(event, (data) => {
      // Broadcast the data payload to everyone else
      socket.broadcast.emit(event, data);
    });
  });
});`;

  const PACKAGE_JSON = `{
  "name": "inventory-backend",
  "version": "1.0.0",
  "description": "Realtime backend for AutoSys",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "socket.io": "^4.7.4"
  }
}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const handleConnect = () => {
    if(!serverUrl) return;
    socket.connect(serverUrl);
    setConnectionStatus('Connecting...');
    setTimeout(() => {
       if(socket.status === 'connected') setConnectionStatus('✅ Connected successfully!');
       else setConnectionStatus('❌ Failed to connect. Check URL.');
    }, 3000);
  };

  const handleDisconnect = () => {
    socket.disconnect();
    setServerUrl('');
    setConnectionStatus('Disconnected. Operating in Offline Mode.');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <Card className="w-full max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
          <h3 className="text-xl font-bold flex items-center gap-2"><Rocket className="text-indigo-600"/> Deployment Center</h3>
          <button onClick={onClose}><X size={24}/></button>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-2 space-y-1">
             <button onClick={() => setActiveTab('share')} className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-2 ${activeTab === 'share' ? 'bg-white dark:bg-gray-800 shadow font-bold text-green-600' : 'text-gray-600 dark:text-gray-400 hover:bg-white/50'}`}>
               <Share2 size={18}/> 1. Share App (Frontend)
             </button>
             <button onClick={() => setActiveTab('guide')} className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-2 ${activeTab === 'guide' ? 'bg-white dark:bg-gray-800 shadow font-bold text-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-white/50'}`}>
               <ExternalLink size={18}/> 2. Deploy Backend
             </button>
             <button onClick={() => setActiveTab('files')} className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-2 ${activeTab === 'files' ? 'bg-white dark:bg-gray-800 shadow font-bold text-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-white/50'}`}>
               <Code size={18}/> 3. Backend Code
             </button>
             <button onClick={() => setActiveTab('connect')} className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-2 ${activeTab === 'connect' ? 'bg-white dark:bg-gray-800 shadow font-bold text-indigo-600' : 'text-gray-600 dark:text-gray-400 hover:bg-white/50'}`}>
               <Globe size={18}/> 4. Connection Info
             </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-800">
             {activeTab === 'share' && (
                <div className="space-y-6 max-w-2xl">
                  <h2 className="text-2xl font-bold mb-4">How to Share this App</h2>
                  
                  {/* WARNING BLOCK FOR SERVER.JS */}
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-800 mb-6">
                    <h4 className="font-bold text-red-800 dark:text-red-200 flex items-center gap-2">
                      <AlertTriangle size={18}/> Critical Deployment Fix
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-2">
                      If you see a <b>500 Error</b> or <code>No entrypoint found</code> on Vercel:
                      <br/>
                      <span className="font-bold underline">YOU MUST UPDATE VERCEL PROJECT SETTINGS.</span>
                      <br/>
                      <ul className="list-disc ml-5 mt-1 space-y-1">
                         <li>Go to Vercel Dashboard &rarr; Settings &rarr; Build & Development</li>
                         <li>Set <b>Framework Preset</b> to <code>Vite</code>.</li>
                         <li>Set <b>Output Directory</b> to <code>dist</code>.</li>
                         <li>Delete <code>server.js</code> from this repo if it exists.</li>
                      </ul>
                    </p>
                  </div>

                  <p className="text-gray-600 dark:text-gray-400">To let your friend use this app on their phone or laptop, you need to put the <b>Frontend</b> (this screen) on the internet.</p>

                  <div className="flex gap-4 mt-4">
                   <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold shrink-0">1</div>
                   <div>
                     <h4 className="font-bold">Deploy Frontend to Vercel</h4>
                     <ol className="text-sm text-gray-500 list-decimal ml-4 space-y-1">
                       <li>Push your <b>Root Folder</b> (with <code>package.json</code>, <code>index.html</code>, etc) to GitHub.</li>
                       <li>Go to <a href="https://vercel.com" target="_blank" className="text-blue-500 underline">Vercel.com</a> and sign up.</li>
                       <li>Click <b>Add New Project</b> &rarr; Import your repo <code>inventory-management</code>.</li>
                       <li>Click <b>Deploy</b> (Vercel will auto-detect Vite).</li>
                     </ol>
                   </div>
                 </div>

                 <div className="flex gap-4 mt-4">
                   <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold shrink-0">2</div>
                   <div>
                     <h4 className="font-bold">Share the Link</h4>
                     <p className="text-sm text-gray-500">Vercel will give you a domain like <code>inventory-app.vercel.app</code>. Send this link to your friend!</p>
                   </div>
                 </div>
                </div>
             )}

             {activeTab === 'files' && (
               <div className="space-y-6">
                 <div>
                   <h2 className="text-2xl font-bold mb-2">Backend Files</h2>
                   <p className="text-gray-500 mb-4">
                     <b>STOP:</b> Do not put these in your root folder if you are deploying to Vercel. 
                     <br/>Create a <b>NEW FOLDER</b> somewhere else on your computer for the backend to avoid conflicts.
                   </p>
                 </div>
                 
                 <div className="space-y-2">
                   <div className="flex justify-between items-center">
                     <span className="font-mono font-bold text-sm bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">server.js</span>
                     <Button variant="secondary" onClick={() => copyToClipboard(SERVER_CODE)} className="text-xs py-1 h-auto"><Copy size={12} className="mr-1"/> Copy</Button>
                   </div>
                   <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto h-48">{SERVER_CODE}</pre>
                 </div>

                 <div className="space-y-2">
                   <div className="flex justify-between items-center">
                     <span className="font-mono font-bold text-sm bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">package.json (Backend Only)</span>
                     <Button variant="secondary" onClick={() => copyToClipboard(PACKAGE_JSON)} className="text-xs py-1 h-auto"><Copy size={12} className="mr-1"/> Copy</Button>
                   </div>
                   <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto">{PACKAGE_JSON}</pre>
                 </div>
               </div>
             )}

             {activeTab === 'guide' && (
               <div className="space-y-6 max-w-2xl">
                 <h2 className="text-2xl font-bold">Deploying Backend (Render)</h2>
                 
                 <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg mb-6">
                    <h4 className="font-bold text-yellow-800 dark:text-yellow-200 flex items-center gap-2"><AlertTriangle size={18}/> Separate Repo Required</h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                      For the backend, create a <b>separate GitHub repository</b> containing ONLY the <code>server.js</code> and <code>package.json</code> from Tab 3. Do not mix it with the Vercel frontend code.
                    </p>
                 </div>

                 <div className="flex gap-4">
                   <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">1</div>
                   <div>
                     <h4 className="font-bold">Create Service on Render</h4>
                     <p className="text-sm text-gray-500 mb-2">
                       1. Go to <a href="https://dashboard.render.com" target="_blank" className="text-blue-500 hover:underline font-bold">Render Dashboard</a>.<br/>
                       2. Click the <b>New +</b> button and select <b>Web Service</b>.<br/>
                       3. Connect your <b>Backend-Only</b> repository.
                     </p>
                   </div>
                 </div>

                 <div className="flex gap-4">
                   <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">2</div>
                   <div>
                     <h4 className="font-bold">Configure Deployment</h4>
                     <div className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-sm font-mono space-y-1">
                        <div><span className="text-gray-500">Build Command:</span> <span className="text-indigo-600">npm install</span></div>
                        <div><span className="text-gray-500">Start Command:</span> <span className="text-indigo-600">node server.js</span></div>
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {activeTab === 'connect' && (
               <div className="space-y-6 max-w-xl">
                 <div>
                   <h2 className="text-2xl font-bold mb-2">Cloud Connection</h2>
                   <p className="text-gray-500">Connect this frontend to your deployed backend (e.g., Render URL).</p>
                 </div>
                 
                 <div className="bg-gray-100 dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                    <label className="block font-bold mb-2">Target Server URL</label>
                    <div className="flex gap-2">
                       <Input 
                         value={serverUrl} 
                         placeholder="https://your-backend.onrender.com"
                         onChange={e => setServerUrl(e.target.value)}
                       />
                       <Button onClick={handleConnect} disabled={!serverUrl}>Connect</Button>
                    </div>
                    {socket.status === 'connected' && (
                       <div className="mt-3 px-4 py-2 bg-green-100 text-green-700 rounded-lg font-bold flex items-center justify-center">
                          ✅ Connected Successfully
                       </div>
                    )}
                    {connectionStatus && socket.status !== 'connected' && (
                       <div className="mt-2 text-sm font-bold text-gray-600">{connectionStatus}</div>
                    )}
                    {serverUrl && (
                       <div className="mt-2 text-right">
                          <button onClick={handleDisconnect} className="text-sm text-red-500 hover:underline">Disconnect & Reset</button>
                       </div>
                    )}
                 </div>
               </div>
             )}
          </div>
        </div>
      </Card>
    </div>
  );
};

// --- Bill Generation Module ---

const PrintableBill = ({ bill, onClose }: { bill: Bill, onClose: () => void }) => (
  <div className="fixed inset-0 z-[100] bg-white flex flex-col">
    <div className="p-4 bg-gray-100 flex justify-between items-center no-print border-b">
      <h2 className="font-bold text-gray-800">Print Preview</h2>
      <div className="flex gap-2">
        <Button onClick={() => window.print()}><Printer size={18} className="mr-2"/> Print</Button>
        <Button variant="secondary" onClick={onClose}><X size={18}/></Button>
      </div>
    </div>
    
    <div id="print-area" className="flex-1 overflow-auto p-8 max-w-4xl mx-auto w-full bg-white text-black">
      {/* Bill Header */}
      <div className="flex justify-between items-start mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">INVOICE</h1>
          <p className="font-semibold text-lg">{bill.billNo}</p>
          <p>Date: {new Date(bill.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold">Auto Repair Shop</h2>
          <p>123 Garage Street</p>
          <p>City, State, ZIP</p>
          <p>Phone: (555) 123-4567</p>
        </div>
      </div>

      {/* Client Info */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="font-bold text-gray-600 uppercase text-sm mb-2">Bill To:</h3>
          <p className="font-bold text-lg">{bill.partyName}</p>
          <p className="whitespace-pre-line">{bill.address}</p>
        </div>
        <div className="text-right">
           <div className="mb-2"><span className="font-bold">Vehicle:</span> {bill.vehicleName}</div>
           <div className="mb-2"><span className="font-bold">Reference:</span> {bill.reference}</div>
           <div className="mb-2"><span className="font-bold">Days:</span> {bill.days}</div>
           <div><span className="font-bold">Payment:</span> {bill.paymentMode}</div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-8 border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2">Item</th>
            <th className="text-right py-2">Quantity</th>
            <th className="text-right py-2">Rate</th>
            <th className="text-right py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-200">
              <td className="py-2">{item.productName}</td>
              <td className="text-right py-2">{item.quantity}</td>
              <td className="text-right py-2">${item.price.toFixed(2)}</td>
              <td className="text-right py-2">${item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-64">
           <div className="flex justify-between py-2 border-t-2 border-black">
             <span className="font-bold text-xl">Total</span>
             <span className="font-bold text-xl">${bill.totalAmount.toFixed(2)}</span>
           </div>
           {bill.status === 'Pending' && (
             <div className="mt-4 text-red-600 border border-red-600 p-2 text-center font-bold uppercase">
               Payment Pending
             </div>
           )}
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-16 text-center text-sm text-gray-500">
        <p>Thank you for your business!</p>
      </div>
    </div>
  </div>
);

const BillList = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const { user } = useContext(AuthContext);
  
  // Create/Edit State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBill, setNewBill] = useState({
    partyName: '', vehicleName: '', address: '', reference: '', days: 1, paymentMode: 'Cash' as 'Cash'|'Online', items: [] as BillItem[]
  });
  const [currentItem, setCurrentItem] = useState({ productId: '', quantity: 1 });
  
  // Print State
  const [printBill, setPrintBill] = useState<Bill | null>(null);

  const fetchData = async () => {
    if(user) setBills(await api.getBills(user));
    setProducts(await api.getProducts());
  };

  useEffect(() => {
    fetchData();
    socket.on('billChange', fetchData);
    return () => { socket.off('billChange', fetchData); };
  }, [user]);

  const addItemToBill = () => {
    const product = products.find(p => p._id === currentItem.productId);
    if (!product) return;
    const item: BillItem = {
      productId: product._id,
      productName: product.name,
      quantity: currentItem.quantity,
      price: product.price,
      total: product.price * currentItem.quantity
    };
    setNewBill({ ...newBill, items: [...newBill.items, item] });
    setCurrentItem({ productId: '', quantity: 1 });
  };

  const removeItem = (idx: number) => {
    const items = [...newBill.items];
    items.splice(idx, 1);
    setNewBill({...newBill, items});
  };

  const calculateTotal = () => newBill.items.reduce((acc, curr) => acc + curr.total, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(newBill.items.length === 0) return alert("Add at least one item");
    if(!user) return;
    
    try {
      const bill = await api.createBill({
        ...newBill,
        totalAmount: calculateTotal(),
        status: newBill.paymentMode === 'Online' ? 'Paid' : 'Pending',
        createdBy: user._id,
        createdByName: user.name
      });
      setIsCreateOpen(false);
      setNewBill({ partyName: '', vehicleName: '', address: '', reference: '', days: 1, paymentMode: 'Cash', items: [] });
      // Auto open print
      setPrintBill(bill);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleStatus = async (bill: Bill) => {
    if(user?.role !== 'admin') return;
    const newStatus = bill.status === 'Paid' ? 'Pending' : 'Paid';
    await api.updateBillStatus(bill._id, newStatus);
  };

  return (
    <>
      {printBill && <PrintableBill bill={printBill} onClose={() => setPrintBill(null)} />}
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Billing</h2>
        <Button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-2"><Plus size={18} /> Generate Bill</Button>
      </div>

      <div className="grid gap-4">
        {bills.map(bill => (
          <Card key={bill._id} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
               <div className="flex items-center gap-2">
                 <h3 className="font-bold text-lg">{bill.partyName}</h3>
                 <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{bill.billNo}</span>
               </div>
               <p className="text-sm text-gray-500">{bill.vehicleName} • {new Date(bill.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-4">
               <div className="text-right">
                 <p className="font-bold text-lg">${bill.totalAmount.toFixed(2)}</p>
                 <button 
                   onClick={() => toggleStatus(bill)} 
                   className={`text-xs px-2 py-1 rounded-full font-bold ${bill.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                   disabled={user?.role !== 'admin'}
                   title={user?.role === 'admin' ? "Click to toggle status" : ""}
                 >
                   {bill.status}
                 </button>
               </div>
               <div className="flex gap-2">
                 <Button variant="secondary" onClick={() => setPrintBill(bill)} title="Print"><Printer size={16} /></Button>
               </div>
            </div>
          </Card>
        ))}
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <Card className="w-full max-w-2xl my-8">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-bold">New Bill</h3>
               <button onClick={() => setIsCreateOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input placeholder="Party Name" required value={newBill.partyName} onChange={e => setNewBill({...newBill, partyName: e.target.value})} />
                <Input placeholder="Vehicle Name" required value={newBill.vehicleName} onChange={e => setNewBill({...newBill, vehicleName: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <Input placeholder="Reference" value={newBill.reference} onChange={e => setNewBill({...newBill, reference: e.target.value})} />
                 <Input type="number" placeholder="Days" min="0" value={newBill.days} onChange={e => setNewBill({...newBill, days: Number(e.target.value)})} />
              </div>
              <textarea 
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400" 
                placeholder="Full Address" 
                rows={2} 
                required 
                value={newBill.address} 
                onChange={e => setNewBill({...newBill, address: e.target.value})}
              />
              
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="font-bold mb-2">Add Items</h4>
                <div className="flex gap-2 mb-2">
                  <Select value={currentItem.productId} onChange={e => setCurrentItem({...currentItem, productId: e.target.value})}>
                    <option value="">Select Product</option>
                    {products.map(p => <option key={p._id} value={p._id} disabled={p.stock<=0}>{p.name} (${p.price})</option>)}
                  </Select>
                  <Input type="number" className="w-24" min="1" placeholder="Qty" value={currentItem.quantity} onChange={e => setCurrentItem({...currentItem, quantity: Number(e.target.value)})} />
                  <Button type="button" onClick={addItemToBill}>Add</Button>
                </div>
                
                {newBill.items.length > 0 && (
                  <table className="w-full text-sm mt-4 text-gray-800 dark:text-gray-200">
                    <thead><tr className="text-left text-gray-500"><th>Product</th><th>Qty</th><th>Total</th><th></th></tr></thead>
                    <tbody>
                      {newBill.items.map((item, idx) => (
                        <tr key={idx} className="border-t border-gray-200 dark:border-gray-600">
                          <td className="py-2">{item.productName}</td>
                          <td className="py-2">{item.quantity}</td>
                          <td className="py-2">${item.total}</td>
                          <td className="py-2 text-right"><button type="button" onClick={() => removeItem(idx)} className="text-red-500"><X size={14}/></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-100 text-gray-900 dark:text-gray-100">
                <div className="flex gap-4 items-center">
                  <label className="font-bold">Payment Mode:</label>
                  <label className="flex items-center gap-2"><input type="radio" name="mode" checked={newBill.paymentMode === 'Cash'} onChange={() => setNewBill({...newBill, paymentMode: 'Cash'})} /> Cash</label>
                  <label className="flex items-center gap-2"><input type="radio" name="mode" checked={newBill.paymentMode === 'Online'} onChange={() => setNewBill({...newBill, paymentMode: 'Online'})} /> Online</label>
                </div>
                <div className="text-xl font-bold">Total: ${calculateTotal()}</div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit">Generate Bill</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
};

const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user: currentUser } = useContext(AuthContext);

  // New User State
  const [newUser, setNewUser] = useState({
    name: '',
    username: '',
    email: '',
    role: 'staff' as UserRole,
    permissions: ['dashboard', 'products', 'bills']
  });

  const availableTabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'products', label: 'Inventory' },
    { id: 'bills', label: 'Billing' },
    { id: 'users', label: 'User Management' },
  ];

  const fetchUsers = async () => setUsers(await api.getUsers());

  useEffect(() => {
    fetchUsers();
    socket.on('userChange', fetchUsers);
    return () => { socket.off('userChange', fetchUsers); };
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
       const finalPermissions = newUser.role === 'admin' ? availableTabs.map(t => t.id) : newUser.permissions;
       await api.createUser({ ...newUser, permissions: finalPermissions });
       setIsModalOpen(false);
       setNewUser({ name: '', username: '', email: '', role: 'staff', permissions: ['dashboard', 'products', 'bills'] });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const togglePermission = (tabId: string) => {
    if (newUser.permissions.includes(tabId)) {
      setNewUser({ ...newUser, permissions: newUser.permissions.filter(id => id !== tabId) });
    } else {
      setNewUser({ ...newUser, permissions: [...newUser.permissions, tabId] });
    }
  };

  if (currentUser?.role !== 'admin') return <div className="text-center p-10 text-gray-500">Access Denied</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">User Management</h2>
        <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <Plus size={18} /> Add Employee
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map(u => (
          <Card key={u._id} className="flex items-start gap-4">
            <div className="p-3 bg-indigo-100 rounded-full"><Users className="text-indigo-600" size={24}/></div>
            <div className="flex-1">
              <h3 className="font-bold">{u.name}</h3>
              <p className="text-sm font-mono text-indigo-600 mb-1">@{u.username}</p>
              <p className="text-sm text-gray-500">{u.email}</p>
              <div className="mt-2 flex gap-2">
                 <span className="text-xs bg-gray-100 px-2 py-1 rounded border uppercase font-bold text-gray-600">{u.role}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Add New Employee</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <Input required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <Input required value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                </div>
                <div>
                   <label className="block text-sm font-medium mb-1">Role</label>
                   <Select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}>
                     <option value="staff">Staff</option>
                     <option value="manager">Manager</option>
                     <option value="admin">Admin</option>
                   </Select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email Address</label>
                <Input type="email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
              </div>

              {newUser.role !== 'admin' && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-medium mb-2">Allowed Access</label>
                  <div className="space-y-2">
                    {availableTabs.map(tab => (
                      <div 
                        key={tab.id} 
                        className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                        onClick={() => togglePermission(tab.id)}
                      >
                        {newUser.permissions.includes(tab.id) 
                          ? <CheckSquare className="text-indigo-600" size={20} />
                          : <Square className="text-gray-400" size={20} />
                        }
                        <span className="text-sm">{tab.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit">Create User</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

// --- Main Layout ---
const DashboardLayout: React.FC = () => {
  const { user, logout } = useContext(AuthContext);
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  
  // Connection State Listener
  const [connectionState, setConnectionState] = useState<ConnectionState>(socket.status);
  useEffect(() => {
    const handleConnection = (state: ConnectionState) => setConnectionState(state);
    socket.on('connectionChange', handleConnection);
    // Initial sync in case it changed before mount
    setConnectionState(socket.status);
    return () => { socket.off('connectionChange', handleConnection); };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // Permission Logic
  const ALL_TABS = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'products', icon: Package, label: 'Inventory' },
    { id: 'bills', icon: FileText, label: 'Billing' },
    { id: 'users', icon: Users, label: 'Users' },
  ];
  
  const visibleTabs = ALL_TABS.filter(t => user?.role === 'admin' || user?.permissions?.includes(t.id));

  const renderContent = () => {
    if(user?.role !== 'admin' && !user?.permissions?.includes(activeTab)) return <div>Access Denied</div>;
    switch(activeTab) {
      case 'dashboard': return <DashboardStats />;
      case 'products': return <ProductList />;
      case 'bills': return <BillList />;
      case 'users': return <UsersPage />;
      default: return <div>Not Found</div>;
    }
  };

  const getConnectionStatusText = () => {
    if (connectionState === 'connected') return 'Server Connected';
    if (connectionState === 'connecting') return 'Connecting...';
    return 'Offline (Local)';
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <aside className={`fixed z-40 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
         <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg"><Package className="text-white w-6 h-6" /></div>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">AutoSys</span>
         </div>
         <nav className="p-4 space-y-1">
           {visibleTabs.map(t => (
             <button key={t.id} onClick={() => { setActiveTab(t.id); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === t.id ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
               <t.icon size={20} /> <span className="font-medium">{t.label}</span>
             </button>
           ))}
         </nav>
         <div className="absolute bottom-0 w-full p-4 border-t border-gray-200 dark:border-gray-700">
            <button onClick={() => setIsDeployOpen(true)} className={`w-full flex items-center gap-2 mb-4 p-2 rounded-lg text-sm font-medium transition ${connectionState === 'connected' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : connectionState === 'connecting' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
              <Server size={16}/> {getConnectionStatusText()}
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">{user?.name[0]}</div>
              <div className="overflow-hidden"><p className="text-sm font-medium truncate">{user?.name}</p><p className="text-xs text-gray-500">@{user?.username}</p></div>
            </div>
            <Button variant="secondary" className="w-full flex justify-center items-center gap-2" onClick={logout}><LogOut size={16}/> Sign Out</Button>
         </div>
      </aside>

      {isDeployOpen && <DeployModal onClose={() => setIsDeployOpen(false)} />}

      <main className="flex-1 md:ml-64 flex flex-col h-screen">
        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sticky top-0 z-30">
          <button className="md:hidden p-2" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}><Menu/></button>
          <div className="flex-1"/>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isOnline ? <Wifi size={14}/> : <WifiOff size={14}/>} {isOnline ? 'Online' : 'Offline'}
            </div>
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">{isDark ? <Sun size={20}/> : <Moon size={20}/>}</button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{renderContent()}</div>
      </main>
    </div>
  );
};

// --- Auth & Root ---
const Login = () => {
  const { login } = useContext(AuthContext);
  const [identifier, setIdentifier] = useState('admin');
  const [error, setError] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    setError('');
    try {
      await login(identifier); 
    } catch(err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex justify-center items-center w-12 h-12 bg-indigo-100 rounded-full mb-4"><Package className="text-indigo-600"/></div>
          <h1 className="text-2xl font-bold">Auto Repair System</h1>
        </div>
        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Username or Email</label><Input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} required /></div>
          <Button type="submit" className="w-full">Sign In</Button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-500">
          Try username: <span className="font-mono bg-gray-200 rounded px-1">admin</span> or <span className="font-mono bg-gray-200 rounded px-1">staff</span>
        </div>
      </Card>
    </div>
  );
};

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const u = localStorage.getItem('inv_user_session');
    if(u) setUser(JSON.parse(u));
    setIsLoading(false);
  }, []);
  const login = async (e: string) => { const r = await api.login(e); setUser(r.user); localStorage.setItem('inv_user_session', JSON.stringify(r.user)); };
  const logout = () => { setUser(null); localStorage.removeItem('inv_user_session'); };
  return <AuthContext.Provider value={{ user, login, logout }}>{!isLoading && children}</AuthContext.Provider>;
};

const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const toggleTheme = () => setIsDark(!isDark);
  useEffect(() => { document.documentElement.classList.toggle('dark', isDark); }, [isDark]);
  return <ThemeContext.Provider value={{ isDark, toggleTheme }}>
    <div className={isDark ? 'dark' : ''}>
      <div className="text-gray-900 dark:text-gray-100 min-h-screen transition-colors duration-200">
        {children}
      </div>
    </div>
  </ThemeContext.Provider>;
};

const App = () => {
  const { user } = useContext(AuthContext);
  return user ? <DashboardLayout /> : <Login />;
};

createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><ThemeProvider><App /></ThemeProvider></AuthProvider></React.StrictMode>);

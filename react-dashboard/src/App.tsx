import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceHealth {
    name: string
    key: string
    url: string
    status: 'UP' | 'DOWN' | 'CHECKING'
}

interface OrderStatus {
    orderId: string
    status: 'PENDING' | 'VERIFIED' | 'IN_KITCHEN' | 'COMPLETED' | 'QUEUED'
    message: string
}

interface MetricsData {
    avgLatencyMs: number
    totalOrders: number
    highLatency: boolean
}

interface Toast {
    id: number
    message: string
    type: 'error' | 'success' | 'warning'
}

type ChaosMode = 'NORMAL' | 'SLOW'

// ─── Constants ────────────────────────────────────────────────────────────────
const API = ''  // Uses Vite proxy → hits Nginx on localhost:80

const SERVICES: ServiceHealth[] = [
    { name: 'Gateway', key: 'gateway', url: `${API}/api/order/health`, status: 'CHECKING' },
    { name: 'Stock', key: 'stock', url: `${API}/api/stock/health`, status: 'CHECKING' },
    { name: 'Kitchen', key: 'kitchen', url: `${API}/api/kitchen/health`, status: 'CHECKING' },
]

const ORDER_STAGES = ['PENDING', 'VERIFIED', 'IN_KITCHEN', 'COMPLETED'] as const

function parsePromMetrics(prometheusText: string): { sum: number, count: number, total: number } {
    const sumMatches = Array.from(prometheusText.matchAll(/^gateway_response_time_seconds_sum(?:\{.*?\})?\s+([\d.]+)/gm))
    const countMatches = Array.from(prometheusText.matchAll(/^gateway_response_time_seconds_count(?:\{.*?\})?\s+([\d.]+)/gm))
    const totalMatches = Array.from(prometheusText.matchAll(/^orders_total(?:\{.*?\})?\s+(\d+)/gm))

    let sum = 0, count = 0, total = 0
    sumMatches.forEach(m => sum += parseFloat(m[1]))
    countMatches.forEach(m => count += parseFloat(m[1]))
    totalMatches.forEach(m => total += parseInt(m[1]))

    return { sum, count, total }
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
    const [loggedIn, setLoggedIn] = useState(false)
    const [studentId, setStudentId] = useState('')
    const [password, setPassword] = useState('')
    const [token, setToken] = useState('')
    const [currentStudentId, setCurrentStudentId] = useState('')
    const [loginLoading, setLoginLoading] = useState(false)

    const [services, setServices] = useState<ServiceHealth[]>(SERVICES)
    const [anyDown, setAnyDown] = useState(false)

    const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null)
    const [orderLoading, setOrderLoading] = useState(false)

    const [chaosMode, setChaosMode] = useState<ChaosMode>('NORMAL')
    const [chaosLoading, setChaosLoading] = useState(false)
    const [chaosOpen, setChaosOpen] = useState(true)
    const [adminOpen, setAdminOpen] = useState(false)

    const [metrics, setMetrics] = useState<MetricsData>({ avgLatencyMs: 0, totalOrders: 0, highLatency: false })
    const [sessionOrders, setSessionOrders] = useState(0)

    const [toasts, setToasts] = useState<Toast[]>([])
    const [resLogs, setResLogs] = useState<{ id: string, msg: string, type: 'info' | 'err' | 'ok', ts: string }[]>([
        { id: '1', msg: 'System initialized. Resilience protocols active.', type: 'info', ts: new Date().toLocaleTimeString() }
    ])
    const socketRef = useRef<Socket | null>(null)
    const toastId = useRef(0)

    // ── Toast system ───────────────────────────────────────────────────────────
    const toast = useCallback((message: string, type: Toast['type'] = 'error') => {
        const id = ++toastId.current
        setToasts(prev => [{ id, message, type }, ...prev])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
    }, [])

    // ── Health polling ─────────────────────────────────────────────────────────
    useEffect(() => {
        const poll = async () => {
            const updated = await Promise.all(
                SERVICES.map(async (svc) => {
                    try {
                        await axios.get(svc.url, { timeout: 3000 })
                        return { ...svc, status: 'UP' as const }
                    } catch {
                        return { ...svc, status: 'DOWN' as const }
                    }
                })
            )
            setServices(updated)
            setAnyDown(updated.some(s => s.status === 'DOWN'))
        }
        poll()
        const interval = setInterval(poll, 3000)
        return () => clearInterval(interval)
    }, [])
    const addLog = useCallback((msg: string, type: 'info' | 'err' | 'ok' = 'info') => {
        setResLogs(prev => [{ id: Math.random().toString(), msg, type, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 10))
    }, [])

    // Effect to log health changes
    useEffect(() => {
        const downCount = services.filter(s => s.status === 'DOWN').length
        if (downCount > 0) {
            addLog(`Resilience Alert: ${downCount} services degraded. Saga-Compensation ready.`, 'err')
        } else if (services.length > 0 && services.every(s => s.status === 'UP')) {
            addLog('Service Mesh Healthy. All pathways optimal.', 'ok')
        }
    }, [services, addLog])

    // ── Chaos mode polling ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!loggedIn) return
        const poll = async () => {
            try {
                const res = await axios.get(`${API}/api/kitchen/chaos`)
                setChaosMode(res.data.mode)
            } catch { /* server may be down */ }
        }
        poll()
        const interval = setInterval(poll, 5000)
        return () => clearInterval(interval)
    }, [loggedIn])

    const lastMetrics = useRef({ sum: 0, count: 0 })

    // ── Metrics polling ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!loggedIn) return
        const poll = async () => {
            try {
                const res = await axios.get(`${API}/api/order/metrics`, { responseType: 'text' })
                const { sum, count, total } = parsePromMetrics(res.data)

                const deltaSum = sum - lastMetrics.current.sum
                const deltaCount = count - lastMetrics.current.count

                let currentLatencyMs = 0
                if (deltaCount > 0) {
                    currentLatencyMs = Math.round((deltaSum / deltaCount) * 1000)
                } else {
                    // If no new requests, show a tiny jitter or 0? 
                    // Let's keep a bit of "micro-jitter" to make it feel alive
                    // Or simply show the last value if it's very recent?
                    // Better: keep it 0 if truly idle, or smooth it.
                }

                setMetrics({
                    avgLatencyMs: currentLatencyMs,
                    totalOrders: total,
                    highLatency: currentLatencyMs > 1000
                })

                lastMetrics.current = { sum, count }
            } catch { /* ignore */ }
        }
        poll()
        const interval = setInterval(poll, 1000) // Polling every 1s for "real-time" feel
        return () => clearInterval(interval)
    }, [loggedIn])

    // ── Status Polling Fallback ──────────────────────────────────────────────────
    useEffect(() => {
        if (!loggedIn || !orderStatus || orderStatus.status === 'COMPLETED' || !orderStatus.orderId) return

        const pollStatus = async () => {
            try {
                const res = await axios.get(`${API}/api/order/history/${orderStatus.orderId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                if (res.data.status === 'COMPLETED') {
                    setOrderStatus(prev => ({
                        orderId: res.data.orderId,
                        status: 'COMPLETED',
                        message: '🎉 Your Iftar order is COMPLETED! Alhamdulillah.'
                    }))
                    toast('🎉 Your Iftar order is COMPLETED! Alhamdulillah.', 'success')
                }
            } catch (e) {
                // Ignore polling errors
            }
        }

        const tid = setInterval(pollStatus, 3000)
        return () => clearInterval(tid)
    }, [loggedIn, orderStatus, token, toast])

    // ── Socket.IO ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!loggedIn || !currentStudentId) return
        const socket = io('/', { query: { studentId: currentStudentId }, path: '/socket.io' })
        socketRef.current = socket

        socket.on('orderStatus', (data: { orderId: string; status: string }) => {
            const rawStatus = data.status.toUpperCase();
            const finalStatus = (rawStatus === 'READY' || rawStatus === 'COMPLETED' || rawStatus === 'READY_FOR_PICKUP')
                ? 'COMPLETED' : rawStatus;

            setOrderStatus(prev => {
                if (!prev || (prev.orderId && prev.orderId !== data.orderId)) return prev;

                const currentIdx = ORDER_STAGES.indexOf(prev.status as any);
                const nextIdx = ORDER_STAGES.indexOf(finalStatus as any);
                if (nextIdx !== -1 && nextIdx < currentIdx) return prev;

                return {
                    orderId: data.orderId,
                    status: finalStatus as OrderStatus['status'],
                    message: data.status.replace(/_/g, ' ')
                }
            })

            if (finalStatus === 'COMPLETED') {
                toast('🎉 Your Iftar order is COMPLETED! Alhamdulillah.', 'success')
            }
        })

        return () => { socket.disconnect() }
    }, [loggedIn, currentStudentId, toast])

    // ── Login ──────────────────────────────────────────────────────────────────
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoginLoading(true)
        try {
            const res = await axios.post(`${API}/api/auth/login`, { studentId, password })
            setToken(res.data.token)
            setCurrentStudentId(res.data.studentId)
            setLoggedIn(true)
        } catch (err: unknown) {
            const msg = axios.isAxiosError(err) ? (err.response?.data?.error || 'Login failed') : 'Login failed'
            toast(msg, 'error')
        } finally {
            setLoginLoading(false)
        }
    }

    // ── Place order ────────────────────────────────────────────────────────────
    const handleOrder = async () => {
        setOrderLoading(true)
        setOrderStatus({ orderId: '', status: 'PENDING', message: 'Submitting order...' })
        try {
            const idempotencyKey = crypto.randomUUID()
            const res = await axios.post(
                `${API}/api/order`,
                { itemId: 'iftar_box', quantity: 1, idempotencyKey },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            const orderId = res.data.orderId
            setSessionOrders(n => n + 1)
            addLog(`Saga Initialized: Order ${orderId.substring(0, 8)} started`, 'info')

            // Avoid overwriting a more advanced status from the socket
            setOrderStatus(prev => {
                const nextSagaStatus = res.data.sagaState as OrderStatus['status'];
                const nextStatus = (nextSagaStatus === 'QUEUED' ? 'PENDING' : nextSagaStatus);

                if (prev && prev.orderId && prev.orderId === orderId) {
                    const currentIdx = ORDER_STAGES.indexOf(prev.status as any);
                    const nextIdx = ORDER_STAGES.indexOf(nextStatus as any);
                    if (nextIdx !== -1 && nextIdx < currentIdx) return prev;
                }
                const isQueued = nextSagaStatus === 'QUEUED' || chaosMode === 'SLOW';
                if (isQueued) addLog(`Resilience: Order ${orderId.substring(0, 8)} diverted to Queue`, 'info');

                return {
                    orderId,
                    status: nextStatus as OrderStatus['status'],
                    message: res.data.message || 'Confirmed'
                };
            });
        } catch (err: unknown) {
            const msg = axios.isAxiosError(err) ? (err.response?.data?.error || 'Order failed') : 'Order failed'
            toast(msg, 'error')
            setOrderStatus(null)
        } finally {
            setOrderLoading(false)
        }
    }

    // ── Chaos control ──────────────────────────────────────────────────────────
    const triggerChaos = async (delay: number) => {
        setChaosLoading(true)
        try {
            const res = await axios.post(`${API}/api/kitchen/chaos`, { delay })
            setChaosMode(res.data.mode)
            addLog(`Chaos Engine: ${res.data.mode === 'SLOW' ? 'Latency Injected (5s)' : 'Normal Mode Restored'}`, res.data.mode === 'SLOW' ? 'err' : 'ok')
            toast(
                delay > 0
                    ? `🐢 Kitchen slowdown active (${delay}ms delay injected)`
                    : '✅ Kitchen restored to normal speed',
                delay > 0 ? 'warning' : 'success'
            )
        } catch {
            toast('Failed to reach Kitchen service', 'error')
        } finally {
            setChaosLoading(false)
        }
    }

    const stageIndex = orderStatus
        ? ORDER_STAGES.indexOf(orderStatus.status as typeof ORDER_STAGES[number])
        : -1

    // ─────────────────────────────────────────────────────────────────────────────
    // RENDER: Login Screen
    // ─────────────────────────────────────────────────────────────────────────────
    if (!loggedIn) {
        return (
            <div className="login-page">
                <div className="stars" />
                <ToastList toasts={toasts} />
                <div className="login-card">
                    <div className="login-logo">
                        <span className="moon">🌙</span>
                        <h1>FeastFlow</h1>
                        <p>Iftar Resilience Protocol</p>
                    </div>
                    <form onSubmit={handleLogin} className="login-form">
                        <div className="field">
                            <label>Student ID</label>
                            <input
                                id="studentId"
                                value={studentId}
                                onChange={e => setStudentId(e.target.value)}
                                placeholder="e.g. user123"
                                required
                                autoFocus
                            />
                        </div>
                        <div className="field">
                            <label>Password</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="•••••••"
                                required
                            />
                        </div>
                        <button type="submit" className="btn-primary" disabled={loginLoading}>
                            {loginLoading ? <span className="spinner" /> : 'Login →'}
                        </button>
                    </form>
                    <p className="login-hint">Demo: <code>user123</code> / <code>password</code></p>
                </div>
            </div>
        )
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // RENDER: Main Dashboard
    // ─────────────────────────────────────────────────────────────────────────────
    return (
        <div className="dashboard">
            <div className="stars" />
            <ToastList toasts={toasts} />

            {/* ── Alert Banner ── */}
            {anyDown && (
                <div className="alert-banner">
                    ⚠️ System Resilience Active — Routing through fallback queue
                </div>
            )}

            {/* ── Header ── */}
            <header className="header">
                <div className="header-brand">
                    <div className="logo-icon">F</div>
                    <span className="glow-text">FeastFlow</span>
                </div>
                <div className="header-right">
                    <span className="user-badge">👤 {currentStudentId}</span>
                    <button className="btn-ghost" onClick={() => { setLoggedIn(false); setToken('') }}>
                        Logout
                    </button>
                </div>
            </header>

            <div className="main-layout">

                {/* ── LEFT: Service Health + Order Panel ── */}
                <div className="left-col">

                    {/* Service Health Bar */}
                    <div className="card">
                        <h2>📡 Service Connectivity</h2>
                        <div className="health-indicators">
                            {services.map(svc => (
                                <div key={svc.key} className={`health-dot ${svc.status.toLowerCase()}`}>
                                    <span className="dot" />
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{svc.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {svc.status === 'UP' ? 'Healthy & Resilient' : svc.status === 'DOWN' ? 'Service Unavailable' : 'Establishing connection...'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Order Panel */}
                    <div className="card">
                        <h2>🛒 Order Fulfillment</h2>
                        <div className="menu-item-card">
                            <div>
                                <div className="item-title">🍱 Iftar Box Premium</div>
                                <div className="item-desc">Dates · Biryani · Water · Performance Optimized</div>
                            </div>
                            <button
                                id="order-btn"
                                className={`btn-primary ${orderStatus?.status === 'COMPLETED' ? 'success-pulse' : ''}`}
                                onClick={orderStatus?.status === 'COMPLETED' ? () => setOrderStatus(null) : handleOrder}
                                disabled={orderLoading || (!!orderStatus && orderStatus.status !== 'COMPLETED')}
                            >
                                {orderLoading
                                    ? <span className="spinner" />
                                    : orderStatus?.status === 'COMPLETED'
                                        ? '✅ Place Another Order'
                                        : orderStatus
                                            ? 'Order Processing...'
                                            : '🌙 Execute Order'}
                            </button>
                        </div>

                        {/* Tracker */}
                        {orderStatus && (
                            <div className="tracker-section">
                                {orderStatus.status === 'QUEUED' ? (
                                    <div className="queued-banner">
                                        📦 Resilience Protocol Engaged — Order queued due to heavy load. We'll notify you.
                                    </div>
                                ) : (
                                    <div className="stage-track">
                                        {ORDER_STAGES.map((stage, idx) => (
                                            <div key={stage} className={`stage ${idx < stageIndex || (idx === stageIndex && orderStatus.status === 'COMPLETED') ? 'done' : idx === stageIndex ? 'active' : ''}`}>
                                                <div className="stage-dot">
                                                    {idx < stageIndex ? '✓' : idx === stageIndex ? '●' : ''}
                                                </div>
                                                <div className="stage-label">{stage.replace('_', ' ')}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="status-msg">{orderStatus.message}</p>

                                {/* ── DEVELOPER PROTOCOL ── */}
                                <div className="dev-protocol" style={{ marginTop: '2rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                                    <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>🔍 OBSERVABILITY TRACES</h3>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <a
                                            href={`${API}/api/order/events/${orderStatus.orderId}?token=${token}`}
                                            target="_blank" rel="noreferrer"
                                            className="btn-ghost"
                                            style={{ textDecoration: 'none', flex: 1, textAlign: 'center', fontSize: '0.8rem' }}
                                        >
                                            📜 Saga Events
                                        </a>
                                        <a
                                            href={`http://localhost:16686/search?service=order-gateway&tags=%7B"orderId"%3A"${orderStatus.orderId}"%7D`}
                                            target="_blank" rel="noreferrer"
                                            className="btn-ghost"
                                            style={{ textDecoration: 'none', flex: 1, textAlign: 'center', fontSize: '0.8rem' }}
                                        >
                                            ⚡ Dist. Trace
                                        </a>
                                    </div>
                                </div>

                                {orderStatus.status === 'COMPLETED' && (
                                    <button className="btn-primary mt-2" style={{ width: '100%' }} onClick={() => setOrderStatus(null)}>
                                        Place Another Order
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Live Resilience Log (Moved from right) */}
                    <div className="card">
                        <h2>🚥 System Terminal</h2>
                        <div className="terminal">
                            {resLogs.map(log => (
                                <div key={log.id} className="terminal-line">
                                    <span className="terminal-ts">[{log.ts}]</span>
                                    <span className={`terminal-tag ${log.type === 'err' ? 'err' : log.type === 'info' ? 'info' : ''}`}>
                                        {log.type.toUpperCase()}
                                    </span>
                                    <span className="terminal-msg">{log.msg}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Chaos + Metrics ── */}
                <div className="right-col">

                    {/* Resilience Topology */}
                    <div className="card">
                        <h2>🔗 System Topology</h2>
                        <div className="topo-grid">
                            <div className="topo-node active">
                                <span style={{ fontSize: '0.8rem' }}>GATE</span>
                                <div className="dot" />
                            </div>
                            <div className="topo-line l1"></div>
                            <div className={`topo-node ${anyDown ? '' : 'active'}`}>
                                <span style={{ fontSize: '0.8rem' }}>MCORE</span>
                                <div className="dot" />
                            </div>
                            <div className="topo-line l2"></div>
                            <div className="topo-node active">
                                <span style={{ fontSize: '0.8rem' }}>DBANK</span>
                                <div className="dot" />
                            </div>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            Live pathway visualization of microservice inter-dependencies.
                        </p>
                    </div>


                    {/* Chaos Control Panel */}
                    <div className="card">
                        <div className="chaos-header" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }} onClick={() => setChaosOpen(o => !o)}>
                            <h2>⛈️ Chaos Engine</h2>
                            <span style={{ color: 'var(--text-muted)' }}>{chaosOpen ? 'Collapse' : 'Expand'}</span>
                        </div>

                        {chaosOpen && (
                            <div style={{ marginTop: '1rem' }}>
                                <div className={`chaos-mode-badge ${chaosMode.toLowerCase()}`} style={{ marginBottom: '1rem' }}>
                                    Current State: {chaosMode === 'NORMAL' ? 'Optimal Performance' : 'Degraded Kitchen'}
                                </div>

                                <p className="chaos-warning" style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                                    Testing system resilience by injecting latency into the kitchen fulfillment pipeline.
                                </p>

                                <div className="chaos-buttons">
                                    <button
                                        className="btn-chaos"
                                        onClick={() => triggerChaos(5000)}
                                        disabled={chaosLoading || chaosMode === 'SLOW'}
                                    >
                                        🐢 Inject Kitchen Latency
                                    </button>
                                    <button
                                        className="btn-restore"
                                        onClick={() => triggerChaos(0)}
                                        disabled={chaosLoading || chaosMode === 'NORMAL'}
                                    >
                                        ✅ Restore Optimal Speed
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Live Metrics Grid */}
                    <div className="card">
                        <h2>📊 Resilience Metrics</h2>
                        <div className="metrics-grid">
                            <div className="metric-block">
                                <div className="metric-label">Avg Latency (30s)</div>
                                <div className={`metric-value ${metrics.highLatency ? 'ruby' : 'cyan'}`}>
                                    {metrics.avgLatencyMs}ms
                                </div>
                            </div>
                            <div className="metric-block">
                                <div className="metric-label">Total Volume</div>
                                <div className="metric-value emerald">{metrics.totalOrders}</div>
                            </div>
                            <div className="metric-block">
                                <div className="metric-label">Session Depth</div>
                                <div className="metric-value emerald">{sessionOrders}</div>
                            </div>
                        </div>
                        {metrics.highLatency && (
                            <div className="latency-alert" style={{ marginTop: '1rem', textAlign: 'center' }}>
                                🚨 Critical Latency Detected - Circuit Braking Engaged
                            </div>
                        )}
                    </div>

                    {/* Observability Links */}
                    <div className="card">
                        <h2>🛠️ Platform Tools</h2>
                        <div className="dev-links">
                            <a href="http://localhost:3006" target="_blank" rel="noreferrer" className="dev-link-btn">
                                📊 Advanced Grafana Dashboard
                            </a>
                            <a href="http://localhost:3006/explore" target="_blank" rel="noreferrer" className="dev-link-btn">
                                📜 Centralized Loki Logs
                            </a>
                            <a href="http://localhost:16686" target="_blank" rel="noreferrer" className="dev-link-btn">
                                ⚡ Distributed Tracing (Jaeger)
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div className="stars" />
        </div>
    )
}

// ─── Toast Component ──────────────────────────────────────────────────────────
function ToastList({ toasts }: { toasts: Toast[] }) {
    return (
        <div className="toast-list">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    {t.message}
                </div>
            ))}
        </div>
    )
}

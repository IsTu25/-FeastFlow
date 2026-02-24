document.addEventListener('DOMContentLoaded', () => {
    const GATEWAY_URL = 'http://localhost/api/order';
    const IDP_URL = 'http://localhost:80/api/auth';
    const NOTIF_HUB_URL = 'http://localhost';

    const loginForm = document.getElementById('login-form');
    const loginSection = document.getElementById('login-section');
    const orderSection = document.getElementById('order-section');
    const statusSection = document.getElementById('status-section');
    const userInfo = document.getElementById('user-info');
    const studentIdDisplay = document.getElementById('student-id-display');
    const logoutBtn = document.getElementById('logout-btn');
    const orderBtn = document.getElementById('order-btn');
    const loginError = document.getElementById('login-error');
    const orderError = document.getElementById('order-error');

    let token = localStorage.getItem('token');
    let currentStudentId = localStorage.getItem('studentId');
    let socket = null;

    const show = (el) => el.classList.remove('hidden');
    const hide = (el) => el.classList.add('hidden');

    function updateTracker(status) {
        const steps = ['pending', 'verified', 'kitchen', 'ready'];
        let currentIdx = -1;
        if (status === 'Pending') currentIdx = 0;
        if (status === 'Verified') currentIdx = 1; // Simulated
        if (status === 'Confirmed' || status === 'In Kitchen') currentIdx = 2;
        if (status === 'Ready') currentIdx = 3;

        steps.forEach((step, idx) => {
            const el = document.getElementById(`step-${step}`);
            el.className = 'step'; // reset
            if (idx < currentIdx) el.classList.add('completed');
            if (idx === currentIdx) {
                el.classList.add('completed');
                el.classList.add('active'); // highlight current
            }
        });
    }

    function initSocket() {
        if (socket) socket.disconnect();
        socket = io(NOTIF_HUB_URL, { query: { studentId: currentStudentId } });

        socket.on('orderStatus', (data) => {
            console.log('Status update:', data);
            updateTracker(data.status);
            if (data.status === 'Ready') {
                setTimeout(() => {
                    alert('Your Iftar is Ready!');
                    hide(statusSection);
                    show(orderSection);
                }, 1000);
            }
        });
    }

    if (token && currentStudentId) {
        setupLoggedInState();
    }

    function setupLoggedInState() {
        hide(loginSection);
        show(orderSection);
        show(userInfo);
        studentIdDisplay.textContent = currentStudentId;
        initSocket();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('studentId').value;
        const pwd = document.getElementById('password').value;
        hide(loginError);

        try {
            const res = await fetch(`${IDP_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: id, password: pwd })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Login failed');

            token = data.token;
            currentStudentId = data.studentId;
            localStorage.setItem('token', token);
            localStorage.setItem('studentId', currentStudentId);

            setupLoggedInState();
        } catch (err) {
            orderSection.classList.add('hidden'); // ensure
            loginError.textContent = err.message;
            show(loginError);
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.clear();
        token = null;
        currentStudentId = null;
        if (socket) socket.disconnect();

        hide(userInfo);
        hide(orderSection);
        hide(statusSection);
        show(loginSection);
    });

    orderBtn.addEventListener('click', async () => {
        try {
            orderBtn.disabled = true;
            hide(orderError);
            const idempotencyKey = crypto.randomUUID();
            const res = await fetch(`${GATEWAY_URL}/order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ itemId: 'iftar_box', quantity: 1, idempotencyKey })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Order failed');

            hide(orderSection);
            show(statusSection);
            updateTracker('Pending');

            // Simulate Gateway verified -> Verified tracker update
            setTimeout(() => {
                updateTracker('Verified');
            }, 500);

        } catch (err) {
            orderError.textContent = err.message;
            show(orderError);
        } finally {
            orderBtn.disabled = false;
        }
    });
});

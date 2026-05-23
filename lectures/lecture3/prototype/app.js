// SpillFree Tray & Bowl - 配膳シミュレータ

const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('tray-handle');

// デバイスピクセル比に応じたキャンバスリサイズ
function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- シミュレーション状態の定義 ---
let mode = 'normal'; // 'normal' or 'spillfree'
let trayX = 0;       // お盆の中心X座標 (キャンバス座標)
let prevTrayX = 0;
let trayVx = 0;      // お盆の速度
let trayAx = 0;      // お盆の加速度

let isDragging = false;
let startDragX = 0;
let baseTrayX = 0;

// 液体のシミュレーション (波のグリッド)
const NUM_POINTS = 15;
const liquidPoints = [];
const bowlRadius = 60;
const bowlHeight = 65;

// お椀と箸の位置 (滑りシミュレーション用)
let bowlOffset = 0; // お盆の中心からのズレ
let chopsticksOffset = 0;

// パーティクル (飛び散る味噌汁)
const particles = [];

// スコア & ステータス
let spillsCount = 0;
let wetness = 0; // 0 to 100
let comfort = 100; // 0 to 100

// 初期化
function initLiquid() {
    liquidPoints.length = 0;
    for (let i = 0; i < NUM_POINTS; i++) {
        liquidPoints.push({
            x: -bowlRadius + (i * (bowlRadius * 2) / (NUM_POINTS - 1)),
            y: 0, // 基本液面からの変位
            vy: 0 // 垂直速度
        });
    }
}
initLiquid();

// --- 各種パラメータ定義 ---
const params = {
    normal: {
        damping: 0.97,      // 減衰 (高いほど波が消えにくい)
        inertia: 0.15,      // 慣性の影響度
        tension: 0.05,     // 液面復元力 (バネ定数)
        slipRisk: 0.8,      // 滑りやすさ
        absorb: false       // 波の吸収機能
    },
    spillfree: {
        damping: 0.80,      // 非常に高い減衰 (波がすぐに静まる)
        inertia: 0.02,      // スタビライザーで慣性をほぼ無効化 (15%)
        tension: 0.15,      // すぐにフラットに戻る力
        slipRisk: 0,        // ノンスリップ
        absorb: true        // 縁で波を吸収
    }
};

// --- イベントリスナー ---
const getEventX = (e) => e.touches ? e.touches[0].clientX : e.clientX;

function startDrag(e) {
    isDragging = true;
    startDragX = getEventX(e);
    baseTrayX = trayX;
    e.preventDefault();
}

function drag(e) {
    if (!isDragging) return;
    const currentX = getEventX(e);
    const diff = currentX - startDragX;
    
    // お盆の位置を更新 (キャンバスの表示幅にクランプ)
    const displayWidth = canvas.width / window.devicePixelRatio;
    trayX = baseTrayX + diff;
    trayX = Math.max(120, Math.min(displayWidth - 120, trayX));
}

function endDrag() {
    isDragging = false;
}

container.addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', drag);
window.addEventListener('mouseup', endDrag);

container.addEventListener('touchstart', startDrag, { passive: false });
window.addEventListener('touchmove', drag, { passive: false });
window.addEventListener('touchend', endDrag);

// モード切り替え
document.querySelectorAll('input[name="tray-mode"]').forEach(input => {
    input.addEventListener('change', (e) => {
        mode = e.target.value;
        // モード変更時にお椀の位置などをリセット
        bowlOffset = 0;
        chopsticksOffset = 0;
    });
});

// リセットボタン
document.getElementById('btn-reset').addEventListener('click', () => {
    spillsCount = 0;
    wetness = 0;
    comfort = 100;
    bowlOffset = 0;
    chopsticksOffset = 0;
    particles.length = 0;
    initLiquid();
    updateUI();
});

// 飛沫パーティクル作成
function createSpillParticle(x, y, vx, vy) {
    particles.push({
        x: x,
        y: y,
        vx: vx + (Math.random() - 0.5) * 2,
        vy: vy - Math.random() * 3 - 1,
        radius: Math.random() * 3 + 2,
        life: 1.0,
        decay: Math.random() * 0.05 + 0.02
    });
}

// 物理演算 & 更新
function updatePhysics() {
    const currentParams = params[mode];
    const displayWidth = canvas.width / window.devicePixelRatio;
    
    // 起動直後などにお盆を中心に初期配置する
    if (trayX === 0) {
        trayX = displayWidth / 2;
        prevTrayX = trayX;
    }

    // 速度と加速度の計算
    trayVx = trayX - prevTrayX;
    trayAx = trayVx * 0.8; // 加速度係数
    prevTrayX = trayX;

    // 滑りシミュレーション (普通モードのみ)
    if (currentParams.slipRisk > 0) {
        // 加速度が一定を超えるとズレる
        if (Math.abs(trayAx) > 3) {
            bowlOffset += trayAx * 0.15 * currentParams.slipRisk;
            chopsticksOffset += trayAx * 0.25 * currentParams.slipRisk;
        }
        // お盆の縁で跳ね返り/クランプ
        bowlOffset = Math.max(-100, Math.min(100, bowlOffset));
        chopsticksOffset = Math.max(-110, Math.min(110, chopsticksOffset));
    } else {
        // SpillFree時はスムーズに中央に戻る (ノンスリップ吸着)
        bowlOffset *= 0.8;
        chopsticksOffset *= 0.8;
    }

    // 液面の物理演算
    const force = -trayAx * currentParams.inertia;
    
    // バネと波の伝播モデル
    for (let i = 0; i < NUM_POINTS; i++) {
        const pt = liquidPoints[i];
        const targetY = 0;
        
        // 1. お盆の加速度による慣性力
        pt.vy += force;
        
        // 2. 基本高さに戻ろうとするバネの力
        const diff = pt.y - targetY;
        pt.vy -= currentParams.tension * diff;
        
        // 3. 速度更新と減衰
        pt.vy *= currentParams.damping;
        pt.y += pt.vy;
    }

    // 隣接ポイント間での波の伝播
    const spread = 0.25;
    for (let iteration = 0; iteration < 4; iteration++) {
        for (let i = 0; i < NUM_POINTS; i++) {
            if (i > 0) {
                const left = liquidPoints[i - 1];
                const pt = liquidPoints[i];
                const lDiff = spread * (pt.y - left.y);
                left.vy += lDiff;
                left.y += lDiff;
            }
            if (i < NUM_POINTS - 1) {
                const right = liquidPoints[i + 1];
                const pt = liquidPoints[i];
                const rDiff = spread * (pt.y - right.y);
                right.vy += rDiff;
                right.y += rDiff;
            }
        }
    }

    // こぼれ判定と飛沫エフェクト
    const displayHeight = canvas.height / window.devicePixelRatio;
    const bowlY = displayHeight - 120;
    const bowlBaseX = trayX + bowlOffset;

    liquidPoints.forEach((pt, index) => {
        // 液面の絶対X, Y
        const absX = bowlBaseX + pt.x;
        // お椀の深さは bowlHeight
        const absY = bowlY - bowlHeight + pt.y;
        
        // 端の部分 (インデックス 0 と最後) がお椀のフチを超えたらこぼれる
        if (index === 0 || index === NUM_POINTS - 1) {
            const limit = -12; // こぼれる閾値
            if (pt.y < limit) {
                // こぼれた！
                const overflow = Math.abs(pt.y - limit);
                pt.y = limit;
                pt.vy = 0;
                
                if (Math.random() < 0.3) {
                    spillsCount++;
                    wetness = Math.min(100, wetness + 1.5);
                    
                    // パーティクル生成 (飛び散る方向)
                    const dir = index === 0 ? -1 : 1;
                    createSpillParticle(absX, absY, trayVx + dir * 2, -2);
                }
            }
        }
    });

    // パーティクル更新
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2; // 重力
        p.life -= p.decay;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    // 快適度 (Gains/Pains) の計算
    if (mode === 'normal') {
        const slipScore = (Math.abs(bowlOffset) + Math.abs(chopsticksOffset)) / 2;
        comfort = Math.max(0, 100 - (wetness * 1.5) - (slipScore * 0.8));
    } else {
        // SpillFree時はほぼ満点
        comfort = 100;
    }

    updateUI();
}

// UI要素の更新
function updateUI() {
    document.getElementById('stat-wetness').innerText = `${Math.floor(wetness)}%`;
    document.getElementById('stat-comfort').innerText = `${Math.floor(comfort)}%`;
    document.getElementById('stat-spills').innerText = `${Math.floor(spillsCount)} 回`;

    // リアルタイムフィードバックの書き換え
    const painList = document.getElementById('pain-list');
    const gainList = document.getElementById('gain-list');
    
    painList.innerHTML = '';
    gainList.innerHTML = '';

    if (mode === 'normal') {
        // Pains
        if (wetness > 0) {
            painList.innerHTML += '<li>お盆が味噌汁で濡れてしまって不快</li>';
            painList.innerHTML += '<li>お盆を拭く用のティッシュが必要</li>';
        }
        if (Math.abs(bowlOffset) > 10) {
            painList.innerHTML += '<li>歩くと汁が波打ってこぼれてしまう</li>';
        }
        if (Math.abs(chopsticksOffset) > 20) {
            painList.innerHTML += '<li>お盆に乗っているお箸なども濡れてしまう</li>';
        }
        if (painList.innerHTML === '') {
            painList.innerHTML = '<li>なし (今はうまく運べています)</li>';
        }

        // Gains
        gainList.innerHTML = '<li>(従来お盆では利得が得られにくいです)</li>';
    } else {
        // SpillFree
        painList.innerHTML = '<li>なし</li>';

        // Gains
        gainList.innerHTML += '<li>片手でも安心して運べる</li>';
        gainList.innerHTML += '<li>汁ものが揺れにくい</li>';
        gainList.innerHTML += '<li>配膳が楽になる</li>';
        gainList.innerHTML += '<li>誰にとっても安心して持ち運べる</li>';
        gainList.innerHTML += '<li>綺麗なまま食事に入れる</li>';
    }
}

// 描画ループ
function draw() {
    const displayWidth = canvas.width / window.devicePixelRatio;
    const displayHeight = canvas.height / window.devicePixelRatio;
    
    // 背景クリア
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const bowlY = displayHeight - 120;
    const trayY = displayHeight - 90;

    // --- お盆 (Tray) の描画 ---
    ctx.shadowBlur = 15;
    ctx.shadowColor = mode === 'spillfree' ? 'rgba(168, 85, 247, 0.4)' : 'rgba(0, 0, 0, 0.5)';
    
    // お盆本体
    ctx.fillStyle = mode === 'spillfree' ? '#1e1b4b' : '#1e293b';
    ctx.strokeStyle = mode === 'spillfree' ? '#a855f7' : '#475569';
    ctx.lineWidth = 4;
    
    // 角丸長方形のお盆
    ctx.beginPath();
    ctx.roundRect(trayX - 160, trayY - 10, 320, 20, 6);
    ctx.fill();
    ctx.stroke();
    
    // シャドウリセット
    ctx.shadowBlur = 0;

    // お盆の濡れ具合 (Wetness) ビジュアル表現
    if (wetness > 0) {
        ctx.fillStyle = `rgba(180, 83, 9, ${Math.min(0.7, wetness / 100)})`; // 味噌汁色の汚れ
        ctx.beginPath();
        ctx.ellipse(trayX + bowlOffset, trayY - 2, 90 + wetness, 4, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // SpillFreeの吸着マーカー (ビジュアル効果)
    if (mode === 'spillfree') {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.ellipse(trayX, trayY - 8, bowlRadius + 10, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // --- お椀 (Bowl) の描画 ---
    const currentBowlX = trayX + bowlOffset;

    // 1. お椀の外側
    ctx.fillStyle = '#7f1d1d'; // 赤漆塗り風
    ctx.beginPath();
    ctx.moveTo(currentBowlX - bowlRadius, bowlY - bowlHeight);
    ctx.quadraticCurveTo(currentBowlX - bowlRadius, bowlY - 10, currentBowlX - 25, bowlY);
    ctx.lineTo(currentBowlX + 25, bowlY);
    ctx.quadraticCurveTo(currentBowlX + bowlRadius, bowlY - 10, currentBowlX + bowlRadius, bowlY - bowlHeight);
    ctx.closePath();
    ctx.fill();
    
    // 高台 (底の足部分)
    ctx.fillStyle = '#450a0a';
    ctx.fillRect(currentBowlX - 20, bowlY, 40, 8);

    // 2. 味噌汁 (液体) の描画
    const liquidBaseY = bowlY - bowlHeight + 20; // 通常の液面高さ
    ctx.fillStyle = '#b45309'; // 味噌汁色
    
    ctx.beginPath();
    ctx.moveTo(currentBowlX - bowlRadius + 4, bowlY - bowlHeight + 10);
    
    // 左端
    ctx.lineTo(currentBowlX + liquidPoints[0].x, liquidBaseY + liquidPoints[0].y);
    
    // 波打つ液面のカーブ描画
    for (let i = 1; i < NUM_POINTS; i++) {
        const pt = liquidPoints[i];
        ctx.lineTo(currentBowlX + pt.x, liquidBaseY + pt.y);
    }
    
    // 右端からお椀の底を通るパス
    ctx.lineTo(currentBowlX + bowlRadius - 4, bowlY - bowlHeight + 10);
    ctx.quadraticCurveTo(currentBowlX + bowlRadius - 4, bowlY - 10, currentBowlX + 22, bowlY - 4);
    ctx.lineTo(currentBowlX - 22, bowlY - 4);
    ctx.quadraticCurveTo(currentBowlX - bowlRadius + 4, bowlY - 10, currentBowlX - bowlRadius + 4, bowlY - bowlHeight + 10);
    ctx.closePath();
    ctx.fill();

    // 豆腐や具のイメージ（おまけ）
    ctx.fillStyle = '#f8fafc'; // とうふ
    ctx.fillRect(currentBowlX - 20 + liquidPoints[3].y*0.2, liquidBaseY + 15 + liquidPoints[3].y*0.8, 8, 8);
    ctx.fillRect(currentBowlX + 15 + liquidPoints[9].y*0.2, liquidBaseY + 22 + liquidPoints[9].y*0.8, 8, 8);
    ctx.fillStyle = '#15803d'; // ネギ
    ctx.beginPath();
    ctx.arc(currentBowlX + 5 + liquidPoints[6].y*0.2, liquidBaseY + 10 + liquidPoints[6].y*0.8, 3, 0, Math.PI * 2);
    ctx.arc(currentBowlX - 10 + liquidPoints[4].y*0.2, liquidBaseY + 25 + liquidPoints[4].y*0.8, 3, 0, Math.PI * 2);
    ctx.fill();

    // お椀のフチ/内側の影
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(currentBowlX - bowlRadius, bowlY - bowlHeight);
    ctx.quadraticCurveTo(currentBowlX, bowlY - bowlHeight + 5, currentBowlX + bowlRadius, bowlY - bowlHeight);
    ctx.stroke();

    // SpillFreeの二重構造/ジャイロスタビライズ演出 (半透明フープ)
    if (mode === 'spillfree') {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(currentBowlX, bowlY - bowlHeight / 2, bowlRadius + 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    // --- お箸 (Chopsticks) の描画 ---
    const chopsticksX = trayX + chopsticksOffset;
    ctx.strokeStyle = '#d97706'; // 木の箸
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    // 箸1
    ctx.beginPath();
    ctx.moveTo(chopsticksX - 110, trayY - 14);
    ctx.lineTo(chopsticksX - 40, trayY - 18);
    ctx.stroke();

    // 箸2
    ctx.beginPath();
    ctx.moveTo(chopsticksX - 110, trayY - 18);
    ctx.lineTo(chopsticksX - 40, trayY - 22);
    ctx.stroke();

    // --- 飛沫パーティクルの描画 ---
    particles.forEach(p => {
        ctx.fillStyle = `rgba(180, 83, 9, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ループ処理
function loop() {
    updatePhysics();
    draw();
    requestAnimationFrame(loop);
}

// ループ開始
requestAnimationFrame(loop);

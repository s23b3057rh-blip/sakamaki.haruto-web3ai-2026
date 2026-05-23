// ==========================================================================
// Technology Database & Descriptions
// ==========================================================================
const techInfo = {
    overview: {
        title: "システム概要",
        desc: "トグルスイッチを操作して各技術をON/OFFしてください。左下の「お盆を揺らす」ボタンでデモ走行を実行でき、技術の有無による物理挙動（器の滑り、味噌汁の波立ち、お盆の安定度）の変化とこぼれリスクを体験できます。"
    },
    nonslip: {
        title: "01. ナノ吸引ノンスリップ層",
        desc: "お盆の表面に微細な吸盤構造を持つ特殊ゴム層を配置。器との間の空気圧を利用して吸着し、摩擦係数を極限まで高めることで、歩行時の振動や最大45度の傾きでも器が横滑りするのを完全に防ぎます。"
    },
    balancer: {
        title: "02. 低重心バランサー",
        desc: "お盆の持ち手（外枠）とトレー部（内枠）を分離した2軸ジャイロ構造を採用。歩行時に手元が左右に傾いても、内枠が重力に従って常に水平を維持し、お盆を常にフラットな状態に保ちます。"
    },
    magnetic: {
        title: "03. 磁力アシストホルダー",
        desc: "お盆の配膳エリアと器の底面にネオジム磁石を内蔵。器を近づけるだけで中心部にピタッとガイド・吸着され、配膳中の不意の衝突や、急に立ち止まった際の強い慣性力でも器の浮き上がりや転倒を防止します。"
    },
    fins: {
        title: "04. 波立ち抑制二重構造椀",
        desc: "器の内壁に流体力学設計の「らせん状フィン」を施した二重構造。歩行のピッチによって発生する味噌汁の周期的な波立ちをフィンの壁面が受け止めて干渉させ、波のエネルギーを熱として分散・打ち消します。"
    }
};

// ==========================================================================
// DOM Elements
// ==========================================================================
const switches = {
    nonslip: document.getElementById('switch-nonslip'),
    balancer: document.getElementById('switch-balancer'),
    magnetic: document.getElementById('switch-magnetic'),
    fins: document.getElementById('switch-fins')
};

const switchCards = document.querySelectorAll('.switch-card');
const techTitle = document.getElementById('tech-title');
const techDesc = document.getElementById('tech-desc');

const btnShake = document.getElementById('btn-shake');
const statusDisplay = document.getElementById('status-display');
const stage = document.getElementById('stage');
const gyroBase = document.getElementById('gyro-base');
const tray = document.getElementById('tray');
const bowl = document.getElementById('bowl');
const soupSurface = document.getElementById('soup-surface');
const bowlFins = document.getElementById('bowl-fins');
const spillDroplets = document.getElementById('spill-droplets');

// Monitor Values
const valTilt = document.getElementById('val-tilt');
const valSlip = document.getElementById('val-slip');
const valWave = document.getElementById('val-wave');

// Risk Meter Elements
const riskProgress = document.getElementById('risk-progress');
const riskNum = document.getElementById('risk-num');
const riskLabel = document.getElementById('risk-label');

// ==========================================================================
// Application State
// ==========================================================================
let isShaking = false;
let shakeInterval = null;
let physicsInterval = null;
let animationFrameId = null;

// ==========================================================================
// Functions
// ==========================================================================

// Calculate and Update Spill Risk
function updateSpillRisk() {
    let risk = 0;
    
    if (!switches.nonslip.checked) risk += 30;
    if (!switches.balancer.checked) risk += 35;
    if (!switches.magnetic.checked) risk += 15;
    if (!switches.fins.checked) risk += 20;

    // Update Circle Progress
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (risk / 100) * circumference;
    riskProgress.style.strokeDashoffset = offset;
    
    // Update Text & Color
    riskNum.textContent = `${risk}%`;
    
    if (risk === 0) {
        riskLabel.textContent = "極めて安全";
        riskLabel.style.color = "var(--color-safe)";
        riskProgress.style.stroke = "var(--color-safe)";
        statusDisplay.className = "status-indicator";
        statusDisplay.querySelector('.text').textContent = "SYSTEM ACTIVE: SECURE";
    } else if (risk <= 35) {
        riskLabel.textContent = "注意（少し揺れる）";
        riskLabel.style.color = "var(--color-warn)";
        riskProgress.style.stroke = "var(--color-warn)";
        statusDisplay.className = "status-indicator";
        statusDisplay.querySelector('.text').textContent = "SYSTEM ACTIVE: MINOR RISK";
    } else if (risk <= 65) {
        riskLabel.textContent = "警告（こぼれ注意）";
        riskLabel.style.color = "var(--color-warn)";
        riskProgress.style.stroke = "var(--color-warn)";
        statusDisplay.className = "status-indicator danger";
        statusDisplay.querySelector('.text').textContent = "SYSTEM WARN: HIGH WAVE";
    } else {
        riskLabel.textContent = "危険（こぼれ発生）";
        riskLabel.style.color = "var(--color-danger)";
        riskProgress.style.stroke = "var(--color-danger)";
        statusDisplay.className = "status-indicator danger";
        statusDisplay.querySelector('.text').textContent = "SYSTEM CRITICAL: SPILLING";
    }

    // Toggle Visual Classes based on switches
    document.body.classList.toggle('nonslip-disabled', !switches.nonslip.checked);
    document.body.classList.toggle('balancer-disabled', !switches.balancer.checked);
    document.body.classList.toggle('balancer-active', switches.balancer.checked);
    document.body.classList.toggle('magnetic-disabled', !switches.magnetic.checked);
    document.body.classList.toggle('fins-disabled', !switches.fins.checked);
}

// Generate Spill Particle Effect
function triggerSpillEffect() {
    const droplet = document.createElement('div');
    droplet.classList.add('droplet');
    
    // Random side (left or right edge of the bowl)
    const isLeft = Math.random() > 0.5;
    droplet.style.left = isLeft ? '0px' : '74px';
    droplet.style.top = '15px';
    
    spillDroplets.appendChild(droplet);
    
    // Remove after animation completes
    setTimeout(() => {
        droplet.remove();
    }, 600);
}

// Simulated Physics Loop
let time = 0;
function runPhysicsSim() {
    time += 0.08;
    
    let baseTilt = 0;
    let actualTrayTilt = 0;
    let bowlSlip = 0;
    let waveAmplitude = 0;
    
    if (isShaking) {
        // Base tray frame tilt (input disturbance)
        baseTilt = Math.sin(time * 2.5) * 18; // Oscillates between -18 and 18 deg
        
        // 02. Low Gravity Balancer effect
        if (switches.balancer.checked) {
            // Absorbs 85% of tilt
            actualTrayTilt = baseTilt * 0.15;
        } else {
            actualTrayTilt = baseTilt;
        }
        
        // 04. Anti-wave Fins effect
        const waveBase = Math.abs(Math.sin(time * 3)) * 60;
        if (switches.fins.checked) {
            waveAmplitude = waveBase * 0.2; // Diminished wave
        } else {
            waveAmplitude = waveBase * 1.2; // Full wild wave
        }

        // 01. & 03. Friction and Magnetic Attraction Slippage calculation
        let maxSlipPotential = Math.sin(time * 2.5) * 60; // Max lateral sliding
        if (switches.nonslip.checked && switches.magnetic.checked) {
            bowlSlip = 0; // Completely locked
        } else if (switches.nonslip.checked && !switches.magnetic.checked) {
            bowlSlip = Math.abs(actualTrayTilt) > 12 ? maxSlipPotential * 0.05 : 0; // Tiny wobble
        } else if (!switches.nonslip.checked && switches.magnetic.checked) {
            bowlSlip = maxSlipPotential * 0.15; // Elastic magnetic sliding
        } else {
            bowlSlip = maxSlipPotential * 0.9; // Slithers all the way
        }
        
        // Trigger spill drops when wave amplitude exceeds 45% or slip is extreme
        if (!switches.fins.checked && waveAmplitude > 40 && Math.random() > 0.6) {
            triggerSpillEffect();
        }
        if (!switches.nonslip.checked && Math.abs(bowlSlip) > 30 && Math.random() > 0.7) {
            triggerSpillEffect();
        }
    }

    // Apply visual rotations/offsets
    gyroBase.style.transform = `rotate(${baseTilt}deg)`;
    tray.style.transform = `rotate(${actualTrayTilt - baseTilt}deg)`; // Relative balance compensation
    bowl.style.left = `calc(50% - 40px + ${bowlSlip}px)`;
    
    // Wave tilt animation
    soupSurface.style.transform = `rotate(${-actualTrayTilt * 0.8 + (waveAmplitude * 0.3 * Math.cos(time * 3.5))}deg) translateY(${-waveAmplitude * 0.08}px)`;

    // Update Monitors
    valTilt.textContent = `${actualTrayTilt.toFixed(1)}°`;
    valSlip.textContent = `${Math.abs(bowlSlip).toFixed(1)} mm`;
    valWave.textContent = `${Math.min(waveAmplitude, 100).toFixed(0)}%`;

    animationFrameId = requestAnimationFrame(runPhysicsSim);
}

// Toggle Demo Shake Mode
function toggleShake() {
    isShaking = !isShaking;
    
    if (isShaking) {
        btnShake.textContent = "デモ走行を停止する";
        btnShake.style.background = "linear-gradient(135deg, var(--color-danger), #b91c1c)";
        btnShake.style.boxShadow = "0 4px 15px rgba(239, 68, 68, 0.4)";
    } else {
        btnShake.textContent = "お盆を揺らす（デモ走行）";
        btnShake.style.background = "linear-gradient(135deg, var(--color-accent), #0284c7)";
        btnShake.style.boxShadow = "0 4px 15px rgba(var(--color-accent-rgb), 0.3)";
        
        // Reset Visual position smoothly
        setTimeout(() => {
            if (!isShaking) {
                gyroBase.style.transform = 'rotate(0deg)';
                tray.style.transform = 'rotate(0deg)';
                bowl.style.left = 'calc(50% - 40px)';
                soupSurface.style.transform = 'rotate(0deg) translateY(0px)';
                valTilt.textContent = "0.0°";
                valSlip.textContent = "0.0 mm";
                valWave.textContent = "0%";
            }
        }, 150);
    }
}

// ==========================================================================
// Event Listeners
// ==========================================================================

// Switch Info Panel on click/hover of cards
switchCards.forEach(card => {
    const tech = card.getAttribute('data-tech');
    
    card.addEventListener('click', (e) => {
        // Prevent toggle triggering multiple times if label itself is clicked
        if (e.target.tagName !== 'INPUT' && e.target.className !== 'slider') {
            const checkbox = card.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;
            updateSpillRisk();
        }
        
        // Update Description Panel
        techTitle.textContent = techInfo[tech].title;
        techDesc.textContent = techInfo[tech].desc;
    });

    card.addEventListener('mouseenter', () => {
        techTitle.textContent = techInfo[tech].title;
        techDesc.textContent = techInfo[tech].desc;
    });
});

// Restore system overview when mouse leaves switch panels
document.querySelector('.switches-list').addEventListener('mouseleave', () => {
    techTitle.textContent = techInfo.overview.title;
    techDesc.textContent = techInfo.overview.desc;
});

// Switches Event Listeners
Object.values(switches).forEach(sw => {
    sw.addEventListener('change', updateSpillRisk);
});

// Shake button
btnShake.addEventListener('click', toggleShake);

// ==========================================================================
// Initialization
// ==========================================================================
updateSpillRisk();
runPhysicsSim();

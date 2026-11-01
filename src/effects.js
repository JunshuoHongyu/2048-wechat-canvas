/**
 * 视觉特效模块（彩带 + 糖果紫气雾闪电）
 * 迁移自 TikTok Unity 版 ConfettiEffect.cs / LightningEffect.cs
 * 通过 Object.assign(Game.prototype, FK_EFFECTS) 混入，全部方法以 this 访问 Game 实例
 *
 * 彩带：合并 ≥256 时从棋盘上方喷出糖果色纸片，重力下落 + 旋转 + 淡出
 * 闪电：撤销时从后悔按钮喷出柔和紫色颗粒气雾，飘向步数框，终点光爆 + 淡出
 */
(function (global) {
    'use strict';

    const C = (typeof require === 'function')
        ? require('./config.js')
        : (global && global.FK_CONFIG) || {};

    const { COLORS, SCORE_BOX_W, SCORE_BOX_H, BOARD_ADJACENT_GAP } = C;

    // 彩带糖果色系（取自 TikTok BoardRenderer 糖果色轮）
    const CONFETTI_COLORS = ['#F091AF', '#FACD6E', '#82C3EB', '#BEA0DC'];
    // 气雾紫色系（取自 TikTok LightningEffect）
    const LIGHTNING_CORE  = '#C39BFF';  // 亮紫  RGB(195,155,255)
    const LIGHTNING_DEEP  = '#A87EF0';  // 深紫  RGB(168,126,240)
    const LIGHTNING_WHITE = '#FEFEFF';  // 白芯

    const EffectsMixin = {

        // ==================== 彩带 ====================

        /**
         * 触发彩带效果
         * @param {number} count - 粒子数量（默认 35，对齐 TikTok 版 PlayConfetti(35)）
         */
        confetti(count) {
            if (!this._confettiPieces) this._confettiPieces = [];
            const n = count || 35;
            const cx = this.width / 2;
            const cy = (this.boardY || this.height / 2) + (this.boardSize || 300) * 0.3;

            for (let i = 0; i < n; i++) {
                const w = 6 + Math.random() * 8;
                this._confettiPieces.push({
                    x: cx + (Math.random() - 0.5) * this.width * 0.5,
                    y: cy + (Math.random() - 0.5) * 40,
                    vx: (Math.random() - 0.5) * 240,
                    vy: 200 + Math.random() * 250,      // 向上初速度
                    rot: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * Math.PI * 4,  // rad/s
                    w: w,
                    h: w * (0.5 + Math.random()),       // 长宽比随机
                    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
                    life: 0,
                    maxLife: 3.0
                });
            }
        },

        updateConfetti(dt) {
            if (!this._confettiPieces || this._confettiPieces.length === 0) return;
            const gravity = 600;  // 向下加速度（canvas y 向下为正）

            for (let i = this._confettiPieces.length - 1; i >= 0; i--) {
                const p = this._confettiPieces[i];
                p.life += dt;
                if (p.life >= p.maxLife) {
                    this._confettiPieces.splice(i, 1);
                    continue;
                }
                p.vx += (Math.random() - 0.5) * 40 * dt;
                p.vy -= gravity * dt;       // 向上速度递减 → 先升后降
                p.x += p.vx * dt;
                p.y -= p.vy * dt;           // vy>0 时 y 减小 = 向上飞
                p.rot += p.rotSpeed * dt;
            }
        },

        drawConfetti() {
            if (!this._confettiPieces || this._confettiPieces.length === 0) return;
            const ctx = this.ctx;

            for (const p of this._confettiPieces) {
                const alpha = Math.max(0, 1 - p.life / p.maxLife);
                if (alpha < 0.01) continue;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        },

        // ==================== 糖果紫气雾闪电 ====================

        /**
         * 触发气雾闪电效果（撤销时从后悔按钮到步数框）
         * 可选传入起点/终点坐标，不传则自动计算
         */
        lightning(fromX, fromY, toX, toY) {
            // 自动计算位置：起点=后悔按钮中心，终点=步数分数框中心
            if (fromX == null) {
                const undoRect = this.undoRect;
                if (undoRect) {
                    fromX = undoRect.x + undoRect.w / 2;
                    fromY = undoRect.y + undoRect.h / 2;
                } else {
                    fromX = this.boardX + (this.boardSize || 300) * 0.17;
                    fromY = (this.boardY || this.height / 2) + (this.boardSize || 300) + 40;
                }
            }
            if (toX == null) {
                const gap = Math.max(8, Math.min(12, Math.floor((this.boardSize || 300) * 0.02)));
                const boxW = Math.min(SCORE_BOX_W, Math.floor(((this.boardSize || 300) - gap * 2) / 3));
                toX = (this.boardX || 30) + (boxW + gap) * 2 + boxW / 2;
                toY = (this.scoreBoxY || 100) + SCORE_BOX_H / 2;
            }

            this._lightningStart = Date.now();
            this._lightningFrom = { x: fromX, y: fromY };
            this._lightningTo = { x: toX, y: toY };
            this._lightningParticles = [];
            this._lightningGlows = [];
            this._lightningPhase = 0;        // 0=气雾喷涌, 1=光爆后淡出, 2=结束
            this._lightningMistTime = 0;
            this._lightningFadeTime = 0;

            // 起点光晕（深紫，可辨）
            this._lightningGlows.push({
                x: fromX, y: fromY, size: 80, targetSize: 130,
                color: LIGHTNING_DEEP, alpha: 0.9, type: 'from'
            });
            // 终点光晕（亮紫，更亮更大）
            this._lightningGlows.push({
                x: toX, y: toY, size: 130, targetSize: 190,
                color: LIGHTNING_CORE, alpha: 0.95, type: 'to'
            });
        },

        _lightningSpawnMist(count) {
            const from = this._lightningFrom;
            const to = this._lightningTo;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const dirX = dx / dist;
            const dirY = dy / dist;
            const normX = -dirY;
            const normY = dirX;

            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = 3 + Math.random() * 27;
                this._lightningParticles.push({
                    x: from.x + Math.cos(angle) * r,
                    y: from.y + Math.sin(angle) * r,
                    dirX: dirX, dirY: dirY,
                    normX: normX, normY: normY,
                    speed: 300 + Math.random() * 260,
                    swayAmp: 16 + Math.random() * 36,
                    swayFreq: 2.5 + Math.random() * 3,
                    phase: Math.random() * Math.PI * 2,
                    life: 0,
                    maxLife: 0.75 + Math.random() * 0.4,
                    size: 14 + Math.random() * 20,
                    color: Math.random() < 0.5 ? LIGHTNING_DEEP : LIGHTNING_CORE,
                    alpha: 0.89,
                    type: 'mist'
                });
            }
        },

        _lightningSpawnBurst(count) {
            const to = this._lightningTo;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 140 + Math.random() * 300;
                this._lightningParticles.push({
                    x: to.x, y: to.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 0,
                    maxLife: 0.35 + Math.random() * 0.2,
                    size: 10 + Math.random() * 16,
                    color: Math.random() < 0.5 ? LIGHTNING_DEEP : LIGHTNING_CORE,
                    alpha: 1,
                    type: 'burst'
                });
            }
        },

        updateLightning(dt) {
            if (!this._lightningStart && (!this._lightningParticles || this._lightningParticles.length === 0)) return;

            // 阶段一：气雾喷涌 (0~0.5s)
            if (this._lightningPhase === 0) {
                this._lightningMistTime += dt;
                const spawnCount = this._lightningMistTime < 0.12 ? 5 : 3;
                this._lightningSpawnMist(spawnCount);
                if (this._lightningMistTime >= 0.5) {
                    this._lightningPhase = 1;
                    // 终点光爆
                    this._lightningSpawnBurst(40);
                    this._lightningGlows.push({
                        x: this._lightningTo.x, y: this._lightningTo.y,
                        size: 26, targetSize: 62,
                        color: LIGHTNING_WHITE, alpha: 0.95, type: 'burst1'
                    });
                    this._lightningGlows.push({
                        x: this._lightningTo.x, y: this._lightningTo.y,
                        size: 60, targetSize: 132,
                        color: LIGHTNING_CORE, alpha: 0.9, type: 'burst2'
                    });
                }
            }

            // 阶段二：淡出 (0.5~1.05s)
            if (this._lightningPhase === 1) {
                this._lightningFadeTime += dt;
                if (this._lightningFadeTime >= 0.55) {
                    this._lightningPhase = 2;
                }
            }

            // 阶段三：等待尾部粒子消散后结束
            if (this._lightningPhase === 2) {
                if (!this._lightningParticles || this._lightningParticles.length === 0) {
                    this._lightningStart = null;
                    this._lightningGlows = [];
                    return;
                }
            }

            // 更新光晕
            for (let i = this._lightningGlows.length - 1; i >= 0; i--) {
                const g = this._lightningGlows[i];
                // 尺寸缓动到目标
                g.size += (g.targetSize - g.size) * Math.min(1, dt * 3);
                // 淡出阶段：alpha 衰减
                if (this._lightningPhase >= 1) {
                    g.alpha *= (1 - dt * 2);
                    if (g.alpha < 0.01) {
                        this._lightningGlows.splice(i, 1);
                    }
                }
            }

            // 更新粒子
            if (this._lightningParticles) {
                for (let i = this._lightningParticles.length - 1; i >= 0; i--) {
                    const p = this._lightningParticles[i];
                    p.life += dt;
                    if (p.life >= p.maxLife) {
                        this._lightningParticles.splice(i, 1);
                        continue;
                    }

                    if (p.type === 'mist') {
                        // 沿方向飘行 + 横向摆动
                        p.x += p.dirX * p.speed * dt;
                        p.y += p.dirY * p.speed * dt;
                        const sway = Math.sin(p.life * p.swayFreq + p.phase) * p.swayAmp * 0.5;
                        p.x += p.normX * sway * dt;
                        p.y += p.normY * sway * dt;

                        // 透明度：快速淡入 → 缓慢淡出
                        const fadeIn = 0.16;
                        if (p.life < fadeIn) {
                            p.curAlpha = p.alpha * (p.life / fadeIn);
                        } else {
                            const fo = (p.life - fadeIn) / (p.maxLife - fadeIn);
                            p.curAlpha = p.alpha * Math.max(0, 1 - fo * fo);
                        }
                        // 雾感膨胀
                        p.curSize = p.size * (0.8 + 0.6 * Math.min(1, p.life / p.maxLife));
                    } else {
                        // burst 粒子：径向飞散 + 阻力衰减
                        p.x += p.vx * dt;
                        p.y += p.vy * dt;
                        p.vx *= 0.5;
                        p.vy *= 0.5;
                        p.curAlpha = 1 - p.life / p.maxLife;
                        p.curSize = p.size * (1 - 0.7 * p.life / p.maxLife);
                    }
                }
            }
        },

        drawLightning() {
            const hasGlows = this._lightningGlows && this._lightningGlows.length > 0;
            const hasParticles = this._lightningParticles && this._lightningParticles.length > 0;
            if (!hasGlows && !hasParticles) return;

            const ctx = this.ctx;

            // 绘制光晕（径向渐变模拟柔和发光）
            if (hasGlows) {
                for (const g of this._lightningGlows) {
                    if (g.alpha < 0.01) continue;
                    const r = Math.max(1, g.size / 2);
                    const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
                    grad.addColorStop(0, g.color);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, Math.min(1, g.alpha));
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }

            // 绘制粒子（径向渐变圆点，模拟气雾感）
            if (hasParticles) {
                for (const p of this._lightningParticles) {
                    const alpha = p.curAlpha != null ? p.curAlpha : p.alpha;
                    const size = p.curSize != null ? p.curSize : p.size;
                    if (alpha < 0.01) continue;
                    const r = Math.max(1, size / 2);
                    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
                    grad.addColorStop(0, p.color);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }

            ctx.globalAlpha = 1;
        },
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EffectsMixin;
    } else {
        global.FK_EFFECTS = EffectsMixin;
    }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : this));

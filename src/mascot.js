/**
 * 魔法少女装饰 + 猫咪 Logo + 油画对话框气泡
 * 迁移自 TikTok Unity 版 ScoreDisplay.cs
 *   - CreateCatTitle: MOVES 分数框上方的透明猫咪 Logo
 *   - CreateMagicGirl: UNDO 按钮正下方的魔法少女装饰
 *   - CreateMagicSpeechBubble: 魔法少女右侧的油画框对话气泡（提示语）
 *
 * 通过 Object.assign(Game2048.prototype, FK.mascot) 混入
 */
(function (global) {
    'use strict';

    const C = (typeof require === 'function')
        ? require('./config.js')
        : (global && global.FK_CONFIG) || {};

    const { COLORS, SCORE_BOX_H, BOARD_ADJACENT_GAP } = C;

    // 图片比例 560:944
    const IMG_RATIO = 560 / 944;

    // 油画框颜色（对齐 TikTok ScoreDisplay.cs）
    const FRAME_BROWN  = '#4F3826';   // 深棕油画框  RGB(0.31,0.22,0.15)
    const PAPER_CREAM  = '#FCF8E8';   // 米白纸面    RGB(0.99,0.97,0.91)

    const MascotMixin = {

        // ==================== 初始化 ====================

        /**
         * 加载图片资源（在 init 中调用一次）
         */
        loadMascotImages() {
            if (this._mascotLoaded) return;
            this._mascotLoaded = true;
            this._catImg = null;
            this._girlImg = null;
            this._mascotLoadErrors = 0;

            // 微信小游戏环境用 wx.createImage，浏览器用 new Image
            const makeImage = (typeof wx !== 'undefined' && wx.createImage)
                ? () => wx.createImage()
                : () => new (typeof Image !== 'undefined' ? Image : Object)();

            const cat = makeImage();
            cat.onload = () => { this._catImg = cat; };
            cat.onerror = () => {
                console.warn('[Mascot] CatLogo.png 加载失败');
                this._mascotLoadErrors++;
            };
            cat.src = 'images/CatLogo.png';

            const girl = makeImage();
            girl.onload = () => { this._girlImg = girl; };
            girl.onerror = () => {
                console.warn('[Mascot] MagicGirl.png 加载失败');
                this._mascotLoadErrors++;
            };
            girl.src = 'images/MagicGirl.png';
        },

        /**
         * 计算魔法少女和猫咪 Logo 的布局位置
         * 在 computeLayout / initLayout 之后调用
         */
        computeMascotLayout() {
            if (!this.boardSize || !this.undoRect) return;

            // ---- 猫咪 Logo：MOVES 分数框正上方 ----
            const gap = Math.max(8, Math.min(12, Math.floor(this.boardSize * 0.02)));
            const boxW = Math.min(C.SCORE_BOX_W, Math.floor((this.boardSize - gap * 2) / 3));
            const movesX = this.boardX + (boxW + gap) * 2 + boxW / 2;

            // 猫咪高度：可用空间 = scoreBoxY 到屏幕顶部，留 margin
            const catAvail = Math.max(0, this.scoreBoxY - 8);
            // 宽度对齐 MOVES 框宽度的 1.5 倍，高度按比例算，但不超过可用空间
            const catWTarget = boxW * 1.2;
            const catHTarget = catWTarget / IMG_RATIO;
            let catH = Math.min(catHTarget, catAvail * 0.85);
            let catW = catH * IMG_RATIO;
            // 下限保护
            if (catH < 30) { catH = 0; catW = 0; }

            this._catLayout = {
                cx: movesX,
                cy: this.scoreBoxY - catH / 2 - 4,
                w: catW,
                h: catH
            };

            // ---- 魔法少女：UNDO 按钮正下方 ----
            const undoRect = this.undoRect;
            const undoCx = undoRect.x + undoRect.w / 2;
            const undoBottom = undoRect.y + undoRect.h;

            // 高度自适应：UNDO 底到屏底的可用高度（留 8px 边距）
            const girlAvail = Math.max(0, this.height - undoBottom - 8);
            let girlH = Math.min(180, Math.max(40, girlAvail));
            let girlW = girlH * IMG_RATIO;
            // 如果太宽超出 UNDO 按钮范围，按宽度限制
            const maxW = undoRect.w * 0.85;
            if (girlW > maxW) {
                girlW = maxW;
                girlH = girlW / IMG_RATIO;
            }

            this._girlLayout = {
                cx: undoCx,
                cy: undoBottom + girlH / 2 + 4,
                w: girlW,
                h: girlH
            };

            // ---- 对话框气泡：魔法少女右侧 ----
            if (this._girlLayout && this._girlLayout.w > 0) {
                const girl = this._girlLayout;
                // 气泡尺寸：根据可用宽度自适应
                const bubbleW = Math.min(this.boardSize * 0.55, 220);
                const bubbleH = Math.min(girl.h * 0.8, 80);
                // 位置：魔法少女右侧，留 8px 间隙
                let bubbleX = girl.cx + girl.w / 2 + 8;
                // 右边界溢出保护：右侧空间不足时改放左侧
                if (bubbleX + bubbleW > this.width - 8) {
                    bubbleX = girl.cx - girl.w / 2 - 8 - bubbleW;
                    // 左侧也不够时强制靠右对齐
                    if (bubbleX < 8) {
                        bubbleX = Math.max(8, this.width - bubbleW - 8);
                    }
                }
                const bubbleY = girl.cy - bubbleH / 2;

                this._bubbleLayout = {
                    x: bubbleX,
                    y: bubbleY,
                    w: bubbleW,
                    h: bubbleH,
                    // 气泡尾巴指向左侧魔法少女
                    tailFromX: bubbleX,
                    tailToX: girl.cx + girl.w / 2,
                    tailY: bubbleY + bubbleH / 2
                };
            }
        },

        // ==================== 绘制 ====================

        /**
         * 绘制猫咪 Logo（在分数框绘制之后、棋盘之前调用）
         */
        drawCatLogo() {
            if (!this._catLayout || this._catLayout.w <= 0) return;
            if (!this._catImg || !this._catImg.width) return;

            const ctx = this.ctx;
            const L = this._catLayout;
            ctx.save();
            ctx.drawImage(
                this._catImg,
                L.cx - L.w / 2,
                L.cy - L.h / 2,
                L.w,
                L.h
            );
            ctx.restore();
        },

        /**
         * 绘制魔法少女装饰（在棋盘和按钮绘制之后调用）
         */
        drawMagicGirl() {
            if (!this._girlLayout || this._girlLayout.w <= 0) return;
            if (!this._girlImg || !this._girlImg.width) return;

            const ctx = this.ctx;
            const L = this._girlLayout;
            ctx.save();
            ctx.drawImage(
                this._girlImg,
                L.cx - L.w / 2,
                L.cy - L.h / 2,
                L.w,
                L.h
            );
            ctx.restore();
        },

        // ==================== 油画对话框气泡 ====================

        /**
         * 显示提示语（通过油画对话框气泡，替代棋盘上浮动文字）
         * 对齐 TikTok 版 ShowFloatText → SpeechRoutine
         */
        showSpeechBubble(text, duration) {
            if (!text) return;
            const now = Date.now();
            this._speech = {
                text: String(text),
                startAt: now,
                duration: duration || 1500,
                // 淡入 0.14s → 停留 → 淡出 0.3s（对齐 TikTok SpeechRoutine）
                fadeIn: 140,
                fadeOut: 300
            };
        },

        /**
         * 更新对话框气泡状态（在更新循环中调用）
         */
        updateSpeechBubble(now) {
            if (!this._speech) return;
            const elapsed = now - this._speech.startAt;
            const total = this._speech.duration + this._speech.fadeOut;
            if (elapsed >= total) {
                this._speech = null;
            }
        },

        /**
         * 绘制油画对话框气泡（在所有 UI 之上绘制）
         */
        drawSpeechBubble(now) {
            if (!this._speech) return;
            if (!this._bubbleLayout) return;

            const ctx = this.ctx;
            const L = this._bubbleLayout;
            const sp = this._speech;

            // 计算透明度
            const elapsed = now - sp.startAt;
            let alpha = 0;
            if (elapsed < sp.fadeIn) {
                alpha = elapsed / sp.fadeIn;
            } else if (elapsed < sp.duration) {
                alpha = 1;
            } else {
                alpha = Math.max(0, 1 - (elapsed - sp.duration) / sp.fadeOut);
            }
            if (alpha <= 0.01) return;

            ctx.save();
            ctx.globalAlpha = alpha;

            // ---- 外层：深棕油画框 ----
            const frameInset = 4;  // 边框宽度
            ctx.fillStyle = FRAME_BROWN;
            this.roundRect(L.x, L.y, L.w, L.h, 10);
            ctx.fill();

            // ---- 内层：米白纸面 ----
            ctx.fillStyle = PAPER_CREAM;
            this.roundRect(
                L.x + frameInset,
                L.y + frameInset,
                L.w - frameInset * 2,
                L.h - frameInset * 2,
                7
            );
            ctx.fill();

            // ---- 文字：纯黑加粗居中 ----
            ctx.fillStyle = '#000';
            ctx.font = this.getFont('bold', Math.max(12, Math.min(18, Math.floor(L.h * 0.32))));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // 文字区域留 padding
            const pad = 14;
            ctx.fillText(sp.text, L.x + L.w / 2, L.y + L.h / 2, L.w - pad * 2);

            // ---- 气泡尾巴：两个空心圆环（漫画对话框风格）----
            // 大环压在框左缘，小环在其左侧，逐级缩小，指向魔法少女
            const tailY = L.tailY;
            const bigR = 10;
            const smallR = 6;
            const bigX = L.x - 4;
            const smallX = bigX - bigR - smallR - 2;

            ctx.strokeStyle = FRAME_BROWN;
            ctx.lineWidth = 3;

            // 大环
            ctx.beginPath();
            ctx.arc(bigX, tailY, bigR, 0, Math.PI * 2);
            ctx.stroke();

            // 小环
            ctx.beginPath();
            ctx.arc(smallX, tailY, smallR, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        },
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MascotMixin;
    } else {
        global.FK_MASCOT = MascotMixin;
    }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : this));

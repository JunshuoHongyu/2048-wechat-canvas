/**
 * 声音模块（WebAudio 合成音效：可爱软软风）+ 声音开关（位于「最佳」分数框正上方）
 *
 * 零资源依赖：使用 wx.createWebAudioContext 实时合成短促、偏高音、圆润的音效，
 * 不依赖任何音频文件；基础库不支持 WebAudio 时自动静默降级（游戏照常运行）。
 * 开关状态持久化在 fk2048_sound_on。
 * 通过 Object.assign(Game.prototype, FK_SOUND) 混入，全部方法以 this 访问 Game 实例
 */
(function (global) {
    'use strict';

    const SOUND_SAVE_KEY = 'fk2048_sound_on';

    const C = (typeof require === 'function')
        ? require('./config.js')
        : (global && global.FK_CONFIG) || {};

    // 布局依赖：分数组宽度与「分数组/特技池与棋盘」的统一垂直间距
    const { SCORE_BOX_W, BOARD_ADJACENT_GAP, COLORS } = C;

    const SoundMixin = {

        // ---------- 初始化 ----------
        initSound() {
            this.soundOn = true;
            this._webAudioCtx = null;
            this._audioInterrupted = false;
            try {
                const saved = wx.getStorageSync(SOUND_SAVE_KEY);
                if (saved === false || saved === 0 || saved === '0') this.soundOn = false;
            } catch (e) { }
            this.initWebAudio();
            this.bindAudioInterruption();
            this.initUndoAudio();
        },

        // 撤销音效使用外部 mp3 文件（魔法音效），通过 InnerAudioContext 播放
        initUndoAudio() {
            try {
                if (typeof wx !== 'undefined' && wx.createInnerAudioContext) {
                    this._undoAudio = wx.createInnerAudioContext();
                    this._undoAudio.src = 'audio/undo_magic.mp3';
                    this._undoAudio.volume = 0.6;
                    this._undoAudio.onError(function () {
                        console.warn('[Sound] undo_magic.mp3 加载失败');
                    });
                }
            } catch (e) {
                this._undoAudio = null;
            }
        },

        // 微信音频中断处理：来电/闹钟时暂停 WebAudio，恢复后 resume
        bindAudioInterruption() {
            if (typeof wx !== 'undefined' && typeof wx.onAudioInterruptionBegin === 'function') {
                this._onAudioInterruptBegin = () => {
                    this._audioInterrupted = true;
                    try {
                        if (this._webAudioCtx && this._webAudioCtx.suspend) {
                            this._webAudioCtx.suspend();
                        }
                    } catch (e) { }
                };
                wx.onAudioInterruptionBegin(this._onAudioInterruptBegin);
            }
            if (typeof wx !== 'undefined' && typeof wx.onAudioInterruptionEnd === 'function') {
                this._onAudioInterruptEnd = () => {
                    this._audioInterrupted = false;
                    try {
                        if (this._webAudioCtx && this._webAudioCtx.resume) {
                            var r = this._webAudioCtx.resume();
                            if (r && r.catch) r.catch(function () { });
                        }
                    } catch (e) { }
                };
                wx.onAudioInterruptionEnd(this._onAudioInterruptEnd);
            }
        },

        initWebAudio() {
            try {
                if (typeof wx !== 'undefined' && wx.createWebAudioContext) {
                    this._webAudioCtx = wx.createWebAudioContext();
                }
            } catch (e) {
                this._webAudioCtx = null;
            }
        },

        // iOS 真机要求用户手势后 WebAudio 才允许发声：每次触摸都尝试恢复（幂等）
        resumeWebAudio() {
            const ctx = this._webAudioCtx;
            if (!ctx) return;
            try {
                if (typeof ctx.resume !== 'function') return;
                const r = ctx.resume();
                if (r && typeof r.then === 'function') {
                    r.catch(() => { });
                }
            } catch (e) { }
        },

        isSoundOn() {
            return !!this.soundOn;
        },

        toggleSound() {
            this.soundOn = !this.soundOn;
            try {
                wx.setStorageSync(SOUND_SAVE_KEY, this.soundOn ? '1' : '0');
            } catch (e) { }
            this.trackSpecial('sound_toggle', { on: this.soundOn });
            // 开启瞬间播一个轻音，让玩家立即听到反馈
            if (this.soundOn) this.soundPlay('click');
            return this.soundOn;
        },

        // ---------- 音效合成 ----------
        // 柔和正弦波 + 快起快落包络；音高偏高、带滑动，营造「可爱软软」的感觉
        _tone(freq, dur, vol, type, slideTo, delay) {
            const ctx = this._webAudioCtx;
            if (!ctx || !this.soundOn) return;
            try {
                const t0 = ctx.currentTime + (delay || 0);
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type || 'sine';
                osc.frequency.setValueAtTime(freq, t0);
                if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
                gain.gain.setValueAtTime(0.0001, t0);
                gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.018);
                gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t0);
                osc.stop(t0 + dur + 0.06);
                // 播放结束后断开连接，释放音频节点（修复：节点未 disconnect 导致内存泄漏）
                osc.onended = () => {
                    try { osc.disconnect(); } catch (e) { }
                    try { gain.disconnect(); } catch (e) { }
                };
            } catch (e) { }
        },

        // type: move / merge / special / bank / reward / undo / click / win / lose
        soundPlay(type) {
            switch (type) {
                case 'move':        // 轻快小踏步
                    this._tone(520, 0.07, 0.09, 'sine', 640);
                    break;
                case 'merge':       // 叮咚双音：软软的上行
                    this._tone(660, 0.10, 0.13, 'sine', 830);
                    this._tone(880, 0.12, 0.11, 'sine', 1100, 0.06);
                    break;
                case 'special':     // 合成 512：三连音上行
                    this._tone(660, 0.09, 0.12, 'sine', 740);
                    this._tone(880, 0.09, 0.11, 'sine', 990, 0.08);
                    this._tone(1046, 0.14, 0.11, 'sine', 1318, 0.16);
                    break;
                case 'bank':        // 特技入池：软软轻「啵」
                    this._tone(740, 0.08, 0.10, 'sine', 900);
                    break;
                case 'reward':      // 特技奖励：开心上行
                    this._tone(740, 0.10, 0.12, 'sine', 988);
                    this._tone(988, 0.14, 0.11, 'sine', 1318, 0.09);
                    break;
                case 'undo':        // 回撤：魔法音效 mp3，失败回退合成下滑音
                    if (this._undoAudio) {
                        try {
                            this._undoAudio.stop();
                            this._undoAudio.seek(0);
                            this._undoAudio.play();
                            break;
                        } catch (e) {
                            // 回退到 WebAudio 合成音
                        }
                    }
                    this._tone(520, 0.16, 0.11, 'sine', 330);
                    break;
                case 'click':       // 轻触按钮
                    this._tone(700, 0.05, 0.09, 'sine', 760);
                    break;
                case 'win':         // 胜利琶音 C5-E5-G5-C6
                    this._tone(523, 0.14, 0.12, 'sine');
                    this._tone(659, 0.14, 0.12, 'sine', 0, 0.10);
                    this._tone(784, 0.14, 0.12, 'sine', 0, 0.20);
                    this._tone(1046, 0.24, 0.13, 'sine', 0, 0.30);
                    break;
                case 'lose':        // 结束：慢慢下落
                    this._tone(392, 0.20, 0.11, 'sine', 330);
                    this._tone(262, 0.26, 0.11, 'sine', 196, 0.16);
                    break;
                default:
                    break;
            }
        },

        // ---------- 声音开关按钮（位于「最佳」分数框正上方） ----------
        getSoundBtnRect() {
            const w = 40, h = 40;
            if (!this.boardSize || !this.scoreBoxY) return { x: 14, y: 14, w, h };
            // 三栏分数框布局：声音按钮位于「得分」分数框左上方
            return {
                x: this.boardX,
                y: this.scoreBoxY - h - BOARD_ADJACENT_GAP,
                w,
                h
            };
        },

        drawSoundButton() {
            const ctx = this.ctx;
            const r = this.getSoundBtnRect();
            const on = this.soundOn !== false;
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;
            const s = r.w / 2;   // 半径为按钮宽一半

            ctx.save();

            // 圆形底
            ctx.fillStyle = on ? COLORS.ui.soundBg : 'rgba(143, 122, 102, 0.16)';
            ctx.beginPath();
            ctx.arc(cx, cy, s * 0.92, 0, Math.PI * 2);
            ctx.fill();

            // 喇叭主体：锥形 + 喇叭口
            ctx.fillStyle = on ? COLORS.ui.soundIcon : '#B7ADA2';
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.70, cy - s * 0.28);
            ctx.lineTo(cx - s * 0.25, cy - s * 0.55);
            ctx.lineTo(cx + s * 0.42, cy - s * 0.55);
            ctx.lineTo(cx + s * 0.42, cy + s * 0.55);
            ctx.lineTo(cx - s * 0.25, cy + s * 0.55);
            ctx.lineTo(cx - s * 0.70, cy + s * 0.28);
            ctx.closePath();
            ctx.fill();

            if (on) {
                // 声波弧线
                ctx.strokeStyle = COLORS.ui.soundIcon;
                ctx.lineWidth = 2.2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(cx + s * 0.42, cy, s * 0.24, -0.9, 0.9);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx + s * 0.42, cy, s * 0.44, -0.9, 0.9);
                ctx.stroke();
            } else {
                // 静音：斜杠
                ctx.strokeStyle = '#B7ADA2';
                ctx.lineWidth = 2.6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(cx - s * 0.55, cy + s * 0.62);
                ctx.lineTo(cx + s * 0.55, cy - s * 0.62);
                ctx.stroke();
            }

            ctx.restore();
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SoundMixin;
    } else {
        global.FK_SOUND = SoundMixin;
    }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : this));

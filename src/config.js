/**
 * 全局配置与常量模块
 * 双环境加载：微信小游戏 use require('./src/config.js')；浏览器测试 use window.FK_CONFIG
 */
(function (global) {
    'use strict';

    // ===== 调测开关（上线前必须改为 false） =====
    // true  = 调测模式：复活 / 特技加速 / 后悔回撤都跳过激励视频，直接发放效果
    // false = 正式模式：正常播放激励视频
    const DEBUG_SKIP_AD = false;

    // ===== 棋盘 =====
    const TILE_SIZE = 100;
    const GAP = 12;
    const DEFAULT_GRID_SIZE = 4;            // 默认 4x4，可在难度弹框中选择 5x5
    const DIFFICULTY_SAVE_KEY = 'fk2048_difficulty';  // 上次选择的难度（记录用）

    // ===== 动画 =====
    const ANIMATION_DURATION = 100;
    const ANIM_SCALE_SPEED = 10;      // pop-in speed
    const ANIM_MOVE_SPEED = 10;       // slide speed
    const ANIM_MERGE_POP_SPEED = 3;   // merge pop speed
    const ANIM_FADE_SPEED = 5;        // fade out speed
    const ANIM_POS_THRESHOLD = 0.05;  // position snap threshold

    // ===== UI =====
    const TITLE_FONT_SIZE = 64;
    const TITLE_MARGIN = 30;
    const SCORE_BOX_W = 160;
    const SCORE_BOX_H = 80;
    const SCORE_LABEL_Y = 25;
    const SCORE_VALUE_Y = 55;
    const BOARD_ADJACENT_GAP = 26; // 分数组/特技池与棋盘保持同一垂直间距
    const BOARD_TOP_MARGIN = 220;
    const BOARD_SIDE_MARGIN = 30;
    const BOARD_BOTTOM_RESERVE = 320;

    // ===== 特技加速（Special Boost） =====
    const SPECIAL_TRIGGER_VALUE = 512;      // 仅合成 512 触发（256 + 256）
    const SPECIAL_CAP = 10;                 // 特技池上限
    const SPECIAL_MAX_PER_GAME = 10;        // 单局最多获得次数
    const SPECIAL_REWARD = 2048;            // 每次广告奖励分数
    const SPECIAL_FLOAT_MS = 10000;         // 棋盘闪烁按钮存在时长
    const SPECIAL_FADE_MS = 260;            // 倒计时结束后的渐隐时长
    const SPECIAL_BANK_FLY_MS = 380;        // 沉入底池的飞行动画
    const SPECIAL_AD_LOAD_TIMEOUT = 5000;   // 广告加载超时
    const SPECIAL_AD_COOLDOWN = 1000;       // 点击冷却
    const SPECIAL_SAVE_KEY = 'fk2048_special_pool';
    const AD_PLAY_WATCHDOG_MS = 90000;      // 广告播放兜底看门狗：SDK 未回调 onClose 时释放锁

    // ===== 后悔回撤（Undo） =====
    const UNDO_STEPS = 5;             // 每次点击回撤步数
    const UNDO_FREE_COUNT = 5;        // 每盘局免费次数，之后需看广告
    const UNDO_HISTORY_CAP = 60;      // 操作历史上限
    const UNDO_ROW_GAP = 12;          // 后悔按钮与特技池的间距

    // ===== 游戏状态机 =====
    const GameState = {
        IDLE: 'idle',                 // 等待难度选择
        PLAYING: 'playing',
        ANIMATING: 'animating',
        WON: 'won',
        GAME_OVER: 'game_over',
        AD_PLAYING: 'ad_playing'
    };

    const StateTransitions = {
        [GameState.IDLE]: [GameState.PLAYING],
        [GameState.PLAYING]: [GameState.ANIMATING, GameState.WON, GameState.GAME_OVER],
        [GameState.ANIMATING]: [GameState.PLAYING, GameState.WON, GameState.GAME_OVER],
        [GameState.WON]: [GameState.PLAYING, GameState.IDLE],
        [GameState.GAME_OVER]: [GameState.IDLE, GameState.PLAYING, GameState.AD_PLAYING],
        [GameState.AD_PLAYING]: [GameState.PLAYING, GameState.GAME_OVER]
    };

    // ===== 颜色方案（TikTok 糖果色轮） =====
    // 迁移自 2048_TikTok_Unity BoardRenderer.cs / ScoreDisplay.cs
    const COLORS = {
        // 背景
        bg: '#FBF7F0',           // 米白（Unity: Color(0.985,0.97,0.94)）
        grid: '#D4CBE2',         // 淡紫托盘（Unity: Color(0.830,0.797,0.886)）
        empty: '#E8E3F2',        // 紫白格子（Unity: Color(0.910,0.890,0.950)）
        // 文字
        text: {
            dark: '#66597A',     // 深紫灰（<2048 方块文字 / 标题，Unity: Color(0.40,0.35,0.48)）
            light: '#F7F7FA',    // 近白（≥2048 方块文字 / 分数值，Unity: Color(0.97,0.97,0.98)）
            label: '#F5F5F0',    // 分数框标签（Unity: Color(0.96,0.96,0.94)）
            brown: '#856E54',    // 深糖棕（弹窗标题，Unity: Color(0.52,0.43,0.33)）
        },
        // UI 按钮
        ui: {
            brown: '#AD8561',       // 焦糖棕（Unity: BtnBrown Color(0.68,0.52,0.38)）
            orange: '#FAB76B',      // 蜜橘橙（Unity: BtnOrange Color(0.98,0.72,0.42)）
            orangeBright: '#FFDB94', // 亮蜜橘橙·呼吸上限（Unity: Color(1.00,0.86,0.58)）
            gray: '#E6DBCE',        // 奶灰·禁用（Unity: BtnGray Color(0.90,0.86,0.81)）
            scoreBox: '#CCAD8A',    // 浅焦糖·分数框/后悔按钮（Unity: ScoreBoxBrown Color(0.80,0.68,0.54)）
            soundBg: 'rgba(143, 122, 102, 0.35)', // 声音按钮背景
            soundIcon: '#544538',   // 声音按钮图标（Unity: Color(0.33,0.27,0.22)）
            panel: '#FAF7F0',       // 弹窗面板背景（Unity: Color(0.98,0.97,0.94)）
            overlay: 'rgba(51, 33, 20, 0.55)',     // 难度弹窗遮罩（Unity: Color(0.20,0.13,0.08,0.55)）
            resultOverlay: 'rgba(232, 227, 242, 0.95)', // 结算遮罩（紫白半透明）
        },
        // 方块——糖果色轮：每个数值专属一色（2 粉红 → 65536 深玫红，色相绕满一圈）
        tiles: {
            2:     { bg: '#F091AF', text: '#66597A' },  // 粉红      RGB(240,145,175)
            4:     { bg: '#FFB28C', text: '#66597A' },  // 蜜桃橙    RGB(255,178,140)
            8:     { bg: '#FACD6E', text: '#66597A' },  // 奶油黄    RGB(250,205,110)
            16:    { bg: '#F5A352', text: '#66597A' },  // 杏橙      RGB(245,163,82)
            32:    { bg: '#82C3EB', text: '#66597A' },  // 天蓝      RGB(130,195,235)
            64:    { bg: '#69A5E1', text: '#66597A' },  // 晴朗蓝    RGB(105,165,225)
            128:   { bg: '#BEA0DC', text: '#66597A' },  // 淡紫      RGB(190,160,220)
            256:   { bg: '#9B8CCD', text: '#66597A' },  // 香芋紫    RGB(155,140,205)
            512:   { bg: '#82D7B9', text: '#66597A' },  // 薄荷绿    RGB(130,215,185)
            1024:  { bg: '#A5D278', text: '#66597A' },  // 青柠绿    RGB(165,210,120)
            2048:  { bg: '#E8647D', text: '#F7F7FA' },  // 草莓红    RGB(232,100,125)
            4096:  { bg: '#8C78C3', text: '#F7F7FA' },  // 葡萄紫    RGB(140,120,195)
            8192:  { bg: '#5A8CD7', text: '#F7F7FA' },  // 深海蓝    RGB(90,140,215)
            16384: { bg: '#AA7D50', text: '#F7F7FA' },  // 焦糖棕    RGB(170,125,80)
            32768: { bg: '#46A5A0', text: '#F7F7FA' },  // 松石青    RGB(70,165,160)
            65536: { bg: '#D25F91', text: '#F7F7FA' },  // 深玫红    RGB(210,95,145)
        }
    };

    const config = {
        DEBUG_SKIP_AD,
        TILE_SIZE, GAP, DEFAULT_GRID_SIZE, DIFFICULTY_SAVE_KEY,
        ANIMATION_DURATION,
        ANIM_SCALE_SPEED, ANIM_MOVE_SPEED, ANIM_MERGE_POP_SPEED, ANIM_FADE_SPEED, ANIM_POS_THRESHOLD,
        TITLE_FONT_SIZE, TITLE_MARGIN, SCORE_BOX_W, SCORE_BOX_H, SCORE_LABEL_Y, SCORE_VALUE_Y,
        BOARD_ADJACENT_GAP, BOARD_TOP_MARGIN, BOARD_SIDE_MARGIN, BOARD_BOTTOM_RESERVE,
        SPECIAL_TRIGGER_VALUE, SPECIAL_CAP, SPECIAL_MAX_PER_GAME, SPECIAL_REWARD,
        SPECIAL_FLOAT_MS, SPECIAL_FADE_MS, SPECIAL_BANK_FLY_MS,
        SPECIAL_AD_LOAD_TIMEOUT, SPECIAL_AD_COOLDOWN, SPECIAL_SAVE_KEY,
        UNDO_STEPS, UNDO_FREE_COUNT, UNDO_HISTORY_CAP, UNDO_ROW_GAP,
        GameState, StateTransitions, COLORS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = config;
    } else {
        global.FK_CONFIG = config;
    }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : this));

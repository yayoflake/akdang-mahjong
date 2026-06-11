/*
 * 게임 화면 렌더러.
 * UIPlayer의 delegate로 동작: update()로 보드를 다시 그리고,
 * choose()로 행동 선택 UI를 띄운 뒤 respond(reply)로 회신한다.
 */
'use strict';

const Majiang = require('@kobalab/majiang-core');
const { tileEl, fulouEl, paiList } = require('./tiles');
const { yakuName, pingjuName, rankLabel } = require('./yaku');

const WINDS = ['동', '남', '서', '북'];

function el(tag, cls, parent, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
}

module.exports = class GameUI {

    /*
     * root: 게임 화면 컨테이너 요소
     * opts: { onGameEnd() — 종국 화면에서 [방으로] 클릭 }
     */
    constructor(root, opts = {}) {
        this._root = root;
        this._opts = opts;
        this._player = null;
        this._respond = null;
        this._timers = [];
        this._build();
    }

    attach(player) { this._player = player; }

    destroy() {
        for (const t of this._timers) clearTimeout(t);
        this._timers = [];
        this._root.innerHTML = '';
    }

    /* ---------- DOM 골격 ---------- */

    _build() {
        this._root.innerHTML = '';
        const table = el('div', 'table', this._root);
        this._seats = [];
        for (let i = 0; i < 4; i++) {
            const wrap = el('div', `seat-wrap sw${i}`, table);
            this._seats.push({
                wrap,
                river: el('div', 'river', wrap),
                melds: el('div', 'melds', wrap),
                hand:  el('div', 'hand' + (i == 0 ? ' mine' : ''), wrap),
                toast: el('div', 'call-toast', wrap),
            });
        }
        const center = el('div', 'center', this._root);
        this._roundLine = el('div', 'round-line', center);
        this._doraRow = el('div', 'dora-row', center);
        this._wallLine = el('div', 'wall-line', center);
        this._cscores = [];
        for (let i = 0; i < 4; i++) {
            const c = el('div', `cscore c${i}`, center);
            this._cscores.push({
                box: c,
                wind: el('span', 'wind', c),
                name: el('span', 'pname', c),
                score: el('span', 'score', c),
                badge: el('span', 'badge', c),
            });
        }
        this._actionBar = el('div', 'action-bar', this._root);
        this._handHint = el('div', 'hand-hint', this._root);
        this._modal = el('div', 'modal hidden', this._root);
    }

    /* ---------- 좌표계 ---------- */

    _rel(l) {
        const me = this._player ? this._player.menfeng : 0;
        return (l - me + 4) % 4;
    }

    /* ---------- 렌더링 ---------- */

    redrawAll() { this._render(); }

    update(kind, data) {
        if (kind == 'dapai' && data.p.indexOf('*') >= 0)
            this._toast(this._rel(data.l), '리치!');
        if (kind == 'fulou') {
            const m = data.m;
            const label = m.match(/^[mpsz]\d{4}/) ? '깡!'
                        : m.replace(/0/g, '5').match(/^[mpsz](\d)\1\1/) ? '퐁!'
                        : '치!';
            this._toast(this._rel(data.l), label);
        }
        if (kind == 'gang') this._toast(this._rel(data.l), '깡!');
        if (kind == 'hule')
            this._toast(this._rel(data.l), data.baojia == null ? '쯔모!' : '론!');
        this._render();
    }

    _render() {
        const player = this._player;
        if (!player || !player.model || !player.model.shoupai
            || !player.model.shoupai.length) return;
        const model = player.model;
        const me = player.menfeng;

        // 국 정보
        const round = `${['동', '남', '서', '북'][model.zhuangfeng]}${model.jushu + 1}국`;
        this._roundLine.textContent =
            round + (model.changbang ? ` ${model.changbang}본장` : '');
        this._wallLine.textContent =
            `남은 패 ${model.shan.paishu}` +
            (model.lizhibang ? ` · 공탁 ${model.lizhibang}` : '');

        // 도라 표시패
        this._doraRow.innerHTML = '';
        for (const p of model.shan.baopai) {
            this._doraRow.appendChild(tileEl(p, 'small'));
        }

        // 좌석별
        for (let l = 0; l < 4; l++) {
            const rel = this._rel(l);
            const seat = this._seats[rel];
            const shoupai = model.shoupai[l];
            const id = model.player_id[l];

            // 손패
            seat.hand.innerHTML = '';
            const tiles = paiList(shoupai);
            for (const p of tiles) {
                seat.hand.appendChild(tileEl(p));
            }
            if (shoupai._zimo) {
                const zimoP = shoupai._zimo.length <= 2 ? shoupai._zimo : null;
                if (zimoP || shoupai._zimo == '_') {
                    const t = tileEl(zimoP || '_', 'zimo');
                    seat.hand.appendChild(t);
                }
            }

            // 버림패 (불려간 패는 제외)
            seat.river.innerHTML = '';
            for (const p of model.he[l]._pai) {
                if (/[+=\-]$/.test(p)) continue;
                const riichi = p.indexOf('*') >= 0;
                const base = p.slice(0, 2);
                const t = tileEl(base, riichi ? 'rot' : '');
                if (p.indexOf('_') >= 0) t.classList.add('tsumogiri');
                if (riichi) {
                    const wrap = el('div', 'rot-wrap');
                    wrap.appendChild(t);
                    seat.river.appendChild(wrap);
                }
                else seat.river.appendChild(t);
            }

            // 부로
            seat.melds.innerHTML = '';
            for (const m of shoupai._fulou) {
                seat.melds.appendChild(fulouEl(m));
            }

            // 중앙 점수판
            const cs = this._cscores[rel];
            cs.wind.textContent = WINDS[l];
            cs.wind.classList.toggle('dealer', l == 0);
            cs.name.textContent = (model.player[id] || `P${id}`);
            cs.score.textContent = model.defen[id];
            cs.box.classList.toggle('turn', model.lunban == l);
            let badge = shoupai._lizhi ? '리치' : '';
            if (l == me && player.furiten) badge = badge ? badge + '·후리텐' : '후리텐';
            cs.badge.textContent = badge;
        }
    }

    _toast(rel, text) {
        const toast = this._seats[rel].toast;
        toast.textContent = text;
        toast.classList.add('show');
        this._later(() => toast.classList.remove('show'), 1200);
    }

    _later(fn, ms) {
        const t = setTimeout(fn, ms);
        this._timers.push(t);
        return t;
    }

    /* ---------- 행동 선택 ---------- */

    choose(choice, respond) {
        this._render();
        this._clearActions();

        switch (choice.type) {
        case 'discard':  return this._chooseDiscard(choice, respond);
        case 'react':    return this._chooseReact(choice, respond);
        case 'chankan':  return this._chooseChankan(choice, respond);
        case 'hule':     return this._showHule(choice.hule, respond);
        case 'pingju':   return this._showPingju(choice.pingju, respond);
        case 'jieju':    return this._showJieju(choice.paipu, respond);
        default:         return respond({});
        }
    }

    _clearActions() {
        this._actionBar.innerHTML = '';
        this._handHint.textContent = '';
        this._setHandClickable(null);
        const seat = this._seats[0];
        for (const t of seat.hand.children) t.classList.remove('selected');
    }

    _button(label, cls, onClick) {
        const b = el('button', 'act ' + (cls || ''), this._actionBar, label);
        b.onclick = onClick;
        return b;
    }

    /*
     * 손패 클릭 활성화.
     * allowed: 합법 타패 목록(['m5','p3','m5_' ...]) 또는 null(비활성).
     * onPick(reply문자열) — 두 번 클릭(선택→확정) 방식.
     */
    _setHandClickable(allowed, onPick, suffix = '') {
        const seat = this._seats[0];
        let selected = null;
        for (const t of seat.hand.children) {
            const p = t.dataset.pai;
            const isZimo = t.classList.contains('zimo');
            let reply = null;
            if (allowed) {
                if (isZimo && allowed.indexOf(p + '_') >= 0) reply = p + '_';
                else if (allowed.indexOf(p) >= 0) reply = p;
                else if (isZimo && allowed.indexOf(p) >= 0) reply = p;
            }
            t.classList.toggle('clickable', !!reply);
            t.classList.remove('selected');
            t.onclick = null;
            if (reply) {
                t.onclick = () => {
                    if (selected == t) {
                        onPick(reply + suffix);
                    }
                    else {
                        if (selected) selected.classList.remove('selected');
                        selected = t;
                        t.classList.add('selected');
                    }
                };
            }
        }
    }

    _chooseDiscard(choice, respond) {
        const done = reply => {
            this._clearActions();
            respond(reply);
        };

        // 리치 후 자동 쯔모기리 (화료/깡 선택지가 없을 때)
        if (choice.lizhied && !choice.hule && !choice.gang.length) {
            this._handHint.textContent = '리치 — 자동 타패';
            this._later(() => done({ dapai: choice.zimo + '_' }), 700);
            return;
        }

        const showBase = () => {
            this._clearActions();
            this._handHint.textContent = choice.lizhied ? '' : '버릴 패를 두 번 클릭하세요';

            if (!choice.lizhied) {
                this._setHandClickable(choice.dapai,
                    p => done({ dapai: p }));
            }

            if (choice.hule) {
                this._button('쯔모', 'primary', () => done({ hule: '-' }));
            }
            if (choice.gang.length) {
                this._button('깡', '', () => {
                    if (choice.gang.length == 1) done({ gang: choice.gang[0] });
                    else this._pickMeld(choice.gang, m => done({ gang: m }), showBase);
                });
            }
            if (choice.lizhi) {
                this._button('리치', 'riichi', () => {
                    this._clearActions();
                    this._handHint.textContent = '리치 — 버릴 패를 두 번 클릭하세요';
                    // 주의: 쯔모기리 표기('m5_')의 '_'를 제거하면 안 된다.
                    // 그 패가 손에 한 장뿐이면 'm5'는 합법 타패 목록에 없다.
                    this._setHandClickable(choice.lizhi,
                        p => done({ dapai: p + '*' }));
                    this._button('취소', '', showBase);
                });
            }
            if (choice.daopai) {
                this._button('유국 (구종구패)', '', () => done({ daopai: '-' }));
            }
            if (choice.lizhied) {
                this._button('패스', '', () => done({ dapai: choice.zimo + '_' }));
            }
        };
        showBase();
    }

    _chooseReact(choice, respond) {
        const done = reply => {
            this._clearActions();
            respond(reply);
        };
        const showBase = () => {
            this._clearActions();
            if (choice.hule) {
                this._button('론', 'primary', () => done({ hule: '-' }));
            }
            if (choice.gang.length) {
                this._button('깡', '', () => done({ fulou: choice.gang[0] }));
            }
            if (choice.peng.length) {
                this._button('퐁', '', () => {
                    if (choice.peng.length == 1) done({ fulou: choice.peng[0] });
                    else this._pickMeld(choice.peng, m => done({ fulou: m }), showBase);
                });
            }
            if (choice.chi.length) {
                this._button('치', '', () => {
                    if (choice.chi.length == 1) done({ fulou: choice.chi[0] });
                    else this._pickMeld(choice.chi, m => done({ fulou: m }), showBase);
                });
            }
            this._button('패스', 'pass', () => done({}));
        };
        showBase();
    }

    _chooseChankan(choice, respond) {
        const done = reply => { this._clearActions(); respond(reply); };
        this._button('론 (창깡)', 'primary', () => done({ hule: '-' }));
        this._button('패스', 'pass', () => done({}));
    }

    /* 여러 후보 부로 중 선택 */
    _pickMeld(melds, onPick, onCancel) {
        this._clearActions();
        for (const m of melds) {
            const b = el('button', 'act meld-pick', this._actionBar);
            b.appendChild(fulouEl(m));
            b.onclick = () => onPick(m);
        }
        this._button('취소', '', onCancel);
    }

    /* ---------- 결과 다이얼로그 ---------- */

    _dialog() {
        this._modal.innerHTML = '';
        this._modal.classList.remove('hidden');
        return el('div', 'dialog', this._modal);
    }

    _closeDialog() {
        this._modal.classList.add('hidden');
        this._modal.innerHTML = '';
    }

    /* 확인 버튼 + 자동 진행 카운트다운 */
    _confirmButton(box, respond, seconds = 12) {
        const btn = el('button', 'act primary', box, `확인 (${seconds})`);
        let left = seconds;
        const tick = () => {
            left--;
            if (left <= 0) return fire();
            btn.textContent = `확인 (${left})`;
            timer = this._later(tick, 1000);
        };
        let timer = this._later(tick, 1000);
        let fired = false;
        const fire = () => {
            if (fired) return;
            fired = true;
            clearTimeout(timer);
            this._closeDialog();
            respond({});
        };
        btn.onclick = fire;
    }

    _showHule(hule, respond) {
        const model = this._player.model;
        const box = this._dialog();

        const winnerId = model.player_id[hule.l];
        const how = hule.baojia == null ? '쯔모' : '론';
        el('div', 'dlg-title', box,
           `${how} — ${model.player[winnerId]}`);

        // 화료 손패
        const handRow = el('div', 'dlg-hand', box);
        const shoupai = Majiang.Shoupai.fromString(hule.shoupai);
        for (const p of paiList(shoupai)) handRow.appendChild(tileEl(p, 'small'));
        if (shoupai._zimo && shoupai._zimo.length <= 2) {
            handRow.appendChild(tileEl(shoupai._zimo, 'small zimo'));
        }
        for (const m of shoupai._fulou) {
            const f = fulouEl(m);
            f.classList.add('small');
            handRow.appendChild(f);
        }

        // 도라 표시패
        const doraRow = el('div', 'dlg-dora', box);
        el('span', null, doraRow, '도라 ');
        for (const p of model.shan.baopai) doraRow.appendChild(tileEl(p, 'small'));
        if (hule.fubaopai) {
            el('span', null, doraRow, ' 뒷도라 ');
            for (const p of hule.fubaopai) doraRow.appendChild(tileEl(p, 'small'));
        }

        // 역 목록
        const yakuBox = el('div', 'dlg-yaku', box);
        for (const h of hule.hupai || []) {
            const row = el('div', 'yaku-row', yakuBox);
            el('span', null, row, yakuName(h.name));
            el('span', 'fan', row,
               typeof h.fanshu == 'number' ? `${h.fanshu}판`
               : h.fanshu == '*' ? '역만'
               : h.fanshu == '**' ? '더블 역만'
               : h.fanshu);
        }

        // 점수
        let scoreText = '';
        if (hule.fanshu) scoreText = `${hule.fu}부 ${hule.fanshu}판 `;
        const label = rankLabel(hule);
        scoreText += (label ? label + ' ' : '') + `${hule.defen}점`;
        el('div', 'dlg-score', box, scoreText);

        // 점수 이동
        const fenpeiBox = el('div', 'dlg-fenpei', box);
        for (let l = 0; l < 4; l++) {
            const id = model.player_id[l];
            const delta = hule.fenpei[l];
            const row = el('div', 'fenpei-row' + (delta > 0 ? ' plus' : delta < 0 ? ' minus' : ''), fenpeiBox);
            el('span', null, row, model.player[id]);
            el('span', null, row, `${model.defen[id]} → ${model.defen[id] + delta}`);
            el('span', 'delta', row, delta > 0 ? `+${delta}` : `${delta}`);
        }

        this._confirmButton(box, respond);
    }

    _showPingju(pingju, respond) {
        const model = this._player.model;
        const box = this._dialog();
        el('div', 'dlg-title', box, pingjuName(pingju.name));

        if (pingju.name == '荒牌平局') {
            for (let l = 0; l < 4; l++) {
                const id = model.player_id[l];
                const row = el('div', 'pingju-row', box);
                el('span', 'pname', row, model.player[id]);
                if (pingju.shoupai[l]) {
                    el('span', 'tenpai', row, '텐파이');
                    const hr = el('span', 'dlg-hand inline', row);
                    const shoupai = Majiang.Shoupai.fromString(pingju.shoupai[l]);
                    for (const p of paiList(shoupai)) hr.appendChild(tileEl(p, 'small'));
                }
                else {
                    el('span', 'noten', row, '노텐');
                }
                const delta = pingju.fenpei[l];
                if (delta) el('span', 'delta', row, delta > 0 ? `+${delta}` : `${delta}`);
            }
        }
        this._confirmButton(box, respond);
    }

    _showJieju(paipu, respond) {
        respond({});   // 종국 처리 자체는 막지 않는다
        const box = this._dialog();
        el('div', 'dlg-title', box, '대국 종료');

        const order = [0, 1, 2, 3].sort((a, b) => paipu.rank[a] - paipu.rank[b]);
        for (const id of order) {
            const row = el('div', 'jieju-row', box);
            el('span', 'rank', row, `${paipu.rank[id]}위`);
            el('span', 'pname', row, paipu.player[id]);
            el('span', 'score', row, `${paipu.defen[id]}점`);
            el('span', 'pt', row, `${paipu.point[id]}pt`);
        }
        const btn = el('button', 'act primary', box, '확인');
        btn.onclick = () => {
            this._closeDialog();
            if (this._opts.onGameEnd) this._opts.onGameEnd(paipu);
        };
    }
};

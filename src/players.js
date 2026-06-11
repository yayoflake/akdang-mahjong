/*
 * 호스트 측 플레이어 구현
 *   - TsumogiriAI: 뽑은 패를 그대로 버리기만 하는 AI (후로/리치/화료 없음)
 *   - RemotePlayer: PeerJS 연결 너머의 게스트에게 메시지를 중계하는 프록시.
 *     접속이 끊기면 쯔모기리 AI가 대신 응답한다.
 */
'use strict';

const Majiang = require('@kobalab/majiang-core');

class TsumogiriAI extends Majiang.Player {

    action_kaiju()  { this._callback() }
    action_qipai()  { this._callback() }

    action_zimo(zimo) {
        if (zimo.l == this._menfeng && zimo.p) {
            // '_' 접미사 = 쯔모기리 표시. 리치 상태여도 항상 합법인 타패.
            this._callback({ dapai: zimo.p + '_' });
        }
        else this._callback();
    }

    action_dapai()  { this._callback() }

    action_fulou(fulou) {
        // 쯔모기리 AI는 후로하지 않지만, 인간 이탈로 대타 투입된 직후
        // 자신의 후로에 대한 타패 요구가 남아 있을 수 있다.
        if (fulou.l == this._menfeng && !fulou.m.match(/^[mpsz]\d{4}/)) {
            const dapai = this.get_dapai(this.shoupai);
            this._callback({ dapai: dapai[dapai.length - 1] });
        }
        else this._callback();
    }

    action_gang()   { this._callback() }
    action_hule()   { this._callback() }
    action_pingju() { this._callback() }
    action_jieju()  { this._callback() }
}

class RemotePlayer {

    constructor(send) {
        this._send    = send;        // (obj) => void : 게스트로 전송
        this._seq     = 0;
        this._pending = new Map();   // seq → { msg, callback }
        this._history = [];          // { msg, seq } 전체 수신 메시지
        this._ai      = null;        // 대타 AI (접속 끊김 시)
    }

    get connected() { return !this._ai }

    action(msg, callback) {
        if (this._ai) {
            this._ai.action(msg, callback);
            return;
        }
        const seq = this._seq++;
        this._history.push({ msg, seq });
        if (callback) this._pending.set(seq, callback);
        this._send({ type: 'm', seq, msg, need: !!callback });
    }

    onReply(seq, reply) {
        const callback = this._pending.get(seq);
        if (callback) {
            this._pending.delete(seq);
            callback(reply || {});
        }
    }

    /* 접속 끊김: 지금까지의 메시지를 AI에 재생해 내부 모델을 복원한 뒤,
       미응답 메시지부터 AI가 응답하게 한다. */
    takeover() {
        if (this._ai) return;
        const ai = new TsumogiriAI();
        for (const { msg, seq } of this._history) {
            const callback = this._pending.get(seq);
            if (callback) {
                this._pending.delete(seq);
                ai.action(msg, callback);
            }
            else {
                ai.action(msg);   // 콜백 없이 모델 갱신만
            }
        }
        this._ai = ai;
    }
}

module.exports = { TsumogiriAI, RemotePlayer };

/*
 * UIPlayer: 사람이 조작하는 클라이언트 플레이어.
 * Majiang.Player를 상속해 보드 모델을 유지하며,
 * 입력이 필요할 때 delegate에 선택지를 넘기고 응답을 받아 회신한다.
 *
 * delegate 인터페이스:
 *   update(kind, data)          — 모델 갱신 후 호출 (렌더링 트리거)
 *   choose(choice, respond)     — 선택지 제시. respond(reply)로 회신.
 *     choice.type: 'discard' | 'react' | 'chankan' | 'hule' | 'pingju' | 'jieju'
 */
'use strict';

const Majiang = require('@kobalab/majiang-core');

module.exports = class UIPlayer extends Majiang.Player {

    constructor(delegate) {
        super();
        this._delegate = delegate;
    }

    get menfeng() { return this._menfeng }
    get id()      { return this._id }

    /* 후리텐 여부 (표시용) */
    get furiten() {
        return !this._neng_rong
            && Majiang.Util.xiangting(this.shoupai) == 0;
    }

    _notify(kind, data) {
        if (this._delegate) this._delegate.update(kind, data);
    }

    /* 깡 신도라 공개는 회신 없는 통지지만 화면 갱신이 필요하다 */
    kaigang(kaigang) {
        super.kaigang(kaigang);
        this._notify('kaigang', kaigang);
    }

    action_kaiju(kaiju) {
        this._notify('kaiju', kaiju);
        this._callback();
    }

    action_qipai(qipai) {
        this._notify('qipai', qipai);
        this._callback();
    }

    /* 내 쯔모: 타패 선택 (+쯔모화료/깡/리치/구종구패) */
    action_zimo(zimo, gangzimo) {
        this._notify(gangzimo ? 'gangzimo' : 'zimo', zimo);
        if (zimo.l != this._menfeng || !zimo.p) {
            this._callback();
            return;
        }

        const shoupai = this.shoupai;
        const choice = {
            type:    'discard',
            zimo:    zimo.p,
            dapai:   this.get_dapai(shoupai),
            hule:    this.allow_hule(shoupai, null, gangzimo),
            gang:    this.shan.paishu > 0 ? this.get_gang_mianzi(shoupai) : [],
            lizhi:   this.allow_lizhi(shoupai),       // 리치 가능 타패 배열 또는 false
            daopai:  this.allow_pingju(shoupai),      // 구종구패 선언 가능
            lizhied: shoupai.lizhi,                   // 이미 리치 상태(자동 쯔모기리 대상)
        };
        this._delegate.choose(choice, reply => this._callback(reply));
    }

    /* 남의 타패: 론/퐁/깡/치 */
    action_dapai(dapai) {
        this._notify('dapai', dapai);
        if (dapai.l == this._menfeng) {
            this._callback();
            return;
        }

        const d  = '_+=-'[(4 + dapai.l - this._menfeng) % 4];
        const pd = dapai.p.slice(0, 2) + d;
        const shoupai = this.shoupai;

        const canCall = this.shan.paishu > 0 && !shoupai.lizhi;
        const choice = {
            type: 'react',
            p:    dapai.p.slice(0, 2),
            from: dapai.l,
            hule: this.allow_hule(shoupai, pd),
            chi:  canCall && d == '-' ? this.get_chi_mianzi(shoupai, pd) : [],
            peng: canCall ? this.get_peng_mianzi(shoupai, pd) : [],
            gang: canCall ? this.get_gang_mianzi(shoupai, pd) : [],
        };

        if (!choice.hule && !choice.chi.length && !choice.peng.length
            && !choice.gang.length) {
            this._callback();
            return;
        }
        this._delegate.choose(choice, reply => this._callback(reply));
    }

    /* 후로 발생: 내가 치/퐁 했으면 타패 필요 */
    action_fulou(fulou) {
        this._notify('fulou', fulou);
        if (fulou.l == this._menfeng && !fulou.m.match(/^[mpsz]\d{4}/)) {
            const choice = {
                type:  'discard',
                zimo:  null,
                dapai: this.get_dapai(this.shoupai),
                hule:  false, gang: [], lizhi: false, daopai: false,
                lizhied: false,
            };
            this._delegate.choose(choice, reply => this._callback(reply));
        }
        else this._callback();
    }

    /* 가깡: 창깡(국사 제외 일반 룰) 론 기회 */
    action_gang(gang) {
        this._notify('gang', gang);
        if (gang.l != this._menfeng && gang.m.match(/^[mpsz]\d{3}[+=\-]\d$/)) {
            const d  = '_+=-'[(4 + gang.l - this._menfeng) % 4];
            const p  = gang.m[0] + gang.m.slice(-1);
            const pd = p + d;
            if (this.allow_hule(this.shoupai, pd, true)) {
                this._delegate.choose(
                    { type: 'chankan', p: p, from: gang.l },
                    reply => this._callback(reply));
                return;
            }
        }
        this._callback();
    }

    action_hule(hule) {
        this._notify('hule', hule);
        this._delegate.choose({ type: 'hule', hule },
                              () => this._callback());
    }

    action_pingju(pingju) {
        this._notify('pingju', pingju);
        this._delegate.choose({ type: 'pingju', pingju },
                              () => this._callback());
    }

    action_jieju(paipu) {
        this._notify('jieju', paipu);
        this._delegate.choose({ type: 'jieju', paipu },
                              () => this._callback());
    }
};

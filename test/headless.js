/*
 * 헤드리스 통합 테스트 (node test/headless.js)
 *
 *  1. 점수 계산 스모크 테스트 (핑후 론 / 국사무쌍 쯔모)
 *  2. 쯔모기리 AI 4인 전체 대국
 *  3. 랜덤 행동 AI 4인 전체 대국 (화료/후로/깡/리치 경로 커버)
 *  4. RemotePlayer 중계 + 대국 중 접속 끊김(AI 대타) 시나리오
 *  5. UIPlayer + 스크립트 delegate 전체 대국
 */
'use strict';

const Majiang = require('@kobalab/majiang-core');
const { TsumogiriAI, RemotePlayer } = require('../src/players');
const UIPlayer = require('../src/uiplayer');

let failures = 0;
function assert(cond, msg) {
    if (!cond) { failures++; console.error('  FAIL:', msg); }
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

/* ---------- 1. 점수 계산 ---------- */

console.log('[1] 점수 계산 스모크 테스트');
{
    const rule = Majiang.rule();
    const param = {
        rule, zhuangfeng: 0, menfeng: 1,
        hupai: {}, baopai: ['z3'], fubaopai: null,
        jicun: { changbang: 0, lizhibang: 0 },
    };
    // 핑후 론 (자리: 남가) = 30부 1판 1000점
    let shoupai = Majiang.Shoupai.fromString('m123456p2399s567');
    let hule = Majiang.Util.hule(shoupai, 'p4+', param);
    assert(hule.hupai.length == 1 && hule.hupai[0].name == '平和',
           '핑후 단독역이어야 함: ' + JSON.stringify(hule.hupai));
    assert(hule.fu == 30 && hule.fanshu == 1 && hule.defen == 1000,
           `핑후 론 30부 1판 1000점이어야 함: ${hule.fu}부 ${hule.fanshu}판 ${hule.defen}점`);

    // 국사무쌍 13면 대기 쯔모 (더블 역만)
    shoupai = Majiang.Shoupai.fromString('m19p19s19z1234567m1');
    hule = Majiang.Util.hule(shoupai, null, param);
    assert(hule.damanguan == 2 && hule.defen == 64000,
           `국사무쌍 13면 쯔모 더블 역만 64000점이어야 함: ${JSON.stringify(hule)}`);

    // 탕야오 도라: 적도라 포함 손
    shoupai = Majiang.Shoupai.fromString('m234567p2340s678p5');
    hule = Majiang.Util.hule(shoupai, null, param);
    assert(hule.hupai.some(h => h.name == '赤ドラ'),
           '적도라가 계산되어야 함: ' + JSON.stringify(hule.hupai));
}

/* ---------- 공용: 대국 실행 + 불변량 검사 ---------- */

function runGame(players, label, ruleParam) {
    const rule = Majiang.rule(ruleParam || {});
    const game = new Majiang.Game(players, null, rule, 'test');
    game._model.player = ['P0', 'P1', 'P2', 'P3'];
    try {
        game.do_sync();
    }
    catch (e) {
        failures++;
        console.error(`  FAIL: [${label}] 대국 중 예외:`, e.message || e);
        console.error(e.stack);
        return null;
    }
    const paipu = game._paipu;
    const sum = paipu.defen.reduce((a, b) => a + b, 0);
    assert(sum == 100000, `[${label}] 최종 점수 합 100000이어야 함: ${sum}`);
    assert(paipu.rank.slice().sort().join('') == '1234',
           `[${label}] 순위는 1~4여야 함: ${paipu.rank}`);
    assert(paipu.log.length > 0, `[${label}] 국이 1국 이상 진행되어야 함`);
    return paipu;
}

/* ---------- 2. 쯔모기리 AI 4인 ---------- */

console.log('[2] 쯔모기리 AI 4인 대국 x 20');
for (let i = 0; i < 20; i++) {
    runGame([0, 1, 2, 3].map(() => new TsumogiriAI()), '쯔모기리');
}

/* ---------- 3. 랜덤 행동 AI ---------- */

class RandomAI extends Majiang.Player {

    action_kaiju()  { this._callback() }
    action_qipai()  { this._callback() }

    action_zimo(zimo, gangzimo) {
        if (zimo.l != this._menfeng || !zimo.p) return this._callback();
        const shoupai = this.shoupai;

        if (this.allow_hule(shoupai, null, gangzimo))
            return this._callback({ hule: '-' });

        if (this.allow_pingju(shoupai) && Math.random() < 0.3)
            return this._callback({ daopai: '-' });

        const gang = this.get_gang_mianzi(shoupai);
        if (gang && gang.length && Math.random() < 0.4)
            return this._callback({ gang: pick(gang) });

        if (shoupai.lizhi)
            return this._callback({ dapai: zimo.p + '_' });

        const lizhi = this.allow_lizhi(shoupai);
        if (lizhi && Math.random() < 0.8)
            return this._callback({ dapai: pick(lizhi) + '*' });

        // 대체로 샨텐을 줄이는 타패, 가끔 무작위 (화료 경로 커버 목적)
        const dapai = this.get_dapai(shoupai);
        if (Math.random() < 0.9) {
            let best = dapai[0], bestX = 9;
            for (const p of dapai) {
                const x = Majiang.Util.xiangting(shoupai.clone().dapai(p));
                if (x < bestX) { bestX = x; best = p; }
            }
            return this._callback({ dapai: best });
        }
        return this._callback({ dapai: pick(dapai) });
    }

    action_dapai(dapai) {
        if (dapai.l == this._menfeng) return this._callback();
        const shoupai = this.shoupai;
        const d  = '_+=-'[(4 + dapai.l - this._menfeng) % 4];
        const pd = dapai.p.slice(0, 2) + d;

        if (this.allow_hule(shoupai, pd))
            return this._callback({ hule: '-' });

        if (this.shan.paishu > 0 && !shoupai.lizhi) {
            const gang = this.get_gang_mianzi(shoupai, pd);
            if (gang && gang.length && Math.random() < 0.3)
                return this._callback({ fulou: pick(gang) });
            const peng = this.get_peng_mianzi(shoupai, pd);
            if (peng && peng.length && Math.random() < 0.3)
                return this._callback({ fulou: pick(peng) });
            if (d == '-') {
                const chi = this.get_chi_mianzi(shoupai, pd);
                if (chi && chi.length && Math.random() < 0.3)
                    return this._callback({ fulou: pick(chi) });
            }
        }
        this._callback();
    }

    action_fulou(fulou) {
        if (fulou.l == this._menfeng && !fulou.m.match(/^[mpsz]\d{4}/)) {
            return this._callback({ dapai: pick(this.get_dapai(this.shoupai)) });
        }
        this._callback();
    }

    action_gang(gang) {
        if (gang.l != this._menfeng && gang.m.match(/^[mpsz]\d{3}[+=\-]\d$/)) {
            const d  = '_+=-'[(4 + gang.l - this._menfeng) % 4];
            const pd = gang.m[0] + gang.m.slice(-1) + d;
            if (this.allow_hule(this.shoupai, pd, true))
                return this._callback({ hule: '-' });
        }
        this._callback();
    }

    action_hule()   { this._callback() }
    action_pingju() { this._callback() }
    action_jieju()  { this._callback() }
}

console.log('[3] 랜덤 행동 AI 4인 대국 x 150');
let stats = { hule: 0, pingju: 0, lizhi: 0, fulou: 0, gang: 0 };
for (let i = 0; i < 150; i++) {
    const paipu = runGame([0, 1, 2, 3].map(() => new RandomAI()), '랜덤',
                          i % 2 ? { '場数': 1 } : {});
    if (!paipu) continue;
    for (const log of paipu.log) {
        for (const e of log) {
            if (e.hule) stats.hule++;
            if (e.pingju) stats.pingju++;
            if (e.dapai && e.dapai.p.indexOf('*') >= 0) stats.lizhi++;
            if (e.fulou) stats.fulou++;
            if (e.gang) stats.gang++;
        }
    }
}
console.log('  커버리지:', JSON.stringify(stats));
assert(stats.hule > 100,  '화료가 충분히 발생해야 함: ' + stats.hule);
assert(stats.lizhi > 100, '리치가 충분히 발생해야 함: ' + stats.lizhi);
assert(stats.fulou > 100, '후로가 충분히 발생해야 함: ' + stats.fulou);
assert(stats.gang > 5,    '깡이 발생해야 함: ' + stats.gang);
assert(stats.pingju > 5,  '유국이 발생해야 함: ' + stats.pingju);

/* ---------- 4. RemotePlayer 중계 + 접속 끊김 ---------- */

console.log('[4] RemotePlayer 중계 + 대국 중 이탈 x 30');
for (let i = 0; i < 30; i++) {
    const players = [];
    const killAt = 50 + Math.floor(Math.random() * 300);   // n번째 메시지에서 이탈
    let sent = 0;
    for (let id = 0; id < 4; id++) {
        const client = new RandomAI();
        const dropTarget = id == 1;     // P1이 이탈
        const remote = new RemotePlayer(obj => {
            if (obj.type != 'm') return;
            if (dropTarget && remote._aiPending) return;    // 이미 죽음
            if (dropTarget && ++sent >= killAt) {
                remote._aiPending = true;
                remote.takeover();      // 전달 실패 → AI 대타
                return;
            }
            client.action(obj.msg,
                obj.need ? reply => remote.onReply(obj.seq, reply) : undefined);
        });
        players.push(remote);
    }
    runGame(players, '원격+이탈');
}

/* ---------- 5. UIPlayer + 스크립트 delegate ---------- */

console.log('[5] UIPlayer(스크립트 delegate) 4인 대국 x 100');
function makeBotDelegate() {
    // 회신한 리치/화료가 게임 마스터에 의해 거부(쯔모기리 폴백)되지 않는지 감시
    const d = {
        player: null, expectRiichi: false, expectHule: false,
        update(kind, data) {
            if (!this.player || this.player.menfeng == null) return;
            const me = this.player.menfeng;
            if (kind == 'dapai' && data.l == me) {
                assert(!this.expectHule, 'UIPlayer의 화료 회신이 거부됨');
                if (this.expectRiichi) {
                    assert(data.p.indexOf('*') >= 0,
                           'UIPlayer의 리치 회신이 거부됨: ' + data.p);
                }
                this.expectRiichi = false;
            }
            if (kind == 'hule') { this.expectHule = false; this.expectRiichi = false; }
            if (kind == 'pingju' || kind == 'qipai') {
                this.expectHule = false; this.expectRiichi = false;
            }
        },
        choose(choice, respond) {
            const reply = d.decide(choice);
            if (reply.hule && (choice.type == 'discard' || choice.type == 'react'
                               || choice.type == 'chankan')) d.expectHule = true;
            if (reply.dapai && reply.dapai.indexOf('*') >= 0) d.expectRiichi = true;
            respond(reply);
        },
        decide(choice) {
            switch (choice.type) {
            case 'discard': {
                if (choice.hule && Math.random() < 0.9)
                    return { hule: '-' };
                if (choice.gang.length && Math.random() < 0.4)
                    return { gang: pick(choice.gang) };
                if (choice.lizhi && Math.random() < 0.7)
                    return { dapai: pick(choice.lizhi) + '*' };
                if (choice.daopai && Math.random() < 0.3)
                    return { daopai: '-' };
                const shoupai = d.player && d.player.shoupai;
                if (shoupai && Math.random() < 0.9) {
                    let best = choice.dapai[0], bestX = 9;
                    for (const p of choice.dapai) {
                        const x = Majiang.Util.xiangting(shoupai.clone().dapai(p));
                        if (x < bestX) { bestX = x; best = p; }
                    }
                    return { dapai: best };
                }
                return { dapai: pick(choice.dapai) };
            }
            case 'react':
                if (choice.hule && Math.random() < 0.9)
                    return { hule: '-' };
                if (choice.gang.length && Math.random() < 0.3)
                    return { fulou: pick(choice.gang) };
                if (choice.peng.length && Math.random() < 0.3)
                    return { fulou: pick(choice.peng) };
                if (choice.chi.length && Math.random() < 0.3)
                    return { fulou: pick(choice.chi) };
                return {};
            case 'chankan':
                return { hule: '-' };
            default:
                return {};
            }
        },
    };
    return d;
}
let uiStats = { hule: 0, lizhi: 0 };
for (let i = 0; i < 100; i++) {
    const players = [0, 1, 2, 3].map(() => {
        const d = makeBotDelegate();
        const p = new UIPlayer(d);
        d.player = p;
        return p;
    });
    const paipu = runGame(players, 'UIPlayer');
    if (!paipu) continue;
    for (const log of paipu.log) {
        for (const e of log) {
            if (e.hule) uiStats.hule++;
            if (e.dapai && e.dapai.p.indexOf('*') >= 0) uiStats.lizhi++;
        }
    }
}
console.log('  커버리지:', JSON.stringify(uiStats));
assert(uiStats.hule > 100,  'UIPlayer 화료가 충분히 발생해야 함: ' + uiStats.hule);
assert(uiStats.lizhi > 100, 'UIPlayer 리치가 충분히 발생해야 함: ' + uiStats.lizhi);

/* ---------- 결과 ---------- */

if (failures) {
    console.error(`\n${failures}개 실패`);
    process.exit(1);
}
console.log('\n모든 테스트 통과 ✓');

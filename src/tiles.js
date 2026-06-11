/*
 * 패 표기(m1, p0, z5 ...) → 타일 DOM 요소 생성
 * 타일 이미지: FluffyStuff/riichi-mahjong-tiles (CC BY 4.0)
 */
'use strict';

const NAME = {
    m: n => n == 0 ? 'Man5-Dora' : 'Man' + n,
    p: n => n == 0 ? 'Pin5-Dora' : 'Pin' + n,
    s: n => n == 0 ? 'Sou5-Dora' : 'Sou' + n,
    z: n => ['', 'Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'][n],
};

function assetName(p) {
    if (!p || p == '_' || p == 'back') return 'Back';
    const s = p[0], n = +p[1];
    return NAME[s] ? NAME[s](n) : 'Back';
}

/*
 * 타일 한 장의 DOM 요소를 만든다.
 *   p: 'm1' 'p0' 'z5' '_'(뒷면) 'blank'(빈칸)
 *   cls: 추가 클래스 ('rot' 회전, 'small' 등)
 */
function tileEl(p, cls) {
    const div = document.createElement('div');
    div.className = 'tile' + (cls ? ' ' + cls : '');
    if (p == 'blank') {
        div.classList.add('blank');
        return div;
    }
    const name = assetName(p);
    if (name == 'Back') {
        div.classList.add('back');
        div.style.backgroundImage = `url(assets/tiles/Back.svg)`;
    }
    else {
        const img = document.createElement('img');
        img.src = `assets/tiles/${name}.svg`;
        img.alt = p;
        img.draggable = false;
        div.appendChild(img);
        if (p[1] == '0') div.classList.add('red');
    }
    div.dataset.pai = p;
    return div;
}

/*
 * 부로(m1-23, p555=, s5550-, z111+1, m1111 ...) 표기를 파싱해
 * [{p:'m1', rot:false, add:false, back:false}, ...] 표시 순서대로 반환.
 *   - 회전 타일 위치: 상가(-)=왼쪽, 대면(=)=중앙, 하가(+)=오른쪽
 *   - 가깡(加槓)의 추가 패는 회전 패 위에 겹침(add)
 *   - 안깡은 양끝 뒷면
 */
function parseFulou(m) {
    const s = m[0];
    const body = m.slice(1);

    // 안깡: 방향 표시 없음
    if (/^\d{4}$/.test(body)) {
        const nn = body.split('');
        return [
            { p: '_', back: true },
            { p: s + nn[1], rot: false },
            { p: s + nn[2], rot: false },
            { p: '_', back: true },
        ];
    }

    let tiles = [];       // 호출되지 않은 패들
    let called = null;    // 방향 표시가 붙은 패
    let dir = '';
    let added = null;     // 가깡 추가 패

    // 가깡: 끝이 [+=-]숫자 형태 (예: p555=0)
    const kakan = body.match(/^(\d+)([+=\-])(\d)$/);
    if (kakan && kakan[1].length == 3) {
        tiles = kakan[1].slice(0, 2).split('').map(n => s + n);
        called = s + kakan[1][2];
        dir = kakan[2];
        added = s + kakan[3];
    }
    else {
        const chars = body.split('');
        for (let i = 0; i < chars.length; i++) {
            const c = chars[i];
            if (!/\d/.test(c)) continue;
            if (chars[i + 1] && /[+=\-]/.test(chars[i + 1])) {
                called = s + c;
                dir = chars[i + 1];
                i++;
            }
            else {
                tiles.push(s + c);
            }
        }
    }

    const result = tiles.map(p => ({ p, rot: false }));
    const calledTile = { p: called, rot: true };
    if (added) calledTile.add = added;
    const pos = dir == '-' ? 0 : dir == '=' ? Math.min(1, result.length) : result.length;
    result.splice(pos, 0, calledTile);
    return result;
}

/* 부로 한 세트의 DOM 요소 */
function fulouEl(m) {
    const div = document.createElement('div');
    div.className = 'fulou';
    for (const t of parseFulou(m)) {
        if (t.back) {
            div.appendChild(tileEl('_'));
        }
        else if (t.rot) {
            const wrap = document.createElement('div');
            wrap.className = 'rot-wrap' + (t.add ? ' kakan' : '');
            wrap.appendChild(tileEl(t.p, 'rot'));
            if (t.add) wrap.appendChild(tileEl(t.add, 'rot'));
            div.appendChild(wrap);
        }
        else {
            div.appendChild(tileEl(t.p));
        }
    }
    return div;
}

/* 손패 문자열('m123p45...')을 정렬된 패 배열로 */
function paiList(shoupai) {
    const list = [];
    for (const s of ['m', 'p', 's', 'z']) {
        const bingpai = shoupai._bingpai[s];
        let nHong = s == 'z' ? 0 : bingpai[0];
        for (let n = 1; n < bingpai.length; n++) {
            let nPai = bingpai[n];
            if (shoupai._zimo) {
                if (s + n == shoupai._zimo) nPai--;
                if (n == 5 && s + '0' == shoupai._zimo) { nPai--; nHong--; }
            }
            for (let i = 0; i < nPai; i++) {
                if (n == 5 && nHong > 0) { list.push(s + '0'); nHong--; }
                else list.push(s + n);
            }
        }
    }
    for (let i = 0; i < shoupai._bingpai._ - (shoupai._zimo == '_' ? 1 : 0); i++) {
        list.push('_');
    }
    return list;
}

module.exports = { tileEl, fulouEl, parseFulou, paiList, assetName };
